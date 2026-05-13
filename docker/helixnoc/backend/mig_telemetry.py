from sqlalchemy import text
from app.db.session import engine

conn = engine.connect()
conn.execute(text("ALTER TABLE site_gateways ADD COLUMN last_handshake_at TIMESTAMP WITHOUT TIME ZONE;"))
conn.execute(text("ALTER TABLE site_gateways ADD COLUMN rx_bytes INTEGER DEFAULT 0;"))
conn.execute(text("ALTER TABLE site_gateways ADD COLUMN tx_bytes INTEGER DEFAULT 0;"))
conn.execute(text("ALTER TABLE site_gateways ADD COLUMN peer_status VARCHAR DEFAULT 'unknown';"))
conn.commit()
conn.close()
