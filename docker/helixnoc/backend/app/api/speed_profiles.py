from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.provisioning import SpeedProfile
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

class SpeedProfileBase(BaseModel):
    name: str
    download_mbps: int
    upload_mbps: int
    upstream_profile: str
    downstream_profile: str
    uses_gpon_shaping: bool = True
    olt_vendor: str = "ZTE"
    notes: Optional[str] = None
    status: str = "active"

class SpeedProfileCreate(SpeedProfileBase):
    pass

class SpeedProfileUpdate(BaseModel):
    name: Optional[str] = None
    download_mbps: Optional[int] = None
    upload_mbps: Optional[int] = None
    upstream_profile: Optional[str] = None
    downstream_profile: Optional[str] = None
    uses_gpon_shaping: Optional[bool] = None
    olt_vendor: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

@router.get("/")
def get_speed_profiles(db: Session = Depends(get_db)):
    return db.query(SpeedProfile).order_by(SpeedProfile.name).all()

@router.post("/")
def create_speed_profile(profile: SpeedProfileCreate, db: Session = Depends(get_db)):
    db_prof = SpeedProfile(**profile.model_dump())
    db.add(db_prof)
    db.commit()
    db.refresh(db_prof)
    return db_prof

@router.put("/{profile_id}")
def update_speed_profile(profile_id: int, profile: SpeedProfileUpdate, db: Session = Depends(get_db)):
    db_prof = db.query(SpeedProfile).filter(SpeedProfile.id == profile_id).first()
    if not db_prof:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    update_data = profile.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_prof, key, value)
        
    db.commit()
    db.refresh(db_prof)
    return db_prof

@router.delete("/{profile_id}")
def delete_speed_profile(profile_id: int, db: Session = Depends(get_db)):
    db_prof = db.query(SpeedProfile).filter(SpeedProfile.id == profile_id).first()
    if not db_prof:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(db_prof)
    db.commit()
    return {"ok": True}
