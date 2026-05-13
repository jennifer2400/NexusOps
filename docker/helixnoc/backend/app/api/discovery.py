from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.network import OLT
from app.drivers.zte import ZteC320Driver
from app.core.crypto import decrypt_secret
import re

router = APIRouter()

@router.get("/uplinks/{olt_id}")
def discover_uplinks(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).get(olt_id)
    if not olt:
        raise HTTPException(status_code=404, detail="OLT no encontrada")

    pwd = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)

    try:
        driver.connect()
        # 1. Discover physical ports
        gei_ports = driver.get_uplink_interfaces()
        
        # 2. Discover LACP smartgroups
        smartgroups = driver.get_smartgroups()
        
        # Combine
        all_uplinks = gei_ports + smartgroups
        
        # Enhance with VLAN info (we'll fetch running config for UP ports and smartgroups)
        # Note: If there are many ports, this could take a few seconds
        for uplink in all_uplinks:
            if uplink['oper_state'] == 'up' or uplink['type'] == 'smartgroup':
                config = driver.get_uplink_running_config(uplink['interface'])
                
                # Default is access unless specified
                switchport_mode = "access"
                allowed_vlans = []
                
                for line in config.splitlines():
                    line = line.strip()
                    if line.startswith("switchport mode"):
                        switchport_mode = line.split(" ")[-1]
                    elif line.startswith("switchport vlan"):
                        # switchport vlan 10,20-30 tag
                        match = re.search(r'switchport vlan\s+([\d\,\-]+)\s+(tag|untag)', line)
                        if match:
                            allowed_vlans.append({
                                "vlans": match.group(1),
                                "mode": match.group(2)
                            })
                            
                uplink['switchport_mode'] = switchport_mode
                uplink['vlan_config'] = allowed_vlans
            else:
                uplink['switchport_mode'] = "unknown"
                uplink['vlan_config'] = []
                
        driver.disconnect()
        return {"uplinks": all_uplinks}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
