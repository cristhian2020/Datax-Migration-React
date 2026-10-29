"""
Gestor de Trabajos Asíncrono de Pruebas Unitarias (JobManager)
DataX Platform - Alto Rendimiento & Streaming de Logs en Tiempo Real (SSE)
"""

import os
import sys
import time
import uuid
import asyncio
import logging
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, field

from server.dependencies import get_current_config

logger = logging.getLogger("datax.job_manager")
logger.setLevel(logging.INFO)


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"
    CANCELLED = "CANCELLED"


@dataclass
class JobState:
    job_id: str
    robot_code: str
    test_type: str  # "conversion" | "download"
    status: JobStatus = JobStatus.QUEUED
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    exit_code: Optional[int] = None
    log_buffer: List[str] = field(default_factory=list)
    diagnostics: List[str] = field(default_factory=list)
    sqlite_created: bool = False
    sqlite_path: Optional[str] = None
    timeout_seconds: float = 300.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Manejo de procesos y colas
    process: Optional[asyncio.subprocess.Process] = None
    task: Optional[asyncio.Task] = None
    subscribers: Set[asyncio.Queue] = field(default_factory=set)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def add_subscriber(self) -> asyncio.Queue:
        """Registra un nuevo suscriptor SSE para recibir logs en vivo."""
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self.subscribers.add(queue)
        return queue

    async def remove_subscriber(self, queue: asyncio.Queue):
        """Elimina un suscriptor cuando la conexión SSE se cierra."""
        async with self._lock:
            self.subscribers.discard(queue)

    async def broadcast(self, event_data: Dict[str, Any]):
        """Envía un evento SSE a todos los suscriptores conectados."""
        async with self._lock:
            stale_queues = set()
            for q in self.subscribers:
                try:
                    q.put_nowait(event_data)
                except asyncio.QueueFull:
                    stale_queues.add(q)
                except Exception:
                    stale_queues.add(q)
            self.subscribers.difference_update(stale_queues)

    def to_dict(self) -> Dict[str, Any]:
        """Serialización para respuestas REST."""
        return {
            "job_id": self.job_id,
            "robot_code": self.robot_code,
            "test_type": self.test_type,
            "status": self.status.value,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "duration_seconds": round(self.duration_seconds, 2) if self.duration_seconds is not None else None,
            "exit_code": self.exit_code,
            "log_count": len(self.log_buffer),
            "sqlite_created": self.sqlite_created,
            "sqlite_path": self.sqlite_path,
            "diagnostics": self.diagnostics,
            "metadata": self.metadata,
        }


class JobManager:
    """
    Singleton que orquesta la ejecución asíncrona de pruebas unitarias,
    captura streams sin bloquear el event loop y distribuye eventos SSE.
    """
    _instance: Optional["JobManager"] = None
    _init_lock = asyncio.Lock()

    def __new__(cls) -> "JobManager":
        if cls._instance is None:
            cls._instance = super(JobManager, cls).__new__(cls)
            cls._instance.jobs = {}
            cls._instance._global_lock = asyncio.Lock()
        return cls._instance

    def get_job(self, job_id: str) -> Optional[JobState]:
        return self.jobs.get(job_id)

    async def create_job(
        self,
        robot_code: str,
        test_type: str,
        timeout_seconds: float = 300.0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> JobState:
        """Crea y registra un nuevo trabajo en memoria."""
        job_id = str(uuid.uuid4())
        job = JobState(
            job_id=job_id,
            robot_code=robot_code,
            test_type=test_type,
            status=JobStatus.QUEUED,
            timeout_seconds=timeout_seconds,
            metadata=metadata or {}
        )
        async with self._global_lock:
            # Limpieza periódica de trabajos viejos (> 2 horas)
            self._prune_old_jobs()
            self.jobs[job_id] = job
        return job

    def _prune_old_jobs(self, max_age_seconds: int = 7200):
        """Elimina trabajos terminados antiguos para evitar fugas de memoria."""
        now = datetime.now()
        to_delete = []
        for j_id, j in self.jobs.items():
            if j.finished_at:
                age = (now - j.finished_at).total_seconds()
                if age > max_age_seconds:
                    to_delete.append(j_id)
        for j_id in to_delete:
            del self.jobs[j_id]

    async def start_job(self, job_id: str):
        """Lanza la ejecución asíncrona en segundo plano como asyncio.Task."""
        job = self.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} no encontrado")

        job.task = asyncio.create_task(self._execute_test_runner(job))
        return job

    async def cancel_job(self, job_id: str) -> bool:
        """Cancela un trabajo en ejecución terminando el subproceso."""
        job = self.get_job(job_id)
        if not job or job.status in (JobStatus.SUCCESS, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.TIMEOUT):
            return False

        job.status = JobStatus.CANCELLED
        job.finished_at = datetime.now()
        if job.started_at:
            job.duration_seconds = (job.finished_at - job.started_at).total_seconds()

        cancel_msg = "🛑 Prueba cancelada por el usuario."
        job.log_buffer.append(cancel_msg)
        await job.broadcast({"type": "log", "data": cancel_msg, "timestamp": time.time()})
        await job.broadcast({"type": "status", "data": job.to_dict(), "timestamp": time.time()})

        # Terminar subproceso si está activo
        if job.process and job.process.returncode is None:
            try:
                job.process.terminate()
                try:
                    await asyncio.wait_for(job.process.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    job.process.kill()
                    await job.process.wait()
            except Exception as e:
                logger.warning(f"Error al matar proceso {job_id}: {e}")

        # Cancelar corrutina de fondo
        if job.task and not job.task.done():
            job.task.cancel()

        return True

    async def _execute_test_runner(self, job: JobState):
        """
        Orquesta la ejecución asíncrona no bloqueante usando asyncio.subprocess
        y streaming línea por línea.
        """
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now()

        init_msg = f"🚀 [JOB INICIADO] ID: {job.job_id} | Robot: {job.robot_code} | Tipo: {job.test_type}"
        job.log_buffer.append(init_msg)
        await job.broadcast({"type": "log", "data": init_msg, "timestamp": time.time()})
        await job.broadcast({"type": "status", "data": job.to_dict(), "timestamp": time.time()})

        cfg = get_current_config()
        new_repo = cfg.get("new_repo", "")
        if not os.path.isdir(new_repo):
            err_msg = f"❌ Directorio de repositorio V2 no existe: '{new_repo}'"
            job.status = JobStatus.FAILED
            job.finished_at = datetime.now()
            job.log_buffer.append(err_msg)
            await job.broadcast({"type": "log", "data": err_msg, "timestamp": time.time()})
            await job.broadcast({"type": "status", "data": job.to_dict(), "timestamp": time.time()})
            return

        # Configurar comando y variables de entorno según el tipo de prueba
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        
        # Inyectar PYTHONPATH para que models/ y conversion_tools se resuelvan de inmediato
        existing_pp = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{new_repo}{os.pathsep}{existing_pp}" if existing_pp else new_repo

        cmd = [sys.executable, "-u", "-m", "unittest"]

        if job.test_type == "conversion":
            test_file = os.path.join(new_repo, "models", "conversion", "tests", "test_conversion.py")
            if not os.path.isfile(test_file):
                err_msg = f"❌ Archivo de prueba de conversión no encontrado: {test_file}"
                job.status = JobStatus.FAILED
                job.finished_at = datetime.now()
                job.log_buffer.append(err_msg)
                await job.broadcast({"type": "log", "data": err_msg, "timestamp": time.time()})
                await job.broadcast({"type": "status", "data": job.to_dict(), "timestamp": time.time()})
                return

            sample_file = job.metadata.get("sample_file", "")
            skip_text_match = "1" if job.metadata.get("skip_text_match", False) else "0"

            env["REPORT_CODE"] = job.robot_code
            env["FILE_PATH"] = sample_file
            env["SKIP_TEXT_MATCH"] = skip_text_match

            cmd.append(test_file)

        else:
            # Descarga
            download_type = job.metadata.get("download_type", "Tipo I")
            test_updated_to = job.metadata.get("updated_to", "2024-01-01")

            test_filename = "test_download_type_i.py"
            if "IV" in download_type or "iv" in download_type:
                test_filename = "test_download_type_iv.py"
            elif "III" in download_type or "iii" in download_type:
                test_filename = "test_download_type_iii.py"
            elif "II" in download_type or "ii" in download_type:
                test_filename = "test_download_type_ii.py"

            test_file = os.path.join(new_repo, "models", "download", "tests", test_filename)
            env["CODE_ROBOT"] = job.robot_code
            env["UPDATED_TO"] = test_updated_to

            cmd.append(test_file)

        # Iniciar subproceso asíncrono
        try:
            start_info = f"⚙️ Lanzando subproceso: {' '.join(cmd)}"
            job.log_buffer.append(start_info)
            await job.broadcast({"type": "log", "data": start_info, "timestamp": time.time()})

            job.process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=new_repo,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Tareas asíncronas para lectura línea por línea de stdout y stderr
            async def _stream_reader(reader: asyncio.StreamReader, stream_name: str):
                while True:
                    line_bytes = await reader.readline()
                    if not line_bytes:
                        break
                    try:
                        line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")
                    except Exception:
                        line = str(line_bytes).rstrip("\r\n")

                    if line:
                        job.log_buffer.append(line)
                        await job.broadcast({
                            "type": "log",
                            "stream": stream_name,
                            "data": line,
                            "timestamp": time.time()
                        })

            stdout_task = asyncio.create_task(_stream_reader(job.process.stdout, "stdout"))
            stderr_task = asyncio.create_task(_stream_reader(job.process.stderr, "stderr"))

            # Control estricto de timeout (300 segundos)
            try:
                await asyncio.wait_for(job.process.wait(), timeout=job.timeout_seconds)
            except asyncio.TimeoutError:
                timeout_msg = f"⏳ [TIMEOUT] El subproceso superó el límite de {job.timeout_seconds} segundos. Forzando terminación..."
                job.log_buffer.append(timeout_msg)
                await job.broadcast({"type": "log", "data": timeout_msg, "timestamp": time.time()})

                job.status = JobStatus.TIMEOUT
                try:
                    job.process.terminate()
                    try:
                        await asyncio.wait_for(job.process.wait(), timeout=3.0)
                    except asyncio.TimeoutError:
                        job.process.kill()
                        await job.process.wait()
                except Exception as ex:
                    logger.warning(f"Error terminando proceso por timeout: {ex}")

            # Esperar a que terminen de vaciarse los buffers de logs
            await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)

            job.finished_at = datetime.now()
            job.duration_seconds = (job.finished_at - job.started_at).total_seconds()
            job.exit_code = job.process.returncode

            # Determinar estatus final
            if job.status != JobStatus.TIMEOUT and job.status != JobStatus.CANCELLED:
                if job.exit_code == 0:
                    job.status = JobStatus.SUCCESS
                    end_msg = f"✅ [PRUEBA EXITOSA] Código de retorno: 0 (Duración: {job.duration_seconds:.2f}s)"
                else:
                    job.status = JobStatus.FAILED
                    end_msg = f"❌ [PRUEBA FALLIDA] Código de retorno: {job.exit_code} (Duración: {job.duration_seconds:.2f}s)"

                job.log_buffer.append(end_msg)
                await job.broadcast({"type": "log", "data": end_msg, "timestamp": time.time()})

            # Validar artefactos generados (SQLite en conversión)
            if job.test_type == "conversion":
                parts = job.robot_code.split("_")
                parent_code = f"C_{parts[1]}_{parts[2]}" if len(parts) >= 4 else job.robot_code.replace("D_", "C_")
                sqlite_path = os.path.join(new_repo, "models", "conversion", parent_code, f"{job.robot_code}.sqlite")
                if os.path.isfile(sqlite_path):
                    job.sqlite_created = True
                    job.sqlite_path = sqlite_path
                    sqlite_msg = f"📦 Base SQLite generada: {sqlite_path} ({os.path.getsize(sqlite_path):,} bytes)"
                    job.log_buffer.append(sqlite_msg)
                    await job.broadcast({"type": "log", "data": sqlite_msg, "timestamp": time.time()})

            # Notificar estado final a todos los clientes
            await job.broadcast({
                "type": "status",
                "data": job.to_dict(),
                "timestamp": time.time()
            })

        except Exception as exc:
            err_msg = f"💥 Error crítico ejecutando subproceso: {exc}"
            logger.exception(err_msg)
            job.status = JobStatus.FAILED
            job.finished_at = datetime.now()
            if job.started_at:
                job.duration_seconds = (job.finished_at - job.started_at).total_seconds()
            job.log_buffer.append(err_msg)
            await job.broadcast({"type": "log", "data": err_msg, "timestamp": time.time()})
            await job.broadcast({"type": "status", "data": job.to_dict(), "timestamp": time.time()})

        finally:
            # Enviar evento de cierre de stream a suscriptores SSE
            await job.broadcast({"type": "done", "timestamp": time.time()})


# Instancia singleton accesible globalmente
job_manager = JobManager()

