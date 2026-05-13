import sys
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.network import OLT

def seed_olt(ip, port, user, pwd):
    db = SessionLocal()
    try:
        # Verificar si ya existe
        existing = db.query(OLT).filter(OLT.ip_address == ip).first()
        if existing:
            print(f"OLT {ip} ya existe en la BD con ID {existing.id}")
            return
            
        nueva_olt = OLT(
            name="Morazan",
            ip_address=ip,
            port=port,
            protocol="telnet",
            username=user,
            password=pwd
        )
        db.add(nueva_olt)
        db.commit()
        db.refresh(nueva_olt)
        print(f"¡OLT guardada exitosamente en la BD con el ID: {nueva_olt.id}!")
    except Exception as e:
        print(f"Error guardando OLT: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Uso: python seed_olt.py <ip> <port> <user> <pass>")
        sys.exit(1)
    seed_olt(sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4])
