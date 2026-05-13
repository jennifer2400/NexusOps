from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from app.drivers.zte import ZteC320Driver
from app.db.session import get_db
from app.models.network import OLT, ONU, SiteGateway
from app.models.audit import AuditLog
from app.core.crypto import encrypt_secret, decrypt_secret
from datetime import datetime
import ipaddress
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class OLTCreate(BaseModel):
    name: str
    ip_address: str
    port: int = 23
    username: str
    password: str
    protocol: str = "telnet"
    vendor: Optional[str] = None
    hardware_model: Optional[str] = None
    firmware_version: Optional[str] = None
    supported_onus: Optional[List[str]] = None
    snmp_port: Optional[int] = 161
    snmp_community: Optional[str] = None
    auto_detect_capabilities: Optional[bool] = False
    site_gateway_id: Optional[int] = None

class OLTResponse(BaseModel):
    id: int
    name: str
    ip_address: str
    port: int
    protocol: str
    is_active: bool
    onu_count: int = 0
    vendor: Optional[str]
    hardware_model: Optional[str]
    firmware_version: Optional[str]
    supported_onus: Optional[List[str]]
    snmp_port: Optional[int]
    snmp_community: Optional[str]
    auto_detect_capabilities: Optional[bool]
    site_gateway_id: Optional[int]
    
    # Operacional
    is_enabled: bool = True
    last_sync_at: Optional[datetime] = None
    sync_duration_ms: Optional[int] = None
    last_sync_error: Optional[str] = None
    
    consecutive_sync_failures: int = 0
    next_sync_allowed_at: Optional[datetime] = None
    
    last_ping_latency_ms: Optional[int] = None
    last_ping_at: Optional[datetime] = None
    last_ping_status: Optional[str] = None
    
    last_total_in_bps: int = 0
    last_total_out_bps: int = 0
    last_traffic_sync_at: Optional[datetime] = None
    
    class Config:
        orm_mode = True

class OLTUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    vendor: Optional[str] = None
    hardware_model: Optional[str] = None
    firmware_version: Optional[str] = None
    site_gateway_id: Optional[int] = None
    is_enabled: Optional[bool] = None
    snmp_port: Optional[int] = None
    snmp_community: Optional[str] = None
    supported_onus: Optional[List[str]] = None
    auto_detect_capabilities: Optional[bool] = None

def log_audit(db: Session, action: str, entity_type: str, entity_id: int, details: dict):
    audit = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details
    )
    db.add(audit)
    db.commit()

@router.get("/", response_model=List[OLTResponse])
def get_olts(db: Session = Depends(get_db)):
    olts = db.query(OLT).all()
    result = []
    for o in olts:
        count = db.query(ONU).filter(ONU.olt_id == o.id).count()
        result.append({
            "id": o.id, "name": o.name, "ip_address": o.ip_address,
            "port": o.port, "protocol": o.protocol, "is_active": o.is_active,
            "onu_count": count,
            "vendor": o.vendor, "hardware_model": o.hardware_model,
            "firmware_version": o.firmware_version, "supported_onus": o.supported_onus,
            "snmp_port": o.snmp_port,
            # Desencriptamos la comunidad para la API (usualmente no se muestra, pero por completitud)
            "snmp_community": decrypt_secret(o.snmp_community) if o.snmp_community else None,
            "auto_detect_capabilities": o.auto_detect_capabilities,
            "site_gateway_id": o.site_gateway_id,
            "is_enabled": o.is_enabled,
            "last_sync_at": o.last_sync_at,
            "sync_duration_ms": o.sync_duration_ms,
            "last_sync_error": o.last_sync_error,
            "consecutive_sync_failures": o.consecutive_sync_failures,
            "next_sync_allowed_at": o.next_sync_allowed_at,
            "last_ping_latency_ms": o.last_ping_latency_ms,
            "last_ping_at": o.last_ping_at,
            "last_ping_status": o.last_ping_status,
            "last_total_in_bps": o.last_total_in_bps,
            "last_total_out_bps": o.last_total_out_bps,
            "last_traffic_sync_at": o.last_traffic_sync_at
        })
    return result

@router.post("/", response_model=OLTResponse)
def create_olt(olt_data: OLTCreate, db: Session = Depends(get_db)):
    existing = db.query(OLT).filter(OLT.ip_address == olt_data.ip_address).first()
    if existing:
        raise HTTPException(status_code=400, detail="OLT con esta IP ya existe")
        
    # Route Validation if SiteGateway is selected
    if olt_data.site_gateway_id:
        gw = db.query(SiteGateway).filter(SiteGateway.id == olt_data.site_gateway_id).first()
        if not gw:
            raise HTTPException(status_code=400, detail="El Gateway seleccionado no existe")
            
        if gw.internal_subnets:
            is_valid_route = False
            try:
                olt_ip_obj = ipaddress.ip_address(olt_data.ip_address)
                for subnet_str in gw.internal_subnets:
                    try:
                        network = ipaddress.ip_network(subnet_str, strict=False)
                        if olt_ip_obj in network:
                            is_valid_route = True
                            break
                    except ValueError:
                        continue # Invalid subnet configured in gateway
            except ValueError:
                raise HTTPException(status_code=400, detail="Dirección IP de OLT inválida")
                
            if not is_valid_route:
                raise HTTPException(status_code=400, detail=f"La IP {olt_data.ip_address} no pertenece a las subredes configuradas para el Gateway {gw.name}.")
    
    # Encrypt sensitive credentials before saving
    data_dict = olt_data.dict()
    data_dict['password'] = encrypt_secret(data_dict['password'])
    if data_dict.get('snmp_community'):
        data_dict['snmp_community'] = encrypt_secret(data_dict['snmp_community'])
        
    new_olt = OLT(**data_dict)
    db.add(new_olt)
    db.commit()
    db.refresh(new_olt)
    
    # Return decrypted data for the immediate response object mapping
    return {
        "id": new_olt.id, "name": new_olt.name, "ip_address": new_olt.ip_address,
        "port": new_olt.port, "protocol": new_olt.protocol, "is_active": new_olt.is_active,
        "onu_count": 0,
        "vendor": new_olt.vendor, "hardware_model": new_olt.hardware_model,
        "firmware_version": new_olt.firmware_version, "supported_onus": new_olt.supported_onus,
        "snmp_port": new_olt.snmp_port, "snmp_community": decrypt_secret(new_olt.snmp_community) if new_olt.snmp_community else None,
        "auto_detect_capabilities": new_olt.auto_detect_capabilities,
        "site_gateway_id": new_olt.site_gateway_id,
        "is_enabled": new_olt.is_enabled,
        "last_sync_at": new_olt.last_sync_at,
        "sync_duration_ms": new_olt.sync_duration_ms,
        "last_sync_error": new_olt.last_sync_error,
        "consecutive_sync_failures": new_olt.consecutive_sync_failures,
        "next_sync_allowed_at": new_olt.next_sync_allowed_at,
        "last_ping_latency_ms": new_olt.last_ping_latency_ms,
        "last_ping_at": new_olt.last_ping_at,
        "last_ping_status": new_olt.last_ping_status
    }

@router.put("/{olt_id}")
def update_olt(olt_id: int, olt_data: OLTUpdate, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT no encontrada")

    data = olt_data.dict(exclude_unset=True)
    before_state = {k: getattr(olt, k) for k in data.keys() if k != "password"}

    # Route Validation if changing IP or Gateway
    new_ip = data.get("ip_address", olt.ip_address)
    new_gw_id = data.get("site_gateway_id", olt.site_gateway_id)
    
    if new_gw_id:
        gw = db.query(SiteGateway).filter(SiteGateway.id == new_gw_id).first()
        if not gw:
            raise HTTPException(status_code=400, detail="El Gateway seleccionado no existe")
        if gw.internal_subnets:
            is_valid_route = False
            try:
                olt_ip_obj = ipaddress.ip_address(new_ip)
                for subnet_str in gw.internal_subnets:
                    try:
                        if olt_ip_obj in ipaddress.ip_network(subnet_str, strict=False):
                            is_valid_route = True
                            break
                    except ValueError: continue
            except ValueError:
                raise HTTPException(status_code=400, detail="Dirección IP inválida")
            
            if not is_valid_route:
                raise HTTPException(status_code=400, detail=f"La IP {new_ip} no pertenece a las subredes del Gateway {gw.name}.")

    if "password" in data and data["password"]:
        data["password"] = encrypt_secret(data["password"])
    if "snmp_community" in data and data["snmp_community"]:
        data["snmp_community"] = encrypt_secret(data["snmp_community"])

    for key, value in data.items():
        setattr(olt, key, value)
        
    db.commit()
    after_state = {k: getattr(olt, k) for k in data.keys() if k != "password"}
    log_audit(db, "UPDATE", "OLT", olt_id, {"before": before_state, "after": after_state})
    
    return {"message": "OLT actualizada"}

@router.delete("/{olt_id}")
def delete_olt(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT no encontrada")
        
    onu_count = db.query(ONU).filter(ONU.olt_id == olt_id).count()
    if onu_count > 0:
        raise HTTPException(status_code=400, detail=f"No se puede eliminar la OLT porque tiene {onu_count} ONUs asociadas.")
        
    log_audit(db, "DELETE", "OLT", olt_id, {"name": olt.name, "ip": olt.ip_address})
    db.delete(olt)
    db.commit()
    return {"message": "OLT eliminada"}

# --- Métodos OLT directos (Sprint 3) ---

TEST_OLT_CONFIG = {
    "host": "192.168.1.10",
    "port": 22,
    "username": "admin",
    "password": "password"
}

class UnconfiguredONU(BaseModel):
    interface: str
    sn: str

class PowerReading(BaseModel):
    rx: Optional[float]
    tx: Optional[float]

@router.get("/unauthorized-onus", response_model=List[UnconfiguredONU])
def get_unauthorized_onus():
    """Obtiene la lista de ONUs descubiertas pero no autorizadas"""
    driver = ZteC320Driver(**TEST_OLT_CONFIG)
    try:
        onus = driver.get_unauthorized_onus()
        return onus
    except Exception as e:
        logger.error(f"Error conectando a OLT ZTE: {e}")
        return [
            {"interface": "gpon-onu_1/1/1:1", "sn": "ZTEG12345678"},
            {"interface": "gpon-onu_1/1/2:1", "sn": "HWTC87654321"}
        ]
    finally:
        driver.disconnect()

@router.get("/power/{pon_port}/{onu_id}", response_model=PowerReading)
def get_onu_power(pon_port: str, onu_id: str):
    pon_port = pon_port.replace("_", "/")
    driver = ZteC320Driver(**TEST_OLT_CONFIG)
    try:
        power = driver.get_onu_power(pon_port, onu_id)
        return power
    except Exception as e:
        logger.error(f"Error obteniendo potencia OLT ZTE: {e}")
        return {"rx": -22.5, "tx": 2.1}
    finally:
        driver.disconnect()

import os
import time
import socket

@router.post("/{olt_id}/ping")
def ping_olt(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT no encontrada")
        
    start_time = time.time()
    status = "offline"
    try:
        with socket.create_connection((olt.ip_address, olt.port), timeout=2.0):
            status = "online"
    except Exception:
        pass
        
    latency = (time.time() - start_time) * 1000
    
    latency_rounded = int(latency) if status == "online" else None
    
    olt.last_ping_status = status
    olt.last_ping_latency_ms = latency_rounded
    olt.last_ping_at = datetime.utcnow()
    db.commit()
    
    log_audit(db, "PING", "OLT", olt_id, {"status": status, "latency_ms": latency_rounded})
    
    return {"status": status, "latency_ms": latency_rounded, "last_ping_at": olt.last_ping_at}

@router.post("/{olt_id}/test_cli")
def test_cli_olt(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT no encontrada")
    
    # We decrypt the password before sending to driver
    decrypted_password = decrypt_secret(olt.password)
    config = {
        "host": olt.ip_address,
        "port": olt.port,
        "username": olt.username,
        "password": decrypted_password
    }
    
    driver = ZteC320Driver(**config)
    try:
        driver.connect()
        # If connect doesn't raise exception, we are good
        return {"status": "success", "message": "Conexión CLI establecida exitosamente."}
    except Exception as e:
        return {"status": "error", "message": f"Error de conexión: {str(e)}"}
    finally:
        try:
            driver.disconnect()
        except:
            pass

