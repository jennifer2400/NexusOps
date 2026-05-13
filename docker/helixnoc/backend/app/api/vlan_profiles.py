from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.provisioning import VlanProfile
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from fastapi import BackgroundTasks
import json

router = APIRouter()

class VlanProfileBase(BaseModel):
    vlan_id: int
    name: str
    service_type: str = "internet"
    olt_id: Optional[int] = None
    site_gateway_id: Optional[int] = None
    allowed_on_uplinks: Optional[str] = None
    description: Optional[str] = None
    status: str = "active"

class VlanProfileCreate(VlanProfileBase):
    pass

class VlanProfileUpdate(BaseModel):
    vlan_id: Optional[int] = None
    name: Optional[str] = None
    service_type: Optional[str] = None
    olt_id: Optional[int] = None
    site_gateway_id: Optional[int] = None
    allowed_on_uplinks: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

@router.get("/")
def get_vlan_profiles(olt_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(VlanProfile)
    if olt_id:
        query = query.filter((VlanProfile.olt_id == olt_id) | (VlanProfile.olt_id == None))
    return query.order_by(VlanProfile.vlan_id).all()

@router.post("/")
def create_vlan_profile(profile: VlanProfileCreate, db: Session = Depends(get_db)):
    db_prof = VlanProfile(**profile.model_dump())
    db.add(db_prof)
    db.commit()
    db.refresh(db_prof)
    return db_prof

@router.put("/{profile_id}")
def update_vlan_profile(profile_id: int, profile: VlanProfileUpdate, db: Session = Depends(get_db)):
    db_prof = db.query(VlanProfile).filter(VlanProfile.id == profile_id).first()
    if not db_prof:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    update_data = profile.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_prof, key, value)
        
    db.commit()
    db.refresh(db_prof)
    return db_prof

@router.delete("/{profile_id}")
def delete_vlan_profile(profile_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    from app.models.provisioning import VlanTransportJob
    from app.services.provisioning.executor import execute_vlan_deletion_job
    
    db_prof = db.query(VlanProfile).filter(VlanProfile.id == profile_id).first()
    if not db_prof:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    # Get the latest successful job to know the uplinks and tag mode
    latest_job = db.query(VlanTransportJob).filter(
        VlanTransportJob.vlan_profile_id == profile_id,
        VlanTransportJob.status == "success"
    ).order_by(VlanTransportJob.id.desc()).first()
    
    if latest_job and db_prof.olt_id:
        tag_str = "tag" if latest_job.transport_mode in ["tagged", "hybrid"] else "untag"
        background_tasks.add_task(
            execute_vlan_deletion_job,
            db_prof.olt_id,
            db_prof.vlan_id,
            latest_job.uplinks_target,
            tag_str
        )
        
    db.query(VlanTransportJob).filter(VlanTransportJob.vlan_profile_id == profile_id).delete()
    db.delete(db_prof)
    db.commit()
    return {"ok": True}

class VlanDryRunRequest(BaseModel):
    olt_id: int
    vlan_id: int
    name: str
    selected_uplinks: List[str]
    transport_mode: str # tagged, untagged, hybrid

@router.post("/dry-run")
def vlan_dry_run(req: VlanDryRunRequest, db: Session = Depends(get_db)):
    commands = [
        "configure terminal",
        f"vlan {req.vlan_id}",
        f"  name {req.name.replace(' ', '_')}",
        "exit"
    ]
    
    tag_str = "tag" if req.transport_mode in ["tagged", "hybrid"] else "untag"
    
    for uplink in req.selected_uplinks:
        commands.append(f"interface {uplink}")
        commands.append(f"  switchport vlan {req.vlan_id} {tag_str}")
        commands.append("exit")
        
    return {
        "commands": commands,
        "pre_flight_audit": {
            "warnings": [],
            "errors": []
        }
    }

class VlanJobRequest(BaseModel):
    olt_id: int
    vlan_id: int
    name: str
    service_type: str
    selected_uplinks: List[str]
    transport_mode: str

@router.post("/job")
def create_vlan_job(req: VlanJobRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    from app.models.provisioning import VlanProfile, VlanTransportJob
    from app.services.provisioning.executor import execute_vlan_transport_job
    
    # 1. Create VlanProfile as pending
    db_prof = db.query(VlanProfile).filter(VlanProfile.vlan_id == req.vlan_id).first()
    if not db_prof:
        db_prof = VlanProfile(
            vlan_id=req.vlan_id,
            name=req.name,
            service_type=req.service_type,
            olt_id=req.olt_id,
            allowed_on_uplinks=json.dumps(req.selected_uplinks),
            status="pending_transport"
        )
        db.add(db_prof)
        db.commit()
        db.refresh(db_prof)
    else:
        db_prof.status = "pending_transport"
        db_prof.allowed_on_uplinks = json.dumps(req.selected_uplinks)
        db.commit()
        
    # 2. Create Job
    job = VlanTransportJob(
        olt_id=req.olt_id,
        vlan_profile_id=db_prof.id,
        status="pending",
        uplinks_target=req.selected_uplinks,
        transport_mode=req.transport_mode
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # 3. Spawn background worker
    background_tasks.add_task(execute_vlan_transport_job, job.id)
    
    return {"job_id": job.id, "vlan_profile_id": db_prof.id}

@router.get("/job/{job_id}")
def get_vlan_job(job_id: int, db: Session = Depends(get_db)):
    from app.models.provisioning import VlanTransportJob
    job = db.query(VlanTransportJob).filter(VlanTransportJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
        
    return {
        "id": job.id,
        "status": job.status,
        "error_detail": job.error_detail,
        "logs": job.logs,
        "uplinks_target": job.uplinks_target
    }
