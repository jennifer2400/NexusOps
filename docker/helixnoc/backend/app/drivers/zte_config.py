from typing import Dict, List, Optional
import re
from app.drivers.zte import ZteC320Driver

class ZTEOnuConfigDriver(ZteC320Driver):
    """
    Subclase especializada para aplicar parches de configuración L2/L3 atómicos en ONUs.
    """
    
    def parse_onu_identity(self, running_config: str) -> Dict[str, str]:
        """
        Extrae el Name y Description de la ONU desde el running-config de su interfaz.
        """
        identity = {
            "name": "",
            "description": ""
        }
        for line in running_config.split("\n"):
            line = line.strip()
            if line.startswith("name "):
                identity["name"] = line.replace("name ", "").strip()
            elif line.startswith("description "):
                identity["description"] = line.replace("description ", "").strip()
                
        return identity

    def generate_identity_patch(self, onu_interface: str, current_state: Dict[str, str], desired_state: Dict[str, str]) -> Dict[str, List[str]]:
        """
        Genera los comandos CLI necesarios para cambiar el nombre/descripción,
        y los comandos inversos para revertirlos si falla.
        Returns: {"commands": [], "rollback": []}
        """
        commands = []
        rollback = []
        
        # Ensure correct prefix
        if not onu_interface.startswith("gpon-onu_"):
            onu_interface = f"gpon-onu_{onu_interface}"

        current_name = current_state.get("name", "")
        desired_name = desired_state.get("name", "")
        
        current_desc = current_state.get("description", "")
        desired_desc = desired_state.get("description", "")
        
        has_changes = False
        
        if desired_name != current_name:
            has_changes = True
            if desired_name:
                commands.append(f"name {desired_name}")
            else:
                commands.append("no name")
                
            if current_name:
                rollback.append(f"name {current_name}")
            else:
                rollback.append("no name")
                
        if desired_desc != current_desc:
            has_changes = True
            if desired_desc:
                commands.append(f"description {desired_desc}")
            else:
                commands.append("no description")
                
            if current_desc:
                rollback.append(f"description {current_desc}")
            else:
                rollback.append("no description")
                
        if not has_changes:
            return {"commands": [], "rollback": []}
            
        # Wrap with interface context
        final_commands = [
            "conf t",
            f"interface {onu_interface}"
        ] + commands + ["exit"]
        
        final_rollback = [
            "conf t",
            f"interface {onu_interface}"
        ] + rollback + ["exit"]
        
        return {
            "commands": final_commands,
            "rollback": final_rollback
        }
