
from app.drivers.zte import ZteC320Driver
from app.db.session import SessionLocal
from app.models.network import OLT

db = SessionLocal()
olt = db.query(OLT).first()
driver = ZteC320Driver(olt.ip_address, 23, olt.username, "Pr0v1s10n1ng_Adm1n")
driver.connect()
print(driver._send_command("configure terminal"))
print(driver._send_command("pon-onu-mng gpon-onu_1/2/1:58"))
print(driver._send_command("no service hsi"))
print(driver._send_command("no vlan port eth_0/1 mode tag vlan 1330"))
print(driver._send_command("exit"))
print(driver._send_command("interface gpon-onu_1/2/1:58"))
print(driver._send_command("no service-port 1"))
print(driver._send_command("no gemport 1"))
print(driver._send_command("no tcont 1"))
print(driver._send_command("exit"))
print(driver._send_command("interface gpon-olt_1/2/1"))
print(driver._send_command("no onu 58"))
print(driver._send_command("exit"))
driver.disconnect()

