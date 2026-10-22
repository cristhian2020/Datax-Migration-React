# Script de arranque para DATAX Migration Studio (FastAPI + React)
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       DATAX MIGRATION STUDIO V2 (FastAPI + React)        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$backendJob = Start-Job -ScriptBlock {
    Set-Location -Path $using:PSScriptRoot
    python run_backend.py
}
Write-Host "[1/2] Backend FastAPI iniciado en http://127.0.0.1:8000" -ForegroundColor Green

Set-Location -Path "$PSScriptRoot\frontend"
Write-Host "[2/2] Iniciando Frontend React (Vite)..." -ForegroundColor Green
Start-Process "http://localhost:5173"

npm run dev
