from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.db.session import get_db
from app.models.network import OLT, OLTBackup, ONU, PONLock
from app.models.audit import AuditLog
from app.drivers.zte import ZteC320Driver
from app.core.crypto import decrypt_secret
from datetime import datetime
import asyncio
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

def get_olt_driver(olt: OLT) -> ZteC320Driver:
    if not olt.ip_address or not olt.username:
        raise HTTPException(status_code=400, detail="OLT no tiene credenciales configuradas")
    pwd = decrypt_secret(olt.password) if olt.password else ""
    return ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)

def log_audit(db: Session, action: str, details: Dict):
    # Minimal helper to log to AuditLog manually
    audit = AuditLog(
        action=action,
        entity_type="OLT_TOOLS",
        entity_id=details.get("olt_id"),
        details=details
    )
    db.add(audit)
    db.commit()

# --- READ ENDPOINTS ---

@router.get("/{olt_id}/hardware")
def get_hardware(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: raise HTTPException(status_code=404)
    driver = get_olt_driver(olt)
    try:
        boards = driver.get_boards()
        driver.disconnect()
        return {"boards": boards}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{olt_id}/vlans")
def get_vlans(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: raise HTTPException(status_code=404)
    driver = get_olt_driver(olt)
    try:
        raw_vlans = driver.get_vlans()
        driver.disconnect()
        return {"raw_output": raw_vlans}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{olt_id}/running-config")
def get_running_config(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: raise HTTPException(status_code=404)
    driver = get_olt_driver(olt)
    try:
        config = driver.get_running_config()
        driver.disconnect()
        return {"config": config}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- BACKUPS ---

@router.get("/{olt_id}/backups")
def get_backups(olt_id: int, db: Session = Depends(get_db)):
    backups = db.query(OLTBackup).filter(OLTBackup.olt_id == olt_id).order_by(OLTBackup.created_at.desc()).all()
    return [{"id": b.id, "filename": b.filename, "file_size": b.file_size, "created_at": b.created_at, "source": b.source} for b in backups]

@router.post("/{olt_id}/backups")
def create_backup(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: raise HTTPException(status_code=404)
    
    driver = get_olt_driver(olt)
    try:
        config = driver.get_running_config()
        driver.disconnect()
        
        filename = f"backup_{olt.name}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.cfg"
        backup = OLTBackup(
            olt_id=olt.id,
            filename=filename,
            file_size=len(config.encode('utf-8')),
            config_content=config,
            source="manual",
            created_by="admin"
        )
        db.add(backup)
        log_audit(db, "CREATE_BACKUP", {"olt_id": olt.id, "filename": filename})
        return {"message": "Backup creado", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{olt_id}/backups/{backup_id}")
def get_backup_content(olt_id: int, backup_id: int, db: Session = Depends(get_db)):
    backup = db.query(OLTBackup).filter(OLTBackup.id == backup_id, OLTBackup.olt_id == olt_id).first()
    if not backup: raise HTTPException(status_code=404)
    return {"content": backup.config_content}

# --- CRITICAL ACTIONS ---

class ActionConfirm(BaseModel):
    confirm_text: str

@router.post("/{olt_id}/write-config")
def write_config(olt_id: int, db: Session = Depends(get_db)):
    # Check locks
    active_lock = db.query(PONLock).filter(PONLock.olt_id == olt_id, PONLock.expires_at > datetime.utcnow()).first()
    if active_lock:
        raise HTTPException(status_code=400, detail="OLT bloqueada por un proceso de aprovisionamiento.")
        
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: raise HTTPException(status_code=404)
    
    driver = get_olt_driver(olt)
    try:
        output = driver.save_config()
        driver.disconnect()
        log_audit(db, "WRITE_CONFIG", {"olt_id": olt.id, "output": output})
        return {"message": "Configuración guardada", "output": output}
    except Exception as e:
        log_audit(db, "WRITE_CONFIG_FAILED", {"olt_id": olt.id, "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{olt_id}/reboot")
def reboot_olt(olt_id: int, req: ActionConfirm, db: Session = Depends(get_db)):
    if req.confirm_text != "REINICIAR OLT":
        raise HTTPException(status_code=400, detail="Texto de confirmación incorrecto.")
        
    # Check locks
    active_lock = db.query(PONLock).filter(PONLock.olt_id == olt_id, PONLock.expires_at > datetime.utcnow()).first()
    if active_lock:
        raise HTTPException(status_code=400, detail="OLT bloqueada por un proceso de aprovisionamiento.")
        
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: raise HTTPException(status_code=404)
    
    driver = get_olt_driver(olt)
    try:
        # Require backup first? We'll let the user do it manually based on UI flow
        output = driver.reboot_olt()
        driver.disconnect()
        log_audit(db, "REBOOT_OLT", {"olt_id": olt.id, "output": output})
        return {"message": "Comando de reinicio enviado", "output": output}
    except Exception as e:
        log_audit(db, "REBOOT_OLT_FAILED", {"olt_id": olt.id, "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))
