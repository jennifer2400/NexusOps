from app.db.session import engine, Base
from app.models.provisioning import ProvisioningTemplate, ProvisioningJob

# Solo crea las tablas nuevas si no existen
Base.metadata.create_all(bind=engine)
