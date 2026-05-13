from sqlalchemy.orm import Session
from app.models.network import GponResourcePool, OLT
from app.drivers.zte import ZteC320Driver
from app.core.crypto import decrypt_secret
import re

def get_next_onu_id(db: Session, olt_id: int, pon_interface: str) -> int:
    """Calculates the next available ONU ID (1-128) by checking OLT and Reservations."""
    
    # 1. Fetch reserved from DB
    reservations = db.query(GponResourcePool).filter(
        GponResourcePool.olt_id == olt_id,
        GponResourcePool.pon_interface == pon_interface,
        GponResourcePool.resource_type == "onu_id",
        GponResourcePool.status == "reserved"
    ).all()
    reserved_ids = {r.allocated_value for r in reservations}
    
    # 2. Fetch from OLT
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: return 1
    
    used_ids = set()
    if olt.password:
        pwd = decrypt_secret(olt.password)
        driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
        
        try:
            driver.connect()
            output = driver._send_command(f"show gpon onu baseinfo {pon_interface}")
            driver.disconnect()
            
            # gpon-onu_1/2/2:1     enable       disable     OffLine      1(GPON)
            for line in output.splitlines():
                match = re.search(r"\d+/\d+/\d+:(\d+)", line)
                if match:
                    used_ids.add(int(match.group(1)))
        except Exception as e:
            print(f"[Resource Manager] Error getting ONU IDs from OLT: {e}")
            # If OLT fails, we might still want to fail or rely purely on DB?
            # It's safer to raise an exception so we don't accidentally cause a collision
            raise Exception(f"Fallo de conexión a OLT al buscar ONU IDs libres: {e}")
        
    for i in range(1, 129):
        if i not in used_ids and i not in reserved_ids:
            return i
            
    raise Exception(f"No hay ONU IDs libres en el puerto {pon_interface}")

def get_next_onu_internal_resources(db: Session, olt_id: int, onu_interface: str) -> dict:
    """Calculates max+1 for TCONT, GEMPORT, SERVICE-PORT and VPORT for an existing ONU."""
    
    # 1. Fetch reserved from DB
    reservations = db.query(GponResourcePool).filter(
        GponResourcePool.olt_id == olt_id,
        GponResourcePool.onu_interface == onu_interface,
        GponResourcePool.status == "reserved"
    ).all()
    
    reserved_tconts = {r.allocated_value for r in reservations if r.resource_type == "tcont"}
    reserved_gemports = {r.allocated_value for r in reservations if r.resource_type == "gemport"}
    reserved_service_ports = {r.allocated_value for r in reservations if r.resource_type == "service_port"}
    reserved_vports = {r.allocated_value for r in reservations if r.resource_type == "vport"}
    
    # 2. Fetch from OLT
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    used_tconts = set()
    used_gemports = set()
    used_service_ports = set()
    used_vports = set()
    
    if olt and olt.password:
        pwd = decrypt_secret(olt.password)
        driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
        try:
            driver.connect()
            output = driver._send_command(f"show running-config interface {onu_interface}")
            driver.disconnect()
            
            for line in output.splitlines():
                t = re.search(r"tcont\s+(\d+)", line)
                if t: used_tconts.add(int(t.group(1)))
                
                g = re.search(r"gemport\s+(\d+)", line)
                if g: used_gemports.add(int(g.group(1)))
                
                s = re.search(r"service-port\s+(\d+)", line)
                if s: used_service_ports.add(int(s.group(1)))
                
                v = re.search(r"vport\s+(\d+)", line)
                if v: used_vports.add(int(v.group(1)))
        except Exception as e:
            print(f"[Resource Manager] Error getting internal resources: {e}")
            raise Exception(f"Fallo de conexión a OLT al buscar recursos internos: {e}")
            
    def get_max_plus_1(used, reserved):
        all_used = used.union(reserved)
        if not all_used: return 1
        return max(all_used) + 1

    return {
        "tcont": get_max_plus_1(used_tconts, reserved_tconts),
        "gemport": get_max_plus_1(used_gemports, reserved_gemports),
        "service_port": get_max_plus_1(used_service_ports, reserved_service_ports),
        "vport": get_max_plus_1(used_vports, reserved_vports)
    }
