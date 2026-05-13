from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.network import OLT, SyncJob, ONU, OnuStateHistory, SiteGateway
from app.drivers.zte import ZteC320Driver
from app.core.crypto import decrypt_secret
from datetime import datetime, timedelta
import logging
import asyncio
import traceback
import time

logger = logging.getLogger(__name__)

jobstores = {
    'default': MemoryJobStore()
}
scheduler = AsyncIOScheduler(jobstores=jobstores, timezone="UTC")

def release_stale_jobs(db: Session):
    """ Watchdog: Marca como failed los jobs atascados por más de 20 minutos """
    stale_threshold = datetime.utcnow() - timedelta(minutes=20)
    stale_jobs = db.query(SyncJob).filter(
        SyncJob.status == "running",
        SyncJob.started_at < stale_threshold
    ).all()
    
    for job in stale_jobs:
        job.status = "failed"
        job.result_summary = "Watchdog: Job expirado por timeout de 20 minutos."
        job.finished_at = datetime.utcnow()
        if job.raw_log:
            job.raw_log += f"\n[{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}] ERROR: Job asesinado por Watchdog."
    if stale_jobs:
        db.commit()

async def fast_sync_all_olts():
    db = SessionLocal()
    try:
        release_stale_jobs(db)
        olts = db.query(OLT).filter(OLT.is_enabled == True).all()
        for olt in olts:
            if olt.next_sync_allowed_at and olt.next_sync_allowed_at > datetime.utcnow():
                logger.info(f"[FastSync] OLT {olt.id} en Cooldown hasta {olt.next_sync_allowed_at}")
                continue
                
            running_job = db.query(SyncJob).filter(SyncJob.olt_id == olt.id, SyncJob.status == "running").first()
            if running_job:
                logger.info(f"[FastSync] OLT {olt.id} ya tiene un job corriendo. Se omite.")
                continue
            asyncio.create_task(run_sync_job(olt.id, "fast", "scheduler"))
    finally:
        db.close()

async def deep_sync_all_olts():
    db = SessionLocal()
    try:
        release_stale_jobs(db)
        olts = db.query(OLT).filter(OLT.is_enabled == True).all()
        for olt in olts:
            if olt.next_sync_allowed_at and olt.next_sync_allowed_at > datetime.utcnow():
                continue
            running_job = db.query(SyncJob).filter(SyncJob.olt_id == olt.id, SyncJob.status == "running").first()
            if running_job:
                continue
            asyncio.create_task(run_sync_job(olt.id, "deep", "scheduler"))
    finally:
        db.close()

async def run_sync_job(olt_id: int, mode: str, started_by: str, manual_job_id: int = None):
    db = SessionLocal()
    start_time = datetime.utcnow()
    
    if manual_job_id:
        job = db.query(SyncJob).filter(SyncJob.id == manual_job_id).first()
    else:
        job = SyncJob(olt_id=olt_id, job_type=mode, status="running", started_by=started_by)
        db.add(job)
        db.commit()
        db.refresh(job)

    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    if not olt or not olt.is_enabled:
        job.status = "failed"
        job.result_summary = "OLT no encontrada o deshabilitada"
        job.finished_at = datetime.utcnow()
        db.commit()
        db.close()
        return

    raw_log_lines = []
    def log_to_job(msg):
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {msg}"
        raw_log_lines.append(line)
        job.raw_log = "\n".join(raw_log_lines)
        db.commit()

    log_to_job(f"Iniciando {mode.upper()} Sync para OLT: {olt.name} ({olt.ip_address})")
    
    if olt.site_gateway_id:
        gw = db.query(SiteGateway).filter(SiteGateway.id == olt.site_gateway_id).first()
        if gw:
            log_to_job(f"Topología detectada: Ruta a través de WireGuard Gateway '{gw.name}' ({gw.wg_ip})")
        else:
            log_to_job("Topología detectada: OLT tiene Gateway configurado pero no se encontró en BD.")
    else:
        log_to_job("Topología detectada: Conexión Directa.")

    job.current_step = "Conectando a OLT..."
    db.commit()

    decrypted_pass = decrypt_secret(olt.password) if olt.password else ""
    driver = ZteC320Driver(host=olt.ip_address, port=olt.port, username=olt.username, password=decrypted_pass)
    
    try:
        t0 = time.time()
        await asyncio.to_thread(driver.connect)
        job.command_count += 1
        log_to_job(f"Conexión CLI establecida exitosamente en {round(time.time() - t0, 2)}s.")
        
        job.current_step = "Obteniendo estado de ONUs..."
        db.commit()
        t0 = time.time()
        states = await asyncio.to_thread(driver.get_all_onu_states)
        job.command_count += 1
        log_to_job(f"Se encontraron {len(states)} ONUs en el árbol PON en {round(time.time() - t0, 2)}s.")
        
        configs = {}
        optical_powers = {}
        warnings = []
        
        if mode == "deep":
            job.current_step = "Descargando running-config completo..."
            db.commit()
            t0 = time.time()
            try:
                configs = await asyncio.to_thread(driver.get_all_onu_configs)
                job.command_count += 1
                log_to_job(f"Se descargó running-config para {len(configs)} interfaces en {round(time.time() - t0, 2)}s.")
            except Exception as e:
                warnings.append(f"Error parsing running-config: {str(e)}")
                log_to_job(f"Warning: Hubo fallos en el parser de configs: {str(e)}")
                
            job.current_step = "Obteniendo potencia óptica Rx..."
            db.commit()
            t0 = time.time()
            try:
                optical_powers = await asyncio.to_thread(driver.get_all_optical_power)
                job.command_count += 1
                log_to_job(f"Potencias ópticas extraídas en {round(time.time() - t0, 2)}s.")
            except Exception as e:
                warnings.append(f"Error extrayendo potencias: {str(e)}")
                log_to_job(f"Warning: No se pudieron extraer potencias: {str(e)}")

        job.current_step = "Procesando datos en BD..."
        db.commit()
        
        synced_count = 0
        online_count = 0
        offline_count = 0
        
        for i, (interface, state_data) in enumerate(states.items()):
            existing_onu = db.query(ONU).filter(ONU.interface == interface, ONU.olt_id == olt.id).first()
            config_data = configs.get(interface, {})
            power_str = optical_powers.get(interface)
            
            final_sn = config_data.get("sn") or state_data.get("sn")
            status = state_data.get("status", "offline")
            
            if status == "working": online_count += 1
            else: offline_count += 1
            
            target_onu = existing_onu
            if target_onu:
                target_onu.status = status
                target_onu.last_sync_at = start_time
                if final_sn and "PENDING" not in final_sn:
                    target_onu.sn = final_sn
                    
                if mode == "deep":
                    if config_data.get("name"): target_onu.name = config_data.get("name")
                    if config_data.get("description"): target_onu.description = config_data.get("description")
                    if config_data.get("onu_type"): target_onu.onu_type = config_data.get("onu_type")
                    if config_data.get("vlan"): target_onu.vlan = config_data.get("vlan")
                    if config_data.get("service_profile"): target_onu.service_profile = config_data.get("service_profile")
                    if config_data.get("bridge_router_mode"): target_onu.bridge_router_mode = config_data.get("bridge_router_mode")
                    if config_data.get("pppoe_username"): target_onu.pppoe_username = config_data.get("pppoe_username")
                    target_onu.config_source = "ZTE_RUNNING_CONFIG"
                    
                    # ONU Model Discovery
                    olt_type_name = config_data.get("olt_type_name")
                    if olt_type_name:
                        from app.models.provisioning import OnuModelProfile
                        model_prof = db.query(OnuModelProfile).filter(OnuModelProfile.model_name == olt_type_name).first()
                        if not model_prof:
                            type_upper = olt_type_name.upper()
                            supports_catv = "CATV" in type_upper
                            vendor = "Unknown"
                            if "XPON" in type_upper: vendor = "Generic/Unknown"
                            elif "RL804" in type_upper: vendor = "RedLink/Unknown"
                            elif "ZTE" in type_upper: vendor = "ZTE"
                            elif "HUAWEI" in type_upper: vendor = "Huawei"
                            elif "VSOL" in type_upper or "V28" in type_upper: vendor = "V-SOL"
                            
                            model_prof = OnuModelProfile(
                                model_name=olt_type_name,
                                olt_type_name=olt_type_name,
                                vendor=vendor,
                                source_olt_id=olt.id,
                                detected_count=1,
                                supports_wifi="WIFI" in type_upper,
                                supports_catv=supports_catv,
                            )
                            db.add(model_prof)
                            db.flush() # Importante para evitar duplicados en la misma transacción
                        else:
                            model_prof.detected_count += 1
                            model_prof.last_seen_at = start_time
            else:
                target_onu = ONU(
                    olt_id=olt.id,
                    interface=interface,
                    sn=final_sn,
                    status=status,
                    last_sync_at=start_time,
                    name=config_data.get("name"),
                    description=config_data.get("description"),
                    onu_type=config_data.get("onu_type"),
                    vlan=config_data.get("vlan"),
                    service_profile=config_data.get("service_profile"),
                    bridge_router_mode=config_data.get("bridge_router_mode") if mode == "deep" else None,
                    pppoe_username=config_data.get("pppoe_username"),
                    config_source="ZTE_RUNNING_CONFIG" if mode == "deep" else None
                )
                db.add(target_onu)
                db.flush() # Para obtener el ID del nuevo ONU
                
            # Guardar historial si estamos en deep sync y hay info, o si el estado cambia (podría expandirse luego)
            if mode == "deep" and power_str:
                hist = OnuStateHistory(
                    onu_id=target_onu.id,
                    status=status,
                    optical_power=power_str,
                    sync_job_id=job.id
                )
                db.add(hist)
                
            synced_count += 1
            
            if i % 20 == 0:
                job.progress_percent = int((i / len(states)) * 100)
                db.commit()

        job.progress_percent = 100
        job.total_onus = synced_count
        job.online_onus = online_count
        job.offline_onus = offline_count
        job.errors_detected = warnings if warnings else None
        
        job.status = "success"
        job.result_summary = f"Sincronizadas {synced_count} ONUs ({online_count} online, {offline_count} offline)."
        if warnings:
            job.result_summary += f" ({len(warnings)} warnings generados)"
        
        # Reseteo de fallos
        olt.last_sync_at = start_time
        olt.last_sync_error = None
        olt.consecutive_sync_failures = 0
        olt.next_sync_allowed_at = None
        
        log_to_job("Procesamiento en BD completado con éxito.")
        
    except Exception as e:
        logger.error(f"Error en run_sync_job para OLT {olt_id}: {e}")
        job.status = "failed"
        job.result_summary = str(e)
        
        olt.last_sync_error = str(e)
        olt.consecutive_sync_failures += 1
        
        # Backoff Logic
        if olt.consecutive_sync_failures >= 5:
            olt.next_sync_allowed_at = datetime.utcnow() + timedelta(minutes=15)
            log_to_job("CRITICAL: OLT falló 5 veces consecutivas. Entrando en Cooldown de 15 minutos.")
        elif olt.consecutive_sync_failures >= 3:
            olt.next_sync_allowed_at = datetime.utcnow() + timedelta(minutes=5)
            log_to_job("WARNING: OLT falló 3 veces consecutivas. Entrando en Cooldown de 5 minutos.")
            
        log_to_job(f"ERROR: {traceback.format_exc()}")
    finally:
        try:
            await asyncio.to_thread(driver.disconnect)
            log_to_job("Desconectado de la OLT.")
        except: pass
        
        end_time = datetime.utcnow()
        job.finished_at = end_time
        job.duration_ms = int((end_time - start_time).total_seconds() * 1000)
        olt.sync_duration_ms = job.duration_ms
        db.commit()
        db.close()

from app.models.provisioning import ProvisioningJob
from app.services.provisioning.engine import ProvisioningEngine
from app.services.traffic_collector import collect_olt_traffic

async def process_provisioning_jobs():
    db = SessionLocal()
    try:
        # Find one pending job to process (serialization per worker)
        pending_job = db.query(ProvisioningJob).filter(ProvisioningJob.status == "pending").first()
        if pending_job:
            # We could do a DB lock here for multi-worker (Celery), but since it's a single APScheduler thread, this is fine
            # Run in a separate thread so we don't block the asyncio event loop or the scheduler
            await asyncio.to_thread(ProvisioningEngine.run_job, pending_job.id)
    except Exception as e:
        logger.error(f"Error in process_provisioning_jobs: {e}")
    finally:
        db.close()

async def sync_all_olts_traffic():
    db = SessionLocal()
    try:
        olts = db.query(OLT).filter(OLT.is_enabled == True).all()
        for olt in olts:
            if not olt.snmp_community:
                continue
            # Execute in thread to avoid blocking loop with SNMP calls
            await asyncio.to_thread(collect_olt_traffic, olt.id)
    except Exception as e:
        logger.error(f"Error en sync_all_olts_traffic: {e}")
    finally:
        db.close()

def start_scheduler():
    if not scheduler.running:
        scheduler.add_job(fast_sync_all_olts, IntervalTrigger(seconds=60), id="fast_sync_all", replace_existing=True)
        scheduler.add_job(deep_sync_all_olts, IntervalTrigger(minutes=15), id="deep_sync_all", replace_existing=True)
        scheduler.add_job(process_provisioning_jobs, IntervalTrigger(seconds=5), id="provisioning_worker", replace_existing=True)
        scheduler.add_job(sync_all_olts_traffic, IntervalTrigger(seconds=60), id="traffic_collector_worker", replace_existing=True)
        scheduler.start()
        logger.info("APScheduler inicializado con FAST (60s), DEEP (15m), PROVISIONING (5s) y TRAFFIC (60s).")
