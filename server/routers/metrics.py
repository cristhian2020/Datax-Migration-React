import os
from datetime import date, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from server.dependencies import get_engine, get_current_config

router = APIRouter(prefix="/api/metrics", tags=["Métricas de Productividad"])

QUERY_MASTER = """
WITH dl_events AS (
    SELECT id_file, MIN(download_date) AS min_download
    FROM download
    GROUP BY id_file
),
conv_events AS (
    SELECT id_report, MIN(conversion_date) AS min_conversion
    FROM conversion
    GROUP BY id_report
),
mig_events AS (
    SELECT id_report, MIN(migration_date) AS min_migration
    FROM migration
    GROUP BY id_report
),
combined AS (
    SELECT 
        COALESCE(r.code, f.code) AS codigo_reporte,
        COALESCE(r.name, f.name) AS nombre_reporte,
        f.code AS codigo_archivo,
        d.min_download AS primera_descarga,
        c.min_conversion AS primera_conversion,
        m.min_migration AS primera_migracion,
        GREATEST(d.min_download, c.min_conversion, m.min_migration) AS fecha_culminacion,
        LEAST(d.min_download, c.min_conversion, m.min_migration) AS primer_despliegue
    FROM report r
    FULL OUTER JOIN file f ON r.id_file = f.id_file
    LEFT JOIN dl_events d ON f.id_file = d.id_file
    LEFT JOIN conv_events c ON r.id_report = c.id_report
    LEFT JOIN mig_events m ON r.id_report = m.id_report
    WHERE d.min_download IS NOT NULL 
       OR c.min_conversion IS NOT NULL 
       OR m.min_migration IS NOT NULL
)
SELECT 
    codigo_reporte,
    nombre_reporte,
    codigo_archivo,
    primera_descarga,
    primera_conversion,
    primera_migracion,
    fecha_culminacion,
    primer_despliegue
FROM combined
WHERE (
    :only_full = TRUE AND 
    primera_descarga IS NOT NULL AND 
    primera_conversion IS NOT NULL AND 
    primera_migracion IS NOT NULL AND 
    fecha_culminacion >= :fecha_desde AND 
    fecha_culminacion <= :fecha_hasta
) OR (
    :only_full = FALSE AND (
        (primera_descarga >= :fecha_desde AND primera_descarga <= :fecha_hasta) OR
        (primera_conversion >= :fecha_desde AND primera_conversion <= :fecha_hasta) OR
        (primera_migracion >= :fecha_desde AND primera_migracion <= :fecha_hasta)
    )
)
ORDER BY fecha_culminacion DESC NULLS LAST, primer_despliegue DESC, codigo_reporte ASC;
"""

@router.get("/productivity")
def get_productivity_metrics(
    period: str = Query("7d", description="hoy, 7d, 30d, custom"),
    days: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    only_full_pipeline: bool = Query(True, description="Filtrar solo robots con 100% de pipeline completado"),
):
    today = date.today()
    if period == "hoy":
        f_desde = today
        f_hasta = today
        title = f"Hoy ({today})"
    elif period == "30d" or days == 30:
        f_desde = today - timedelta(days=30)
        f_hasta = today
        title = "Últimos 30 días"
    elif period == "custom" and start_date:
        f_desde = date.fromisoformat(start_date)
        f_hasta = date.fromisoformat(end_date) if end_date else today
        title = f"Del {f_desde} al {f_hasta}"
    else:  # default 7d
        f_desde = today - timedelta(days=days if days else 7)
        f_hasta = today
        title = f"Últimos {days if days else 7} días"

    engine = get_engine()
    if not engine:
        return {
            "success": False,
            "error": "No se pudo conectar a PostgreSQL (platform_db). Verifica que la base de datos esté activa en Configuración .env.",
            "data": [],
            "stats": {"total": 0, "with_download": 0, "with_conversion": 0, "with_migration": 0, "full_pipeline": 0},
            "filter": {"desde": str(f_desde), "hasta": str(f_hasta), "title": title, "only_full_pipeline": only_full_pipeline}
        }

    try:
        with engine.connect() as conn:
            res = conn.execute(
                text(QUERY_MASTER),
                {"fecha_desde": f_desde, "fecha_hasta": f_hasta, "only_full": only_full_pipeline}
            ).fetchall()

            robots = []
            with_dl = 0
            with_conv = 0
            with_mig = 0
            full_pip = 0

            for row in res:
                m = row._mapping
                dl = str(m["primera_descarga"]) if m["primera_descarga"] else None
                cv = str(m["primera_conversion"]) if m["primera_conversion"] else None
                mg = str(m["primera_migracion"]) if m["primera_migracion"] else None

                if dl: with_dl += 1
                if cv: with_conv += 1
                if mg: with_mig += 1
                is_full = bool(dl and cv and mg)
                if is_full: full_pip += 1

                robots.append({
                    "codigo_reporte": m["codigo_reporte"],
                    "nombre_reporte": m["nombre_reporte"] or "Sin descripción",
                    "primera_descarga": dl or "Pendiente",
                    "primera_conversion": cv or "Pendiente",
                    "primera_migracion": mg or "Pendiente",
                    "fecha_culminacion": str(m["fecha_culminacion"]) if m["fecha_culminacion"] else "-",
                    "primer_despliegue": str(m["primer_despliegue"]) if m["primer_despliegue"] else "-",
                    "is_full_pipeline": is_full
                })

            return {
                "success": True,
                "data": robots,
                "stats": {
                    "total": len(robots),
                    "with_download": with_dl,
                    "with_conversion": with_conv,
                    "with_migration": with_mig,
                    "full_pipeline": full_pip
                },
                "filter": {
                    "desde": str(f_desde),
                    "hasta": str(f_hasta),
                    "title": title,
                    "only_full_pipeline": only_full_pipeline
                }
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "data": [],
            "stats": {"total": 0, "with_download": 0, "with_conversion": 0, "with_migration": 0, "full_pipeline": 0},
            "filter": {"desde": str(f_desde), "hasta": str(f_hasta), "title": title, "only_full_pipeline": only_full_pipeline}
        }
