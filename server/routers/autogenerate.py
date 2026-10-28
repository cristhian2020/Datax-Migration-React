import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from server.dependencies import get_current_config
from server.utils.logger_stream import log_manager
from core.taiga_client import TaigaClient
from core.agent_generator import (
    AgentGenerator,
    inspect_sample_file,
    load_datax_rules,
    load_doc,
    load_example,
)
from core.agent_tester import test_conversion_robot_code, validate_download_robot_structure

router = APIRouter(prefix="/api/autogenerate", tags=["AutoGenerate AI"])

class FetchAttachmentRequest(BaseModel):
    task_id: int
    attachment_id: int
    filename: str

class DownloadAttachmentRequest(BaseModel):
    attachment_url: str
    filename: str

class GenerateRobotRequest(BaseModel):
    report_code: str
    robot_type: str  # conversion / download
    sample_path: str
    instructions: Optional[str] = ""

class TestRobotRequest(BaseModel):
    report_code: str
    robot_code: str
    sample_path: str
    robot_type: str = "conversion"

@router.get("/taiga-tasks")
def get_taiga_tasks():
    cfg = get_current_config()
    try:
        client = TaigaClient(
            cfg.get("taiga_host") or "https://investigaciontaiga.datax.com.bo",
            cfg.get("taiga_user") or "",
            cfg.get("taiga_pass") or "",
            cfg.get("taiga_project_slug") or "procesamiento-de-archivos-2"
        )
        ok, msg = client.authenticate()
        if not ok:
            raise HTTPException(status_code=401, detail=f"Error autenticando en Taiga: {msg}")

        stories = client.get_user_stories()
        formatted_tasks = []
        for s in stories:
            meta = client.parse_story_metadata(s)
            formatted_tasks.append({
                "id": s.get("id"),
                "ref": s.get("ref"),
                "subject": s.get("subject"),
                "status": meta.get("status") or (s.get("status_extra_info") or {}).get("name", "Unknown"),
                "status_color": (s.get("status_extra_info") or {}).get("color", "#024ad8"),
                "assigned_to": meta.get("assigned_to"),
                "task_type": meta.get("task_type", "conversion"),
                "robot_code": meta.get("robot_code"),
                "report_name": meta.get("report_name"),
                "main_url": meta.get("main_url"),
                "download_type": meta.get("download_type", "Tipo I"),
                "page_number": meta.get("page_number", 1),
                "decimal_separator": meta.get("decimal_separator", ","),
                "key_words": meta.get("key_words", ""),
                "periodicity": meta.get("periodicity", "Diario"),
                "updated_to": meta.get("updated_to", "2024-01-01"),
                "raw_description": meta.get("raw_description", "")
            })

        return {"tasks": formatted_tasks, "total": len(formatted_tasks)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando Taiga: {str(e)}")

@router.get("/story/{story_ref}")
def get_story_detail(story_ref: int):
    cfg = get_current_config()
    try:
        client = TaigaClient(
            cfg.get("taiga_host") or "https://investigaciontaiga.datax.com.bo",
            cfg.get("taiga_user") or "",
            cfg.get("taiga_pass") or "",
            cfg.get("taiga_project_slug") or "procesamiento-de-archivos-2"
        )
        client.authenticate()
        ok, msg, detail = client.get_story_detail(story_ref)
        if not ok:
            raise HTTPException(status_code=404, detail=msg)
        return {
            "detail": detail,
            "attachments": detail.get("all_attachments", []),
            "custom_attributes": detail.get("custom_attributes", {}),
            "convert_image": detail.get("convert_image", "")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo detalle de historia: {str(e)}")

@router.post("/download-attachment")
def download_attachment(req: DownloadAttachmentRequest):
    cfg = get_current_config()
    try:
        client = TaigaClient(
            cfg.get("taiga_host") or "https://investigaciontaiga.datax.com.bo",
            cfg.get("taiga_user") or "",
            cfg.get("taiga_pass") or "",
            cfg.get("taiga_project_slug") or "procesamiento-de-archivos-2"
        )
        client.authenticate()
        
        target_dir = os.path.join(cfg.get("new_repo") or ".", "attachtments")
        os.makedirs(target_dir, exist_ok=True)
        dest_path = os.path.join(target_dir, req.filename)
        
        ok, msg = client.download_attachment(req.attachment_url, dest_path)
        if not ok:
            raise HTTPException(status_code=500, detail=msg)
        return {"success": True, "path": dest_path, "filename": req.filename, "message": msg}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error descargando adjunto: {str(e)}")

@router.post("/inspect-sample")
def inspect_sample(sample_path: str):
    if not os.path.isfile(sample_path):
        raise HTTPException(status_code=404, detail="Archivo de muestra no encontrado")
    info = inspect_sample_file(sample_path)
    return {"info": info}

@router.post("/generate-robot")
async def generate_robot(req: GenerateRobotRequest):
    try:
        cfg = get_current_config()
        api_key = cfg.get("gemini_api_key") or ""
        if not api_key:
            raise HTTPException(status_code=400, detail="GEMINI_API_KEY no configurada. Por favor define GEMINI_API_KEY en tu archivo .env.")

        # Resolver sample_path y descartar imágenes (.png/.jpg) en favor de datos (.xlsx/.xls/.pdf)
        sample = req.sample_path
        if sample and not os.path.isfile(sample):
            candidates = [
                os.path.join(cfg.get("new_repo", "."), "attachtments", os.path.basename(sample)),
                os.path.join(".", "attachtments", os.path.basename(sample)),
                os.path.join(cfg.get("new_repo", "."), "models", "conversion", req.report_code.split("_")[0] if "_" in req.report_code else "", os.path.basename(sample))
            ]
            for c in candidates:
                if os.path.isfile(c):
                    sample = c
                    break

        # Si el usuario seleccionó una imagen (.png, .jpg) o está vacío, buscar automáticamente el Excel/PDF del reporte
        sample_ext = os.path.splitext(sample)[1].lower() if sample else ""
        if sample_ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", "") or not os.path.isfile(sample):
            clean_num = "".join(filter(str.isdigit, req.report_code))
            search_dirs = [
                os.path.join(cfg.get("new_repo", "."), "attachtments"),
                os.path.join(".", "attachtments"),
                os.path.join(cfg.get("new_repo", "."), "models", "conversion", f"C_BO_{clean_num[:9]}" if len(clean_num) >= 9 else "")
            ]
            for s_dir in search_dirs:
                if os.path.isdir(s_dir):
                    for fname in os.listdir(s_dir):
                        f_ext = os.path.splitext(fname)[1].lower()
                        if f_ext in (".xlsx", ".xls", ".pdf") and (clean_num in fname or req.report_code in fname):
                            sample = os.path.join(s_dir, fname)
                            break
                if sample and os.path.isfile(sample) and os.path.splitext(sample)[1].lower() in (".xlsx", ".xls", ".pdf"):
                    break

        await log_manager.broadcast(f"Generando robot {req.report_code} con IA...", "info", "autogenerate")
        generator = AgentGenerator(api_key=api_key)
        
        code, summary = generator.generate_robot_code(
            report_code=req.report_code,
            robot_type=req.robot_type,
            sample_path=sample,
            extra_instructions=req.instructions
        )
        
        await log_manager.broadcast("¡Código generado con éxito!", "info", "autogenerate")
        return {
            "report_code": req.report_code,
            "robot_code": code,
            "summary": summary
        }
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Falla al generar robot: {str(exc)}")

@router.post("/test-robot")
async def test_robot(req: TestRobotRequest):
    await log_manager.broadcast(f"Validando robot {req.report_code}...", "info", "autogenerate")
    if req.robot_type == "conversion":
        res = test_conversion_robot_code(req.report_code, req.robot_code, req.sample_path)
    else:
        res = validate_download_robot_structure(req.report_code, req.robot_code)
        
    for l in res.get("logs", []):
        lvl = "error" if "FAIL" in l or "ERROR" in l else "info"
        await log_manager.broadcast(l, lvl, "autogenerate")
        
    return res

@router.get("/docs")
def get_docs():
    rules = load_datax_rules()
    return {
        "rules": rules
    }
