from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from app.db.session import get_db
from app.models.network import ONU
from app.services.onu_configuration_engine import ONUConfigurationEngine

router = APIRouter()

@router.get("/{onu_id}/state")
def get_onu_state(onu_id: int, db: Session = Depends(get_db)):
    onu = db.query(ONU).filter(ONU.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
        
    engine = ONUConfigurationEngine(db, onu.olt_id)
    return engine.get_current_state(onu.interface)

@router.post("/{onu_id}/patch")
def generate_patch(
    onu_id: int, 
    current_state: Dict[str, Any] = Body(...),
    desired_state: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    onu = db.query(ONU).filter(ONU.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
        
    engine = ONUConfigurationEngine(db, onu.olt_id)
    patch = engine.generate_patch(onu.interface, current_state, desired_state)
    
    return patch

@router.post("/{onu_id}/commit")
def commit_patch(
    onu_id: int,
    target_onu_id: int = Body(...),
    patch_data: Dict[str, Any] = Body(...),
    current_state: Dict[str, Any] = Body(...),
    desired_state: Dict[str, Any] = Body(...),
    author: str = Body(default="Helix NOC Admin"),
    db: Session = Depends(get_db)
):
    if target_onu_id != onu_id:
        raise HTTPException(status_code=400, detail="Mismatch de ONU: posible estado obsoleto. Recargue la configuración.")
        
    onu = db.query(ONU).filter(ONU.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
        
    engine = ONUConfigurationEngine(db, onu.olt_id)
    result = engine.execute_patch(
        onu_id=onu.id, 
        onu_interface=onu.interface, 
        patch_data=patch_data, 
        current_state=current_state, 
        desired_state=desired_state, 
        author=author
    )
    
    return result

@router.get("/{onu_id}/audit-history")
def get_audit_history(onu_id: int, db: Session = Depends(get_db)):
    from app.models.provisioning import OnuConfigAudit
    
    onu = db.query(ONU).filter(ONU.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
        
    audits = db.query(OnuConfigAudit).filter(OnuConfigAudit.onu_id == onu_id).order_by(OnuConfigAudit.created_at.desc()).limit(20).all()
    return audits
