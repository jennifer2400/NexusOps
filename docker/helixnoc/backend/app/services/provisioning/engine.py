from app.db.session import SessionLocal
from app.models.provisioning import ProvisioningJob, ProvisioningTemplate
from app.models.network import OLT
from app.services.provisioning.utils import safe_render_template
from app.services.provisioning.zte_driver import ZTEProvisioningDriver
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)

class ProvisioningEngine:
    @staticmethod
    def run_job(job_id: int):
        db = SessionLocal()
        job = db.query(ProvisioningJob).filter(ProvisioningJob.id == job_id).first()
        if not job:
            db.close()
            return
            
        try:
            # 1. Validating
            job.status = "validating"
            db.commit()
            
            olt = db.query(OLT).filter(OLT.id == job.olt_id).first()
            template = db.query(ProvisioningTemplate).filter(ProvisioningTemplate.id == job.template_id).first()
            
            if not olt or not template:
                raise ValueError("OLT o Template no encontrados")
                
            # Render templates
            try:
                raw_commands = safe_render_template(template.commands_template, job.variables)
                commands_list = [c.strip() for c in raw_commands.splitlines() if c.strip()]
                
                rollback_list = []
                if template.rollback_template:
                    raw_rollback = safe_render_template(template.rollback_template, job.variables)
                    rollback_list = [c.strip() for c in raw_rollback.splitlines() if c.strip()]
            except Exception as e:
                raise ValueError(f"Error renderizando template: {e}")
                
            # 2. Connecting
            job.status = "connecting"
            db.commit()
            
            # Select driver
            driver = None
            if olt.vendor.lower() == "zte":
                driver = ZTEProvisioningDriver(olt.ip_address, olt.port, olt.username, olt.password)
            else:
                raise ValueError(f"Vendor no soportado: {olt.vendor}")
                
            if not driver.connect():
                raise ConnectionError("No se pudo conectar a la OLT")
                
            # 3. Provisioning
            job.status = "provisioning"
            db.commit()
            
            results = driver.execute_script(commands_list)
            
            # Update logs
            current_logs = job.logs or []
            current_logs.extend(results)
            job.logs = current_logs
            db.commit()
            
            # Check for failure
            failed = any(not r["success"] for r in results)
            if failed:
                job.status = "rollback"
                db.commit()
                
                # Execute rollback if exists
                if rollback_list:
                    rollback_results = driver.execute_script(rollback_list)
                    current_logs.append({"type": "rollback", "results": rollback_results})
                    job.logs = current_logs
                    
                    rollback_failed = any(not r["success"] for r in rollback_results)
                    job.status = "rollback_failed" if rollback_failed else "rollback_success"
                else:
                    job.status = "failed"
                    
                job.error_detail = "Fallo en ejecución de comandos"
                driver.disconnect()
                db.commit()
                return

            # 4. Verifying
            job.status = "verifying"
            db.commit()
            
            is_online = driver.verify_success(job.onu_sn)
            
            # 5. Success
            if is_online:
                job.status = "success"
            else:
                job.status = "warning"
                job.error_detail = "Procesado sin errores, pero la ONU no reportó 'working'"
                
            job.completed_at = datetime.utcnow()
            driver.disconnect()
            db.commit()

        except Exception as e:
            logger.error(f"Provisioning Engine Error on Job {job_id}: {e}")
            job.status = "failed"
            job.error_detail = str(e)
            job.completed_at = datetime.utcnow()
            db.commit()
        finally:
            db.close()
