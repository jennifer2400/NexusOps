import telnetlib
import time
import re
from typing import List, Dict, Optional, Any
from app.drivers.base import OLTDriver
import logging

logger = logging.getLogger(__name__)

class ZteC320Driver(OLTDriver):
    def __init__(self, host: str, port: int, username: str, password: str):
        super().__init__(host, port, username, password)
        self.tn = None

    def connect(self):
        if self.tn:
            return
            
        logger.info(f"Connecting to ZTE C320 at {self.host}:{self.port} via Telnet")
        self.tn = telnetlib.Telnet(self.host, self.port, timeout=10)
        
        self.tn.read_until(b"Username:", timeout=5)
        self.tn.write(self.username.encode('ascii') + b"\n")
        
        self.tn.read_until(b"Password:", timeout=5)
        self.tn.write(self.password.encode('ascii') + b"\n")
        
        time.sleep(2)
        out = self.tn.read_very_eager().decode('ascii', errors='ignore')
        
        # Some ZTE OLTs start in unprivileged mode '>'
        if ">" in out:
            self.tn.write(b"enable\n")
            time.sleep(1)
            eager = self.tn.read_very_eager().decode('ascii', errors='ignore')
            if "Password:" in eager:
                self.tn.write(self.password.encode('ascii') + b"\n")
                time.sleep(1)
                verify = self.tn.read_very_eager().decode('ascii', errors='ignore')
                if "Error" in verify or "Bad password" in verify:
                    # Fallback to default ZTE enable password
                    self.tn.write(b"enable\n")
                    time.sleep(1)
                    self.tn.write(b"zxr10\n")
                    time.sleep(1)
            else:
                self.tn.write(self.password.encode('ascii') + b"\n")
                time.sleep(1)
                
        self.tn.write(b"terminal length 0\n")
        time.sleep(1)
        self.tn.read_very_eager() 

    def disconnect(self):
        if self.tn:
            self.tn.close()
            self.tn = None

    def _send_command(self, cmd: str, wait_time: int = 3) -> str:
        self.connect()
        self.tn.write(cmd.encode('ascii') + b"\n")
        time.sleep(wait_time)
        return self.tn.read_very_eager().decode('ascii', errors='ignore')

    def get_boards(self) -> List[Dict[str, str]]:
        output = self._send_command("show card", wait_time=3)
        boards = []
        for line in output.split('\n'):
            line = line.strip()
            if not line or line.startswith("Rack") or line.startswith("---"):
                continue
            parts = re.split(r'\s+', line)
            if len(parts) >= 8:
                boards.append({
                    "slot": parts[2],
                    "type": parts[3],
                    "ports": parts[5],
                    "version": parts[6],
                    "status": parts[-1]
                })
        return boards

    def get_vlans(self) -> str:
        # show vlan summary
        return self._send_command("show vlan summary", wait_time=3)

    def get_running_config(self) -> str:
        # To get the full running config safely without freezing the terminal, we read iteratively
        self.connect()
        self.tn.write(b"show running-config\n")
        time.sleep(5) # wait for the buffer to fill
        out = self.tn.read_very_eager().decode('ascii', errors='ignore')
        return out

    def save_config(self) -> str:
        # "write" in privilege mode
        self.connect()
        self.tn.write(b"write\n")
        time.sleep(10) # Write takes a while
        return self.tn.read_very_eager().decode('ascii', errors='ignore')

    def reboot_olt(self) -> str:
        self.connect()
        self.tn.write(b"reload\n")
        time.sleep(2)
        self.tn.write(b"yes\n") # Confirm
        time.sleep(2)
        out = self.tn.read_very_eager().decode('ascii', errors='ignore')
        self.disconnect()
        return out

    def get_unauthorized_onus(self) -> List[Dict[str, str]]:
        output = self._send_command("show gpon onu uncfg", wait_time=4)
        onus = []
        for line in output.split('\n'):
            line = line.strip()
            if not line or "OnuIndex" in line or "---" in line or "No related information" in line:
                continue
            parts = re.split(r'\s+', line)
            if len(parts) >= 2:
                raw_idx = parts[0]
                sn = parts[1]
                
                match = re.search(r'(\d+)/(\d+)/(\d+)', raw_idx)
                if match:
                    shelf = match.group(1)
                    slot = match.group(2)
                    pon = match.group(3)
                    
                    onus.append({
                        "interface": raw_idx if raw_idx.startswith("gpon-onu") else f"gpon-onu_{raw_idx}",
                        "slot": slot,
                        "pon": pon,
                        "sn": sn
                    })
        return onus

    def get_onu_full_config(self, onu_interface: str) -> Dict[str, str]:
        """
        Extracts running-config of ONU, OLT port, and detail info.
        """
        # Ensure correct prefix
        if not onu_interface.startswith("gpon-onu_"):
            onu_interface = f"gpon-onu_{onu_interface}"
            
        # Extract OLT port from ONU interface (e.g. gpon-onu_1/1/1:1 -> gpon-olt_1/1/1)
        olt_interface = onu_interface.replace("gpon-onu_", "gpon-olt_").split(":")[0]

        data = {}
        data["running_config_onu"] = self._send_command(f"show running-config interface {onu_interface}", wait_time=2)
        data["running_config_olt_port"] = self._send_command(f"show running-config interface {olt_interface}", wait_time=2)
        data["detail_info"] = self._send_command(f"show gpon onu detail-info {onu_interface}", wait_time=2)
        data["wan_ip"] = self._send_command(f"show gpon remote-onu wan-ip {onu_interface}", wait_time=2)
        data["ip_host"] = self._send_command(f"show gpon remote-onu ip-host {onu_interface}", wait_time=2)
        return data

    def get_onu_running_config(self, onu_interface: str) -> Dict[str, str]:
        """
        Fast extraction method ONLY for Configuration Engine.
        Omits all diagnostic data (detail-info, wan-ip) to drop time from 15s to 2s.
        Includes performance logging.
        """
        import time
        import logging
        logger = logging.getLogger(__name__)
        
        t0 = time.time()
        
        # Ensure correct prefix
        if not onu_interface.startswith("gpon-onu_"):
            onu_interface = f"gpon-onu_{onu_interface}"
            
        data = {}
        # We assume self.connect() is managed externally by the Engine (ONUConfigurationEngine handles lock and connection)
        # But wait, _send_command doesn't require explicit connect() if it uses the session. 
        # For safety and time tracking:
        t_start_cmd = time.time()
        data["running_config_onu"] = self._send_command(f"show running-config interface {onu_interface}", wait_time=2)
        t_cmd_end = time.time()
        
        logger.info(f"[ONU CONFIG] running-config: {t_cmd_end - t_start_cmd:.2f}s")
        
        # Omit diagnostic commands for speed
        
        t_total = time.time() - t0
        logger.info(f"[ONU CONFIG] total extraction: {t_total:.2f}s")
        
        return data

    def get_next_available_onu_id(self, pon_interface: str) -> int:
        """
        Calculates the next free ONU ID (1-128) on a specific PON port.
        pon_interface should be like 'gpon-olt_1/2/1'
        """
        output = self._send_command(f"show gpon onu state {pon_interface}", wait_time=3)
        used_ids = set()
        
        for line in output.split('\n'):
            line = line.strip()
            # Expecting lines like: gpon-onu_1/2/1:1   working
            match = re.search(r'gpon-onu_\d+/\d+/\d+:(\d+)', line)
            if match:
                used_ids.add(int(match.group(1)))
                
        for i in range(1, 129): # Max 128 ONUs per PON
            if i not in used_ids:
                return i
                
        return -1

    # --- UPLINK DISCOVERY METHODS ---
    
    def get_uplink_interfaces(self) -> List[Dict[str, str]]:
        """
        Polls standard C320 uplink interfaces to discover their status.
        Since ZTE doesn't have a single 'show uplinks' command, we check the common ones.
        """
        uplinks = []
        # Standard uplink ports on C320 control boards
        candidate_ports = [
            "xgei_1/19/1", "xgei_1/19/2", "gei_1/19/3", "gei_1/19/4",
            "xgei_1/20/1", "xgei_1/20/2", "gei_1/20/3", "gei_1/20/4",
            "gei_1/19/1", "gei_1/19/2", "gei_1/20/1", "gei_1/20/2" # Added just in case
        ]
        
        for port in candidate_ports:
            out = self._send_command(f"show interface {port}", wait_time=2)
            if "%Error" not in out and port in out:
                # Parse status
                # Example: xgei_1/19/1 is up, line protocol is up
                # Or: xgei_1/19/1 is down, line protocol is down
                oper_state = "down"
                out_lower = out.lower()
                if "is up" in out_lower and "line protocol is up" in out_lower:
                    oper_state = "up"
                elif "administratively down" in out_lower or "line protocol is down" in out_lower:
                    oper_state = "down"
                    
                speed = "auto"
                if "10000Mb/s" in out:
                    speed = "10G"
                elif "1000Mb/s" in out:
                    speed = "1G"
                    
                uplinks.append({
                    "interface": port,
                    "admin_state": "enable", # simplified
                    "oper_state": oper_state,
                    "speed": speed,
                    "type": "xgei" if "xgei" in port else "gei"
                })
                    
        return uplinks

    def get_smartgroups(self) -> List[Dict[str, str]]:
        """
        Parses smartgroups (LACP) from the OLT by checking common smartgroups.
        """
        smartgroups = []
        candidate_ports = ["smartgroup1", "smartgroup2", "smartgroup3", "smartgroup4"]
        
        for port in candidate_ports:
            out = self._send_command(f"show interface {port}", wait_time=2)
            if "%Error" not in out and port in out:
                oper_state = "down"
                out_lower = out.lower()
                if "is up" in out_lower and "line protocol is up" in out_lower:
                    oper_state = "up"
                    
                smartgroups.append({
                    "interface": port,
                    "mode": "static",
                    "admin_state": "enable",
                    "oper_state": oper_state,
                    "type": "smartgroup"
                })
        return smartgroups

    def get_uplink_running_config(self, interface: str) -> str:
        """
        Gets the running configuration for a specific uplink or smartgroup
        to determine its switchport mode and allowed VLANs.
        """
        return self._send_command(f"show running-config interface {interface}", wait_time=2)

    def execute_provisioning_transactional(self, commands: List[str]) -> List[Dict[str, str]]:
        """
        Executes a list of commands. Stops immediately and raises an Exception
        if any command results in an error. Returns the list of successful command outputs.
        """
        self.connect()
        results = []
        for cmd in commands:
            self.tn.write(cmd.encode('ascii') + b"\n")
            time.sleep(1.0) # Esperamos 1 seg por comando, algunos necesitan más pero ZTE suele ser rápido
            out = self.tn.read_very_eager().decode('ascii', errors='ignore')
            
            # Verificar indicadores de error de ZTE (ignorando %Info y %Warning)
            error_keywords = ["Invalid input", "Error:", "Unknown command", "already exists", "Conflict", "%Error", "%Unrecognized", "% Incomplete"]
            has_error = any(kw in out for kw in error_keywords)
            
            if "%" in out and "%Info" not in out and "%Warning" not in out and not has_error:
                has_error = True
            
            results.append({
                "command": cmd,
                "output": out.strip(),
                "status": "FAILED" if has_error else "SUCCESS"
            })
            
            if has_error:
                # Transacción fallida, levantar excepción
                raise Exception(f"Fallo en comando: '{cmd}'. Output: {out.strip()}")
                
        return results

    def get_all_onu_states(self) -> Dict[str, Dict[str, str]]:
        # Sync Rápido: Devuelve { "gpon-onu_1/2/1:1": {"status": "working", "sn": ...} }
        output = self._send_command("show gpon onu state", wait_time=6)
        states = {}
        for line in output.split('\n'):
            line = line.strip()
            if not line or "OnuIndex" in line or "---" in line or "No related information" in line:
                continue
            parts = re.split(r'\s+', line)
            
            if len(parts) >= 4 and re.match(r'^(gpon-onu_)?\d+/\d+/\d+:\d+', parts[0]):
                raw_idx = parts[0]
                interface = raw_idx if raw_idx.startswith("gpon-onu_") else f"gpon-onu_{raw_idx}"
                state = parts[3]
                
                states[interface] = {
                    "status": state, 
                    "sn": f"PENDING_{interface}" # Placeholder, config lo sobrescribirá
                }
        return states

    def get_all_onu_configs(self) -> Dict[str, Dict[str, Any]]:
        # Sync Profundo: Parsea running-config por bloques de manera resiliente
        output = self._send_command("show running-config", wait_time=12) # Toma más tiempo
        configs = {}
        
        # Bloques separados por "!"
        blocks = output.split('!')
        for block in blocks:
            if "interface gpon-onu_" in block:
                try:
                    lines = block.strip().split('\n')
                    interface_match = re.search(r'interface\s+(gpon-onu_\d+/\d+/\d+:\d+)', lines[0])
                    if not interface_match:
                        continue
                    
                    interface = interface_match.group(1)
                    onu_data = {
                        "name": None,
                        "description": None,
                        "onu_type": None,
                        "sn": None,
                        "vlan": None,
                        "service_profile": None,
                        "pppoe_username": None,
                        "bridge_router_mode": "Bridge" # default until proven otherwise
                    }
                    
                    for line in lines[1:]:
                        line = line.strip()
                        try:
                            if line.lower().startswith("name "):
                                onu_data["name"] = line[5:].strip()
                            elif line.lower().startswith("description "):
                                onu_data["description"] = line[12:].strip()
                            elif line.lower().startswith("sn "):
                                onu_data["sn"] = line[3:].strip()
                            elif line.lower().startswith("type "):
                                onu_data["onu_type"] = line[5:].strip()
                            elif "user-vlan" in line.lower() or "vlan " in line.lower():
                                vlan_match = re.search(r'(?:user-vlan\s+|vlan\s+)(\d+)', line, re.IGNORECASE)
                                if vlan_match: onu_data["vlan"] = vlan_match.group(1)
                            elif line.lower().startswith("tcont ") and "profile" in line.lower():
                                prof_match = re.search(r'profile\s+([^\s]+)', line, re.IGNORECASE)
                                if prof_match: onu_data["service_profile"] = prof_match.group(1)
                            elif line.lower().startswith("wan-ip ") and "mode pppoe" in line.lower():
                                onu_data["bridge_router_mode"] = "Router"
                                user_match = re.search(r'username\s+([^\s]+)', line, re.IGNORECASE)
                                if user_match: onu_data["pppoe_username"] = user_match.group(1)
                            elif line.lower().startswith("wan-ip ") and ("mode dhcp" in line.lower() or "mode static" in line.lower()):
                                onu_data["bridge_router_mode"] = "Router"
                            elif line.lower().startswith("service internet"):
                                onu_data["bridge_router_mode"] = "Router"
                        except Exception as parse_err:
                            logger.warning(f"Error parsing line '{line}' on {interface}: {parse_err}")
                            continue # Si falla una línea, continuamos
                    
                    configs[interface] = onu_data
                except Exception as block_err:
                    logger.warning(f"Error parsing block for an interface: {block_err}")
                    continue # Si falla un bloque, continuamos con la siguiente ONU

        # Segunda pasada: Extraer SN reales de los bloques gpon-olt
        for block in blocks:
            if "interface gpon-olt_" in block:
                try:
                    lines = block.strip().split('\n')
                    olt_iface_match = re.search(r'interface\s+(gpon-olt_\d+/\d+/\d+)', lines[0])
                    if not olt_iface_match: continue
                    
                    olt_iface = olt_iface_match.group(1)
                    base_onu_iface = olt_iface.replace("gpon-olt_", "gpon-onu_")
                    
                    for line in lines[1:]:
                        # onu 1 type ZTEG-F660 sn ZTEGC0123456
                        match = re.search(r'onu\s+(\d+)\s+type\s+(\S+)\s+sn\s+(\S+)', line, re.IGNORECASE)
                        if match:
                            onu_idx = match.group(1)
                            onu_type = match.group(2)
                            real_sn = match.group(3)
                            full_onu_iface = f"{base_onu_iface}:{onu_idx}"
                            
                            if full_onu_iface in configs:
                                configs[full_onu_iface]["sn"] = real_sn
                                configs[full_onu_iface]["olt_type_name"] = onu_type
                except Exception as e:
                    logger.warning(f"Error parsing PON block for SN: {e}")
                    
        return configs

    def get_all_optical_power(self) -> Dict[str, str]:
        # Extrae masivamente la potencia optica en OLTs ZTE
        # Utiliza "show pon power attenuation gpon-onu_X/X/X:X" iterativamente o 
        # para ZTE C320 existe un comando masivo "show gpon onu rx-power all" (depende de versión).
        # Implementaremos el comando masivo "show pon power onu-rx gpon-olt_*"
        output = self._send_command("show pon power onu-rx", wait_time=8)
        powers = {}
        for line in output.split('\n'):
            line = line.strip()
            if not line or "OnuIndex" in line or "---" in line or "No related information" in line:
                continue
            parts = re.split(r'\s+', line)
            # Esperamos: gpon-onu_1/2/1:1    -18.423(dbm)
            if len(parts) >= 2 and re.match(r'^(gpon-onu_)?\d+/\d+/\d+:\d+', parts[0]):
                raw_idx = parts[0]
                interface = raw_idx if raw_idx.startswith("gpon-onu_") else f"gpon-onu_{raw_idx}"
                # Capturar el número antes de (dbm)
                power_match = re.search(r'([-0-9.]+)', parts[1])
                if power_match:
                    powers[interface] = power_match.group(1)
        return powers

    def get_all_onus(self) -> List[Dict[str, str]]:
        # Backward compatibility for fast sync
        states = self.get_all_onu_states()
        return [{"interface": k, **v} for k, v in states.items()]

    def get_onu_power(self, pon_port: str, onu_id: str) -> Dict[str, Optional[float]]:
        # Backward compatibility for base class and api/olt.py
        interface = f"gpon-onu_{pon_port}:{onu_id}"
        full_power = self.get_full_onu_power(interface)
        return {
            "rx": full_power.get("rx_onu"),
            "tx": full_power.get("tx_onu")
        }

    def get_full_onu_power(self, interface: str) -> Dict[str, Any]:
        raw_logs = []
        try:
            # Primero leer RX que la OLT ve de la ONU
            out_rx = self._send_command(f"show pon power onu-rx {interface}", wait_time=2)
            raw_logs.append(f"> show pon power onu-rx {interface}\n{out_rx}")
            
            rx_olt_match = re.search(r'Rx power:\s*([-0-9.]+)', out_rx)
            rx_olt = float(rx_olt_match.group(1)) if rx_olt_match else None
            
            # Luego leer detalle de atenuación o información de la ONU
            out_detail = self._send_command(f"show pon power attenuation {interface}", wait_time=2)
            raw_logs.append(f"> show pon power attenuation {interface}\n{out_detail}")
            
            rx_onu_match = re.search(r'Rx power[^\n:]*:\s*([-0-9.]+)', out_detail, re.IGNORECASE)
            tx_onu_match = re.search(r'Tx power[^\n:]*:\s*([-0-9.]+)', out_detail, re.IGNORECASE)
            temp_match = re.search(r'Temperature[^\n:]*:\s*([-0-9.]+)', out_detail, re.IGNORECASE)
            
            # Si falló, intentar fallback a detail-info
            if not rx_onu_match:
                out_detail2 = self._send_command(f"show gpon onu detail-info {interface}", wait_time=3)
                raw_logs.append(f"> show gpon onu detail-info {interface}\n{out_detail2}")
                rx_onu_match = re.search(r'Rx power[^\n:]*:\s*([-0-9.]+)', out_detail2, re.IGNORECASE)
                tx_onu_match = re.search(r'Tx power[^\n:]*:\s*([-0-9.]+)', out_detail2, re.IGNORECASE)
                if not temp_match:
                    temp_match = re.search(r'Temperature[^\n:]*:\s*([-0-9.]+)', out_detail2, re.IGNORECASE)
            
            rx_onu = float(rx_onu_match.group(1)) if rx_onu_match else None
            tx_onu = float(tx_onu_match.group(1)) if tx_onu_match else None
            temp = float(temp_match.group(1)) if temp_match else None
            
            return {
                "rx_onu": rx_onu,
                "tx_onu": tx_onu,
                "rx_olt": rx_olt,
                "tx_olt": None,
                "temp": temp,
                "raw_output": "\n\n".join(raw_logs)
            }
        except Exception as e:
            raise Exception(f"Telnet Error: {str(e)}. Logs: " + "\n\n".join(raw_logs))

    def get_onu_details(self, interface: str) -> Dict[str, Any]:
        raw_logs = []
        try:
            # Comando 1: Detail info (Generalmente da uptime, distance, MAC, type, name, description)
            out_detail = self._send_command(f"show gpon onu detail-info {interface}", wait_time=3)
            raw_logs.append(f"> show gpon onu detail-info {interface}\n{out_detail}")
            
            # Comando 2: Running config (Generalmente da name, tcont, gemport)
            out_run = self._send_command(f"show running-config interface {interface}", wait_time=2)
            raw_logs.append(f"> show running-config interface {interface}\n{out_run}")
            
            combined_out = out_detail + "\n" + out_run
            
            # Name and Description (more robust using running config parse logic)
            # ZTE might output "Name: " (empty) in detail-info, but have it in running-config as "name XXX"
            olt_name = None
            olt_desc = None
            for line in out_run.split('\n'):
                line = line.strip()
                if line.startswith("name "):
                    olt_name = line.replace("name ", "").strip()
                elif line.startswith("description "):
                    olt_desc = line.replace("description ", "").strip()
            
            # If not found in running-config, try detail-info regex
            if not olt_name:
                name_match = re.search(r'(?:Name\s*:|ONU Name\s*:)\s+([^\n\r]+)', out_detail, re.IGNORECASE)
                if name_match: olt_name = name_match.group(1).strip()
            
            if not olt_desc:
                desc_match = re.search(r'(?:Description\s*:)\s+([^\n\r]+)', out_detail, re.IGNORECASE)
                if desc_match: olt_desc = desc_match.group(1).strip()

            # Model / Type: "Type: XXX" or "ONU Type: XXX"
            type_match = re.search(r'(?:Type\s*:|ONU Type\s*:)\s+([^\n\r]+)', combined_out, re.IGNORECASE)
            # MAC: "Serial number: XXX" or "SN: XXX" o "Mac: "
            mac_match = re.search(r'(?:Serial number\s*:|SN\s*:|Mac\s*:)\s+([a-zA-Z0-9:-]+)', combined_out, re.IGNORECASE)
            # Uptime: "Online duration: XXX"
            uptime_match = re.search(r'(?:Online duration\s*:|uptime\s*:)\s+([^\n\r]+)', combined_out, re.IGNORECASE)
            # Distance: "Distance: 1234m"
            distance_match = re.search(r'(?:Distance\s*:)\s+([^\n\r]+)', combined_out, re.IGNORECASE)
            
            return {
                "olt_name_config": olt_name,
                "description": olt_desc,
                "onu_type": type_match.group(1).strip() if type_match else None,
                "mac_sn": mac_match.group(1).strip() if mac_match else None,
                "uptime": uptime_match.group(1).strip() if uptime_match else None,
                "distance": distance_match.group(1).strip() if distance_match else None,
                "raw_output": "\n\n".join(raw_logs)
            }
            
        except Exception as e:
            raise Exception(f"Telnet Error: {str(e)}. Logs: " + "\n\n".join(raw_logs))

    def get_onu_wan_status(self, interface: str) -> Dict[str, Any]:
        raw_logs = []
        wan_ip = None
        wan_mode = None
        wan_status = None
        vlan = None
        profile = None
        pppoe_user = None
        is_router = False
        
        try:
            # 1. show running-config (Base config: vlan, profile, pppoe user)
            out_run = self._send_command(f"show running-config interface {interface}", wait_time=2)
            raw_logs.append(f"> show running-config interface {interface}\n{out_run}")
            
            vlan_match = re.search(r'(?:user-vlan\s+|vlan\s+)(\d+)', out_run, re.IGNORECASE)
            if vlan_match: vlan = vlan_match.group(1)
            
            profile_match = re.search(r'tcont\s+\d+\s+profile\s+([^\n\r]+)', out_run, re.IGNORECASE)
            if profile_match: profile = profile_match.group(1).strip()
            
            # Detect PPPoE config from run
            pppoe_match = re.search(r'wan-ip\s+\d+\s+mode\s+pppoe\s+username\s+([^\s]+)', out_run, re.IGNORECASE)
            if pppoe_match:
                is_router = True
                wan_mode = "PPPoE"
                pppoe_user = pppoe_match.group(1)
            elif re.search(r'wan-ip\s+\d+\s+mode\s+dhcp', out_run, re.IGNORECASE):
                is_router = True
                wan_mode = "DHCP"
            elif re.search(r'service internet', out_run, re.IGNORECASE):
                is_router = True

            # 2. show gpon remote-onu wan-ip (Status & IP)
            out_wan = self._send_command(f"show gpon remote-onu wan-ip {interface}", wait_time=3)
            raw_logs.append(f"> show gpon remote-onu wan-ip {interface}\n{out_wan}")
            
            if "IP Address" in out_wan or "Mode" in out_wan or "PPPoE" in out_wan or "DHCP" in out_wan or re.search(r'\d+\.\d+\.\d+\.\d+', out_wan):
                is_router = True
                if "PPPoE" in out_wan: wan_mode = "PPPoE"
                elif "DHCP" in out_wan: wan_mode = "DHCP"
                elif "Static" in out_wan or "static" in out_wan: wan_mode = "Static"
                
                ip_match = re.search(r'(?:IP Address\s*:|IP\s*:)?\s*(\d{1,3}(?:\.\d{1,3}){3})', out_wan)
                if ip_match and ip_match.group(1) != "0.0.0.0":
                    wan_ip = ip_match.group(1)
                    
                if "up" in out_wan.lower() or "connected" in out_wan.lower() or wan_ip:
                    wan_status = "Connected"
                elif "down" in out_wan.lower() or "disconnected" in out_wan.lower():
                    wan_status = "Disconnected"

            # 3. show gpon remote-onu ip-host (Fallback for IP)
            if not wan_ip:
                out_host = self._send_command(f"show gpon remote-onu ip-host {interface}", wait_time=2)
                raw_logs.append(f"> show gpon remote-onu ip-host {interface}\n{out_host}")
                ip_match = re.search(r'(\d{1,3}(?:\.\d{1,3}){3})', out_host)
                if ip_match and ip_match.group(1) != "0.0.0.0" and ip_match.group(1) != "127.0.0.1":
                    wan_ip = ip_match.group(1)
                    is_router = True
                    if not wan_status: wan_status = "Connected"

            # 4. show gpon remote-onu detail-info (Deep fallback)
            if not wan_ip or not wan_mode:
                out_rem_det = self._send_command(f"show gpon remote-onu detail-info {interface}", wait_time=3)
                raw_logs.append(f"> show gpon remote-onu detail-info {interface}\n{out_rem_det}")
                if not wan_ip:
                    ip_match = re.search(r'(\d{1,3}(?:\.\d{1,3}){3})', out_rem_det)
                    if ip_match and ip_match.group(1) != "0.0.0.0":
                        wan_ip = ip_match.group(1)
                        is_router = True
                        if not wan_status: wan_status = "Connected"

            return {
                "is_router": is_router,
                "wan_ip": wan_ip,
                "wan_mode": wan_mode,
                "wan_status": wan_status,
                "vlan": vlan,
                "profile": profile,
                "pppoe_user": pppoe_user,
                "raw_output": "\n\n".join(raw_logs)
            }
            
        except Exception as e:
            raise Exception(f"Telnet Error: {str(e)}. Logs: " + "\n\n".join(raw_logs))
