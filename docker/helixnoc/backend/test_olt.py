import sys
sys.path.append('.')
from app.drivers.zte import ZteC320Driver
from app.db.session import SessionLocal
from app.models.network import OLT
from app.core.crypto import decrypt_secret

db = SessionLocal()
olt = db.query(OLT).first()
pwd = decrypt_secret(olt.password) if olt.password else ''
driver = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
driver.connect()
print("--- UNCFG ---")
print(driver._send_command('show gpon onu uncfg', wait_time=2))
print("--- ONU 47 ---")
print(driver._send_command('show gpon onu state gpon-olt_1/2/1 47', wait_time=2))
driver.disconnect()
