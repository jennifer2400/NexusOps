from sqlalchemy import text
from app.db.session import engine
from app.models.network import Base

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE olts ADD COLUMN last_total_in_bps FLOAT DEFAULT 0"))
        print("Added last_total_in_bps")
    except Exception as e:
        print("Error last_total_in_bps:", e)
        
    try:
        conn.execute(text("ALTER TABLE olts ADD COLUMN last_total_out_bps FLOAT DEFAULT 0"))
        print("Added last_total_out_bps")
    except Exception as e:
        print("Error last_total_out_bps:", e)
        
    try:
        conn.execute(text("ALTER TABLE olts ADD COLUMN last_traffic_sync_at TIMESTAMP"))
        print("Added last_traffic_sync_at")
    except Exception as e:
        print("Error last_traffic_sync_at:", e)
    
    conn.commit()

Base.metadata.create_all(bind=engine)
print("Tables ensured.")
