import time
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.provisioning import ProvisioningJob, VlanTransportJob, VlanProfile
from app.models.network import OLT
from app.models.network import OLT, GponResourcePool
from app.drivers.zte import ZteC320Driver
from app.core.crypto import decrypt_secret
from app.services.provisioning.utils import safe_render_template

logger = logging.getLogger(__name__)

def execute_provisioning_job(job_id: int):
    db: Session = SessionLocal()
    job = db.query(ProvisioningJob).get(job_id)
    if not job:
        db.close()
        return

    try:
        # Phase 1: Validating
        update_job_status(db, job, "validating")
        olt = db.query(OLT).get(job.olt_id)
        if not olt:
            raise Exception("OLT no encontrada.")

        variables = job.variables
        onu_interface = variables.get('onu_interface', '')
        if not onu_interface:
            raise Exception("onu_interface no encontrada en variables.")

        commands_to_run = render_commands(job.template.commands_template, variables)
        rollback_commands = []
        if job.template.rollback_template:
            rollback_commands = render_commands(job.template.rollback_template, variables)

        is_new_onu = variables.get('is_new_onu') == True
        if is_new_onu:
            pon_int = variables.get('pon_interface')
            onu_id = variables.get('onu_id')
            onu_sn = job.onu_sn
            onu_type = variables.get('onu_type')
            
            if not onu_type:
                # If onu_type is somehow missing, fallback to the first supported model or default
                onu_type = "ZTE-G"
            
            adoption_cmds = [
                f"interface {pon_int}",
                f"onu {onu_id} type {onu_type} sn {onu_sn}",
                "exit"
            ]
            commands_to_run = adoption_cmds + commands_to_run
            
            rollback_commands = [
                f"interface {pon_int}",
                f"no onu {onu_id}",
                "exit"
            ] + rollback_commands

        # Phase 2: Backup specific ONU (if existing)
        pwd = decrypt_secret(olt.password) if olt.password else ""
        driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
        
        update_job_status(db, job, "connecting")
        try:
            driver.connect()
        except Exception as e:
            raise Exception(f"Fallo al conectar a la OLT: {str(e)}")

        if is_new_onu:
            # PRE-FLIGHT CHECK: Ensure the calculated ONU ID is still free in the OLT
            import re
            verify_res = driver._send_command(f"show gpon onu baseinfo {pon_int}", wait_time=2)
            used_ids = set()
            for line in verify_res.splitlines():
                match = re.search(r"\d+/\d+/\d+:(\d+)", line)
                if match:
                    used_ids.add(int(match.group(1)))
            if int(onu_id) in used_ids:
                driver.disconnect()
                raise Exception("El ONU ID reservado ya fue ocupado. Recalcule el aprovisionamiento.")

        if not is_new_onu:
            # Try to get existing config
            try:
                backup = driver._send_command(f"show running-config interface {onu_interface}", wait_time=2)
                # TODO: add pre_provisioning_backup field to ProvisioningJob if needed, or just append to logs as a meta event
                append_log(db, job, "BACKUP", "Backup pre-configuración completado", 0, True)
            except:
                pass
                
        # Enter conf t
        driver._send_command("configure terminal", wait_time=1)

        # Phase 4: Provisioning
        update_job_status(db, job, "provisioning")
        
        has_error = False
        for cmd in commands_to_run:
            start_time = time.time()
            response = driver._send_command(cmd, wait_time=1)
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Check for ZTE error indicators
            cmd_failed = False
            error_msg = ""
            if any(err in response for err in ["%", "Error", "Invalid", "Incomplete", "Unrecognized"]):
                # Whitelist harmless errors
                if "UNI does not exist" in response:
                    cmd_failed = False
                else:
                    cmd_failed = True
                    has_error = True
                    error_msg = response.strip()
                
            append_log(db, job, cmd, response, duration_ms, not cmd_failed)
            
            if cmd_failed:
                break # Stop executing commands if one fails
                
        if has_error:
            # Trigger Rollback
            update_job_status(db, job, "rollback")
            rollback_failed = False
            
            # Ensure we are in config mode before rollback to avoid context errors
            driver._send_command("end", wait_time=1)
            driver._send_command("configure terminal", wait_time=1)
            
            for r_cmd in rollback_commands:
                start_time = time.time()
                r_response = driver._send_command(r_cmd, wait_time=1)
                r_duration = int((time.time() - start_time) * 1000)
                
                r_err = False
                if any(err in r_response for err in ["%", "Error", "Invalid"]):
                    r_err = True
                    rollback_failed = True
                append_log(db, job, f"[ROLLBACK] {r_cmd}", r_response, r_duration, not r_err)
                
            driver.disconnect()
            
            # Free resources
            free_job_resources(db, job.olt_id, onu_interface)
            
            if rollback_failed:
                update_job_status(db, job, "rollback_failed", "Rollback falló. Intervención manual requerida.")
            else:
                update_job_status(db, job, "rollback_success", "Proceso abortado y revertido correctamente.")
            return

        # Phase 5: Verifying
        update_job_status(db, job, "verifying")
        verify_resp = driver._send_command(f"show gpon onu detail-info {onu_interface}", wait_time=2)
        append_log(db, job, "VERIFY", verify_resp, 2000, True)
        
        driver.disconnect()

        # Phase 6: Success
        commit_job_resources(db, job.olt_id, onu_interface)
        
        from app.models.network import ONU
        existing_onu = db.query(ONU).filter(ONU.olt_id == job.olt_id, ONU.interface == onu_interface).first()
        if not existing_onu:
            new_onu = ONU(
                olt_id=job.olt_id,
                interface=onu_interface,
                sn=job.onu_sn,
                name=variables.get('name', 'Sin Nombre'),
                description=variables.get('description', ''),
                onu_type=variables.get('onu_type', 'Unknown'),
                status="working",
                vlan=variables.get('vlan', ''),
                config_source="Provisioning"
            )
            db.add(new_onu)
        else:
            existing_onu.sn = job.onu_sn
            existing_onu.name = variables.get('name', existing_onu.name)
            existing_onu.description = variables.get('description', existing_onu.description)
            existing_onu.onu_type = variables.get('onu_type', existing_onu.onu_type)
            existing_onu.status = "working"
            existing_onu.vlan = variables.get('vlan', existing_onu.vlan)
        
        db.commit()
        update_job_status(db, job, "success")

    except Exception as e:
        logger.error(f"Error in execute_provisioning_job {job_id}: {e}")
        try:
            free_job_resources(db, job.olt_id, job.variables.get('onu_interface', ''))
            update_job_status(db, job, "failed", str(e))
        except:
            pass
    finally:
        db.close()


def execute_vlan_transport_job(job_id: int):
    """
    Background worker that performs the VLAN creation and uplink configuration.
    State machine: validating -> backup -> creating_vlan -> applying_transport -> verifying -> success/rollback
    """
    db = SessionLocal()
    job = db.query(VlanTransportJob).filter(VlanTransportJob.id == job_id).first()
    
    if not job:
        db.close()
        return

    logger.info(f"Starting VLAN Transport Job {job_id}")
    
    # Internal log appender
    def append_log(cmd: str, res: str, success: bool, duration: int):
        current_logs = list(job.logs)
        current_logs.append({
            "cmd": cmd,
            "res": res,
            "success": success,
            "duration_ms": duration
        })
        job.logs = current_logs
        db.commit()

    def set_status(status: str, error: str = None):
        job.status = status
        if error:
            job.error_detail = error
            logger.error(f"VLAN Job {job_id} Error: {error}")
        db.commit()

    # Rollback function
    def do_rollback(vlan_id: int, uplinks: list, tag_str: str, driver: ZteC320Driver):
        set_status("rollback")
        rb_success = True
        
        rb_commands = []
        for uplink in uplinks:
            rb_commands.extend([
                f"interface {uplink}",
                f"  no switchport vlan {vlan_id} {tag_str}",
                "exit"
            ])
            
        # We don't delete the VLAN globally to avoid breaking other things, but we could
        
        driver.connect()
        # Ensure we are in config mode
        driver.tn.write(b"configure terminal\n")
        time.sleep(1)
        driver.tn.read_very_eager()
        
        for cmd in rb_commands:
            t0 = time.time()
            driver.tn.write(cmd.encode('ascii') + b"\n")
            time.sleep(1)
            raw = driver.tn.read_very_eager().decode('ascii', errors='ignore')
            dur = int((time.time() - t0) * 1000)
            
            err = "ZTE Error" if any(e in raw for e in ["%", "Error", "Invalid"]) else None
            append_log(cmd, raw, err is None, dur)
            
            if err:
                rb_success = False
                
        driver.disconnect()
        
        if rb_success:
            set_status("rollback_success")
        else:
            set_status("rollback_failed", "Rollback failed, manual intervention required")

    try:
        set_status("validating")
        
        olt = db.query(OLT).filter(OLT.id == job.olt_id).first()
        vlan_profile = db.query(VlanProfile).filter(VlanProfile.id == job.vlan_profile_id).first()
        
        if not olt or not vlan_profile:
            set_status("failed", "OLT or VlanProfile missing")
            return
            
        pwd = decrypt_secret(olt.password) if olt.password else ""
        driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
        
        # Backup
        set_status("backup")
        driver.connect()
        # Just backup the vlan config for safety
        out_vlan = driver._send_command(f"show vlan {vlan_profile.vlan_id}", wait_time=2)
        append_log("show vlan (backup)", out_vlan, True, 2000)
        
        for uplink in job.uplinks_target:
            out_up = driver._send_command(f"show running-config interface {uplink}", wait_time=2)
            append_log(f"show running-config interface {uplink} (backup)", out_up, True, 2000)
            
        # Creating VLAN
        set_status("creating_vlan")
        driver.tn.write(b"configure terminal\n")
        time.sleep(1)
        driver.tn.read_very_eager()
        
        vlan_cmds = [
            f"vlan {vlan_profile.vlan_id}",
            f"  name {vlan_profile.name.replace(' ', '_')}",
            "exit"
        ]
        
        for cmd in vlan_cmds:
            t0 = time.time()
            driver.tn.write(cmd.encode('ascii') + b"\n")
            time.sleep(1)
            raw = driver.tn.read_very_eager().decode('ascii', errors='ignore')
            dur = int((time.time() - t0) * 1000)
            
            err = "ZTE Error" if any(e in raw for e in ["%", "Error", "Invalid"]) else None
            append_log(cmd, raw, err is None, dur)
            
            if err:
                driver.disconnect()
                set_status("failed", err)
                # Rollback not strictly needed if vlan creation fails, it just didn't create
                return

        # Applying Transport
        set_status("applying_transport")
        
        tag_str = "tag" if job.transport_mode in ["tagged", "hybrid"] else "untag"
        
        uplink_cmds = []
        for uplink in job.uplinks_target:
            uplink_cmds.append(f"interface {uplink}")
            uplink_cmds.append(f"  switchport vlan {vlan_profile.vlan_id} {tag_str}")
            uplink_cmds.append("exit")
            
        for cmd in uplink_cmds:
            t0 = time.time()
            driver.tn.write(cmd.encode('ascii') + b"\n")
            time.sleep(1)
            raw = driver.tn.read_very_eager().decode('ascii', errors='ignore')
            dur = int((time.time() - t0) * 1000)
            
            err = "ZTE Error" if any(e in raw for e in ["%", "Error", "Invalid"]) else None
            append_log(cmd, raw, err is None, dur)
            
            if err:
                driver.disconnect()
                do_rollback(vlan_profile.vlan_id, job.uplinks_target, tag_str, driver)
                return
                
        # Verifying
        set_status("verifying")
        
        out_verify = driver._send_command(f"show vlan {vlan_profile.vlan_id}", wait_time=2)
        append_log("show vlan (verify)", out_verify, True, 2000)
        
        driver.disconnect()
        
        # Success
        set_status("success")
        job.completed_at = datetime.utcnow()
        vlan_profile.status = "active"
        db.commit()
        
    except Exception as e:
        logger.error(f"VLAN Transport Job {job_id} Exception: {str(e)}")
        set_status("failed", str(e))
    finally:
        db.close()

def update_job_status(db: Session, job: ProvisioningJob, status: str, error_detail: str = None):
    job.status = status
    if error_detail:
        job.error_detail = error_detail
    if status in ["success", "failed", "rollback_success", "rollback_failed"]:
        job.completed_at = datetime.utcnow()
    db.commit()

def append_log(db: Session, job: ProvisioningJob, cmd: str, response: str, duration_ms: int, success: bool):
    # In SQLAlchemy JSON arrays, we need to create a new list reference or use flag_modified
    from sqlalchemy.orm.attributes import flag_modified
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "cmd": cmd,
        "res": response.strip(),
        "duration_ms": duration_ms,
        "success": success
    }
    if not job.logs:
        job.logs = []
    job.logs.append(log_entry)
    flag_modified(job, "logs")
    db.commit()

def render_commands(template_str: str, variables: dict) -> list:
    if not template_str:
        return []
    rendered = safe_render_template(template_str, variables)
    commands = []
    for c in rendered.splitlines():
        c = c.strip()
        if not c:
            continue
        # Skip entering config mode since driver.connect() already does it
        if c.lower() in ["conf t", "configure terminal"]:
            continue
        commands.append(c)
    return commands

def free_job_resources(db: Session, olt_id: int, onu_interface: str):
    # delete or mark as released reserved resources
    from app.models.network import GponResourcePool
    
    if not onu_interface: return
    
    pon_interface = onu_interface.split(":")[0]
    
    reservations = db.query(GponResourcePool).filter(
        GponResourcePool.olt_id == olt_id,
        GponResourcePool.pon_interface == pon_interface,
        GponResourcePool.status == "reserved"
    ).all()
    
    for r in reservations:
        if r.scope == "onu" and r.onu_interface == onu_interface:
            db.delete(r)
        elif r.scope == "pon":
            # Si el onu_interface generado usaba este ID, libéralo
            if f":{r.allocated_value}" in onu_interface:
                db.delete(r)
                
    db.commit()

def commit_job_resources(db: Session, olt_id: int, onu_interface: str):
    from app.models.network import GponResourcePool
    
    if not onu_interface: return
    
    pon_interface = onu_interface.split(":")[0]
    
    reservations = db.query(GponResourcePool).filter(
        GponResourcePool.olt_id == olt_id,
        GponResourcePool.pon_interface == pon_interface,
        GponResourcePool.status == "reserved"
    ).all()
    
    for r in reservations:
        if r.scope == "onu" and r.onu_interface == onu_interface:
            r.status = "active"
        elif r.scope == "pon":
            if f":{r.allocated_value}" in onu_interface:
                r.status = "active"
                
    db.commit()

def execute_vlan_deletion_job(olt_id: int, vlan_id: int, uplinks: list, tag_str: str):
    """
    Background worker that performs the VLAN deletion and uplink de-configuration on the physical OLT.
    """
    db = SessionLocal()
    olt = db.query(OLT).filter(OLT.id == olt_id).first()
    
    if not olt:
        db.close()
        return

    logger.info(f"Starting VLAN Deletion Job for VLAN {vlan_id} on OLT {olt_id}")
    
    try:
        pwd = decrypt_secret(olt.password) if olt.password else ""
        driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
        
        driver.connect()
        driver.tn.write(b"configure terminal\n")
        time.sleep(1)
        driver.tn.read_very_eager()
        
        # 1. Remove from uplinks
        for uplink in uplinks:
            cmd = f"interface {uplink}\n  no switchport vlan {vlan_id} {tag_str}\nexit\n"
            driver.tn.write(cmd.encode('ascii'))
            time.sleep(1)
            driver.tn.read_very_eager()
            
        # 2. Delete VLAN globally
        cmd = f"no vlan {vlan_id}\n"
        driver.tn.write(cmd.encode('ascii'))
        time.sleep(1)
        driver.tn.read_very_eager()
        
        driver.disconnect()
        logger.info(f"Successfully deleted VLAN {vlan_id} from OLT {olt_id}")
    except Exception as e:
        logger.error(f"Error in execute_vlan_deletion_job for VLAN {vlan_id}: {e}")
    finally:
        db.close()

def execute_onu_deletion_job(job_id: int):
    """
    Background worker that performs the ONU deletion logic:
    - Backup running config
    - Delete ONU from OLT
    - Verify deletion
    - Soft delete in DB
    """
    from app.models.provisioning import ONUDeleteJob
    from app.models.network import ONU, ONUHistory
    
    db = SessionLocal()
    job = db.query(ONUDeleteJob).get(job_id)
    
    if not job:
        db.close()
        return

    logger.info(f"Starting ONU Deletion Job {job_id}")
    
    def append_log(cmd: str, res: str, success: bool, duration: int):
        current_logs = list(job.logs)
        current_logs.append({
            "cmd": cmd,
            "res": res,
            "success": success,
            "duration_ms": duration
        })
        job.logs = current_logs
        db.commit()

    def set_status(status: str, error: str = None):
        job.status = status
        if error:
            job.error_detail = error
            logger.error(f"ONU Delete Job {job_id} Error: {error}")
        db.commit()

    try:
        set_status("connecting")
        olt = db.query(OLT).get(job.olt_id)
        if not olt:
            raise Exception("OLT no encontrada.")
            
        pwd = decrypt_secret(olt.password) if olt.password else ""
        driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
        driver.connect()
        
        # 1. Backup
        set_status("backup")
        t0 = time.time()
        backup_res = driver._send_command(f"show running-config interface {job.onu_interface}", wait_time=2)
        append_log(f"show running-config interface {job.onu_interface}", backup_res, True, int((time.time()-t0)*1000))
        
        # 2. Dynamic Unbinding
        set_status("deleting")
        driver._send_command("configure terminal", wait_time=1)
        
        onu_id = job.onu_interface.split(":")[1]
        
        # Parse backup_res to find service-ports, gemports, tconts
        import re
        service_ports = re.findall(r'service-port (\d+)', backup_res)
        gemports = re.findall(r'gemport (\d+)', backup_res)
        tconts = re.findall(r'tcont (\d+)', backup_res)
        
        # Try to clean pon-onu-mng
        driver._send_command(f"pon-onu-mng {job.onu_interface}", wait_time=1)
        driver._send_command("no service hsi", wait_time=1)
        driver._send_command("no service internet", wait_time=1)
        driver._send_command("no service voip", wait_time=1)
        driver._send_command("no service iptv", wait_time=1)
        driver._send_command("no vlan port eth_0/1 mode tag vlan 1330", wait_time=1) # generic fallback
        driver._send_command("no vlan port eth_0/2 mode tag vlan 1330", wait_time=1)
        driver._send_command("no vlan port eth_0/3 mode tag vlan 1330", wait_time=1)
        driver._send_command("no vlan port eth_0/4 mode tag vlan 1330", wait_time=1)
        driver._send_command("exit", wait_time=1)
        
        del_cmds = [f"interface {job.onu_interface}"]
        for sp in set(service_ports):
            del_cmds.append(f"no service-port {sp}")
        for gp in set(gemports):
            del_cmds.append(f"no gemport {gp}")
        for tc in set(tconts):
            del_cmds.append(f"no tcont {tc}")
        del_cmds.append("exit")
        
        del_cmds.append(f"interface {job.pon_interface}")
        del_cmds.append(f"no onu {onu_id}")
        del_cmds.append("exit")
        
        for cmd in del_cmds:
            t0 = time.time()
            res = driver._send_command(cmd, wait_time=1)
            dur = int((time.time() - t0) * 1000)
            err = "ZTE Error" if any(e in res for e in ["%", "Error", "Invalid"]) else None
            append_log(cmd, res, err is None, dur)
            if err:
                raise Exception(f"Comando falló: {cmd}")
                
        # 3. Verify
        set_status("verifying")
        t0 = time.time()
        verify_res = driver._send_command(f"show gpon onu baseinfo {job.pon_interface}", wait_time=2)
        
        # Look for the ONU ID in the baseinfo. If it's there, deletion failed.
        # Format: gpon-onu_1/2/11:1   RL804GCW
        if f"{job.pon_interface}:{onu_id}" in verify_res:
            append_log("VERIFY", verify_res, False, int((time.time()-t0)*1000))
            raise Exception("La ONU todavía aparece en la OLT después de intentar borrarla.")
        else:
            append_log("VERIFY", verify_res, True, int((time.time()-t0)*1000))
            
        driver.disconnect()
        
        # 4. History and Soft Delete
        set_status("success")
        job.completed_at = datetime.utcnow()
        
        onu_db = db.query(ONU).filter(ONU.id == job.onu_id_ref).first()
        if onu_db:
            # Create History Record
            history = ONUHistory(
                olt_id=onu_db.olt_id,
                sn=onu_db.sn,
                last_interface=onu_db.interface,
                last_name=onu_db.name,
                last_description=onu_db.description,
                last_pppoe_username=onu_db.pppoe_username,
                last_vlan=onu_db.vlan,
                backup_config=backup_res,
                deleted_by="Admin",
                delete_reason="Eliminación vía Portal de Administración"
            )
            db.add(history)
            
            # Remove from active ONUs
            db.delete(onu_db)
            db.commit()
            
    except Exception as e:
        set_status("failed", str(e))
        logger.error(f"Error in execute_onu_deletion_job {job_id}: {e}")
    finally:
        db.close()
