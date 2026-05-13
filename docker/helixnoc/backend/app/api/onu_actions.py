from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.network import ONU, OLT
from app.models.provisioning import ProvisioningJob
from app.drivers.zte import ZteC320Driver

router = APIRouter()

@router.get("/{onu_id}/power")
def get_onu_power(onu_id: int, db: Session = Depends(get_db)):
    onu = db.query(ONU).filter(ONU.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
        
    olt = db.query(OLT).filter(OLT.id == onu.olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT asociada no encontrada")
        
    from app.core.crypto import decrypt_secret
    pwd = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(host=olt.ip_address, port=olt.port, username=olt.username, password=pwd)
    
    try:
        power_data = driver.get_full_onu_power(onu.interface)
        
        # Auditoría de consulta (Logs)
        log_text = f"Consultada potencia para {onu.interface}\nRX ONU: {power_data.get('rx_onu')} | TX ONU: {power_data.get('tx_onu')}\nRX OLT: {power_data.get('rx_olt')} | Temp: {power_data.get('temp')}"
        new_log = ProvisioningJob(
            olt_id=olt.id,
            onu_sn=onu.sn,
            onu_interface=onu.interface,
            status="success",
            current_step="Lectura de Potencia",
            raw_log=log_text
        )
        db.add(new_log)
        db.commit()
        
        return power_data
    except Exception as e:
        # Log error
        new_log = ProvisioningJob(
            olt_id=olt.id,
            onu_sn=onu.sn,
            onu_interface=onu.interface,
            status="failed",
            current_step="Lectura de Potencia",
            raw_log=f"Error consultando potencia: {str(e)}"
        )
        db.add(new_log)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error comunicando con OLT: {str(e)}")
    finally:
        driver.disconnect()

@router.get("/{onu_id}/details")
def get_onu_details_api(onu_id: int, db: Session = Depends(get_db)):
    onu = db.query(ONU).filter(ONU.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
        
    olt = db.query(OLT).filter(OLT.id == onu.olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT asociada no encontrada")
        
    from app.core.crypto import decrypt_secret
    pwd = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(host=olt.ip_address, port=olt.port, username=olt.username, password=pwd)
    
    try:
        details_data = driver.get_onu_details(onu.interface)
        return details_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error comunicando con OLT: {str(e)}")
    finally:
        driver.disconnect()

@router.get("/{onu_id}/network")
def get_onu_network_api(onu_id: int, db: Session = Depends(get_db)):
    onu = db.query(ONU).filter(ONU.id == onu_id).first()
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada")
        
    olt = db.query(OLT).filter(OLT.id == onu.olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT asociada no encontrada")
        
    from app.core.crypto import decrypt_secret
    pwd = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(host=olt.ip_address, port=olt.port, username=olt.username, password=pwd)
    
    try:
        network_data = driver.get_onu_wan_status(onu.interface)
        return network_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error comunicando con OLT: {str(e)}")
    finally:
        driver.disconnect()
