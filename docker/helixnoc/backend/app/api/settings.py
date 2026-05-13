from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict
from pydantic import BaseModel
from app.db.session import get_db
from app.models.network import SystemSetting

router = APIRouter()

class SettingItem(BaseModel):
    key: str
    value: str
    description: str

@router.get("/", response_model=List[SettingItem])
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(SystemSetting).all()
    return [{"key": s.key, "value": s.value, "description": s.description} for s in settings]

@router.post("/")
def update_settings(settings_data: List[SettingItem], db: Session = Depends(get_db)):
    for item in settings_data:
        setting = db.query(SystemSetting).filter(SystemSetting.key == item.key).first()
        if setting:
            setting.value = item.value
            setting.description = item.description
        else:
            db.add(SystemSetting(key=item.key, value=item.value, description=item.description))
    db.commit()
    return {"message": "Settings updated"}
