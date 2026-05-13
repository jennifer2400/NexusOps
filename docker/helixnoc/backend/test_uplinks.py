from app.db.session import SessionLocal
from app.models.network import OLT
from app.drivers.zte import ZteC320Driver
from app.core.crypto import decrypt_secret

db = SessionLocal()
olt = db.query(OLT).get(1)
pwd = decrypt_secret(olt.password)
d = ZteC320Driver(olt.ip_address, olt.port or 23, olt.username, pwd)
d.connect()

ports = ['xgei_1/19/1','xgei_1/19/2','xgei_1/20/1','xgei_1/20/2','gei_1/19/1','gei_1/19/2','gei_1/20/1','gei_1/20/2']
for p in ports:
    print(f'-- {p} --')
    out = d._send_command(f'show interface {p}', 2)
    print(out[:200])
