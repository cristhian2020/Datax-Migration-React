# 🚀 DATAX Migration Studio V2 (FastAPI + React)

Plataforma unificada de migración, estandarización y generación autónoma de robots de datos (V1 ➔ V2) para la plataforma DATAX.

---

## 🏛️ Arquitectura del Sistema

`
┌────────────────────────────────────────────────────────┐
│               FRONTEND (React + Vite)                  │
│  - Tailwind CSS v4 con Sistema de Diseño HP (desing.md)│
│  - Monaco Editor para comparativa de código y DDL      │
│  - Lucide Icons & Terminal Logs en streaming           │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP REST (/api) + WebSocket (/ws/logs)
┌───────────────────────────▼────────────────────────────┐
│              BACKEND API (FastAPI en Python)           │
│  - server/main.py (Puerto 8000)                        │
│  - Routers: config, download, conversion, migration,   │
│             autogenerate                               │
│  - Gestor de Logs asíncrono para terminal en vivo      │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│               CORE ENGINE (core/ intacto)              │
│  - migrator_download.py    - migrator_conversion.py    │
│  - migrator_migration.py   - agent_generator.py        │
│  - agent_tester.py         - deployer.py               │
│  - taiga_client.py         - github_client.py          │
└────────────────────────────────────────────────────────┘
`

---

## 🎨 Sistema de Diseño (desing.md)

* **Canvas & Paper**: #ffffff (Pure white).
* **HP Electric Blue**: #024ad8 (CTA primario y acentos de navegación).
* **Ink**: #1a1a1a (Tipografía universal, barra superior de 36px y pie de página).
* **Cloud & Fog**: #f7f7f7 y #e8e8e8 (Paneles alternos y bordes).
* **Two-Tier Radius**: Botones afilados (4px) y tarjetas suaves (16px).
* **Tipografía**: Inter / Manrope con display headings en peso 500.

---

## 📦 Módulos Incluidos (100% de la Plataforma)

1. **📥 Robots de Descarga (D_...)**:
   * Flujo V1 (Migración con refactor automático) y Flujo V2 (Validación de robots nuevos).
   * Selector inteligente de fechas de corte para scraper (updated_to).
   * Diagnóstico inteligente de errores y forzado de DAGs.
   * Gestión inline de fecha en base de datos.
   * Despliegue SFTP y generación de DAGs en Airflow Docker.

2. **🔄 Robots de Conversión (C_...)**:
   * Wizard de 5 pasos: Selección, Refactorización, Ejecución de Pruebas, Auditoría y Despliegue.
   * Subida de archivos de muestra (Excel/PDF) con dropzone.
   * Visor de tabla SQLite (data_melted).
   * Editor interactivo para la tabla de reemplazos DATA_DB_BO_AUX (Búsqueda, adición, eliminación y guardado masivo).

3. **🚚 Robots de Migración (M_... / PostgreSQL)**:
   * Detección de salidas SQLite convertidas.
   * Generación automática de scripts DDL SQL (CREATE TABLE) y Python (M_...py).
   * Guardado en el repositorio V2 y despliegue a producción.

4. **🤖 AutoGenerate (Agente Autónomo IA con Taiga)**:
   * Integración directa con el tablero Kanban de Taiga para leer User Stories y descargar adjuntos.
   * Generación cognitiva de robots con Google Gemini y auto-corrección guiada.
   * Pestaña integrada con la documentación oficial y estándares DATAX.

---

## ⚡ Cómo Ejecutar la Aplicación

### Opción 1: Un Solo Clic (Recomendado en Windows)
Haz doble clic sobre:
E:\DATAX\Migracion React\run.bat

### Opción 2: Desde PowerShell
`powershell
cd 'E:\DATAX\Migracion React'
.\run.ps1
`

### Opción 3: Manualmente en Terminales Separadas
1. **Backend (Terminal 1)**:
   `ash
   cd 'E:\DATAX\Migracion React'
   python run_backend.py
   `
   *Acceso a documentación interactiva Swagger:* http://localhost:8000/docs

2. **Frontend (Terminal 2)**:
   `ash
   cd 'E:\DATAX\Migracion React\frontend'
   npm run dev
   `
   *Aplicación Web:* http://localhost:5173
