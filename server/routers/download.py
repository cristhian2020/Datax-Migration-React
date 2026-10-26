import os
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from server.dependencies import get_current_config, get_engine
from server.utils.logger_stream import log_manager
from core.migrator_download import (
    scan_old_download_robots,
    scan_v2_download_robots,
    get_download_db_info,
    refactor_download_code,
    apply_download_migration,
    generate_download_dag_only,
    test_download_robot_v2,
    reset_file_updated_to_in_db,
)
from core.deployer import deploy_robot_to_server, trigger_dag_on_server
from core.github_client import (
    list_pull_requests,
    get_pr_files,
    download_github_file,
)

router = APIRouter(prefix="/api/download", tags=["Robots de Descarga"])

class RefactorDownloadRequest(BaseModel):
    code: str
    raw_code: str
    download_type: Optional[str] = ""

class MigrateDownloadRequest(BaseModel):
    code: str
    skip_test: bool = False
    skip_dag: bool = False
    test_updated_to: str = "2024-01-01"

class TestV2DownloadRequest(BaseModel):
    code: str
    test_updated_to: str = "2024-01-01"

class ForceDagRequest(BaseModel):
    code: str

class UpdateDbDateRequest(BaseModel):
    code: str
    new_date: str

class SaveDownloadCodeRequest(BaseModel):
    code: str
    code_content: str

class DownloadGithubFileRequest(BaseModel):
    raw_url: str
    contents_url: str
    filename: str

class DeployDownloadRequest(BaseModel):
    code: str
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    generate_dag_server: bool = True
    trigger_dag: bool = False

@router.get("/v1-robots")
def get_v1_robots():
    cfg = get_current_config()
    old_repo = cfg["old_repo"]
    robots = scan_old_download_robots(old_repo)
    return {"robots": robots, "total": len(robots)}

@router.get("/v2-robots")
def get_v2_robots():
    cfg = get_current_config()
    new_repo = cfg["new_repo"]
    robots = scan_v2_download_robots(new_repo)
    return {"robots": robots, "total": len(robots)}

@router.get("/robot/{code}")
def get_download_robot_detail(code: str):
    cfg = get_current_config()
    old_repo = cfg["old_repo"]
    new_repo = cfg["new_repo"]
    engine = get_engine()

    db_info = get_download_db_info(code, engine) if engine else None
    
    # Check V2 existence
    v2_folder = os.path.join(new_repo, "models", "download", code)
    v2_py_path = os.path.join(v2_folder, f"{code}.py")
    v2_dag_path = os.path.join(new_repo, "dags", "download", f"{code}.py")
    already_migrated = os.path.isfile(v2_py_path)
    has_dag = os.path.isfile(v2_dag_path)

    v1_code = ""
    v1_folder = os.path.join(old_repo, "models", "download", code)
    if os.path.isdir(v1_folder):
        candidates = [f"Executor_{code}.py", f"{code}.py"]
        for c in candidates:
            p = os.path.join(v1_folder, c)
            if os.path.isfile(p):
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    v1_code = f.read()
                break

    v2_code = ""
    if already_migrated:
        with open(v2_py_path, "r", encoding="utf-8", errors="ignore") as f:
            v2_code = f.read()
    elif os.path.isdir(v2_folder):
        # Maybe another .py file inside
        for f in os.listdir(v2_folder):
            if f.endswith(".py") and not f.startswith("__"):
                with open(os.path.join(v2_folder, f), "r", encoding="utf-8", errors="ignore") as fl:
                    v2_code = fl.read()
                break

    refactored_code = ""
    if v1_code:
        dl_type = db_info.get("download_type", "") if db_info else ""
        refactored_code = refactor_download_code(v1_code, code, dl_type)

    return {
        "code": code,
        "db_info": db_info,
        "already_migrated": already_migrated,
        "has_dag": has_dag,
        "v1_code": v1_code,
        "v2_code": v2_code,
        "refactored_code": refactored_code,
    }

@router.post("/save-code")
def save_download_code(req: SaveDownloadCodeRequest):
    cfg = get_current_config()
    target_dir = os.path.join(cfg["new_repo"], "models", "download", req.code)
    os.makedirs(target_dir, exist_ok=True)
    target_py = os.path.join(target_dir, f"{req.code}.py")
    with open(target_py, "w", encoding="utf-8") as f:
        f.write(req.code_content)
    return {"success": True, "message": f"Código guardado en {target_py}", "path": target_py}

# GITHUB PR INTEGRATION FOR DOWNLOAD
@router.get("/github/prs")
def get_download_github_prs(search_query: str = ""):
    cfg = get_current_config()
    token = cfg.get("github_token") or ""
    repo = cfg.get("github_repo") or ""
    if not token:
        raise HTTPException(status_code=400, detail="GitHub Token (PAT) no configurado en Configuración")
    prs = list_pull_requests(token, repo, state="open", search_query=search_query)
    return {"prs": prs, "total": len(prs), "repo": repo}

@router.get("/github/pr-files/{pr_number}")
def get_download_pr_files_list(pr_number: int):
    cfg = get_current_config()
    token = cfg.get("github_token") or ""
    repo = cfg.get("github_repo") or ""
    files = get_pr_files(token, repo, pr_number)
    return {"files": files, "total": len(files)}

@router.post("/github/download-file")
async def download_download_file_from_github(req: DownloadGithubFileRequest):
    cfg = get_current_config()
    token = cfg.get("github_token") or ""
    content_bytes = download_github_file(token, req.raw_url, req.contents_url)
    if not content_bytes:
        raise HTTPException(status_code=400, detail="No se pudo descargar el archivo de GitHub")
    text_content = content_bytes.decode("utf-8", errors="ignore")
    return {"success": True, "type": "code", "content": text_content, "filename": req.filename}

@router.post("/refactor")
def refactor_code(req: RefactorDownloadRequest):
    code = refactor_download_code(req.raw_code, req.code, req.download_type)
    return {"code": code}

@router.post("/migrate")
async def migrate_robot(req: MigrateDownloadRequest):
    cfg = get_current_config()
    old_repo = cfg["old_repo"]
    new_repo = cfg["new_repo"]
    engine = get_engine()

    db_info = get_download_db_info(req.code, engine) if engine else None
    source_file = None
    v1_folder = os.path.join(old_repo, "models", "download", req.code)
    for c in [f"Executor_{req.code}.py", f"{req.code}.py"]:
        p = os.path.join(v1_folder, c)
        if os.path.isfile(p):
            source_file = p
            break

    if not source_file and os.path.isdir(v1_folder):
        for f in os.listdir(v1_folder):
            if f.endswith(".py") and not f.startswith("__"):
                source_file = os.path.join(v1_folder, f)
                break

    if not source_file:
        raise HTTPException(status_code=404, detail=f"No se encontró script original en {v1_folder}")

    await log_manager.broadcast(f"Iniciando migración para {req.code}...", "info", "download")
    
    res = apply_download_migration(
        code=req.code,
        source_file=source_file,
        new_repo_path=new_repo,
        download_type=db_info.get("download_type", "") if db_info else "",
        skip_test=req.skip_test,
        skip_dag=req.skip_dag,
        test_updated_to=req.test_updated_to
    )

    for l in res.get("logs", []):
        lvl = "error" if "FAIL" in l or "ERROR" in l else "info"
        await log_manager.broadcast(l, lvl, "download")

    return res

@router.post("/force-dag")
async def force_dag(req: ForceDagRequest):
    cfg = get_current_config()
    res = generate_download_dag_only(req.code, cfg["new_repo"])
    await log_manager.broadcast(res["message"], "info" if res["success"] else "error", "download")
    return res

@router.post("/test-v2")
async def test_v2(req: TestV2DownloadRequest):
    cfg = get_current_config()
    engine = get_engine()
    db_info = get_download_db_info(req.code, engine) if engine else None
    download_type = db_info.get("download_type", "") if db_info else ""
    await log_manager.broadcast(f"Ejecutando suite de test V2 para {req.code} (Fecha: {req.test_updated_to}, Tipo: {download_type or 'Auto'})...", "info", "download")
    res = test_download_robot_v2(
        code=req.code,
        new_repo_path=cfg["new_repo"],
        download_type=download_type,
        test_updated_to=req.test_updated_to
    )
    for l in res.get("logs", []):
        lvl = "error" if "FAIL" in l or "ERROR" in l else "info"
        await log_manager.broadcast(l, lvl, "download")
    return res

@router.post("/update-db-date")
def update_db_date(req: UpdateDbDateRequest):
    engine = get_engine()
    if not engine:
        raise HTTPException(status_code=500, detail="Base de datos no conectada")
    res = reset_file_updated_to_in_db(req.code, req.new_date, engine)
    return res

@router.post("/deploy")
async def deploy_download(req: DeployDownloadRequest):
    cfg = get_current_config()
    host = req.host or cfg["ssh_host"]
    port = req.port or cfg["ssh_port"]
    user = req.username or cfg["ssh_user"]
    pwd = req.password or cfg["ssh_pass"]

    if not pwd:
        raise HTTPException(status_code=400, detail="Contraseña SSH requerida para conectar al servidor")

    local_path = os.path.join(cfg["new_repo"], "models", "download", req.code)
    if not os.path.isdir(local_path):
        raise HTTPException(status_code=400, detail=f"El robot {req.code} no existe en V2 ({local_path}). Guárdalo primero antes de desplegar.")

    await log_manager.broadcast(f"Iniciando despliegue de {req.code} en {host}:{port}...", "info", "deploy")

    try:
        res = deploy_robot_to_server(
            host=host,
            port=port,
            username=user,
            password=pwd,
            remote_base_path="/home/datax-pds/datax/data-processing-platform-dev",
            process_type="download",
            robot_code=req.code,
            local_dir=local_path,
            local_robot_path=local_path,
            generate_dag=req.generate_dag_server
        )
    except Exception as exc:
        err = f"Fallo al desplegar {req.code}: {str(exc)}"
        await log_manager.broadcast(err, "error", "deploy")
        return {"success": False, "logs": [err], "dag_generated": False}

    for l in res.get("logs", []):
        await log_manager.broadcast(l, "info" if res.get("success") else "error", "deploy")

    if res.get("success") and req.trigger_dag:
        dag_id = f"download_{req.code}"
        await log_manager.broadcast(f"Activando DAG {dag_id} en Airflow...", "info", "deploy")
        trig_res = trigger_dag_on_server(host, port, user, pwd, dag_id)
        res["trigger_result"] = trig_res

    return res
