from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.network import OLT, InterfaceTrafficMetric
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/{olt_id}/traffic")
def get_olt_traffic(olt_id: int, db: Session = Depends(get_db)):
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT not found")
        
    return {
        "olt_id": olt.id,
        "last_total_in_bps": olt.last_total_in_bps,
        "last_total_out_bps": olt.last_total_out_bps,
        "last_traffic_sync_at": olt.last_traffic_sync_at
    }

@router.get("/{olt_id}/traffic/history")
def get_olt_traffic_history(olt_id: int, minutes: int = 60, db: Session = Depends(get_db)):
    time_threshold = datetime.utcnow() - timedelta(minutes=minutes)
    
    # Obtener todas las lecturas de tipo uplink de esta OLT en ese periodo
    metrics = db.query(InterfaceTrafficMetric).filter(
        InterfaceTrafficMetric.olt_id == olt_id,
        InterfaceTrafficMetric.interface_type == "uplink",
        InterfaceTrafficMetric.created_at >= time_threshold
    ).order_by(InterfaceTrafficMetric.created_at.asc()).all()
    
    # Agrupar por timestamp (minuto a minuto aproximado)
    # Como el recolector corre cada 60s, agrupamos por created_at quitando segundos
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
