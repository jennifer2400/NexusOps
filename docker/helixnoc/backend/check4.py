import json
from app.db.session import SessionLocal
from sqlalchemy import text
db = SessionLocal()
res = db.execute(text("SELECT commands_template FROM provisioning_templates WHERE id = 4")).fetchone()
print(res[0])

