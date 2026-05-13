from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.db.session import get_db
from app.models.network import SiteGateway, OLT, ONU
from app.models.audit import AuditLog
import os
import time

router = APIRouter()

import ipaddress
from app.models.network import SystemSetting

class GatewayCreate(BaseModel):
    name: str
    wg_ip: Optional[str] = None
    wg_interface: Optional[str] = None
    internal_subnets: Optional[List[str]] = []
    description: Optional[str] = None
    location: Optional[str] = None
    isp_site: Optional[str] = None
    technical_notes: Optional[str] = None

class GatewayResponse(BaseModel):
    id: int
    name: str
    wg_ip: Optional[str]
    wg_interface: Optional[str]
    internal_subnets: Optional[List[str]]
    status: str
    latency_ms: Optional[float]
    last_ping_at: Optional[datetime]
    description: Optional[str] = None
    location: Optional[str] = None
    isp_site: Optional[str] = None
    technical_notes: Optional[str] = None
    olt_count: int = 0
    last_handshake_at: Optional[datetime] = None
    rx_bytes: int = 0
    tx_bytes: int = 0
    peer_status: str = "unknown"
    onu_count: int = 0
    
    class Config:
        orm_mode = True

def log_audit(db: Session, action: str, entity_type: str, entity_id: int, details: dict):
    audit = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details
    )
    db.add(audit)
    db.commit()

@router.get("/", response_model=List[GatewayResponse])
def get_gateways(db: Session = Depends(get_db)):
    gws = db.query(SiteGateway).all()
    result = []
    for gw in gws:
        olt_count = db.query(OLT).filter(OLT.site_gateway_id == gw.id).count()
        onu_count = db.query(ONU).join(OLT).filter(OLT.site_gateway_id == gw.id).count()
        gw_dict = {
            "id": gw.id, "name": gw.name, "wg_ip": gw.wg_ip, "wg_interface": gw.wg_interface,
            "internal_subnets": gw.internal_subnets, "status": gw.status,
            "latency_ms": gw.latency_ms, "last_ping_at": gw.last_ping_at,
            "description": gw.description, "location": gw.location, 
            "isp_site": gw.isp_site, "technical_notes": gw.technical_notes,
            "olt_count": olt_count,
            "onu_count": onu_count,
            "last_handshake_at": gw.last_handshake_at,
            "rx_bytes": gw.rx_bytes,
            "tx_bytes": gw.tx_bytes,
            "peer_status": gw.peer_status
        }
        result.append(gw_dict)
    return result

@router.post("/", response_model=GatewayResponse)
def create_gateway(gw: GatewayCreate, db: Session = Depends(get_db)):
    # 1. Validar nombre único
    if db.query(SiteGateway).filter(SiteGateway.name == gw.name).first():
        raise HTTPException(status_code=400, detail=f"Ya existe un Site Gateway con el nombre '{gw.name}'.")

    # 2. Extraer configuración global WireGuard
    global_cidr_setting = db.query(SystemSetting).filter(SystemSetting.key == "wg_network_cidr").first()
    wg_network_cidr = global_cidr_setting.value if global_cidr_setting and global_cidr_setting.value else "10.200.0.0/24"

    try:
        global_net = ipaddress.ip_network(wg_network_cidr, strict=False)
    except Exception:
        raise HTTPException(status_code=500, detail="El CIDR global de WireGuard está mal configurado en el sistema.")

    # 3. Validar IP del Gateway
    if gw.wg_ip:
        try:
            gw_ip_obj = ipaddress.ip_address(gw.wg_ip)
            if gw_ip_obj not in global_net:
                raise HTTPException(status_code=400, detail=f"La IP WireGuard {gw.wg_ip} no pertenece a la red global WireGuard {wg_network_cidr}.")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"La IP {gw.wg_ip} tiene un formato inválido.")

        # Verificar IP duplicada
        duplicate_ip = db.query(SiteGateway).filter(SiteGateway.wg_ip == gw.wg_ip).first()
        if duplicate_ip:
            raise HTTPException(status_code=400, detail=f"La IP WireGuard {gw.wg_ip} ya está asignada al Gateway '{duplicate_ip.name}'.")

    # 4. Validar formato y solapamiento de subredes internas
    valid_subnets = []
    if gw.internal_subnets:
        # Check formato de subredes que está intentando agregar
        for sub in gw.internal_subnets:
            try:
                net = ipaddress.ip_network(sub, strict=False)
                valid_subnets.append(net)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"La subred '{sub}' tiene un formato CIDR inválido.")

        # Verificar solapamiento dentro de la misma petición
        for i, net1 in enumerate(valid_subnets):
            for j, net2 in enumerate(valid_subnets):
                if i != j and net1.overlaps(net2):
                    raise HTTPException(status_code=400, detail=f"Solapamiento detectado en tu misma solicitud: {net1} choca con {net2}.")

        # Verificar solapamiento contra todos los demás Gateways de la BD
        all_other_gws = db.query(SiteGateway).all()
        for other_gw in all_other_gws:
            if other_gw.internal_subnets:
                for other_sub_str in other_gw.internal_subnets:
                    try:
                        other_net = ipaddress.ip_network(other_sub_str, strict=False)
                        for new_net in valid_subnets:
                            if new_net.overlaps(other_net):
                                raise HTTPException(status_code=400, detail=f"La subred {new_net} se solapa con la subred {other_net} del Gateway '{other_gw.name}'.")
                    except Exception:
                        pass # Ignorar subredes mal formateadas antiguas

    new_gw = SiteGateway(
        name=gw.name,
        wg_ip=gw.wg_ip,
        wg_interface=gw.wg_interface,
        internal_subnets=gw.internal_subnets,
        status="pending_adoption",
        description=gw.description,
        location=gw.location,
        isp_site=gw.isp_site,
        technical_notes=gw.technical_notes
    )
    db.add(new_gw)
    db.commit()
    db.refresh(new_gw)
    
    log_audit(db, "CREATE", "SiteGateway", new_gw.id, {"name": new_gw.name, "wg_ip": new_gw.wg_ip, "subnets": gw.internal_subnets})
    
    return {
        "id": new_gw.id, "name": new_gw.name, "wg_ip": new_gw.wg_ip, "wg_interface": new_gw.wg_interface,
        "internal_subnets": new_gw.internal_subnets, "status": new_gw.status,
        "latency_ms": None, "last_ping_at": None, "olt_count": 0,
        "description": new_gw.description, "location": new_gw.location,
        "isp_site": new_gw.isp_site, "technical_notes": new_gw.technical_notes,
        "last_handshake_at": None, "rx_bytes": 0, "tx_bytes": 0, "peer_status": "unknown"
    }

@router.delete("/{gw_id}")
def delete_gateway(gw_id: int, db: Session = Depends(get_db)):
    gw = db.query(SiteGateway).filter(SiteGateway.id == gw_id).first()
    if not gw:
        raise HTTPException(status_code=404, detail="Gateway not found")
    
    log_audit(db, "DELETE", "SiteGateway", gw_id, {"name": gw.name})
    db.delete(gw)
    db.commit()
    return {"message": "Gateway deleted"}

@router.post("/{gw_id}/ping")
def ping_gateway(gw_id: int, db: Session = Depends(get_db)):
    gw = db.query(SiteGateway).filter(SiteGateway.id == gw_id).first()
    if not gw:
        raise HTTPException(status_code=404, detail="Gateway not found")
        
    if not gw.wg_ip:
        raise HTTPException(status_code=400, detail="Gateway has no IP configured")
        
    start_time = time.time()
    response = os.system(f"ping -c 1 -W 2 {gw.wg_ip} > /dev/null 2>&1")
    latency = (time.time() - start_time) * 1000
    
    status = "online" if response == 0 else "offline"
    gw.status = status
    gw.last_ping_at = datetime.utcnow()
    gw.latency_ms = round(latency, 2) if status == "online" else None
    
    db.commit()
    
    log_audit(db, "PING", "SiteGateway", gw_id, {"status": status, "latency_ms": gw.latency_ms})
    
    return {"status": status, "latency_ms": gw.latency_ms, "last_ping_at": gw.last_ping_at}

class PublicKeyUpdate(BaseModel):
    public_key: str

@router.post("/{gw_id}/public-key")
def update_public_key(gw_id: int, data: PublicKeyUpdate, db: Session = Depends(get_db)):
    gw = db.query(SiteGateway).filter(SiteGateway.id == gw_id).first()
    if not gw:
        raise HTTPException(status_code=404, detail="Gateway not found")
        
    pubkey = data.public_key.strip()
    if len(pubkey) != 44 or not pubkey.endswith('='):
        raise HTTPException(status_code=400, detail="El formato de la llave pública es inválido (debe tener 44 caracteres base64 y terminar en =).")
        
    dup = db.query(SiteGateway).filter(SiteGateway.mikrotik_public_key == pubkey).first()
    if dup and dup.id != gw_id:
        raise HTTPException(status_code=400, detail=f"Esta llave pública ya está asignada al Gateway '{dup.name}'.")

    gw.mikrotik_public_key = pubkey
    db.commit()
    log_audit(db, "UPDATE", "SiteGateway", gw_id, {"mikrotik_public_key_updated": True})
    return {"message": "Public key guardada exitosamente"}

import subprocess

@router.post("/{gw_id}/diagnose")
def diagnose_gateway(gw_id: int, db: Session = Depends(get_db)):
    gw = db.query(SiteGateway).filter(SiteGateway.id == gw_id).first()
    if not gw:
        raise HTTPException(status_code=404, detail="Gateway not found")
        
    if not gw.wg_ip:
        raise HTTPException(status_code=400, detail="Gateway has no IP configured")
        
    if not gw.mikrotik_public_key:
        gw.status = "pending_adoption"
        gw.peer_status = "unknown"
        db.commit()
        return {"status": gw.status, "peer_status": gw.peer_status, "detail": "Missing public key."}

    # 1. Ping
    start_time = time.time()
    response = os.system(f"ping -c 1 -W 2 {gw.wg_ip} > /dev/null 2>&1")
    latency = (time.time() - start_time) * 1000
    ping_ok = (response == 0)
    
    gw.last_ping_at = datetime.utcnow()
    gw.latency_ms = round(latency, 2) if ping_ok else None

    # 2. Telemetría WG
    telemetry_ok = False
    has_handshake = False
    
    try:
        wg_output = subprocess.check_output(["wg", "show", "all", "dump"], stderr=subprocess.STDOUT, timeout=2).decode("utf-8")
        telemetry_ok = True
        
        for line in wg_output.splitlines():
            parts = line.split('\\t')
            if len(parts) >= 8 and parts[1].strip() == gw.mikrotik_public_key.strip():
                handshake_ts = int(parts[5])
                gw.rx_bytes = int(parts[6])
                gw.tx_bytes = int(parts[7])
                
                if handshake_ts > 0:
                    gw.last_handshake_at = datetime.fromtimestamp(handshake_ts)
                    if time.time() - handshake_ts < 180:
                        has_handshake = True
                break
    except Exception as e:
        telemetry_ok = False
        
    # 3. Calcular Estado Operacional
    warnings = []
    if ping_ok and has_handshake:
        gw.status = "online"
        gw.peer_status = "active"
    elif ping_ok and not telemetry_ok:
        gw.status = "warning"
        gw.peer_status = "unknown"
        warnings.append("WireGuard telemetry unavailable in this environment.")
    elif not ping_ok and has_handshake:
        gw.status = "warning"
        gw.peer_status = "routing_issue"
        warnings.append("Handshake detectado pero IP WireGuard no responde a ping. Posible problema de rutas o firewall.")
    else:
        gw.status = "offline"
        gw.peer_status = "down"
        warnings.append("Gateway inaccesible. No responde a ping ni reporta handshake reciente.")

    db.commit()
    log_audit(db, "DIAGNOSE", "SiteGateway", gw_id, {
        "status": gw.status, 
        "ping_ok": ping_ok, 
        "telemetry_ok": telemetry_ok,
        "has_handshake": has_handshake
    })
    
    # Generate raw log simulation for frontend
    raw_log = f"[Iniciando diagnóstico Site {gw.name}...]\n"
    raw_log += f"[Probando ping a WireGuard IP {gw.wg_ip}...]\n"
    raw_log += f"  -> {'OK' if ping_ok else 'FAIL'} ({latency:.1f}ms)\n"
    raw_log += f"[Consultando wg show...]\n"
    raw_log += f"  -> {'OK' if telemetry_ok else 'FAIL'}\n"
    raw_log += f"[Validando handshake...]\n"
    if has_handshake:
        raw_log += f"  -> Handshake detectado.\n"
    else:
        raw_log += f"  -> No hay handshake reciente.\n"
    raw_log += f"[Calculando RX/TX...]\n"
    raw_log += f"  -> RX: {gw.rx_bytes} bytes | TX: {gw.tx_bytes} bytes\n"
    raw_log += f"[Evaluando estado operacional...]\n"
    raw_log += f"  -> Status final: {gw.status.upper()}\n"
    
    return {
        "status": gw.status, 
        "latency_ms": gw.latency_ms, 
        "ping_status": "ok" if ping_ok else "fail",
        "last_ping_at": gw.last_ping_at,
        "last_handshake_at": gw.last_handshake_at,
        "handshake_status": "recent" if has_handshake else ("old" if gw.last_handshake_at else "none"),
        "rx_bytes": gw.rx_bytes,
        "tx_bytes": gw.tx_bytes,
        "peer_status": gw.peer_status,
        "wg_available": telemetry_ok,
        "warnings": warnings,
        "raw_log": raw_log
    }

from app.models.network import SystemSetting

@router.get("/{gw_id}/script")
def generate_mikrotik_script(gw_id: int, add_routes: bool = True, db: Session = Depends(get_db)):
    gw = db.query(SiteGateway).filter(SiteGateway.id == gw_id).first()
    if not gw:
        raise HTTPException(status_code=404, detail="Gateway not found")
    if not gw.wg_ip:
        raise HTTPException(status_code=400, detail="El Gateway debe tener una IP WireGuard configurada primero.")

    # Get Global Settings
    settings_query = db.query(SystemSetting).all()
    settings_map = {s.key: s.value for s in settings_query}

    # Merging Global vs Override
    server_endpoint = gw.override_wg_endpoint or settings_map.get("wg_server_endpoint", "helix.example.com")
    server_port = gw.override_wg_port or settings_map.get("wg_server_port", "13231")
    server_pubkey = gw.override_wg_public_key or settings_map.get("wg_server_public_key", "PONER_PUBLIC_KEY_AQUI")
    wg_cidr = settings_map.get("wg_network_cidr", "10.200.0.0/24")
    wg_iface = gw.wg_interface or settings_map.get("default_wg_interface_name", "wg-helix-noc")
    keepalive = settings_map.get("default_keepalive", "25")

    # Generate Idempotent Script
    script = f"""# Helix NOC - MikroTik Adoption Script
# Generado automáticamente para Gateway: {gw.name}
# Este script es idempotente. Se puede correr múltiples veces sin duplicar configuraciones.

:local wgIface "{wg_iface}"
:local wgPort {server_port}
:local wgIp "{gw.wg_ip}/24"
:local helixEndpoint "{server_endpoint}"
:local helixPubKey "{server_pubkey}"
:local keepAlive "{keepalive}s"
:local helixCidr "{wg_cidr}"
:local commentMark "HELIX_NOC_GATEWAY"

# 1. Clean existing configuration if re-running
/interface/wireguard/peers/remove [find comment=\$commentMark]
/ip/address/remove [find comment=\$commentMark]
/ip/route/remove [find comment=\$commentMark]
/ip/firewall/filter/remove [find comment=\$commentMark]

# 2. Add WireGuard Interface
:if ([:len [/interface/wireguard/find name=\$wgIface]] = 0) do={{
    /interface/wireguard/add name=\$wgIface listen-port=\$wgPort mtu=1420
}}

# 3. Add IP Address
/ip/address/add address=\$wgIp interface=\$wgIface comment=\$commentMark

# 4. Add Server Peer
/interface/wireguard/peers/add interface=\$wgIface public-key=\$helixPubKey endpoint-address=\$helixEndpoint endpoint-port=\$wgPort allowed-address=\$helixCidr persistent-keepalive=\$keepAlive comment=\$commentMark

# 5. Firewall Rules
/ip/firewall/filter/add chain=input action=accept in-interface=\$wgIface comment=\$commentMark place-before=0
/ip/firewall/filter/add chain=forward action=accept in-interface=\$wgIface comment=\$commentMark place-before=0
"""

    if add_routes:
        script += f"""
# 6. Static Routes to Helix Network
/ip/route/add dst-address=\$helixCidr gateway=\$wgIface comment=\$commentMark
"""

    script += """
# --- Fin del Script ---
# Muestra la public-key generada para guardarla en Helix NOC:
/interface/wireguard/print detail
"""

    log_audit(db, "GENERATE_SCRIPT", "SiteGateway", gw_id, {"script_generated": True, "add_routes": add_routes})

    return {"script": script}
