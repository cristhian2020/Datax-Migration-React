import sys
import io
import asyncio
from typing import Set
from fastapi import WebSocket

class LogStreamManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: str, level: str = "info", process: str = "general"):
        if not self.active_connections:
            return
        payload = {"type": "log", "level": level, "process": process, "message": message}
        dead = set()
        for conn in list(self.active_connections):
            try:
                await conn.send_json(payload)
            except Exception:
                dead.add(conn)
        for d in dead:
            self.active_connections.discard(d)

log_manager = LogStreamManager()
