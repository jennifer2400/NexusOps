from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.db.session import get_db
from app.models.provisioning import ProvisioningTemplate, ProvisioningJob
from app.services.provisioning.utils import safe_render_template

router = APIRouter()

class TemplateCreate(BaseModel):
    name: str
    vendor: str
    onu_model: Optional[str] = None
    service_mode: str
    commands_template: str
    rollback_template: Optional[str] = None

class JobCreate(BaseModel):
    olt_id: int
    onu_sn: str
    template_id: int
    variables: Dict[str, Any]
    speed_profile_id: Optional[int] = None
    vlan_profile_id: Optional[int] = None
    is_new_onu: bool = False

class DryRunRequest(BaseModel):
    olt_id: int
    template_id: int
    onu_sn: Optional[str] = None
    variables: Dict[str, Any]
    speed_profile_id: Optional[int] = None
    vlan_profile_id: Optional[int] = None
    is_new_onu: bool = False

class TemplateResponse(BaseModel):
    id: int
    name: str
    vendor: str
    onu_model: Optional[str] = None
    service_mode: str
    commands_template: str
    rollback_template: Optional[str] = None
    variables_schema: List[str] = []

    class Config:
        orm_mode = True

@router.get("/templates", response_model=List[TemplateResponse])
def get_templates(db: Session = Depends(get_db)):
    return db.query(ProvisioningTemplate).all()

@router.post("/templates")
def create_template(data: TemplateCreate, db: Session = Depends(get_db)):
    tmpl = ProvisioningTemplate(**data.dict())
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return tmpl

@router.delete("/templates/{id}")
def delete_template(id: int, db: Session = Depends(get_db)):
    tmpl = db.query(ProvisioningTemplate).filter(ProvisioningTemplate.id == id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template no encontrado")
    db.delete(tmpl)
    db.commit()
    return {"message": "Template eliminado"}

def run_pre_flight_checks(db: Session, olt_id: int, onu_sn: str, tmpl: ProvisioningTemplate, variables: dict, allocated_resources: dict, is_job: bool = False) -> list:
    from app.models.network import ONU
    import re
    
    warnings = []
    errors = []
    
    # 1. Identity Format
    name = variables.get('name', '')
    if name:
        if not re.match(r"^[A-Za-z0-9_-]+$", name):
            errors.append("El nombre contiene espacios o caracteres no permitidos. Use solo letras, números, guiones o guiones bajos.")
            
    # 2. Certification
    if not tmpl.certified:
        if is_job:
            errors.append(f"La plantilla '{tmpl.name}' NO está certificada para ejecución real.")
        else:
            warnings.append(f"La plantilla '{tmpl.name}' no está certificada. Solo apta para Dry Run.")
            
    # 3. Duplicate SN
    if onu_sn:
        onu_interface = variables.get('onu_interface', '')
        is_new_onu = ":" not in onu_interface
        if is_new_onu:
            existing = db.query(ONU).filter(ONU.sn == onu_sn, ONU.status != 'deleted').first()
            if existing:
                errors.append(f"El número de serie {onu_sn} ya está registrado en la OLT {existing.olt_id} ({existing.interface}).")
                
    # 4. PON Saturation
    if 'onu_id' in allocated_resources:
        onu_id = allocated_resources['onu_id']
        if onu_id > 120 and onu_id < 128:
            warnings.append(f"Alta saturación en PON: ONU ID asignado es {onu_id}/128.")
        elif onu_id >= 128:
            errors.append("Capacidad PON crítica: No hay IDs libres (128/128 ocupados).")
            
    # 5. Speed/Vlan validation can also be inferred if variables missing
    if 'vlan' not in variables:
        warnings.append("No se ha asignado VLAN al servicio.")
        
    if is_job and len(errors) > 0:
        raise HTTPException(status_code=400, detail="Fallo en Pre-Flight Checks: " + " | ".join(errors))
        
    return {"warnings": warnings, "errors": errors}

INTERNAL_VARIABLES = {
    "full_onu_interface",
    "onu_id",
    "pon_interface",
    "tcont_index",
    "gemport_index",
    "gemport_name",
    "service_port_index",
    "vport",
    "upstream_profile",
    "downstream_profile",
    "vlan",
    "onu_sn",
    "onu_interface"
}

@router.post("/dry-run")
def do_dry_run(req: DryRunRequest, db: Session = Depends(get_db)):
    from app.models.provisioning import SpeedProfile, VlanProfile

    tmpl = db.query(ProvisioningTemplate).filter(ProvisioningTemplate.id == req.template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template no encontrado")
        
    # Security: Filter out internal variables if they were sent by frontend
    variables = {}
    for k, v in req.variables.items():
        if k.lower() in INTERNAL_VARIABLES:
            continue
        variables[k] = v
        
    source_of_values = {}
    
    # Force inject onu_sn
    variables['onu_sn'] = req.onu_sn
    source_of_values['onu_sn'] = "frontend_selection"
    
    if req.speed_profile_id:
        sp = db.query(SpeedProfile).filter(SpeedProfile.id == req.speed_profile_id).first()
        if sp:
            variables['upstream_profile'] = sp.upstream_profile
            variables['downstream_profile'] = sp.downstream_profile
            source_of_values['upstream_profile'] = "speed_profile"
            source_of_values['downstream_profile'] = "speed_profile"
            if not sp.uses_gpon_shaping:
                variables['downstream_profile'] = "DEFAULT"
                
    if req.vlan_profile_id:
        vp = db.query(VlanProfile).filter(VlanProfile.id == req.vlan_profile_id).first()
        if vp:
            variables['vlan'] = str(vp.vlan_id)
            source_of_values['vlan'] = "vlan_profile"
            
    # Resource Allocation (GPON Resource Manager)
    from app.services.provisioning.resources import get_next_onu_id, get_next_onu_internal_resources
    
    allocated_resources = {}
    
    # Read raw pon interface from the request's ONU selection
    raw_onu_interface = req.variables.get('onu_interface', '')
    
    try:
        if req.is_new_onu:
            if ":" in raw_onu_interface:
                # e.g., gpon-onu_1/2/1:pending -> gpon-olt_1/2/1
                pon_part = raw_onu_interface.split(":")[0].replace('gpon-onu', 'gpon-olt')
            else:
                # e.g., gpon-olt_1/2/1
                pon_part = raw_onu_interface
                
            pon_interface = pon_part
            variables['pon_interface'] = pon_interface
            variables['is_new_onu'] = True
            source_of_values['pon_interface'] = "detected_from_onu"
            
            next_onu_id = get_next_onu_id(db, req.olt_id, pon_interface)
            
            variables['onu_id'] = str(next_onu_id)
            variables['full_onu_interface'] = f"{pon_interface.replace('gpon-olt', 'gpon-onu')}:{next_onu_id}"
            source_of_values['onu_id'] = "calculated_free_id"
            source_of_values['full_onu_interface'] = "calculated"
            
            # For new ONUs, defaults to 1
            variables['tcont_index'] = "1"
            variables['gemport_index'] = "1"
            variables['gemport_name'] = "1"
            variables['service_port_index'] = "1"
            variables['vport'] = "1"
            
            source_of_values['tcont_index'] = "default_new_onu"
            source_of_values['gemport_index'] = "default_new_onu"
            source_of_values['gemport_name'] = "default_new_onu"
            source_of_values['service_port_index'] = "default_new_onu"
            source_of_values['vport'] = "default_new_onu"
            
            allocated_resources = {
                "onu_id": next_onu_id,
                "tcont": 1,
                "gemport": 1,
                "service_port": 1,
                "vport": 1
            }
        else:
            # Existing ONU, calculate internal resources
            resources = get_next_onu_internal_resources(db, req.olt_id, raw_onu_interface)
            variables['tcont_index'] = str(resources['tcont'])
            variables['gemport_index'] = str(resources['gemport'])
            variables['gemport_name'] = str(resources['gemport'])
            variables['service_port_index'] = str(resources['service_port'])
            variables['vport'] = str(resources['vport'])
            
            source_of_values['tcont_index'] = "read_from_olt"
            source_of_values['gemport_index'] = "read_from_olt"
            source_of_values['gemport_name'] = "read_from_olt"
            source_of_values['service_port_index'] = "read_from_olt"
            source_of_values['vport'] = "read_from_olt"
            
            allocated_resources = resources
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error en GPON Resource Manager: {str(e)}")
            
    try:
        commands = safe_render_template(tmpl.commands_template, variables)
        rollback = ""
        if tmpl.rollback_template:
            rollback = safe_render_template(tmpl.rollback_template, variables)
            
        pre_flight = run_pre_flight_checks(db, req.olt_id, req.onu_sn, tmpl, variables, allocated_resources, is_job=False)
            
        return {
            "commands": [c.strip() for c in commands.splitlines() if c.strip()],
            "rollback": [c.strip() for c in rollback.splitlines() if c.strip()],
            "calculated_variables": variables,
            "allocated_resources": allocated_resources,
            "source_of_values": source_of_values,
            "pre_flight_audit": pre_flight
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error renderizando template: {e}")

@router.get("/extract-config/{olt_id}/{onu_interface:path}")
def extract_onu_config(olt_id: int, onu_interface: str, db: Session = Depends(get_db)):
    from app.models.network import OLT
    from app.drivers.zte import ZteC320Driver
    from app.core.crypto import decrypt_secret
    
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: raise HTTPException(status_code=404, detail="OLT no encontrada")
    
    pwd = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
    
    try:
        driver.connect()
        data = driver.get_onu_full_config(onu_interface)
        driver.disconnect()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs")
def create_job(req: JobCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # 0. Check template certification for Router mode
    tmpl = db.query(ProvisioningTemplate).filter(ProvisioningTemplate.id == req.template_id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template no encontrado")

    # 1. Validaciones previas de concurrencia
    active_job = db.query(ProvisioningJob).filter(
        ProvisioningJob.olt_id == req.olt_id,
        ProvisioningJob.status.in_(["pending", "validating", "connecting", "provisioning", "verifying", "rollback"])
    ).first()
    
    if active_job:
        raise HTTPException(status_code=400, detail="Ya existe un proceso de aprovisionamiento activo en esta OLT. Espere a que termine.")
        
    # Security: Filter out internal variables if they were sent by frontend
    variables = {}
    for k, v in req.variables.items():
        if k.lower() in INTERNAL_VARIABLES:
            continue
        variables[k] = v
        
    from app.models.provisioning import SpeedProfile, VlanProfile
    
    # Force inject onu_sn
    variables['onu_sn'] = req.onu_sn
    
    if req.speed_profile_id:
        sp = db.query(SpeedProfile).filter(SpeedProfile.id == req.speed_profile_id).first()
        if sp:
            variables['upstream_profile'] = sp.upstream_profile
            variables['downstream_profile'] = sp.downstream_profile
            if not sp.uses_gpon_shaping:
                variables['downstream_profile'] = "DEFAULT"
                
    if req.vlan_profile_id:
        vp = db.query(VlanProfile).filter(VlanProfile.id == req.vlan_profile_id).first()
        if vp:
            variables['vlan'] = str(vp.vlan_id)

    # Resource Allocation (GPON Resource Manager)
    from app.services.provisioning.resources import get_next_onu_id, get_next_onu_internal_resources
    from app.models.network import GponResourcePool
    from datetime import datetime, timedelta
    
    raw_onu_interface = req.variables.get('onu_interface', '')
    allocated_resources_db = []
    
    try:
        if req.is_new_onu:
            if ":" in raw_onu_interface:
                pon_part = raw_onu_interface.split(":")[0].replace('gpon-onu', 'gpon-olt')
            else:
                pon_part = raw_onu_interface
                
            pon_interface = pon_part
            variables['pon_interface'] = pon_interface
            variables['is_new_onu'] = True
            
            next_onu_id = get_next_onu_id(db, req.olt_id, pon_interface)
            
            variables['onu_id'] = str(next_onu_id)
            variables['full_onu_interface'] = f"{pon_interface.replace('gpon-olt', 'gpon-onu')}:{next_onu_id}"
            variables['onu_interface'] = variables['full_onu_interface']
            
            variables['tcont_index'] = "1"
            variables['gemport_index'] = "1"
            variables['gemport_name'] = "1"
            variables['service_port_index'] = "1"
            variables['vport'] = "1"
            
            allocated_resources_db.append(GponResourcePool(scope="pon", olt_id=req.olt_id, pon_interface=pon_interface, resource_type="onu_id", allocated_value=next_onu_id, status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
            allocated_resources_db.append(GponResourcePool(scope="onu", olt_id=req.olt_id, pon_interface=pon_interface, onu_interface=variables['full_onu_interface'], resource_type="tcont", allocated_value=1, status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
            allocated_resources_db.append(GponResourcePool(scope="onu", olt_id=req.olt_id, pon_interface=pon_interface, onu_interface=variables['full_onu_interface'], resource_type="gemport", allocated_value=1, status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
            allocated_resources_db.append(GponResourcePool(scope="onu", olt_id=req.olt_id, pon_interface=pon_interface, onu_interface=variables['full_onu_interface'], resource_type="service_port", allocated_value=1, status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
            allocated_resources_db.append(GponResourcePool(scope="onu", olt_id=req.olt_id, pon_interface=pon_interface, onu_interface=variables['full_onu_interface'], resource_type="vport", allocated_value=1, status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
        else:
            pon_interface = raw_onu_interface.split(":")[0].replace('gpon-onu', 'gpon-olt')
            variables['pon_interface'] = pon_interface
            variables['is_new_onu'] = False
            variables['onu_interface'] = raw_onu_interface
            resources = get_next_onu_internal_resources(db, req.olt_id, raw_onu_interface)
            variables['tcont_index'] = str(resources['tcont'])
            variables['gemport_index'] = str(resources['gemport'])
            variables['gemport_name'] = str(resources['gemport'])
            variables['service_port_index'] = str(resources['service_port'])
            variables['vport'] = str(resources['vport'])
            
            allocated_resources_db.append(GponResourcePool(scope="onu", olt_id=req.olt_id, pon_interface=pon_interface, onu_interface=raw_onu_interface, resource_type="tcont", allocated_value=resources['tcont'], status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
            allocated_resources_db.append(GponResourcePool(scope="onu", olt_id=req.olt_id, pon_interface=pon_interface, onu_interface=raw_onu_interface, resource_type="gemport", allocated_value=resources['gemport'], status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
            allocated_resources_db.append(GponResourcePool(scope="onu", olt_id=req.olt_id, pon_interface=pon_interface, onu_interface=raw_onu_interface, resource_type="service_port", allocated_value=resources['service_port'], status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
            allocated_resources_db.append(GponResourcePool(scope="onu", olt_id=req.olt_id, pon_interface=pon_interface, onu_interface=raw_onu_interface, resource_type="vport", allocated_value=resources['vport'], status="reserved", expires_at=datetime.utcnow()+timedelta(minutes=10)))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reservando GPON Resources: {str(e)}")

    # 2. RUN PRE FLIGHT CHECKS FOR JOB
    allocated_dict = {}
    if ":" not in raw_onu_interface:
        allocated_dict['onu_id'] = int(variables['onu_id'])
    run_pre_flight_checks(db, req.olt_id, req.onu_sn, tmpl, variables, allocated_dict, is_job=True)

    job = ProvisioningJob(
        olt_id=req.olt_id,
        onu_sn=req.onu_sn,
        template_id=req.template_id,
        variables=variables,
        status="pending"
    )
    db.add(job)
    db.flush() # flush to get job.id
    
    for r in allocated_resources_db:
        r.locked_by_job_id = job.id
        db.add(r)
        
    db.commit()
    db.refresh(job)
    
    from app.services.provisioning.executor import execute_provisioning_job
    background_tasks.add_task(execute_provisioning_job, job.id)
    
    return {"message": "Provisioning Job encolado", "job_id": job.id}

@router.get("/jobs")
def get_jobs(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(ProvisioningJob).order_by(ProvisioningJob.id.desc()).limit(limit).all()

@router.get("/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(ProvisioningJob).filter(ProvisioningJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
@router.get("/pon-matrix/{olt_id}/{pon_interface:path}")
def get_pon_matrix(olt_id: int, pon_interface: str, db: Session = Depends(get_db)):
    from app.models.network import OLT, GponResourcePool
    from app.drivers.zte import ZteC320Driver
    from app.core.crypto import decrypt_secret
    import re
    
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt: raise HTTPException(status_code=404, detail="OLT no encontrada")
    
    pwd = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
    
    matrix = []
    for i in range(1, 129):
        matrix.append({"id": i, "status": "free", "details": None})
        
    try:
        driver.connect()
        output = driver._send_command(f"show gpon onu state {pon_interface}")
        driver.disconnect()
        
        for line in output.splitlines():
            match = re.search(r"\d+/\d+/\d+:(\d+)\s+\S+\s+\S+\s+(\S+)", line)
            if match:
                onu_id = int(match.group(1))
                phase_state = match.group(2).lower()
                status = "online" if "working" in phase_state else "offline"
                if 1 <= onu_id <= 128:
                    matrix[onu_id - 1]["status"] = status
                    matrix[onu_id - 1]["details"] = phase_state
                    
    except Exception as e:
        print(f"Error fetching PON matrix: {e}")
        raise HTTPException(status_code=500, detail="Error de conexión con la OLT")
        
    reservations = db.query(GponResourcePool).filter(
        GponResourcePool.olt_id == olt_id,
        GponResourcePool.pon_interface == pon_interface,
        GponResourcePool.resource_type == "onu_id",
        GponResourcePool.status == "reserved"
    ).all()
    
    for r in reservations:
        onu_id = r.allocated_value
        if 1 <= onu_id <= 128:
            if matrix[onu_id - 1]["status"] == "free":
                matrix[onu_id - 1]["status"] = "reserved"
                matrix[onu_id - 1]["details"] = "Reservado por Job Activo"
                
    return {"pon_interface": pon_interface, "matrix": matrix}

@router.get("/pon-telemetry/{olt_id}/{pon_interface:path}")
def get_pon_telemetry(olt_id: int, pon_interface: str, db: Session = Depends(get_db)):
    from app.models.network import ONU
    from sqlalchemy import func
    
    # Prefix for matching: gpon-onu_1/2/2:
    interface_prefix = f"{pon_interface}:"
    
    onus = db.query(ONU).filter(
        ONU.olt_id == olt_id,
        ONU.interface.like(f"{interface_prefix}%")
    ).all()
    
    total = len(onus)
    online = sum(1 for o in onus if o.status == 'online')
    offline = sum(1 for o in onus if o.status == 'offline')
    los = sum(1 for o in onus if o.status == 'los')
    
    # Calculate top models
    models_count = {}
    for o in onus:
        m = o.onu_type or "Desconocido"
        models_count[m] = models_count.get(m, 0) + 1
    top_models = sorted([{"name": k, "count": v} for k,v in models_count.items()], key=lambda x: x["count"], reverse=True)[:3]
    
    # Calculate top VLANs
    vlans_count = {}
    for o in onus:
        v = o.vlan or "N/A"
        vlans_count[v] = vlans_count.get(v, 0) + 1
    top_vlans = sorted([{"vlan": k, "count": v} for k,v in vlans_count.items()], key=lambda x: x["count"], reverse=True)[:3]
    
    # Top plans (service_profile)
    plans_count = {}
    for o in onus:
        p = o.service_profile or "N/A"
        plans_count[p] = plans_count.get(p, 0) + 1
    top_plans = sorted([{"plan": k, "count": v} for k,v in plans_count.items()], key=lambda x: x["count"], reverse=True)[:3]
    
    return {
        "pon_interface": pon_interface,
        "total": total,
        "online": online,
        "offline": offline,
        "los": los,
        "free_ids": 128 - total,
        "occupation_percent": round((total / 128.0) * 100, 1) if total > 0 else 0,
        "top_models": top_models,
        "top_vlans": top_vlans,
        "top_plans": top_plans
    }

@router.delete("/onu/{olt_id}/{onu_interface:path}")
def delete_onu(olt_id: int, onu_interface: str, db: Session = Depends(get_db)):
    from app.models.network import ONU
    from app.models.provisioning import ONUDeleteJob
    from app.services.provisioning.executor import execute_onu_deletion_job
    
    onu = db.query(ONU).filter(
        ONU.olt_id == olt_id,
        ONU.interface == onu_interface,
        ONU.status != 'deleted'
    ).first()
    
    if not onu:
        raise HTTPException(status_code=404, detail="ONU no encontrada o ya eliminada.")
        
    # Extract PON interface (e.g. gpon-onu_1/2/1:44 -> gpon-olt_1/2/1)
    if ":" not in onu_interface:
        raise HTTPException(status_code=400, detail="Formato de interfaz ONU inválido.")
        
    base_int = onu_interface.split(":")[0]
    pon_interface = base_int.replace("gpon-onu", "gpon-olt")
    
    job = ONUDeleteJob(
        olt_id=olt_id,
        onu_id_ref=onu.id,
        onu_sn=onu.sn,
        pon_interface=pon_interface,
        onu_interface=onu_interface,
        operator_id=1 # Hardcoded for now
    )
    
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Run deletion logic in background or synchronously? 
    # The frontend is waiting for completion in this implementation since there's no websockets for delete job yet.
    # We will run it synchronously but ideally it should be background.
    execute_onu_deletion_job(job.id)
    
    db.refresh(job)
    if job.status == "failed":
        raise HTTPException(status_code=500, detail=f"Error al eliminar la ONU: {job.error_detail}")
        
    return {"status": "success", "message": "ONU eliminada correctamente", "job_id": job.id}

