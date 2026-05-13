from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models.network import OLT, ONU
from app.drivers.zte_config import ZTEOnuConfigDriver
from app.core.crypto import decrypt_secret
from fastapi import HTTPException
from datetime import datetime

class ONUConfigurationEngine:
    def __init__(self, db: Session, olt_id: int):
        self.db = db
        self.olt = db.query(OLT).filter(OLT.id == olt_id).first()
        if not self.olt:
            raise HTTPException(status_code=404, detail="OLT no encontrada")
            
        pwd = decrypt_secret(self.olt.password) if self.olt.password else ""
        self.driver = ZTEOnuConfigDriver(self.olt.ip_address, self.olt.port or 23, self.olt.username, pwd)

    def check_lock(self, onu_interface: str):
        from app.models.provisioning import OnuOperationLock
        active_lock = self.db.query(OnuOperationLock).filter(
            OnuOperationLock.olt_id == self.olt.id,
            OnuOperationLock.onu_interface == onu_interface,
            OnuOperationLock.status == "active",
            OnuOperationLock.expires_at > datetime.utcnow()
        ).first()
        
        if active_lock:
            raise HTTPException(status_code=423, detail=f"La ONU está bloqueada por una operación en curso (Usuario: {active_lock.locked_by})")

    def get_current_state(self, onu_interface: str) -> Dict[str, Any]:
        """
        Extrae y parsea el estado actual L2/L3 y de Identidad.
        """
        import time
        self.check_lock(onu_interface)
        
        try:
            self.driver.connect()
            t0 = time.time()
            full_data = self.driver.get_onu_running_config(onu_interface)
            identity = self.driver.parse_onu_identity(full_data.get("running_config_onu", ""))
            
            return {
                "onu_interface": onu_interface,
                "identity": identity,
                "raw_config": full_data,
                "fetched_at": time.time()
            }
        finally:
            self.driver.disconnect()

    def generate_patch(self, onu_interface: str, current_state: Dict[str, Any], desired_state: Dict[str, Any]) -> Dict[str, List[str]]:
        """
        Compara current_state y desired_state, y genera comandos CLI exactos de parche.
        """
        self.check_lock(onu_interface)
        all_commands = []
        all_rollback = []
        
        # 1. Identity Patching
        if "identity" in desired_state:
            patch = self.driver.generate_identity_patch(
                onu_interface, 
                current_state.get("identity", {}), 
                desired_state["identity"]
            )
            if patch["commands"]:
                all_commands.extend(patch["commands"])
                all_rollback.extend(patch["rollback"])
                
        # Calculate SHA256 Hash
        import hashlib
        patch_hash = ""
        if all_commands:
            patch_hash = hashlib.sha256("\n".join(all_commands).encode()).hexdigest()
        
        return {
            "commands": all_commands,
            "rollback": all_rollback,
            "hash": patch_hash
        }

    def execute_patch(self, onu_id: int, onu_interface: str, patch_data: Dict[str, Any], current_state: Dict[str, Any], desired_state: Dict[str, Any], author: str) -> Dict[str, Any]:
        """
        Ejecuta el parche de forma transaccional. Hace backup previo, verifica lock y guarda auditoría.
        """
        from app.models.provisioning import OnuConfigAudit, OnuOperationLock
        from datetime import timedelta
        
        self.check_lock(onu_interface)
        
        if not patch_data.get("commands"):
            return {"status": "success", "message": "No hay cambios por aplicar."}
            
        # 1. Acquire Lock
        lock = OnuOperationLock(
            onu_id=onu_id,
            olt_id=self.olt.id,
            onu_interface=onu_interface,
            operation_type="config_patch",
            locked_by=author,
            expires_at=datetime.utcnow() + timedelta(minutes=5)
        )
        self.db.add(lock)
        self.db.commit()
        
        # 2. Record Job in Audit
        audit = OnuConfigAudit(
            onu_id=onu_id,
            olt_id=self.olt.id,
            onu_interface=onu_interface,
            operation_type="patch",
            patch_hash_sha256=patch_data.get("hash", ""),
            before_state=current_state,
            after_state=desired_state,
            generated_patch=patch_data.get("commands", []),
            rollback_patch=patch_data.get("rollback", []),
            status="patching",
            created_by=author
        )
        self.db.add(audit)
        self.db.commit()
        
        try:
            self.driver.connect()
            
            # 3. Automatic Backup before touch
            raw_config = self.driver.get_onu_full_config(onu_interface)
            backup_content = raw_config.get("running_config_onu", "")
            
            audit.running_config_snapshot = backup_content
            self.db.commit()
            
            # 4. Execute Transactionally
            results = self.driver.execute_provisioning_transactional(patch_data["commands"])
            
            audit.status = "success"
            audit.result = results
            audit.completed_at = datetime.utcnow()
            
            # Formateamos raw_cli_output para auditoría humana
            raw_output = "\n".join([f"> {r['cmd']}\n{r['res']}" for r in results])
            audit.raw_cli_output = raw_output
            
            self.db.commit()
            
            return {
                "status": "success",
                "results": results
            }
            
        except Exception as e:
            # If execution fails, attempt rollback
            error_msg = str(e)
            audit.status = "failed"
            audit.error_message = error_msg
            self.db.commit()
            
            # Execute rollback commands (best effort)
            try:
                if patch_data.get("rollback"):
                    rollback_results = self.driver.execute_provisioning_transactional(patch_data["rollback"])
                    audit.rollback_output = "\n".join([f"> {r['cmd']}\n{r['res']}" for r in rollback_results])
                    audit.status = "rollback_success"
                    self.db.commit()
            except Exception as rb_e:
                audit.status = "rollback_failed"
                audit.error_message = f"Fallo principal: {error_msg} | Fallo Rollback: {str(rb_e)}"
                self.db.commit()
                
            raise HTTPException(status_code=500, detail=f"Error ejecutando parche: {error_msg}")
        finally:
            # Release Lock
            lock.status = "released"
            self.db.commit()
            self.driver.disconnect()
