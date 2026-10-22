import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from server.dependencies import get_current_config, get_engine
import core.config as core_cfg
from core.github_client import test_github_access
from core.deployer import test_connection
from core.taiga_client import TaigaClient

router = APIRouter(prefix="/api/config", tags=["Configuration"])

class ConfigUpdate(BaseModel):
    old_repo: Optional[str] = None
    new_repo: Optional[str] = None
    db_host: Optional[str] = None
    db_port: Optional[int] = None
    db_user: Optional[str] = None
    db_pass: Optional[str] = None
    db_name: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_port: Optional[int] = None
    ssh_user: Optional[str] = None
    ssh_pass: Optional[str] = None
    github_repo: Optional[str] = None
    github_token: Optional[str] = None
    gemini_api_key: Optional[str] = None
    taiga_host: Optional[str] = None
    taiga_user: Optional[str] = None
    taiga_pass: Optional[str] = None
    taiga_project_slug: Optional[str] = None

class SshTestRequest(BaseModel):
    host: str
    port: int
    user: str
    password: str

class GithubTestRequest(BaseModel):
    token: str
    repo: str

class TaigaTestRequest(BaseModel):
    host: str
    user: str
    password: str
    project_slug: str

@router.get("")
def get_config():
    cfg = get_current_config()
    engine = get_engine()
    db_active = False
    if engine:
        try:
            with engine.connect() as conn:
                db_active = True
        except Exception:
            db_active = False
    return {
        "config": cfg,
        "db_connected": db_active
    }

@router.post("")
def update_config(payload: ConfigUpdate):
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(root_dir, ".env")
    
    current = get_current_config()
    data = payload.dict(exclude_unset=True)
    
    mapping = {
        "old_repo": "OLD_REPO_PATH",
        "new_repo": "NEW_REPO_PATH",
        "db_host": "DB_HOST",
        "db_port": "DB_PORT",
        "db_user": "DB_USER",
        "db_pass": "DB_PASS",
        "db_name": "DB_NAME",
        "ssh_host": "SSH_HOST",
        "ssh_port": "SSH_PORT",
        "ssh_user": "SSH_USER",
        "ssh_pass": "SSH_PASS",
        "github_repo": "GITHUB_REPO",
        "github_token": "GITHUB_TOKEN",
        "gemini_api_key": "GEMINI_API_KEY",
        "taiga_host": "TAIGA_HOST",
        "taiga_user": "TAIGA_USER",
        "taiga_pass": "TAIGA_PASS",
        "taiga_project_slug": "TAIGA_PROJECT_SLUG",
    }
    
    for k, v in data.items():
        if v is not None:
            env_var = mapping.get(k)
            if env_var:
                os.environ[env_var] = str(v)
    
    # Save to .env
    lines = []
    if os.path.isfile(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
    existing_keys = set()
    new_lines = []
    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            k = line.split("=")[0].strip()
            existing_keys.add(k)
            matched = False
            for p_key, env_var in mapping.items():
                if k == env_var and p_key in data and data[p_key] is not None:
                    new_lines.append(f"{env_var}={data[p_key]}\n")
                    matched = True
                    break
            if not matched:
                new_lines.append(line)
        else:
            new_lines.append(line)
            
    for p_key, env_var in mapping.items():
        if env_var not in existing_keys and p_key in data and data[p_key] is not None:
            new_lines.append(f"{env_var}={data[p_key]}\n")
            
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
        
    return {"success": True, "message": "Configuración guardada en .env", "config": get_current_config()}

@router.post("/test-db")
def test_db():
    engine = get_engine()
    if not engine:
        return {"success": False, "message": "No se pudo crear el motor de base de datos."}
    try:
        with engine.connect() as conn:
            return {"success": True, "message": "Conexión a PostgreSQL (platform_db) exitosa!"}
    except Exception as e:
        return {"success": False, "message": f"Error de conexión: {str(e)}"}

@router.post("/test-github")
def test_github(req: GithubTestRequest):
    ok, msg, _ = test_github_access(req.token, req.repo)
    return {"success": ok, "message": msg}

@router.post("/test-ssh")
def test_ssh(req: SshTestRequest):
    ok, msg = test_connection(req.host, req.port, req.user, req.password)
    return {"success": ok, "message": msg}

@router.post("/test-taiga")
def test_taiga(req: TaigaTestRequest):
    try:
        client = TaigaClient(req.host, req.user, req.password, req.project_slug)
        ok, msg = client.authenticate()
        if not ok:
            return {"success": False, "message": f"Error autenticando en Taiga: {msg}"}
        stories = client.get_user_stories()
        return {"success": True, "message": f"Conectado a Taiga exitosamente! ({len(stories)} historias encontradas)"}
    except Exception as e:
        return {"success": False, "message": f"Error conectando a Taiga: {str(e)}"}
