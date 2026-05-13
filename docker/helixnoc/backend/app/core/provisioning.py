import re
import json
import logging
import traceback
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.network import OLT, ProvisioningTemplate, ProvisioningJob, PONLock, ONU
from app.drivers.zte import ZteC320Driver
from app.core.crypto import decrypt_secret
import asyncio

logger = logging.getLogger(__name__)

def safe_render_template(template_str: str, variables: Dict[str, str]) -> str:
    """
    Renders a Python format string safely.
    Ensures that only expected variables are replaced, and validates them.
    Throws an Exception if a variable is missing or malformed.
    """
    # Detect all {placeholders} in the template
    placeholders = re.findall(r'\{([A-Za-z0-9_]+)\}', template_str)
    
    rendered = template_str
    for placeholder in placeholders:
        if placeholder not in variables:
            raise ValueError(f"Falta la variable requerida: {placeholder}")
            
        value = str(variables[placeholder])
        
        # Basal sanitization (prevent command injection on CLI via newlines)
        if '\n' in value or '\r' in value:
            raise ValueError(f"El valor de {placeholder} no puede contener saltos de línea.")
            
        # Replace
        rendered = rendered.replace("{" + placeholder + "}", value)
        
    return rendered

def check_pon_lock(db: Session, olt_id: int, pon_interface: str) -> bool:
    """ Returns True if the PON is locked """
    now = datetime.utcnow()
    lock = db.query(PONLock).filter(
        PONLock.olt_id == olt_id,
        PONLock.pon_interface == pon_interface,
        PONLock.expires_at > now
    ).first()
    return lock is not None

def acquire_pon_lock(db: Session, olt_id: int, pon_interface: str, job_id: int = None, timeout_minutes: int = 5) -> PONLock:
    if check_pon_lock(db, olt_id, pon_interface):
        raise Exception(f"El puerto PON {pon_interface} está actualmente bloqueado por otra transacción.")
        
    # Limpiar locks expirados
    now = datetime.utcnow()
    db.query(PONLock).filter(PONLock.expires_at <= now).delete()
    
    new_lock = PONLock(
        olt_id=olt_id,
        pon_interface=pon_interface,
        locked_by_job_id=job_id,
        expires_at=now + timedelta(minutes=timeout_minutes)
    )
    db.add(new_lock)
    db.commit()
    db.refresh(new_lock)
    return new_lock

def release_pon_lock(db: Session, lock: PONLock):
    db.delete(lock)
    db.commit()

async def dry_run_provisioning(olt_id: int, sn: str, pon_interface: str, template_id: int, raw_variables: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fase de Simulación: Valida esquema, construye comandos, comprueba compatibilidad.
    """
    db = SessionLocal()
    try:
        olt = db.query(OLT).filter(OLT.id == olt_id).first()
        template = db.query(ProvisioningTemplate).filter(ProvisioningTemplate.id == template_id).first()
        
        if not olt:
            raise ValueError("OLT no encontrada.")
        if not template:
            raise ValueError("Plantilla no encontrada.")
            
        # 1. Validar esquema
        schema = template.variables_schema or []
        variables = {}
        for var in schema:
            if var not in raw_variables or not str(raw_variables[var]).strip():
                raise ValueError(f"La variable {var} es obligatoria para esta plantilla.")
            variables[var] = str(raw_variables[var])
            
        # Variables implícitas
        variables['onu_sn'] = sn
        variables['pon_interface'] = pon_interface
        
        # 2. Renderizar comandos
        commands_json = template.command_template_json or []
        rendered_commands = []
        for cmd_tmpl in commands_json:
            cmd = safe_render_template(cmd_tmpl, variables)
            rendered_commands.append(cmd)
            
        # 3. Rollback renderizado (para visualizar qué pasaría si falla)
        rollback_json = template.rollback_template_json or []
        rendered_rollback = []
        for cmd_tmpl in rollback_json:
            cmd = safe_render_template(cmd_tmpl, variables)
            rendered_rollback.append(cmd)
            
        # 4. Warnings de Compatibilidad
        warnings = []
        if template.vendor and olt.vendor and template.vendor.lower() != olt.vendor.lower():
            warnings.append(f"Advertencia: La plantilla es para {template.vendor} pero la OLT es {olt.vendor}.")
            
        return {
            "status": "success",
            "rendered_commands": rendered_commands,
            "rendered_rollback": rendered_rollback,
            "warnings": warnings,
            "variables_used": variables
        }
        
    finally:
        db.close()

async def execute_provisioning(job_id: int):
    """
    Motor Transaccional:
    1. Pre-check y Reserva de ONU ID
    2. Lock del PON
    3. Construcción (Dry Run implícito)
    4. Ejecución Transaccional
    5. Commit (DB)
    6. Rollback (si falla)
    """
    db = SessionLocal()
    job = db.query(ProvisioningJob).filter(ProvisioningJob.id == job_id).first()
    if not job:
        db.close()
        return

    olt = db.query(OLT).filter(OLT.id == job.olt_id).first()
    template = db.query(ProvisioningTemplate).filter(ProvisioningTemplate.id == job.template_id).first()
    
    # 1. Recuperar info básica
    # interface format expected: gpon-onu_1/1/1:X or unconfigured: 1/1/1
    raw_interface = job.onu_interface
    pon_interface = ""
    if "gpon-onu" in raw_interface:
        pon_interface = raw_interface.split(":")[0].replace("gpon-onu_", "gpon-olt_")
    else:
        # If it's just 1/1/1 (from uncfg list)
        pon_interface = f"gpon-olt_{raw_interface}"

    raw_log_lines = []
    def log_to_job(msg):
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {msg}"
        raw_log_lines.append(line)
        job.raw_log = "\n".join(raw_log_lines)
        db.commit()

    lock = None
    driver = None
    try:
        job.status = "running"
        job.current_step = "Adquiriendo Lock y Conectando"
        db.commit()
        log_to_job(f"Iniciando Transacción de Aprovisionamiento para SN {job.onu_sn} en PON {pon_interface}")

        # 2. Lock del PON
        lock = acquire_pon_lock(db, olt.id, pon_interface, job.id)
        log_to_job("PON Lock adquirido exitosamente.")
        
        # Conectar a la OLT
        decrypted_pass = decrypt_secret(olt.password) if olt.password else ""
        driver = ZteC320Driver(host=olt.ip_address, port=olt.port, username=olt.username, password=decrypted_pass)
        await asyncio.to_thread(driver.connect)
        log_to_job("Conexión Telnet/SSH establecida.")

        # 3. Pre-check y Reserva
        job.current_step = "Reservando ONU ID"
        db.commit()
        onu_id = await asyncio.to_thread(driver.get_next_available_onu_id, pon_interface)
        log_to_job(f"ONU ID Reservado: {onu_id}")
        
        full_onu_interface = f"{pon_interface.replace('gpon-olt_', 'gpon-onu_')}:{onu_id}"
        
        # Construir variables (las del template y las calculadas)
        variables = {
            "vlan": job.vlan or "",
            "profile": job.profile or "",
            "onu_sn": job.onu_sn,
            "pon_interface": pon_interface,
            "onu_id": str(onu_id),
            "full_onu_interface": full_onu_interface
        }
        
        # 4. Renderizar Comandos
        commands_json = template.command_template_json or []
        rendered_commands = []
        for cmd_tmpl in commands_json:
            cmd = safe_render_template(cmd_tmpl, variables)
            rendered_commands.append(cmd)
            
        rollback_json = template.rollback_template_json or []
        rendered_rollback = []
        for cmd_tmpl in rollback_json:
            cmd = safe_render_template(cmd_tmpl, variables)
            rendered_rollback.append(cmd)

        # 5. Ejecución Transaccional
        job.current_step = "Escribiendo Configuración"
        db.commit()
        log_to_job("Ejecutando comandos transaccionales en OLT...")
        
        try:
            results = await asyncio.to_thread(driver.execute_provisioning_transactional, rendered_commands)
            for res in results:
                log_to_job(f"> {res['command']}\n{res['output']}")
        except Exception as e_exec:
            log_to_job(f"ERROR DURANTE EJECUCIÓN: {str(e_exec)}")
            raise e_exec # Saltar al bloque de catch general que dispara el rollback
            
        # 6. Commit de Base de Datos
        job.current_step = "Commit de BD"
        db.commit()
        
        new_onu = ONU(
            olt_id=olt.id,
            interface=full_onu_interface,
            sn=job.onu_sn,
            vlan=job.vlan,
            service_profile=job.profile,
            config_source="Provisioning_Engine",
            status="offline" # Sync loop will detect it later
        )
        db.add(new_onu)
        
        job.status = "success"
        job.finished_at = datetime.utcnow()
        log_to_job("Aprovisionamiento Completado Exitosamente.")
        db.commit()

    except Exception as e:
        log_to_job(f"CRÍTICO: Excepción atrapada: {str(e)}")
        
        # Iniciar Rollback
        job.current_step = "Ejecutando Rollback"
        db.commit()
        
        if driver and 'rendered_rollback' in locals() and len(rendered_rollback) > 0:
            log_to_job("Iniciando Rollback de emergencia...")
            try:
                # We use execute_provisioning which ignores errors since we just want to force cleanup
                rb_results = await asyncio.to_thread(driver.execute_provisioning, rendered_rollback)
                for res in rb_results:
                    log_to_job(f"[RB] > {res['command']}\n{res['output']}")
                job.rollback_executed = True
                log_to_job("Rollback finalizado.")
                job.status = "rollback_success"
            except Exception as e_rb:
                log_to_job(f"ERROR EN ROLLBACK: {str(e_rb)}")
                job.status = "rollback_failed"
        else:
            job.status = "failed"
            
        job.finished_at = datetime.utcnow()
        db.commit()
        
    finally:
        if lock:
            release_pon_lock(db, lock)
            log_to_job("PON Lock liberado.")
            
        if driver:
            try:
                await asyncio.to_thread(driver.disconnect)
            except: pass
            
        db.close()
