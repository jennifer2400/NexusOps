from typing import Dict, Any

class BaseProvisioningDriver:
    """
    Clase abstracta para los drivers de aprovisionamiento de OLTs.
    Debe ser extendida por drivers específicos (e.g., ZTEProvisioningDriver).
    """

    def __init__(self, olt_ip: str, port: int, username: str, password: str):
        self.olt_ip = olt_ip
        self.port = port
        self.username = username
        self.password = password

    def connect(self) -> bool:
        """Establece conexión SSH/Telnet con la OLT"""
        raise NotImplementedError()

    def disconnect(self):
        """Cierra la conexión con la OLT"""
        raise NotImplementedError()

    def execute_command(self, cmd: str) -> Dict[str, Any]:
        """
        Ejecuta un comando en la OLT y retorna el resultado y métricas.
        Retorna: {"success": bool, "response": str, "duration_ms": int}
        """
        raise NotImplementedError()

    def execute_script(self, commands: list[str]) -> list[Dict[str, Any]]:
        """
        Ejecuta un bloque de comandos secuencialmente.
        Si falla, debería registrar el error en el array de retorno.
        """
        results = []
        for cmd in commands:
            res = self.execute_command(cmd)
            results.append({"cmd": cmd, "res": res["response"], "success": res["success"], "duration_ms": res.get("duration_ms", 0)})
            if not res["success"]:
                break
        return results

    def verify_success(self, onu_sn: str) -> bool:
        """Verifica en vivo que la ONU se encuentre Online/Configurada luego del proceso."""
        raise NotImplementedError()
