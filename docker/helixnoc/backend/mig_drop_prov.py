from sqlalchemy import text
from app.db.session import engine

conn = engine.connect()
try:
    conn.execute(text("DROP TABLE provisioning_jobs CASCADE;"))
    conn.execute(text("DROP TABLE provisioning_templates CASCADE;"))
    conn.commit()
    print("Old tables dropped.")
except Exception as e:
    print(e)
finally:
    conn.close()
