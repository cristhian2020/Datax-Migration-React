#!/usr/bin/env python3
"""
Módulo CLI de Métricas de Productividad y Despliegue de Robots.
Audita la cantidad de robots nuevos estrenados en platform_db aislando crons automáticos.
"""

import os
import sys
import argparse
import json
from datetime import date, timedelta
from typing import List, Dict, Any, Optional

# Cargar .env si existe
try:
    from dotenv import load_dotenv
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(root_dir, ".env"))
except Exception:
    pass

from sqlalchemy import create_engine, text

# Configuración de base de datos
DB_HOST = os.getenv("DB_HOST", "10.0.0.16")
DB_PORT = int(os.getenv("DB_PORT", 5434))
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "datax")
DB_NAME = os.getenv("DB_NAME", "platform_db")

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


def get_db_engine():
    conn_str = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    return create_engine(conn_str, connect_args={"connect_timeout": 5})


def fetch_productivity_metrics(fecha_desde: date, fecha_hasta: date, only_full: bool = True) -> List[Dict[str, Any]]:
    """Ejecuta la consulta maestra y formatea los resultados."""
    engine = get_db_engine()
    with engine.connect() as conn:
        res = conn.execute(
            text(QUERY_MASTER),
            {"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta, "only_full": only_full}
        ).fetchall()

        results = []
        for row in res:
            m = row._mapping
            results.append({
                "codigo_reporte": m["codigo_reporte"],
                "nombre_reporte": m["nombre_reporte"] or "Sin descripción",
                "primera_descarga": str(m["primera_descarga"]) if m["primera_descarga"] else "Pendiente",
                "primera_conversion": str(m["primera_conversion"]) if m["primera_conversion"] else "Pendiente",
                "primera_migracion": str(m["primera_migracion"]) if m["primera_migracion"] else "Pendiente",
            })
        return results


def print_ascii_table(data: List[Dict[str, Any]], title_desc: str):
    """Imprime una tabla formateada en ASCII en consola."""
    header_sep = "=" * 105
    sub_sep = "-" * 105

    print(header_sep)
    print(f"  [+] ROBOTS NUEVOS DESPLEGADOS Y ESTRENADOS ({title_desc})")
    print(header_sep)
    print(f"Total de robots nuevos estrenados: {len(data)}")
    print(sub_sep)
    print(f"{'CÓDIGO':<18} | {'DESCARGA':<12} | {'CONVERSIÓN':<12} | {'MIGRACIÓN':<12} | {'NOMBRE REPORTE'}")
    print(sub_sep)

    if not data:
        print("  No se encontraron robots estrenados en el período seleccionado.")
    else:
        for r in data:
            code = r["codigo_reporte"][:18]
            desc = r["primera_descarga"][:12]
            conv = r["primera_conversion"][:12]
            migr = r["primera_migracion"][:12]
            name = (r["nombre_reporte"][:40] + "...") if len(r["nombre_reporte"]) > 40 else r["nombre_reporte"]
            print(f"{code:<18} | {desc:<12} | {conv:<12} | {migr:<12} | {name}")

    print(sub_sep)


def main():
    parser = argparse.ArgumentParser(description="Métricas de Productividad y Despliegue de Robots (DATAX)")
    parser.add_argument("--hoy", action="store_true", help="Filtrar únicamente robots estrenados hoy")
    parser.add_argument("--dias", type=int, default=None, help="Filtrar estrenados en los últimos N días")
    parser.add_argument("--desde", type=str, default=None, help="Fecha inicio (YYYY-MM-DD)")
    parser.add_argument("--hasta", type=str, default=None, help="Fecha fin (YYYY-MM-DD)")
    parser.add_argument("--todos", action="store_true", help="Mostrar tambin robots en desarrollo con pipeline parcial")
    parser.add_argument("--json", action="store_true", help="Salida en formato JSON")

    args = parser.parse_args()

    today = date.today()
    if args.desde:
        f_desde = date.fromisoformat(args.desde)
        f_hasta = date.fromisoformat(args.hasta) if args.hasta else today
        title = f"DEL {f_desde} AL {f_hasta}"
    elif args.dias is not None:
        f_desde = today - timedelta(days=args.dias)
        f_hasta = today
        title = f"ÚLTIMOS {args.dias} DÍAS"
    else:
        # Por defecto hoy
        f_desde = today
        f_hasta = today
        title = f"HOY ({today})"

    try:
        results = fetch_productivity_metrics(f_desde, f_hasta, only_full=not args.todos)
        if args.json:
            print(json.dumps({
                "fecha_desde": str(f_desde),
                "fecha_hasta": str(f_hasta),
                "total": len(results),
                "robots": results
            }, indent=2, ensure_ascii=False))
        else:
            print_ascii_table(results, title)
    except Exception as e:
        if args.json:
            print(json.dumps({"error": str(e)}, indent=2))
        else:
            print(f"Error consultando base de datos: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
