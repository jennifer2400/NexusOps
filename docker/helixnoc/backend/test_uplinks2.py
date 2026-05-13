from app.db.session import SessionLocal
from app.models.network import OLT
from app.drivers.zte import ZteC320Driver
from app.core.crypto import decrypt_secret

db = SessionLocal()
olt = db.query(OLT).get(1)
pwd = decrypt_secret(olt.password)
d = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
d.connect()

ports = []
for slot in ['19', '20']:
    for p in ['1', '2', '3', '4']:
        ports.append(f'xgei_1/{slot}/{p}')
        ports.append(f'gei_1/{slot}/{p}')

for p in ports:
    out = d._send_command(f'show interface {p}', 1)
    if '%Error' not in out:
        print(f'{p} EXISTS')
