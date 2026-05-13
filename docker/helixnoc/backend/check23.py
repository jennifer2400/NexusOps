import json
from app.db.session import SessionLocal
from sqlalchemy import text
db = SessionLocal()
res = db.execute(text("SELECT logs FROM provisioning_jobs WHERE id = 23")).fetchone()
if res and res[0]:
    for log in res[0]:
        if not log.get("success"):
            print("FAIL:", log.get("cmd"), "=>", log.get("res")[:100])

