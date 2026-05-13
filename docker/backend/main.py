import docker
import os
import re
import subprocess
import yaml
import shutil
import psutil
import time
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

# ==================================================
# APP CONFIGURATION & MIDDLEWARE
# ==================================================
APP_ENV = os.getenv("APP_ENV", "development")
STACKS_DIR = os.getenv("STACKS_DIR", "/app/stacks")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3030,http://localhost:8081").split(",")
    if origin.strip()
]
STACK_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$")

app = FastAPI(
    title="NexusOps Docker NOC API",
    description="Backend operativo para gestion Docker, stacks y monitoreo de NexusOps.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if APP_ENV != "development" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(STACKS_DIR, exist_ok=True)

def get_docker_client():
    try:
        client = docker.from_env()
        client.ping()
        return client
    except Exception as e:
        print(f"Docker connection error: {e}")
        return None

def validate_stack_name(name: str) -> str:
    normalized = name.lower().strip()
    if not STACK_NAME_PATTERN.match(normalized):
        raise HTTPException(
            status_code=400,
            detail="Invalid stack name. Use 3-64 chars: lowercase letters, numbers and dashes. It must start and end with a letter or number.",
        )
    return normalized

def run_compose_command(args: list[str]):
    process = subprocess.run(args, capture_output=True, text=True)
    if process.returncode != 0:
        error_msg = process.stderr.strip() or process.stdout.strip() or "Unknown compose error"
        raise HTTPException(status_code=500, detail=error_msg)
    return process

# ==================================================
# SYSTEM HEALTH & OVERVIEW ENDPOINTS
# ==================================================
@app.get("/")
def home():
    client = get_docker_client()
    if not client:
        return {
            "project": "NexusOps",
            "environment": APP_ENV,
            "docker_engine": "Offline",
            "containers": 0,
            "services": "Offline"
        }
    try:
        containers = client.containers.list(all=True)
        running = len([c for c in containers if c.status == "running"])
        return {
            "project": "NexusOps",
            "environment": APP_ENV,
            "docker_engine": "Active",
            "containers": len(containers),
            "services": "Online" if running > 0 else "Offline"
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/health")
def health():
    client = get_docker_client()
    return {
        "status": "ok",
        "timestamp": time.time(),
        "docker_engine": "online" if client else "offline",
        "environment": APP_ENV,
    }

@app.get("/stats")
def stats():
    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    net = psutil.net_io_counters()
    boot_time = psutil.boot_time()
    
    return {
        "cpu_usage": f"{cpu}%",
        "memory_usage": f"{round(mem.used / (1024**3), 1)}GB / {round(mem.total / (1024**3), 1)}GB",
        "disk_usage": f"{disk.percent}%",
        "network_io": f"{round(net.bytes_sent / (1024**2), 1)}MB / {round(net.bytes_recv / (1024**2), 1)}MB",
        "uptime_seconds": int(time.time() - boot_time),
        "raw": {
            "cpu": cpu,
            "mem_percent": mem.percent,
            "disk_percent": disk.percent
        }
    }

# ==================================================
# DOCKER CONTAINERS ENDPOINTS
# ==================================================
@app.get("/containers")
def list_containers():
    client = get_docker_client()
    if not client:
        raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    try:
        containers = client.containers.list(all=True)
        result = []
        for c in containers:
            ports = []
            if c.ports:
                for k, v in c.ports.items():
                    if v:
                        ports.append(f"{v[0]['HostPort']}:{k.split('/')[0]}")
            result.append({
                "id": c.short_id,
                "name": c.name,
                "image": c.image.tags[0] if c.image.tags else c.image.id[-12:],
                "state": c.status.capitalize(),
                "status": c.attrs.get("State", {}).get("Status", c.status),
                "started_at": c.attrs.get("State", {}).get("StartedAt", ""),
                "ports": ports 
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing containers: {str(e)}")

@app.post("/containers/{container_id}/start")
def start_container(container_id: str):
    client = get_docker_client()
    if not client: raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    try:
        c = client.containers.get(container_id)
        c.start()
        return {"message": f"Container {c.name} started successfully"}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/containers/{container_id}/stop")
def stop_container(container_id: str):
    client = get_docker_client()
    if not client: raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    try:
        c = client.containers.get(container_id)
        c.stop()
        return {"message": f"Container {c.name} stopped successfully"}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/containers/{container_id}/restart")
def restart_container(container_id: str):
    client = get_docker_client()
    if not client: raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    try:
        c = client.containers.get(container_id)
        c.restart()
        return {"message": f"Container {c.name} restarted successfully"}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/containers/{container_id}")
def delete_container(container_id: str):
    client = get_docker_client()
    if not client: raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    try:
        c = client.containers.get(container_id)
        c.remove(force=True)
        return {"message": "Container removed successfully"}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/containers/{container_id}/logs")
def get_container_logs(container_id: str, tail: int = 100):
    client = get_docker_client()
    if not client: raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    try:
        safe_tail = min(max(tail, 10), 1000)
        c = client.containers.get(container_id)
        logs = c.logs(tail=safe_tail, timestamps=True).decode("utf-8", errors="replace")
        return {"logs": logs}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Log error: {str(e)}")

# ==================================================
# IMAGES MANAGEMENT ENDPOINTS
# ==================================================
@app.get("/images")
def list_images():
    client = get_docker_client()
    if not client: raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    try:
        images = client.images.list()
        result = []
        for img in images:
            result.append({
                "id": img.short_id.replace("sha256:", ""),
                "tags": img.tags,
                "size_mb": round(img.attrs.get("Size", 0) / (1024 * 1024), 2),
                "created": img.attrs.get("Created", "")
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/images/{image_id}")
def delete_image(image_id: str):
    client = get_docker_client()
    if not client: raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    try:
        client.images.remove(image_id, force=True)
        return {"message": "Image removed successfully"}
    except docker.errors.ImageNotFound:
        raise HTTPException(status_code=404, detail="Image not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove: {str(e)}")

# ==================================================
# STACKS (COMPOSE) DEPLOYMENT ENDPOINTS
# ==================================================
@app.post("/stacks/deploy")
async def deploy_stack(name: str = Form(...), file: UploadFile = File(...)):
    name = validate_stack_name(name)
    stack_path = os.path.join(STACKS_DIR, name)
    compose_file_path = os.path.join(stack_path, "docker-compose.yml")
    
    client = get_docker_client()
    if client:
        existing = [c for c in client.containers.list(all=True) if c.labels.get("com.docker.compose.project") == name]
        if existing and os.path.exists(stack_path):
             raise HTTPException(status_code=400, detail="Stack name already active in Docker and filesystem")

    if os.path.exists(stack_path):
        shutil.rmtree(stack_path)
        
    os.makedirs(stack_path, exist_ok=True)
    
    try:
        content = await file.read()
        try:
            yaml_content = yaml.safe_load(content)
            if not isinstance(yaml_content, dict) or "services" not in yaml_content:
                raise ValueError("Not a valid docker-compose structure. Missing services section.")
        except Exception as ye:
            shutil.rmtree(stack_path)
            raise HTTPException(status_code=400, detail=f"Invalid YAML file: {str(ye)}")
            
        with open(compose_file_path, "wb") as f:
            f.write(content)
            
        run_compose_command(["docker", "compose", "-p", name, "-f", compose_file_path, "up", "-d"])
        return {"message": "Stack deployed successfully", "name": name}
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(stack_path):
            shutil.rmtree(stack_path)
        raise HTTPException(status_code=500, detail=f"Server error during deploy: {str(e)}")

@app.get("/stacks")
def list_stacks():
    client = get_docker_client()
    if not client: raise HTTPException(status_code=503, detail="Docker Daemon Offline")
    
    try:
        all_containers = client.containers.list(all=True)
        docker_stacks = {}
        for c in all_containers:
            proj = c.labels.get("com.docker.compose.project")
            if proj:
                if proj not in docker_stacks:
                    docker_stacks[proj] = {"containers": 0, "running": 0, "ports": set()}
                
                docker_stacks[proj]["containers"] += 1
                if c.status == "running":
                    docker_stacks[proj]["running"] += 1
                
                if c.ports:
                    for k, v in c.ports.items():
                        if v:
                            port_map = f"{v[0]['HostPort']}:{k.split('/')[0]}"
                            docker_stacks[proj]["ports"].add(port_map)

        result = []
        if os.path.exists(STACKS_DIR):
            for name in os.listdir(STACKS_DIR):
                full_path = os.path.join(STACKS_DIR, name)
                if os.path.isdir(full_path):
                    created_at = os.path.getctime(full_path)
                    stack_info = {
                        "name": name,
                        "containers": 0,
                        "running": 0,
                        "state": "Ghost",
                        "published_ports": [],
                        "created_at": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(created_at)),
                        "path": full_path
                    }
                    
                    if name in docker_stacks:
                        d_data = docker_stacks[name]
                        stack_info["containers"] = d_data["containers"]
                        stack_info["running"] = d_data["running"]
                        stack_info["published_ports"] = sorted(list(d_data["ports"]))
                        
                        if d_data["running"] == d_data["containers"]:
                            stack_info["state"] = "Running"
                        elif d_data["running"] > 0:
                            stack_info["state"] = "Partial"
                        else:
                            stack_info["state"] = "Stopped"
                    
                    result.append(stack_info)
        
        for proj_name, d_data in docker_stacks.items():
            if not any(r["name"] == proj_name for r in result):
                result.append({
                    "name": proj_name,
                    "containers": d_data["containers"],
                    "running": d_data["running"],
                    "state": "External",
                    "published_ports": sorted(list(d_data["ports"])),
                    "created_at": "Unknown",
                    "path": None
                })
                
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/stacks/{name}")
def delete_stack(name: str):
    name = validate_stack_name(name)
    stack_path = os.path.join(STACKS_DIR, name)
    compose_file_path = os.path.join(stack_path, "docker-compose.yml")
    
    try:
        if os.path.exists(compose_file_path):
            subprocess.run(["docker", "compose", "-p", name, "-f", compose_file_path, "down"], capture_output=True)
        else:
            subprocess.run(["docker", "compose", "-p", name, "down"], capture_output=True)

        client = get_docker_client()
        if client:
            proj_containers = [c for c in client.containers.list(all=True) if c.labels.get("com.docker.compose.project") == name]
            for c in proj_containers:
                try:
                    c.remove(force=True)
                except Exception:
                    pass

        if os.path.exists(stack_path):
            shutil.rmtree(stack_path)
            
        return {"message": f"Stack {name} and its assets have been fully purged."}
    except Exception as e:
        if os.path.exists(stack_path):
            try:
                shutil.rmtree(stack_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Failed to fully purge stack: {str(e)}")
