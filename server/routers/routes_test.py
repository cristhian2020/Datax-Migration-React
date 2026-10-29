"""
Endpoints de Testing Asíncrono con Streaming de Logs en Tiempo Real (SSE)
DataX Platform - FastAPI Router
"""

import json
import asyncio
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from server.utils.job_manager import job_manager, JobStatus

router = APIRouter(prefix="/api/test", tags=["Testing Asíncrono & SSE"])


class RunTestRequest(BaseModel):
    robot_code: str = Field(..., description="Código oficial del reporte (ej. D_BO_000000055_01)")
    test_type: str = Field("conversion", description="Tipo de robot: 'conversion' o 'download'")
    sample_file: Optional[str] = Field(None, description="Ruta absoluta o relativa del archivo de muestra (Excel/PDF)")
    skip_text_match: Optional[bool] = Field(False, description="Si es True, omite el cruce con tabla de reemplazos")
    download_type: Optional[str] = Field("Tipo I", description="Categoría de descarga: Tipo I, II, III o IV")
    updated_to: Optional[str] = Field("2024-01-01", description="Fecha de corte referencial (YYYY-MM-DD)")
    timeout_seconds: Optional[float] = Field(300.0, description="Tiempo límite en segundos antes de forzar terminación (por defecto 300s)")
    extra_env: Optional[Dict[str, str]] = Field(default_factory=dict, description="Variables de entorno adicionales")


class JobCancelResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    message: str


@router.post("/run", status_code=status.HTTP_202_ACCEPTED)
async def run_test_async(req: RunTestRequest):
    """
    Inicia la ejecución asíncrona de pruebas unitarias en segundo plano.
    Responde de inmediato con HTTP 202 Accepted y el ID del trabajo para suscripción SSE.
    """
    code = req.robot_code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="El campo 'robot_code' es obligatorio.")

    test_type = req.test_type.strip().lower()
    if test_type not in ("conversion", "download"):
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de prueba inválido: '{req.test_type}'. Debe ser 'conversion' o 'download'."
        )

    # Validar timeout
    timeout = max(30.0, min(float(req.timeout_seconds or 300.0), 900.0))  # Entre 30s y 15m

    # Empaquetar metadatos para la ejecución
    metadata = {
        "sample_file": req.sample_file,
        "skip_text_match": bool(req.skip_text_match),
        "download_type": req.download_type,
        "updated_to": req.updated_to,
        "extra_env": req.extra_env or {}
    }

    # Crear y registrar el trabajo en memoria
    job = await job_manager.create_job(
        robot_code=code,
        test_type=test_type,
        timeout_seconds=timeout,
        metadata=metadata
    )

    # Lanzar la tarea de ejecución no bloqueante
    await job_manager.start_job(job.job_id)

    return {
        "job_id": job.job_id,
        "robot_code": job.robot_code,
        "test_type": job.test_type,
        "status": job.status.value,
        "timeout_seconds": job.timeout_seconds,
        "message": f"Prueba unitaria para {job.robot_code} iniciada en segundo plano.",
        "stream_url": f"/api/test/jobs/{job.job_id}/stream",
        "status_url": f"/api/test/jobs/{job.job_id}/status"
    }


@router.get("/jobs/{job_id}/stream")
async def stream_job_logs(job_id: str, request: Request):
    """
    Canal de Server-Sent Events (SSE) para streaming en vivo de logs y estado del subproceso.
    1. Replay del buffer acumulado (para conexiones que llegan tras el arranque).
    2. Envío en tiempo real de cada línea producida por stdout/stderr.
    3. Pings periódicos cada 15 segundos para evitar desconexiones de proxies.
    4. Cierre automático al completar la prueba.
    """
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Trabajo con ID '{job_id}' no encontrado.")

    async def sse_event_generator():
        # 1. Enviar estado inicial
        init_event = {
            "type": "status",
            "data": job.to_dict(),
            "timestamp": job.started_at.timestamp() if job.started_at else None
        }
        yield f"data: {json.dumps(init_event)}\n\n"

        # 2. Replay del historial ya acumulado en buffer
        for log_line in list(job.log_buffer):
            replay_payload = {
                "type": "log",
                "data": log_line,
                "historical": True
            }
            yield f"data: {json.dumps(replay_payload)}\n\n"

        # Si el trabajo ya había terminado antes de conectarse
        if job.status in (JobStatus.SUCCESS, JobStatus.FAILED, JobStatus.TIMEOUT, JobStatus.CANCELLED):
            final_status = {
                "type": "status",
                "data": job.to_dict()
            }
            yield f"data: {json.dumps(final_status)}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        # 3. Suscribirse a la cola de eventos en vivo
        queue = await job.add_subscriber()
        try:
            while True:
                # Detectar desconexión del cliente HTTP
                if await request.is_disconnected():
                    break

                try:
                    # Esperar siguiente evento con timeout de 15s para heartbeat
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    
                    yield f"data: {json.dumps(event)}\n\n"

                    # Fin de transmisión
                    if event.get("type") == "done":
                        break

                except asyncio.TimeoutError:
                    # Heartbeat ping estándar SSE
                    yield ": ping\n\n"

        finally:
            await job.remove_subscriber(queue)

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Desactiva buffer en NGINX / Cloudflare
            "Content-Type": "text/event-stream; charset=utf-8"
        }
    )


@router.get("/jobs/{job_id}/status")
def get_job_status(job_id: str):
    """Consulta síncrona REST del estado actual y métricas del trabajo."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Trabajo con ID '{job_id}' no encontrado.")
    return job.to_dict()


@router.post("/jobs/{job_id}/cancel", response_model=JobCancelResponse)
async def cancel_job(job_id: str):
    """Interrumpe y cancela de inmediato el subproceso asociado al trabajo."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Trabajo con ID '{job_id}' no encontrado.")

    cancelled = await job_manager.cancel_job(job_id)
    if not cancelled:
        return JobCancelResponse(
            success=False,
            job_id=job_id,
            status=job.status.value,
            message="El trabajo ya no se encontraba en ejecución."
        )

    return JobCancelResponse(
        success=True,
        job_id=job_id,
        status=job.status.value,
        message="Subproceso cancelado y finalizado forzosamente."
    )


@router.get("/jobs")
def list_recent_jobs():
    """Lista todos los trabajos recientes en memoria."""
    return {
        "total": len(job_manager.jobs),
        "jobs": [j.to_dict() for j in job_manager.jobs.values()]
    }

