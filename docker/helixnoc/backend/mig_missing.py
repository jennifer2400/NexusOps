from sqlalchemy import text
from app.db.session import engine

conn = engine.connect()
try:
    conn.execute(text('ALTER TABLE site_gateways ADD COLUMN description VARCHAR;'))
except Exception as e: print(e)

try:
    conn.execute(text('ALTER TABLE site_gateways ADD COLUMN location VARCHAR;'))
except Exception as e: print(e)

try:
    conn.execute(text('ALTER TABLE site_gateways ADD COLUMN isp_site VARCHAR;'))
except Exception as e: print(e)

try:
    conn.execute(text('ALTER TABLE site_gateways ADD COLUMN technical_notes VARCHAR;'))
except Exception as e: print(e)

conn.commit()
conn.close()
