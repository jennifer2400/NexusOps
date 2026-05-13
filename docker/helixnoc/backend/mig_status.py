from sqlalchemy import text
from app.db.session import engine

conn = engine.connect()
conn.execute(text("ALTER TABLE site_gateways ALTER COLUMN status SET DEFAULT 'pending_adoption';"))
conn.commit()
conn.close()
