from app.services.provisioning.base_driver import BaseProvisioningDriver
from app.drivers.zte import ZteC320Driver
import time
from typing import Dict, Any

class ZTEProvisioningDriver(BaseProvisioningDriver):
    def __init__(self, olt_ip: str, port: int, username: str, password: str):
        super().__init__(olt_ip, port, username, password)
        self.driver = ZteC320Driver(host=olt_ip, port=port, username=username, password=password)

    def connect(self) -> bool:
        try:
            self.driver.connect()
            return True
        except Exception as e:
            print(f"ZTE Connect Error: {e}")
            return False

    def disconnect(self):
        self.driver.disconnect()

    def execute_command(self, cmd: str) -> Dict[str, Any]:
        start = time.time()
        try:
            response = self.driver._send_command(cmd, wait_time=1)
            duration_ms = int((time.time() - start) * 1000)
            
            # Chequeos de error específicos de ZTE
            # Si retorna '%Error', '%Unknown command', etc.
            success = True
            if "%Error" in response or "%Unknown command" in response or "Incomplete command" in response:
                success = False
                
            return {"success": success, "response": response, "duration_ms": duration_ms}
        except Exception as e:
            duration_ms = int((time.time() - start) * 1000)
            return {"success": False, "response": str(e), "duration_ms": duration_ms}

    def verify_success(self, onu_sn: str) -> bool:
        # Busca el estado de la ONU por serial
        response = self.driver._send_command(f"show gpon onu by sn {onu_sn}")
        # Si dice "working", significa que subió correctamente.
        if "working" in response.lower() or "ready" in response.lower():
            return True
        return False
