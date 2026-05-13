from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, olt
from app.db.session import engine
from app.models.user import Base as UserBase
from app.models.network import Base as NetworkBase

# Crear las tablas en la BD (ahora administrado por Alembic, pero lo dejamos como fallback seguro)
UserBase.metadata.create_all(bind=engine)
NetworkBase.metadata.create_all(bind=engine)

app = FastAPI(
    title="Helix NOC API",
    description="Backend para la Plataforma de Administracion OLT GPON",
    version="1.0.0"
)

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En producción cambiar por dominios específicos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
import os

# Create uploads directory if it doesn't exist
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Rutas
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(olt.router, prefix="/api/olt", tags=["olt"])
from app.api import sync, stats, onu, provisioning, onu_actions, gateways, settings, traffic, alarms, olt_tools
app.include_router(sync.router, prefix="/api/olt", tags=["sync"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(onu.router, prefix="/api/onus", tags=["onus"])
app.include_router(provisioning.router, prefix="/api/provisioning", tags=["provisioning"])
app.include_router(onu_actions.router, prefix="/api/onus", tags=["onu_actions"])
app.include_router(gateways.router, prefix="/api/gateways", tags=["gateways"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(traffic.router, prefix="/api/olt", tags=["traffic"])
app.include_router(alarms.router, prefix="/api/alarms", tags=["alarms"])
app.include_router(olt_tools.router, prefix="/api/olt", tags=["olt_tools"])
from app.api import onu_config, onu_models, speed_profiles, vlan_profiles, discovery
app.include_router(onu_config.router, prefix="/api/onu-config", tags=["onu_config"])
app.include_router(onu_models.router, prefix="/api/onu-models", tags=["onu_models"])
app.include_router(speed_profiles.router, prefix="/api/provisioning/speed-profiles", tags=["speed_profiles"])
app.include_router(vlan_profiles.router, prefix="/api/provisioning/vlan-profiles", tags=["vlan_profiles"])
app.include_router(discovery.router, prefix="/api/discovery", tags=["discovery"])
from app.core.scheduler import start_scheduler

@app.on_event("startup")
async def startup_event():
    start_scheduler()

@app.get("/api/health")
def read_root():
    return {"status": "online", "message": "Helix NOC Backend is running!"}

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Message text was: {data}")
