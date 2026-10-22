import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from server.dependencies import get_current_config, get_engine
from server.utils.logger_stream import log_manager
from core.agent_analyzer import run_agent_sqlite_analysis
from core.migrator_migration import (
    get_latest_conversion_for_report,
    scan_conversion_outputs,
    scan_existing_migration_robots,
    load_migration_robot_files,
    get_migration_db_info,
    inspect_sqlite_structure,
    generate_migration_sql,
    generate_migration_py,
    save_migration_files,
    generate_migration_preview_data,
)
from core.deployer import deploy_robot_to_server, trigger_dag_on_server

router = APIRouter(prefix="/api/migration", tags=["Robots de Migración"])

class AnalyzeSqliteRequest(BaseModel):
    sqlite_file: str
    report_code: Optional[str] = ""

class PreviewMigrationRequest(BaseModel):
    sqlite_file: str
    report_code: Optional[str] = ""
    metric: str = "moneda"
    unit: str = "BOB"
    factor: float = 1.0
    is_mixed: bool = False
    custom_metric_code: Optional[str] = ""
    custom_unit_code: Optional[str] = ""
    limit: int = 50

class GenerateMigrationRequest(BaseModel):
    parent_code: str
    report_code: str
    sqlite_file: str
    report_name: Optional[str] = ""
    metric: str = "precio"
    unit: str = "BOB"
    factor: float = 1.0
    has_mixed_rows: bool = False
    custom_metric_code: Optional[str] = ""
    custom_unit_code: Optional[str] = ""

class SaveMigrationRequest(BaseModel):
    parent_code: str
    report_code: str
    sql_content: str
    py_content: str

class DeployMigrationRequest(BaseModel):
    parent_code: str
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None

@router.get("/outputs")
def get_migration_outputs():
    cfg = get_current_config()
    outputs = scan_conversion_outputs(cfg["new_repo"])
    existing = scan_existing_migration_robots(cfg["new_repo"])
    return {
        "outputs": outputs,
        "existing_migration_robots": existing
    }

@router.get("/inspect")
def inspect_sqlite(sqlite_file: str, report_code: str, use_heuristic: bool = False):
    if not os.path.isfile(sqlite_file):
        raise HTTPException(status_code=404, detail="Archivo SQLite no existe")
    engine = get_engine()
    db_info = get_migration_db_info(report_code, engine) if engine else None
    report_name = db_info.get("name", "") if db_info else ""
    struct = inspect_sqlite_structure(sqlite_file, report_code, extra_text=report_name, run_heuristic=use_heuristic)
    
    # Clean DataFrame to records for JSON serialization
    sample_rows = []
    sample_cols = []
    if "sample_df" in struct and struct["sample_df"] is not None:
        df = struct["sample_df"]
        sample_cols = list(df.columns)
        sample_rows = df.head(30).to_dict(orient="records")
        del struct["sample_df"]

    preview = generate_migration_preview_data(
        sqlite_path=sqlite_file,
        table_name=report_code,
        metric=struct.get("suggested_metric", "moneda"),
        unit=struct.get("suggested_unit", "BOB"),
        factor=struct.get("suggested_factor", 1.0),
        is_mixed=struct.get("has_mixed_rows", False) or struct.get("has_multi_currency", False) or struct.get("has_multiple_facts", False),
        limit=50
    )

    return {
        "report_code": report_code,
        "db_info": db_info,
        "structure": struct,
        "sample_columns": sample_cols,
        "sample_rows": sample_rows,
        "preview": preview
    }

@router.post("/analyze-sqlite")
async def analyze_sqlite(req: AnalyzeSqliteRequest):
    if not os.path.isfile(req.sqlite_file):
        raise HTTPException(status_code=404, detail="Archivo SQLite no encontrado")

    cfg = get_current_config()
    api_key = cfg.get("gemini_api_key", "")
    
    await log_manager.broadcast("Ejecutando Agente Analizador Inteligente de SQLite...", "info", "migration")
    agent_res = run_agent_sqlite_analysis(req.sqlite_file, api_key=api_key)
    await log_manager.broadcast(f"Análisis completado ({agent_res.get('source', 'Heurístico')})", "info", "migration")

        # Generar vista previa con la clasificación del agente
    try:
        preview = generate_migration_preview_data(
            sqlite_path=req.sqlite_file,
            table_name=req.report_code or "",
            metric=agent_res.get("base_metric", "moneda"),
            unit=agent_res.get("base_unit", "BOB"),
            factor=agent_res.get("conversion_factor", 1.0),
            is_mixed=agent_res.get("is_mixed", False),
            custom_metric_code=agent_res.get("get_metric_code", ""),
            custom_unit_code=agent_res.get("get_unit_code", ""),
            limit=50
        )
        agent_res["preview"] = preview
    except Exception as e:
        agent_res["preview"] = {"columns": [], "rows": [], "total_rows": 0, "error": str(e)}

    return agent_res

@router.post("/preview-table")
def preview_migration_table(req: PreviewMigrationRequest):
    if not os.path.isfile(req.sqlite_file):
        raise HTTPException(status_code=404, detail="Archivo SQLite no encontrado")
    return generate_migration_preview_data(
        sqlite_path=req.sqlite_file,
        table_name=req.report_code or "",
        metric=req.metric,
        unit=req.unit,
        factor=req.factor,
        is_mixed=req.is_mixed,
        custom_metric_code=req.custom_metric_code or "",
        custom_unit_code=req.custom_unit_code or "",
        limit=req.limit
    )

@router.post("/generate")
def generate_migration_code(req: GenerateMigrationRequest):
    if not os.path.isfile(req.sqlite_file):
        raise HTTPException(status_code=404, detail="Archivo SQLite no encontrado")

    struct = inspect_sqlite_structure(req.sqlite_file, req.report_code)
    columns = struct.get("all_columns", [])
    
    sql = generate_migration_sql(columns)
    py = generate_migration_py(
        report_code=req.report_code,
        report_name=req.report_name or "Estandarizacion y carga a PostgreSQL",
        columns=columns,
        metric=req.metric,
        unit=req.unit,
        factor=req.factor,
        has_mixed_rows=req.has_mixed_rows,
        custom_metric_code=req.custom_metric_code or "",
        custom_unit_code=req.custom_unit_code or ""
    )

    return {
        "sql_code": sql,
        "py_code": py,
        "columns": columns
    }

@router.post("/save")
def save_migration(req: SaveMigrationRequest):
    cfg = get_current_config()
    res = save_migration_files(
        repo_path=cfg["new_repo"],
        parent_code=req.parent_code,
        report_code=req.report_code,
        sql_content=req.sql_content,
        py_content=req.py_content
    )
    return res

@router.post("/deploy")
async def deploy_migration(req: DeployMigrationRequest):
    cfg = get_current_config()
    host = req.host or cfg["ssh_host"]
    port = req.port or cfg["ssh_port"]
    user = req.username or cfg["ssh_user"]
    pwd = req.password or cfg["ssh_pass"]

    local_path = os.path.join(cfg["new_repo"], "models", "migration", req.parent_code)
    if not os.path.isdir(local_path):
        raise HTTPException(status_code=400, detail="Robot de migración no encontrado en V2")

    await log_manager.broadcast(f"Desplegando migración {req.parent_code}...", "info", "deploy")
    res = deploy_robot_to_server(
        host=host,
        port=port,
        username=user,
        password=pwd,
        remote_base_path="/home/datax-pds/datax/data-processing-platform-dev",
        process_type="migration",
        robot_code=req.parent_code,
        local_robot_path=local_path,
        generate_dag=True
    )
    for l in res.get("logs", []):
        await log_manager.broadcast(l, "info" if res["success"] else "error", "deploy")
    return res


class TriggerMigrationDagRequest(BaseModel):
    dag_id: str
    code: str
    id_conversion: int
    conversion_path: str
    host: Optional[str] = None
    port: Optional[int] = 22
    username: Optional[str] = None
    password: Optional[str] = None

@router.get("/latest-conversion/{code}")
def get_latest_conversion(code: str):
    engine = get_engine()
    conv = get_latest_conversion_for_report(code, engine) if engine else None
    if not conv:
        parts = code.split("_")
        c_tag = parts[1] if len(parts) > 1 else "BO"
        parent = code.rsplit("_", 1)[0].replace("M_", "D_").replace("C_", "D_")
        return {
            "found": False,
            "id_conversion": 1,
            "conversion_path": f"/mnt/datos1/data_process/{c_tag}/{parent}/2026.sqlite",
            "converted_to": ""
        }
    return {"found": True, **conv}

@router.post("/trigger-dag")
async def trigger_migration_dag(req: TriggerMigrationDagRequest):
    cfg = get_current_config()
    host = req.host or cfg["ssh_host"]
    port = req.port or cfg["ssh_port"]
    user = req.username or cfg["ssh_user"]
    pwd = req.password or cfg["ssh_pass"]

    if not pwd:
        raise HTTPException(status_code=400, detail="Contraseña SSH requerida para disparar el DAG")

    conf = {
        "code": req.code,
        "id_conversion": int(req.id_conversion),
        "conversion_path": req.conversion_path
    }
    await log_manager.broadcast(f"Disparando DAG de migración {req.dag_id} en Airflow worker...", "info", "deploy")
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
