from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.network import NetworkAlarm, OLT

router = APIRouter()

@router.get("/recent")
def get_recent_alarms(limit: int = 10, db: Session = Depends(get_db)):
    alarms = db.query(NetworkAlarm).order_by(NetworkAlarm.created_at.desc()).limit(limit).all()
    result = []
    for a in alarms:
        olt_name = None
        if a.olt_id:
            olt = db.query(OLT).filter(OLT.id == a.olt_id).first()
            if olt:
                olt_name = olt.name
                
        result.append({
            "id": a.id,
            "severity": a.severity,
            "alarm_type": a.alarm_type,
            "title": a.title,
            "description": a.description,
            "status": a.status,
            "created_at": a.created_at,
            "olt_name": olt_name
        })
    return result
