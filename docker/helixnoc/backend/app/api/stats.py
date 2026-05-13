from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.network import OLT, ONU, NetworkAlarm, InterfaceTrafficMetric
from datetime import datetime, timedelta
from sqlalchemy import func

router = APIRouter()

@router.get("/dashboard")
def get_dashboard_stats(db: Session = Depends(get_db)):
    olts_count = db.query(OLT).count()
    onus_count = db.query(ONU).count()
    critical_alarms = db.query(NetworkAlarm).filter(NetworkAlarm.status == "active", NetworkAlarm.severity == "critical").count()
    
    # Aggregate traffic across all OLTs
    olts = db.query(OLT).all()
    total_in = sum([olt.last_total_in_bps for olt in olts if olt.last_total_in_bps])
    total_out = sum([olt.last_total_out_bps for olt in olts if olt.last_total_out_bps])
    
    return {
        "total_olts": olts_count,
        "total_onus": onus_count,
        "critical_alarms": critical_alarms,
        "total_in_bps": total_in,
        "total_out_bps": total_out
    }

@router.get("/traffic/history")
def get_dashboard_traffic_history(minutes: int = 60, db: Session = Depends(get_db)):
    time_threshold = datetime.utcnow() - timedelta(minutes=minutes)
    
    metrics = db.query(InterfaceTrafficMetric).filter(
        InterfaceTrafficMetric.interface_type == "uplink",
        InterfaceTrafficMetric.created_at >= time_threshold
    ).order_by(InterfaceTrafficMetric.created_at.asc()).all()
    
    history_map = {}
    
    for m in metrics:
        key = m.created_at.strftime("%Y-%m-%d %H:%M")
        if key not in history_map:
            history_map[key] = {
                "timestamp": key,
                "in_bps": 0,
                "out_bps": 0
            }
        history_map[key]["in_bps"] += m.direction_in_bps
        history_map[key]["out_bps"] += m.direction_out_bps
        
    return list(history_map.values())
