from sqlalchemy.orm import Session
from app.models.network import NetworkAlarm
from datetime import datetime

def create_or_update_alarm(
    db: Session, 
    olt_id: int, 
    alarm_type: str, 
    severity: str, 
    title: str, 
    description: str, 
    source: str = "system",
    onu_id: int = None,
    gateway_id: int = None
):
    # Check if active alarm of this type exists for this specific entity
    query = db.query(NetworkAlarm).filter(
        NetworkAlarm.alarm_type == alarm_type,
        NetworkAlarm.status == "active"
    )
    
    if onu_id:
        query = query.filter(NetworkAlarm.onu_id == onu_id)
    elif gateway_id:
        query = query.filter(NetworkAlarm.gateway_id == gateway_id)
    elif olt_id:
        query = query.filter(NetworkAlarm.olt_id == olt_id)
        
    existing = query.first()
    
    if existing:
        # Update description if it changed
        existing.description = description
        db.commit()
        return existing
        
    # Create new alarm
    new_alarm = NetworkAlarm(
        olt_id=olt_id,
        onu_id=onu_id,
        gateway_id=gateway_id,
        severity=severity,
        alarm_type=alarm_type,
        title=title,
        description=description,
        source=source,
        status="active"
    )
    db.add(new_alarm)
    db.commit()
    db.refresh(new_alarm)
    return new_alarm

def resolve_alarm(
    db: Session, 
    olt_id: int, 
    alarm_type: str, 
    onu_id: int = None,
    gateway_id: int = None
):
    query = db.query(NetworkAlarm).filter(
        NetworkAlarm.alarm_type == alarm_type,
        NetworkAlarm.status == "active"
    )
    
    if onu_id:
        query = query.filter(NetworkAlarm.onu_id == onu_id)
    elif gateway_id:
        query = query.filter(NetworkAlarm.gateway_id == gateway_id)
    elif olt_id:
        query = query.filter(NetworkAlarm.olt_id == olt_id)
        
    existing = query.first()
    
    if existing:
        existing.status = "resolved"
        existing.resolved_at = datetime.utcnow()
        db.commit()
        return True
        
    return False
