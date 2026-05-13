from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.models.network import OLT, SyncJob
from pydantic import BaseModel
from datetime import datetime
import logging
import asyncio

logger = logging.getLogger(__name__)
router = APIRouter()

class SyncResponse(BaseModel):
    message: str
    job_id: int
    mode: str

class SyncJobResponse(BaseModel):
    id: int
    olt_id: int
    job_type: str
    status: str
    started_by: str
    progress_percent: int
    current_step: Optional[str]
    command_count: int
    started_at: datetime
    finished_at: Optional[datetime]
    duration_ms: Optional[int]
    total_onus: int
    online_onus: int
    offline_onus: int
    result_summary: Optional[str]

    class Config:
        orm_mode = True

@router.post("/{olt_id}/sync", response_model=SyncResponse, status_code=202)
def trigger_manual_sync(olt_id: int, sync_mode: str = Query("full"), db: Session = Depends(get_db)):
    """Encola un SyncJob asíncrono para la OLT (HTTP 202 Accepted)"""
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt:
        raise HTTPException(status_code=404, detail="OLT no encontrada en la base de datos")
    if not olt.is_enabled:
        raise HTTPException(status_code=400, detail="No se puede sincronizar una OLT deshabilitada")

    running_job = db.query(SyncJob).filter(SyncJob.olt_id == olt_id, SyncJob.status == "running").first()
    if running_job:
        raise HTTPException(status_code=409, detail=f"Ya existe un sync en progreso para esta OLT (Job #{running_job.id})")

    # Creamos el Job en DB
    job = SyncJob(olt_id=olt.id, job_type="deep" if sync_mode == "full" else "fast", status="running", started_by="manual")
    db.add(job)
    db.commit()
    db.refresh(job)

    # Disparamos asíncronamente
    from app.core.scheduler import run_sync_job
    asyncio.create_task(run_sync_job(olt.id, job.job_type, "manual", job.id))

    return {"message": "Sincronización iniciada en segundo plano", "job_id": job.id, "mode": job.job_type}

@router.get("/{olt_id}/sync/jobs", response_model=List[SyncJobResponse])
def get_sync_jobs(olt_id: int, limit: int = 5, db: Session = Depends(get_db)):
    """Obtiene el historial de sync jobs de la OLT"""
    jobs = db.query(SyncJob).filter(SyncJob.olt_id == olt_id).order_by(SyncJob.id.desc()).limit(limit).all()
    return jobs

@router.get("/sync/logs/{job_id}")
def get_sync_job_log(job_id: int, db: Session = Depends(get_db)):
    """Obtiene el log crudo técnico de un job"""
    job = db.query(SyncJob).filter(SyncJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return {"id": job.id, "raw_log": job.raw_log, "status": job.status, "current_step": job.current_step}
