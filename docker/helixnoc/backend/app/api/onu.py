from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from pydantic import BaseModel
from app.db.session import get_db
from app.models.network import ONU, OLT

router = APIRouter()

class ONUResponse(BaseModel):
    id: int
    olt_id: int
    interface: str
    sn: str
    status: str
    olt_name: str
    name: Optional[str]
    description: Optional[str]
    onu_type: Optional[str]
    pppoe_username: Optional[str]
    vlan: Optional[str]
    
    class Config:
        orm_mode = True

@router.get("/", response_model=List[ONUResponse])
def get_onus(
    skip: int = 0, 
    limit: int = 1000, 
    search: str = None, 
    status: str = None,
    olt_id: int = None,
    db: Session = Depends(get_db)
):
    query = db.query(ONU, OLT.name.label("olt_name")).join(OLT, ONU.olt_id == OLT.id)
    
    # By default, hide soft-deleted ONUs unless explicitly requested
    if status != "deleted":
        query = query.filter(ONU.status != 'deleted')
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                ONU.interface.ilike(search_term),
                ONU.sn.ilike(search_term),
                ONU.name.ilike(search_term),
                ONU.description.ilike(search_term),
                ONU.pppoe_username.ilike(search_term)
            )
        )
        
    if status:
        if status.lower() == "online":
            query = query.filter(ONU.status.ilike("%working%"))
        elif status.lower() == "offline":
            query = query.filter(ONU.status.ilike("%offline%"))
            
    if olt_id and olt_id > 0:
        query = query.filter(ONU.olt_id == olt_id)
        
    onus_data = query.offset(skip).limit(limit).all()
    
    result = []
    for onu, olt_name in onus_data:
        result.append({
            "id": onu.id,
            "olt_id": onu.olt_id,
            "interface": onu.interface,
            "sn": onu.sn,
            "status": onu.status,
            "olt_name": olt_name,
            "name": onu.name,
            "description": onu.description,
            "onu_type": onu.onu_type,
            "pppoe_username": onu.pppoe_username,
            "vlan": onu.vlan
        })
        
    return result

@router.get("/{olt_id}/unconfigured")
def get_unconfigured_onus(olt_id: int, db: Session = Depends(get_db)):
    from app.drivers.zte import ZteC320Driver
    from app.core.crypto import decrypt_secret
    from fastapi import HTTPException
    
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT no encontrada")
        
    pwd = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
    try:
        driver.connect()
        onus = driver.get_unauthorized_onus()
        driver.disconnect()
        return onus
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
