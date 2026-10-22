from core.agent_tester import test_conversion_robot_code
import os
import sqlite3
import shutil
import base64
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from server.dependencies import get_current_config, get_engine
from server.utils.logger_stream import log_manager
from core.github_client import (
    list_pull_requests,
    get_pr_files,
    download_github_file,
    test_github_access,
)
from core.migrator_conversion import (
    scan_old_conversion_families,
    scan_v2_conversion_families,
    get_conversion_db_info,
    refactor_conversion_code,
    detect_available_samples,
    run_conversion_step_test,
    get_sqlite_data,
    get_replacement_table_data,
    save_replacement_table_changes,
    insert_single_replacement_record,
    delete_single_replacement_record,
    setup_columns_to_review,
    normalize_srch_value,
    get_latest_download_for_report,
    reset_report_migrated_to_in_db,
)
from core.deployer import deploy_robot_to_server, trigger_dag_on_server

router = APIRouter(prefix="/api/conversion", tags=["Robots de Conversión"])

class CustomFamilyRequest(BaseModel):
    report_code: str
    parent_code: Optional[str] = None

class SaveRobotCodeRequest(BaseModel):
    parent_code: str
    report_code: str
    code_content: str

class DownloadGithubFileRequest(BaseModel):
    raw_url: str
    contents_url: str
    filename: str
    is_sample: bool = False
    parent_code: Optional[str] = ""

class RunConversionTestRequest(BaseModel):
    code: str
    sample_file: str
    skip_text_match: Optional[bool] = True
    sheet_name: Optional[str] = None
    page_number: Optional[int] = 1

class SetupColumnsRequest(BaseModel):
    report_code: str
    parent_code: Optional[str] = ""
    custom_columns: Optional[List[str]] = None

class ReplacementQuery(BaseModel):
    report_code: str
    search: Optional[str] = ""
    limit: int = 500

class ReplacementInsert(BaseModel):
    report_code: str
    original_value: str
    srch_value: Optional[str] = ""
    final_value: str

class ReplacementUpdate(BaseModel):
    report_code: str
    original_data: List[Dict[str, Any]]
    edited_data: List[Dict[str, Any]]

class ReplacementDelete(BaseModel):
    report_code: str
    record_id: int

class DeployConversionRequest(BaseModel):
    parent_code: str
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    generate_dag_server: bool = True
    trigger_dag: bool = False

@router.get("/v1-families")
def get_v1_families():
    cfg = get_current_config()
    families = scan_old_conversion_families(cfg["old_repo"])
    return {"families": families, "total": len(families)}

@router.get("/v2-families")
def get_v2_families():
    cfg = get_current_config()
    families = scan_v2_conversion_families(cfg["new_repo"])
    return {"families": families, "total": len(families)}

@router.post("/custom-family")
def get_custom_family(req: CustomFamilyRequest):
    cfg = get_current_config()
    old_repo = cfg["old_repo"]
    new_repo = cfg["new_repo"]
    engine = get_engine()

    rep_code = req.report_code.strip()
    if req.parent_code and req.parent_code.strip():
        parent_code = req.parent_code.strip()
    else:
        parts = rep_code.split("_")
        if len(parts) >= 3:
            parent_code = f"C_{parts[1]}_{parts[2]}"
        else:
            parent_code = rep_code.replace("D_", "C_")

    db_info = get_conversion_db_info(rep_code, engine) if engine else None

    # Check local samples in attachments and repos
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local_att = os.path.join(root_dir, "attachtments")
    old_fam = os.path.join(old_repo, "models", "conversion", parent_code)
    new_fam = os.path.join(new_repo, "models", "conversion", parent_code)
    
    samples = detect_available_samples(parent_code, old_fam, local_att)
    if os.path.isdir(new_fam):
        for f in os.listdir(new_fam):
            if f.lower().endswith((".xlsx", ".xls", ".pdf", ".csv")):
                samples.append(os.path.join(new_fam, f))

    # Check V2 file
    v2_file = os.path.join(new_fam, f"{rep_code}.py")
    v2_code = ""
    has_v2 = os.path.isfile(v2_file)
    if has_v2:
        with open(v2_file, "r", encoding="utf-8", errors="ignore") as f:
            v2_code = f.read()

    # Check V1 file
    v1_file = os.path.join(old_fam, f"{rep_code}.py")
    v1_code = ""
    has_v1 = os.path.isfile(v1_file)
    if has_v1:
        with open(v1_file, "r", encoding="utf-8", errors="ignore") as f:
            v1_code = f.read()

    return {
        "report_code": rep_code,
        "parent_code": parent_code,
        "db_info": db_info,
        "samples": list(set(samples)),
        "has_v2": has_v2,
        "v2_code": v2_code,
        "has_v1": has_v1,
        "v1_code": v1_code,
        "refactored_code": refactor_conversion_code(v1_code, rep_code) if v1_code else ""
    }

@router.get("/family/{parent_code}")
def get_family_detail(parent_code: str):
    cfg = get_current_config()
    old_repo = cfg["old_repo"]
    new_repo = cfg["new_repo"]
    engine = get_engine()

    old_fam_path = os.path.join(old_repo, "models", "conversion", parent_code)
    v2_fam_path = os.path.join(new_repo, "models", "conversion", parent_code)
    already_migrated = os.path.isdir(v2_fam_path)

    sub_reports = []
    samples = []
    
    if os.path.isdir(old_fam_path):
        for f in os.listdir(old_fam_path):
            p = os.path.join(old_fam_path, f)
            if f.endswith(".py") and not f.startswith("__"):
                code = f.replace(".py", "")
                db_info = get_conversion_db_info(code, engine) if engine else None
                v2_py = os.path.join(v2_fam_path, f)
                sub_reports.append({
                    "code": code,
                    "v1_file": p,
                    "has_v2": os.path.isfile(v2_py),
                    "db_info": db_info
                })
            elif f.lower().endswith((".xlsx", ".xls", ".pdf", ".csv")):
                samples.append(p)

    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local_att = os.path.join(root_dir, "attachtments")
    extra_samples = detect_available_samples(parent_code, old_fam_path, local_att)

    return {
        "parent_code": parent_code,
        "already_migrated": already_migrated,
        "sub_reports": sub_reports,
        "samples": list(set(samples + extra_samples)),
    }

@router.get("/report-code/{code}")
def get_report_code(code: str, parent_code: str):
    cfg = get_current_config()
    old_repo = cfg["old_repo"]
    new_repo = cfg["new_repo"]

    v1_file = os.path.join(old_repo, "models", "conversion", parent_code, f"{code}.py")
    v2_file = os.path.join(new_repo, "models", "conversion", parent_code, f"{code}.py")

    v1_code = ""
    if os.path.isfile(v1_file):
        with open(v1_file, "r", encoding="utf-8", errors="ignore") as f:
            v1_code = f.read()

    v2_code = ""
    if os.path.isfile(v2_file):
        with open(v2_file, "r", encoding="utf-8", errors="ignore") as f:
            v2_code = f.read()

    refactored_code = ""
    if v1_code:
        refactored_code = refactor_conversion_code(v1_code, code)

    return {
        "code": code,
        "parent_code": parent_code,
        "v1_code": v1_code,
        "v2_code": v2_code,
        "refactored_code": refactored_code
    }

@router.post("/save-code")
def save_robot_code(req: SaveRobotCodeRequest):
    cfg = get_current_config()
    new_repo = cfg["new_repo"]
    fam_dir = os.path.join(new_repo, "models", "conversion", req.parent_code)
    os.makedirs(fam_dir, exist_ok=True)
    target_py = os.path.join(fam_dir, f"{req.report_code}.py")
    with open(target_py, "w", encoding="utf-8") as f:
        f.write(req.code_content)
    return {"success": True, "message": f"Código guardado en {target_py}", "path": target_py}

# ─── GITHUB PR INTEGRATION ────────────────────────────────────
@router.get("/github/prs")
def get_github_prs(search_query: str = ""):
    cfg = get_current_config()
    token = cfg["github_token"]
    repo = cfg["github_repo"]
    if not token:
        raise HTTPException(status_code=400, detail="GitHub Token (PAT) no configurado en .env")
    prs = list_pull_requests(token, repo, state="open", search_query=search_query)
    return {"prs": prs, "total": len(prs), "repo": repo}

@router.get("/github/pr-files/{pr_number}")
def get_pr_files_list(pr_number: int):
    cfg = get_current_config()
    token = cfg["github_token"]
    repo = cfg["github_repo"]
    files = get_pr_files(token, repo, pr_number)
    return {"files": files, "total": len(files)}

@router.post("/github/download-file")
async def download_file_from_github(req: DownloadGithubFileRequest):
    cfg = get_current_config()
    token = cfg["github_token"]
    content_bytes = download_github_file(token, req.raw_url, req.contents_url)
    if not content_bytes:
        raise HTTPException(status_code=400, detail="No se pudo descargar el archivo de GitHub")

    if req.is_sample:
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        att_dir = os.path.join(root_dir, "attachtments")
        os.makedirs(att_dir, exist_ok=True)
        fname = os.path.basename(req.filename)
        out_path = os.path.join(att_dir, fname)
        with open(out_path, "wb") as f:
            f.write(content_bytes)
        return {"success": True, "type": "sample", "path": out_path, "filename": fname}
    else:
        text_content = content_bytes.decode("utf-8", errors="ignore")
        return {"success": True, "type": "code", "content": text_content, "filename": req.filename}

@router.post("/upload-sample")
async def upload_sample(file: UploadFile = File(...)):
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    att_dir = os.path.join(root_dir, "attachtments")
    os.makedirs(att_dir, exist_ok=True)
    target_path = os.path.join(att_dir, file.filename)
    with open(target_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"success": True, "path": target_path, "filename": file.filename}


class ValidateConversionCodeRequest(BaseModel):
    code: str
    robot_code: str
    sample_path: Optional[str] = ""

@router.post("/validate-code")
async def validate_code(req: ValidateConversionCodeRequest):
    await log_manager.broadcast(f"Validando estructura y estándares DATAX para {req.robot_code}...", "info", "conversion")
    res = test_conversion_robot_code(
        code_str=req.code,
        robot_code=req.robot_code,
        sample_file_path=req.sample_path or "",
        key_words="",
        page_number=1
    )
    msg = f"[VALIDACIÓN OK] Robot {req.robot_code} conforme con los estándares DATAX." if res.get("success") else f"[VALIDACIÓN FALLÓ] Etapa {res.get('stage')}: {res.get('error')}"
    lvl = "info" if res.get("success") else "error"
    await log_manager.broadcast(msg, lvl, "conversion")
    return res

@router.post("/run-test")
async def run_test(req: RunConversionTestRequest):
    cfg = get_current_config()
    test_type_str = "Extracción Pura (Sin text_match)" if req.skip_text_match else "Con Reemplazos (text_match activo)"
    await log_manager.broadcast(f"Ejecutando test de {test_type_str} para {req.code}...", "info", "conversion")
    
    try:
        res = run_conversion_step_test(
            report_code=req.code,
            sample_file_path=req.sample_file,
            new_repo_path=cfg["new_repo"],
            skip_text_match=bool(req.skip_text_match)
        )
    except Exception as e:
        err_msg = f"Error ejecutando test de conversión: {str(e)}"
        await log_manager.broadcast(err_msg, "error", "conversion")
        return {
            "success": False,
            "stdout": "",
            "stderr": err_msg,
            "sqlite_created": False,
            "diagnostics": [err_msg]
        }

    if res.get("stdout"):
        for line in res["stdout"].splitlines():
            if line.strip():
                await log_manager.broadcast(line, "info", "conversion")
    if res.get("stderr"):
        for line in res["stderr"].splitlines():
            if line.strip():
                lvl = "error" if "FAIL" in line or "ERROR" in line or "Traceback" in line else "info"
                await log_manager.broadcast(line, lvl, "conversion")

    for d in res.get("diagnostics", []):
        await log_manager.broadcast(f"[DIAGNÓSTICO] {d}", "warning", "conversion")

    return res

@router.get("/sqlite-data/{code}")
def get_sqlite(code: str, limit: int = 100):
    cfg = get_current_config()
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_dir = os.path.join(root_dir, "output")
    
    candidates = [
        os.path.join(output_dir, f"{code}.sqlite"),
    ]
    parent_cand = code.rsplit("_", 1)[0].replace("D_", "C_")
    candidates.append(os.path.join(cfg["new_repo"], "models", "conversion", parent_cand, f"{code}.sqlite"))
    
    conv_dir = os.path.join(cfg["new_repo"], "models", "conversion")
    if os.path.isdir(conv_dir):
        for root, dirs, files in os.walk(conv_dir):
            if f"{code}.sqlite" in files:
                candidates.append(os.path.join(root, f"{code}.sqlite"))
                break

    sqlite_file = None
    for cand in candidates:
        if os.path.isfile(cand):
            sqlite_file = cand
            break

    if not sqlite_file:
        raise HTTPException(status_code=404, detail=f"Archivo SQLite no encontrado para {code}")

    try:
        conn = sqlite3.connect(sqlite_file)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [t[0] for t in cur.fetchall()]
        
        target_table = None
        if code in tables:
            target_table = code
        elif "data_melted" in tables:
            target_table = "data_melted"
        else:
            non_review = [t for t in tables if t != "columns_to_review"]
            if non_review:
                target_table = non_review[0]
            elif tables:
                target_table = tables[0]

        if not target_table:
            conn.close()
            return {"columns": [], "data": [], "total": 0, "path": sqlite_file, "table": ""}

        cur.execute(f"SELECT COUNT(*) FROM [{target_table}];")
        total_count = cur.fetchone()[0]

        query = f"SELECT * FROM [{target_table}] LIMIT {limit};"
        df = pd.read_sql_query(query, conn)

        # Check columns_to_review
        has_review = "columns_to_review" in tables
        current_review_cols = []
        if has_review:
            try:
                cur.execute("SELECT column FROM columns_to_review;")
                current_review_cols = [r[0] for r in cur.fetchall()]
            except Exception:
                pass
        
        conn.close()

        df = df.where(pd.notnull(df), None)

        potential_hierarchy = [
            c for c in list(df.columns)
            if not (c.lower() in ("valor", "file", "fecha") or c.lower().startswith(("titulo", "id_")))
        ]

        return {
            "success": True,
            "columns": list(df.columns),
            "data": df.to_dict(orient="records"),
            "total": total_count,
            "path": sqlite_file,
            "table": target_table,
            "tables": tables,
            "has_columns_to_review": has_review and len(current_review_cols) > 0,
            "current_review_columns": current_review_cols,
            "potential_hierarchy_columns": potential_hierarchy
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo SQLite: {str(e)}")

@router.post("/replacements/query")
def query_replacements(query: ReplacementQuery):
    cfg = get_current_config()
    df, table_name, err = get_replacement_table_data(
        report_code=query.report_code,
        db_host=cfg["db_host"],
        db_port=cfg["db_port"],
        db_user=cfg["db_user"],
        db_pass=cfg["db_pass"],
        limit=query.limit
    )
    if err:
        return {"success": False, "error": err, "table_name": table_name, "rows": []}
        
    if df is not None and not df.empty:
        if query.search:
            s = query.search.lower()
            mask = df.astype(str).apply(lambda row: row.str.lower().str.contains(s).any(), axis=1)
            df = df[mask]
        rows = df.to_dict(orient="records")
        columns = list(df.columns)
    else:
        rows = []
        columns = []

    return {
        "success": True,
        "table_name": table_name,
        "columns": columns,
        "rows": rows,
        "total": len(rows)
    }

@router.post("/replacements/insert")
def insert_replacement(req: ReplacementInsert):
    cfg = get_current_config()
    srch = req.srch_value or normalize_srch_value(req.original_value)
    ok, err = insert_single_replacement_record(
        report_code=req.report_code,
        original_value=req.original_value,
        srch_value=srch,
        final_value=req.final_value,
        db_host=cfg["db_host"],
        db_port=cfg["db_port"],
        db_user=cfg["db_user"],
        db_pass=cfg["db_pass"]
    )
    return {"success": ok, "error": err}

@router.post("/replacements/update")
def update_replacements(req: ReplacementUpdate):
    cfg = get_current_config()
    orig_df = pd.DataFrame(req.original_data)
    edited_df = pd.DataFrame(req.edited_data)
    res = save_replacement_table_changes(
        report_code=req.report_code,
        original_df=orig_df,
        edited_df=edited_df,
        db_host=cfg["db_host"],
        db_port=cfg["db_port"],
        db_user=cfg["db_user"],
        db_pass=cfg["db_pass"]
    )
    return res

@router.post("/replacements/delete")
def delete_replacement(req: ReplacementDelete):
    cfg = get_current_config()
    ok, err = delete_single_replacement_record(
        report_code=req.report_code,
        record_id=req.record_id,
        db_host=cfg["db_host"],
        db_port=cfg["db_port"],
        db_user=cfg["db_user"],
        db_pass=cfg["db_pass"]
    )
    return {"success": ok, "error": err}

@router.post("/setup-columns")
def setup_columns(req: SetupColumnsRequest):
    cfg = get_current_config()
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_dir = os.path.join(root_dir, "output")
    
    code = req.report_code
    parent_cand = req.parent_code or code.rsplit("_", 1)[0].replace("D_", "C_")
    
    candidates = [
        os.path.join(output_dir, f"{code}.sqlite"),
        os.path.join(cfg["new_repo"], "models", "conversion", parent_cand, f"{code}.sqlite")
    ]
    
    conv_dir = os.path.join(cfg["new_repo"], "models", "conversion")
    if os.path.isdir(conv_dir):
        for root, dirs, files in os.walk(conv_dir):
            if f"{code}.sqlite" in files:
                candidates.append(os.path.join(root, f"{code}.sqlite"))
                break

    sqlite_file = None
    for cand in candidates:
        if os.path.isfile(cand):
            sqlite_file = cand
            break

    if not sqlite_file:
        raise HTTPException(status_code=404, detail=f"Archivo SQLite no encontrado para {code}. Ejecuta primero el Paso 2.")

    if req.custom_columns is not None:
        try:
            conn = sqlite3.connect(sqlite_file)
            cur = conn.cursor()
            cur.execute("DROP TABLE IF EXISTS columns_to_review;")
            cur.execute("CREATE TABLE columns_to_review (column TEXT);")
            cur.executemany("INSERT INTO columns_to_review (column) VALUES (?);", [(c,) for c in req.custom_columns])
            conn.commit()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [t[0] for t in cur.fetchall()]
            conn.close()
            return {
                "success": True,
                "review_columns": req.custom_columns,
                "tables": tables,
                "path": sqlite_file,
                "error": None
            }
        except Exception as e:
            return {"success": False, "review_columns": [], "tables": [], "path": sqlite_file, "error": str(e)}
    else:
        ok, review_cols, tables, err = setup_columns_to_review(sqlite_file, code)
        return {
            "success": ok,
            "review_columns": review_cols,
            "tables": tables,
            "path": sqlite_file,
            "error": err
        }

@router.post("/deploy")
async def deploy_conversion(req: DeployConversionRequest):
    cfg = get_current_config()
    host = req.host or cfg["ssh_host"]
    port = req.port or cfg["ssh_port"]
    user = req.username or cfg["ssh_user"]
    pwd = req.password or cfg["ssh_pass"]

    local_path = os.path.join(cfg["new_repo"], "models", "conversion", req.parent_code)
    if not os.path.isdir(local_path):
        raise HTTPException(status_code=400, detail=f"Familia {req.parent_code} no encontrada en V2")

    await log_manager.broadcast(f"Desplegando familia {req.parent_code} al servidor {host}...", "info", "deploy")

    try:
        res = deploy_robot_to_server(
            host=host,
            port=port,
            username=user,
            password=pwd,
            remote_base_path="/home/datax-pds/datax/data-processing-platform-dev",
            process_type="conversion",
            robot_code=req.parent_code,
            local_robot_path=local_path,
            generate_dag=req.generate_dag_server
        )
    except Exception as e:
        err_msg = f"Error en despliegue SSH/SFTP: {str(e)}"
        await log_manager.broadcast(err_msg, "error", "deploy")
        return {"success": False, "logs": [err_msg], "error": err_msg}

    for l in res.get("logs", []):
        await log_manager.broadcast(l, "info" if res.get("success") else "error", "deploy")
    return res


class TriggerConversionDagRequest(BaseModel):
    dag_id: str
    code: str
    id_download: int
    file_path: str
    host: Optional[str] = None
    port: Optional[int] = 22
    username: Optional[str] = None
    password: Optional[str] = None

@router.get("/latest-download/{code}")
def get_latest_download(code: str):
    engine = get_engine()
    dl = get_latest_download_for_report(code, engine) if engine else None
    if not dl:
        parts = code.split("_")
        c_tag = parts[1] if len(parts) > 1 else "BO"
        parent = code.rsplit("_", 1)[0].replace("C_", "D_")
        return {
            "found": False,
            "id_download": 1,
            "file": f"\\\\10.0.0.16\\downloaded_files\\{c_tag}\\{parent}\\2026",
            "downloaded_to": ""
        }
    return {"found": True, **dl}

@router.post("/trigger-dag")
async def trigger_conversion_dag(req: TriggerConversionDagRequest):
    cfg = get_current_config()
    host = req.host or cfg["ssh_host"]
    port = req.port or cfg["ssh_port"]
    user = req.username or cfg["ssh_user"]
    pwd = req.password or cfg["ssh_pass"]

    if not pwd:
        raise HTTPException(status_code=400, detail="Contraseña SSH requerida para disparar el DAG")

    conf = {
        "code": req.code,
        "id_download": int(req.id_download),
        "file": req.file_path
    }
    await log_manager.broadcast(f"Disparando DAG {req.dag_id} en Airflow worker...", "info", "deploy")
    res = trigger_dag_on_server(
        host=host,
        port=port,
        username=user,
        password=pwd,
        remote_base_path="/home/datax-pds/datax/data-processing-platform-dev",
        dag_id=req.dag_id,
        conf=conf
    )
    for l in res.get("logs", []):
        await log_manager.broadcast(l, "info" if res["success"] else "error", "deploy")
    return res
