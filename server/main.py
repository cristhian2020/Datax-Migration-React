import os
import sys

# Setup current dir and core in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from server.utils.logger_stream import log_manager
from server.routers import config, download, conversion, migration, autogenerate, metrics

app = FastAPI(
    title="DataX Migration Studio API",
    description="Backend FastAPI para la Plataforma de Migración V1 -> V2",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(config.router)
app.include_router(download.router)
app.include_router(conversion.router)
app.include_router(migration.router)
app.include_router(autogenerate.router)
app.include_router(metrics.router)

@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await log_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        log_manager.disconnect(websocket)
    except Exception:
        log_manager.disconnect(websocket)

@app.get("/")
def root():
    return {
        "name": "DataX Migration Studio API",
        "status": "online",
        "version": "2.0.0",
        "docs": "/docs"
    }

@app.get("/api/health")
def health():
    return {"status": "ok"}
