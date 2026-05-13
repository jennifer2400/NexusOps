from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.provisioning import OnuModelProfile, ProvisioningTemplate
from app.models.network import ONU, OLT
from pydantic import BaseModel
from typing import List, Optional
import datetime
import re

router = APIRouter()

class OnuModelUpdate(BaseModel):
    model_name: Optional[str] = None
    vendor: Optional[str] = None
    supports_wifi: Optional[bool] = None
    supports_catv: Optional[bool] = None
    supports_router: Optional[bool] = None
    supports_bridge: Optional[bool] = None
    supports_tr069: Optional[bool] = None
    supports_omci: Optional[bool] = None
    supports_pppoe_router: Optional[bool] = None
    certification_status: Optional[str] = None
    notes: Optional[str] = None
    provisioning_template_id: Optional[int] = None
    config_template_id: Optional[int] = None
    # Visual fields
    pon_type: Optional[str] = None
    ethernet_ports: Optional[int] = None
    voip_ports: Optional[int] = None
    wifi_ssids: Optional[int] = None
    service_mode: Optional[str] = None
    image_url: Optional[str] = None

class OnuModelCreate(OnuModelUpdate):
    model_name: str
    vendor: str = "Unknown"
    certification_status: str = "certified"

class ExtractTemplateRequest(BaseModel):
    onu_interface: str

@router.get("/")
def get_onu_models(db: Session = Depends(get_db)):
    models = db.query(OnuModelProfile).order_by(OnuModelProfile.model_name).all()
    return models

@router.put("/{model_id}")
def update_onu_model(model_id: int, update_data: OnuModelUpdate, db: Session = Depends(get_db)):
    model_prof = db.query(OnuModelProfile).filter(OnuModelProfile.id == model_id).first()
    if not model_prof:
        raise HTTPException(status_code=404, detail="Model not found")
        
    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(model_prof, key, value)
        
    db.commit()
    db.refresh(model_prof)
    return model_prof

@router.post("/")
def create_onu_model(model_data: OnuModelCreate, db: Session = Depends(get_db)):
    existing = db.query(OnuModelProfile).filter(OnuModelProfile.model_name == model_data.model_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Modelo ya existe")
        
    new_model = OnuModelProfile(**model_data.model_dump(exclude_unset=True))
    db.add(new_model)
    db.commit()
    db.refresh(new_model)
    return new_model

@router.delete("/{model_id}")
def delete_onu_model(model_id: int, db: Session = Depends(get_db)):
    model_prof = db.query(OnuModelProfile).filter(OnuModelProfile.id == model_id).first()
    if not model_prof:
        raise HTTPException(status_code=404, detail="Model not found")
        
    db.delete(model_prof)
    db.commit()
    return {"status": "success"}

from fastapi import UploadFile, File
import shutil
import os
import uuid

@router.post("/upload-image")
async def upload_model_image(file: UploadFile = File(...)):
    # Generate unique filename
    extension = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4().hex}.{extension}"
    filepath = f"uploads/{filename}"
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"http://localhost:8000/{filepath}"}


@router.post("/extract-template")
def extract_template_from_onu(req: ExtractTemplateRequest, db: Session = Depends(get_db)):
    from app.drivers.zte import ZteC320Driver
    from app.core.crypto import decrypt_secret
    
    onu = db.query(ONU).filter(ONU.interface == req.onu_interface).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
        
    olt = db.query(OLT).filter(OLT.id == onu.olt_id).first()
    pwd = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(olt.ip_address, olt.port, olt.username, pwd)
    
    try:
        driver.connect()
        warnings_list = []
        
        # 1. Running Config
        raw_config = driver._send_command(f"show running-config interface {req.onu_interface}", wait_time=2)
        
        # 2. Detail Info (Distance)
        distance = "N/A"
        try:
            detail_info = driver._send_command(f"show gpon onu detail-info {req.onu_interface}", wait_time=1)
            dist_match = re.search(r'ONU Distance:\s+(\S+)', detail_info, re.IGNORECASE)
            if dist_match: distance = dist_match.group(1)
        except Exception as e:
            warnings_list.append(f"No se pudo extraer distance: {str(e)}")
            
        # 3. Hardware/Software Versions
        hw_version = "N/A"
        sw_version = "N/A"
        try:
            onu_info = driver._send_command(f"show pon onu information {req.onu_interface}", wait_time=1)
            hw_match = re.search(r'Hardware version:\s+(\S+)', onu_info, re.IGNORECASE)
            if hw_match: hw_version = hw_match.group(1)
            sw_match = re.search(r'Software version:\s+(\S+)', onu_info, re.IGNORECASE)
            if sw_match: sw_version = sw_match.group(1)
        except Exception as e:
            warnings_list.append(f"No se pudo extraer firmware: {str(e)}")
            
        # 4. Optical Power
        rx_power = "N/A"
        tx_power = "N/A"
        try:
            power_info = driver._send_command(f"show pon power attenuation {req.onu_interface}", wait_time=1)
            rx_match = re.search(r'Rx\s*:\s*([-\d.]+)\s*\(dbm\)', power_info, re.IGNORECASE)
            if rx_match: rx_power = f"{rx_match.group(1)} dBm"
            tx_match = re.search(r'Tx\s*:\s*([-\d.]+)\s*\(dbm\)', power_info, re.IGNORECASE)
            if tx_match: tx_power = f"{tx_match.group(1)} dBm"
        except Exception as e:
            warnings_list.append(f"No se pudo extraer potencia: {str(e)}")
            
        driver.disconnect()
        
        # Parse parameters from config
        tcont_index, upstream_profile = "1", "DEFAULT"
        gemport_index, gemport_tcont = "1", "1"
        downstream_profile = "DEFAULT"
        service_port_index, vport, user_vlan, vlan = "1", "1", "1330", "1330"
        
        for line in raw_config.split("\n"):
            line = line.strip()
            # tcont 1 profile ADMINOLT-100-MEGAS-UP
            tcont_match = re.search(r'tcont\s+(\d+)\s+profile\s+(\S+)', line, re.IGNORECASE)
            if tcont_match:
                tcont_index, upstream_profile = tcont_match.group(1), tcont_match.group(2)
                
            # gemport 1 tcont 1 OR gemport 1 name 1 tcont 2
            gemport_match = re.search(r'gemport\s+(\d+).*tcont\s+(\d+)', line, re.IGNORECASE)
            if gemport_match:
                gemport_index, gemport_tcont = gemport_match.group(1), gemport_match.group(2)
                
            # gemport 1 traffic-limit downstream ADMINOLT-100-MEGAS-DOWN
            traffic_match = re.search(r'gemport\s+\d+\s+traffic-limit\s+downstream\s+(\S+)', line, re.IGNORECASE)
            if traffic_match:
                downstream_profile = traffic_match.group(1)
                
            # service-port 1 vport 1 user-vlan 1330 vlan 1330
            sp_match = re.search(r'service-port\s+(\d+)\s+vport\s+(\d+)\s+user-vlan\s+(\d+)\s+vlan\s+(\d+)', line, re.IGNORECASE)
            if sp_match:
                service_port_index, vport, user_vlan, vlan = sp_match.group(1), sp_match.group(2), sp_match.group(3), sp_match.group(4)
                
        # Generate Draft Template dynamically
        if downstream_profile == "DEFAULT":
            gem_traffic_line = f"gemport {gemport_index} traffic-limit downstream DEFAULT upstream DEFAULT"
        else:
            gem_traffic_line = f"gemport {gemport_index} traffic-limit downstream {downstream_profile}"

        template_draft = f"""conf t
interface {{onu_interface}}
name {{name}}
description {{description}}
tcont {tcont_index} profile {upstream_profile}
gemport {gemport_index} tcont {tcont_index}
{gem_traffic_line}
service-port {service_port_index} vport {vport} user-vlan {{vlan}} vlan {{vlan}}
exit
pon-onu-mng {{onu_interface}}
service INTERNET gemport {gemport_index} vlan {{vlan}}
vlan port eth_0/1 mode tag vlan {{vlan}}
exit"""

        return {
            "model_name": onu.onu_type or "Desconocido",
            "onu_interface": onu.interface,
            "raw_running_config": raw_config,
            
            # Extract info
            "detected_tcont": f"{tcont_index} (UP: {upstream_profile})",
            "detected_gemport": f"{gemport_index} (TCONT {gemport_tcont})",
            "detected_traffic_limit": f"DOWN: {downstream_profile}",
            "detected_service_port": f"{service_port_index} (VLAN {vlan})",
            
            # Deep Diagnostics
            "distance": distance,
            "hardware_version": hw_version,
            "software_version": sw_version,
            "optical_rx": rx_power,
            "optical_tx": tx_power,
            
            "suggested_template": template_draft,
            "warnings": warnings_list
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error comunicando con OLT: {str(e)}")
