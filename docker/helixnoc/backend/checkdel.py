import json
from app.db.session import SessionLocal
from sqlalchemy import text
db = SessionLocal()
res = db.execute(text("SELECT logs FROM onu_delete_jobs ORDER BY id DESC LIMIT 1")).fetchone()
if res and res[0]:
    for log in res[0]:
        print(log.get("cmd"), "=>", log.get("res")[:100].replace("\n", " "))

