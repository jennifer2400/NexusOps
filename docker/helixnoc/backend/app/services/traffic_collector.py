import asyncio
from pysnmp.hlapi.v3arch.asyncio import *
from app.db.session import SessionLocal
from app.models.network import OLT, InterfaceTrafficMetric
from app.services.alarm_manager import create_or_update_alarm, resolve_alarm
from app.core.crypto import decrypt_secret
from datetime import datetime
import re

def classify_interface(name: str):
    name_lower = name.lower()
    if re.search(r'xgei|gei|uplink|eth-trunk|xge', name_lower):
        return 'uplink'
    elif re.search(r'gpon|pon', name_lower):
        return 'pon'
    elif re.search(r'vlan|mng|loopback|null', name_lower):
        return 'management'
    return 'unknown'

async def fetch_snmp_table(engine, community, ip, port, base_oid):
    target = await UdpTransportTarget.create((ip, port), timeout=2, retries=1)
    iterator = walk_cmd(
        engine,
        CommunityData(community, mpModel=1),
        target,
        ContextData(),
        ObjectType(ObjectIdentity(base_oid)),
        lexicographicMode=False
    )
    results = {}
    async for errorIndication, errorStatus, errorIndex, varBinds in iterator:
        if errorIndication or errorStatus:
            return None
        for varBind in varBinds:
            oid = str(varBind[0])
            val = varBind[1]
            index = oid.split('.')[-1]
            try:
                text = val.asOctets().decode('utf-8', 'ignore')
            except Exception:
                text = str(val)
            results[index] = text
    return results

def collect_olt_traffic(olt_id: int):
    asyncio.run(_collect_olt_traffic_async(olt_id))

async def _collect_olt_traffic_async(olt_id: int):
    db = SessionLocal()
    try:
        olt = db.query(OLT).filter(OLT.id == olt_id, OLT.is_active == True).first()
        if not olt: return
        
        community = "public"
        if olt.snmp_community:
            try:
                community = decrypt_secret(olt.snmp_community)
            except Exception:
                community = olt.snmp_community
                
        port = olt.snmp_port or 161
        engine = SnmpEngine()
        
        names = await fetch_snmp_table(engine, community, olt.ip_address, port, "1.3.6.1.2.1.31.1.1.1.1")
        if not names:
            create_or_update_alarm(db, olt_id, "snmp_down", "warning", "Fallo SNMP", f"No se pudo recolectar tráfico de la OLT {olt.ip_address} mediante SNMP.")
            return
        else:
            resolve_alarm(db, olt_id, "snmp_down")
            
        hc_in = await fetch_snmp_table(engine, community, olt.ip_address, port, "1.3.6.1.2.1.31.1.1.1.6")
        hc_out = await fetch_snmp_table(engine, community, olt.ip_address, port, "1.3.6.1.2.1.31.1.1.1.10")
        
        if not hc_in or len(hc_in) == 0:
            hc_in = await fetch_snmp_table(engine, community, olt.ip_address, port, "1.3.6.1.2.1.2.2.1.10")
        if not hc_out or len(hc_out) == 0:
            hc_out = await fetch_snmp_table(engine, community, olt.ip_address, port, "1.3.6.1.2.1.2.2.1.16")
            
        high_speed = await fetch_snmp_table(engine, community, olt.ip_address, port, "1.3.6.1.2.1.31.1.1.1.15")
        
        now = datetime.utcnow()
        total_in_bps = 0
        total_out_bps = 0
        
        for idx, name_obj in names.items():
            name = str(name_obj)
            interface_type = classify_interface(name)
            if interface_type == 'management' or interface_type == 'unknown':
                continue
                
            in_octets = int(hc_in.get(idx, 0)) if hc_in else 0
            out_octets = int(hc_out.get(idx, 0)) if hc_out else 0
            speed_mbps = int(high_speed.get(idx, 0)) if high_speed else 0
            speed_bps = speed_mbps * 1000000
            
            last_metric = db.query(InterfaceTrafficMetric).filter(
                InterfaceTrafficMetric.olt_id == olt_id,
                InterfaceTrafficMetric.interface_name == name
            ).order_by(InterfaceTrafficMetric.id.desc()).first()
            
            in_bps = 0
            out_bps = 0
            
            if last_metric:
                seconds = (now - last_metric.created_at).total_seconds()
                if seconds > 0 and in_octets >= last_metric.in_octets:
                    in_bps = ((in_octets - last_metric.in_octets) * 8) / seconds
                if seconds > 0 and out_octets >= last_metric.out_octets:
                    out_bps = ((out_octets - last_metric.out_octets) * 8) / seconds
            
            new_metric = InterfaceTrafficMetric(
                olt_id=olt_id,
                interface_name=name,
                interface_type=interface_type,
                direction_in_bps=in_bps,
                direction_out_bps=out_bps,
                in_octets=in_octets,
                out_octets=out_octets,
                speed_bps=speed_bps,
                source="snmp",
                created_at=now
            )
            db.add(new_metric)
            if interface_type == 'uplink':
                total_in_bps += in_bps
                total_out_bps += out_bps
                
        olt.last_total_in_bps = total_in_bps
        olt.last_total_out_bps = total_out_bps
        olt.last_traffic_sync_at = now
        db.commit()
    except Exception as e:
        print(f"Error collecting traffic for OLT {olt_id}: {e}")
    finally:
        db.close()
