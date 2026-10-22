import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  RefreshCw,
  Search,
  ShieldCheck,
  Filter,
  ArrowUpRight,
  Layers,
  Sparkles,
  Clock,
} from "lucide-react";
import { api } from "../services/api";
import { Badge } from "../components/ui/Badge";

export function MetricsView() {
  const [period, setPeriod] = useState("7d"); // "hoy", "7d", "30d", "custom"
  const [onlyFullPipeline, setOnlyFullPipeline] = useState(true); // Default to full pipeline (100% completed)
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [metricsData, setMetricsData] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    with_download: 0,
    with_conversion: 0,
    with_migration: 0,
    full_pipeline: 0,
  });
  const [filterTitle, setFilterTitle] = useState("Últimos 7 días");

  useEffect(() => {
    loadMetrics(period, customStart, customEnd, onlyFullPipeline);
  }, [period, onlyFullPipeline]);

  const loadMetrics = async (p, start = "", end = "", fullPipeline = onlyFullPipeline) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let url = `/metrics/productivity?period=${p}&only_full_pipeline=${fullPipeline}`;
      if (p === "custom" && start) {
        url += `&start_date=${start}&end_date=${end || ""}`;
      }
      const res = await api.get(url);
      if (res.data.success) {
        setMetricsData(res.data.data || []);
        setStats(res.data.stats || {});
        setFilterTitle(res.data.filter?.title || "Período");
      } else {
        setErrorMsg(res.data.error || "Error consultando base de datos");
        setMetricsData([]);
        setStats({
          total: 0,
          with_download: 0,
          with_conversion: 0,
          with_migration: 0,
          full_pipeline: 0,
        });
      }
    } catch (e) {
      setErrorMsg(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCustom = () => {
    if (!customStart) {
      alert("Por favor selecciona una fecha de inicio.");
      return;
    }
    loadMetrics("custom", customStart, customEnd, onlyFullPipeline);
  };

  const handleExportCSV = () => {
    if (!metricsData.length) return;
    const headers = [
      "Codigo Reporte",
      "Nombre Reporte",
      "Primera Descarga",
      "Primera Conversion",
      "Primera Migracion",
      "Fecha Culminacion",
      "Pipeline Completo",
    ];
    const rows = metricsData.map((r) => [
      `"${r.codigo_reporte}"`,
      `"${(r.nombre_reporte || "").replace(/"/g, '""')}"`,
      `"${r.primera_descarga}"`,
      `"${r.primera_conversion}"`,
      `"${r.primera_migracion}"`,
      `"${r.fecha_culminacion || r.primer_despliegue || ""}"`,
      r.is_full_pipeline ? "SI" : "NO",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `metricas_robots_${period}_${onlyFullPipeline ? "100_completo" : "todos"}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(metricsData, null, 2));
    alert("Datos copiados al portapapeles en formato JSON!");
  };

  // Filtered rows by search query
  const filteredRobots = metricsData.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.codigo_reporte?.toLowerCase().includes(q) ||
      r.nombre_reporte?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Band */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#e8e8e8]">
        <div>
          <div className="flex items-center gap-2">
            <span className="hp-chevron" />
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">
              Métricas de Productividad y Despliegue de Robots
            </h1>
          </div>
          <p className="text-xs text-[#636363] mt-1">
            Auditoría de robots nuevos desarrollados y estrenados en producción, aislando ejecuciones de crons automáticos.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadMetrics(period, customStart, customEnd, onlyFullPipeline)}
            disabled={loading}
            className="hp-btn hp-btn-outline-ink text-xs h-9 px-3"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refrescar</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!metricsData.length}
            className="hp-btn hp-btn-outline text-xs h-9 px-3"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={handleCopyJson}
            disabled={!metricsData.length}
            className="hp-btn hp-btn-outline-ink text-xs h-9 px-3"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copiar JSON</span>
          </button>
        </div>
      </div>

      {/* Business Rule Banner */}
      <div className="p-4 bg-[#f7f7f7] border-l-4 border-l-[#024ad8] rounded-[8px] text-xs space-y-1">
        <div className="font-bold text-[#1a1a1a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#024ad8]" />
            <span>Regla de Negocio: Aislamiento Estricto de Crons Automáticos</span>
          </div>
          <Badge variant={onlyFullPipeline ? "success" : "warning"} className="inline-flex items-center gap-1">
            {onlyFullPipeline ? (
              <>
                <CheckCircle2 className="w-3 h-3" />
                <span>Modo: Solo 100% Completados</span>
              </>
            ) : (
              <span>Modo: Todos / En Progreso</span>
            )}
          </Badge>
        </div>
        <p className="text-[#636363] leading-relaxed">
          {onlyFullPipeline
            ? "Mostrando únicamente robots que han completado las 3 etapas (Descarga + Conversión + Migración a PostgreSQL) y culminaron en el período. Crons y ejecuciones automáticas quedan 100% aisladas."
            : "Mostrando todos los robots con actividad nueva o debut en cualquiera de las 3 etapas (Descarga, Conversión o Migración). Útil para rastrear robots en desarrollo."}
        </p>
      </div>

      {/* Error alert if DB is offline */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-[8px] text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <div className="font-bold">Aviso de Base de Datos (platform_db):</div>
            <div>{errorMsg}</div>
          </div>
        </div>
      )}

      {/* Filter Selector Bar */}
      <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-[8px] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-[#636363] uppercase flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Período:
          </span>

          <div className="flex items-center gap-1.5">
            {[
              { id: "hoy", label: "Hoy" },
              { id: "7d", label: "Últimos 7 días" },
              { id: "30d", label: "Últimos 30 días" },
              { id: "custom", label: "Personalizado" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setPeriod(f.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[4px] transition-all ${
                  period === f.id
                    ? "bg-[#1a1a1a] text-white shadow-xs"
                    : "bg-white text-[#3d3d3d] border border-[#e8e8e8] hover:border-[#1a1a1a]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Toggle Switch: Full Pipeline (100%) vs All / In progress */}
          <div className="flex items-center gap-2 border-l border-[#e8e8e8] pl-3">
            <button
              onClick={() => {
                const next = !onlyFullPipeline;
                setOnlyFullPipeline(next);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[4px] border transition-all flex items-center gap-1.5 ${
                onlyFullPipeline
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs"
                  : "bg-white text-[#636363] border-[#e8e8e8] hover:border-[#1a1a1a]"
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  onlyFullPipeline ? "text-emerald-600" : "text-slate-400"
                }`}
              />
              <span>
                {onlyFullPipeline ? "Solo Pipeline Completo (100%)" : "Ver Todos / En Progreso"}
              </span>
            </button>
          </div>
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 border border-[#c2c2c2] rounded-[4px] bg-white text-xs outline-none"
            />
            <span className="text-[#636363]">hasta</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 border border-[#c2c2c2] rounded-[4px] bg-white text-xs outline-none"
            />
            <button
              onClick={handleApplyCustom}
              className="hp-btn hp-btn-primary text-xs h-8 px-3"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="hp-card p-4 flex flex-col justify-between">
          <span className="text-[11px] font-bold text-[#636363] uppercase tracking-wide">
            Total Mostrados
          </span>
          <div className="mt-2 text-3xl font-extrabold text-[#1a1a1a] tracking-tight">
            {stats.total}
          </div>
          <span className="text-[10px] text-[#024ad8] font-semibold mt-1">
            {filterTitle}
          </span>
        </div>

        <div className="hp-card p-4 flex flex-col justify-between">
          <span className="text-[11px] font-bold text-[#636363] uppercase tracking-wide">
            Con Descarga (D_)
          </span>
          <div className="mt-2 text-3xl font-extrabold text-[#1a1a1a] tracking-tight">
            {stats.with_download}
          </div>
          <span className="text-[10px] text-slate-400 mt-1">Etapa 1: Ingesta</span>
        </div>

        <div className="hp-card p-4 flex flex-col justify-between">
          <span className="text-[11px] font-bold text-[#636363] uppercase tracking-wide">
            Con Conversión (C_)
          </span>
          <div className="mt-2 text-3xl font-extrabold text-[#1a1a1a] tracking-tight">
            {stats.with_conversion}
          </div>
          <span className="text-[10px] text-slate-400 mt-1">Etapa 2: Aplanado</span>
        </div>

        <div className="hp-card p-4 flex flex-col justify-between">
          <span className="text-[11px] font-bold text-[#636363] uppercase tracking-wide">
            Con Migración (M_)
          </span>
          <div className="mt-2 text-3xl font-extrabold text-[#1a1a1a] tracking-tight">
            {stats.with_migration}
          </div>
          <span className="text-[10px] text-slate-400 mt-1">Etapa 3: PostgreSQL</span>
        </div>

        <div className="hp-card p-4 flex flex-col justify-between bg-emerald-50/50 border-emerald-200">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Full Pipeline 100%</span>
          </span>
          <div className="mt-2 text-3xl font-extrabold text-emerald-900 tracking-tight">
            {stats.full_pipeline}
          </div>
          <span className="text-[10px] text-emerald-700 font-semibold mt-1">
            Producción Activa
          </span>
        </div>
      </div>

      {/* Robots Table Section */}
      <div className="hp-card p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#024ad8]" />
            <h2 className="text-base font-bold text-[#1a1a1a]">
              Detalle de Robots ({filteredRobots.length})
            </h2>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-[#e8e8e8] rounded-[6px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f7f7f7] border-b border-[#e8e8e8] text-[#636363] font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Código Reporte</th>
                <th className="py-2.5 px-4">Nombre / Descripción</th>
                <th className="py-2.5 px-4">1. Descarga</th>
                <th className="py-2.5 px-4">2. Conversión</th>
                <th className="py-2.5 px-4">3. Migración</th>
                <th className="py-2.5 px-4">Fecha Culminación</th>
                <th className="py-2.5 px-4 text-center">Estado Pipeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8] text-[#1a1a1a]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                    Consultando métricas en PostgreSQL (platform_db)...
                  </td>
                </tr>
              ) : filteredRobots.length > 0 ? (
                filteredRobots.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-[#024ad8]">
                      {r.codigo_reporte}
                    </td>
                    <td className="py-2.5 px-4 max-w-xs truncate" title={r.nombre_reporte}>
                      {r.nombre_reporte}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px]">
                      {r.primera_descarga !== "Pendiente" ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{r.primera_descarga}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px]">
                      {r.primera_conversion !== "Pendiente" ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{r.primera_conversion}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px]">
                      {r.primera_migracion !== "Pendiente" ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{r.primera_migracion}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] font-semibold text-[#1a1a1a]">
                      {r.fecha_culminacion !== "-" ? r.fecha_culminacion : r.primer_despliegue}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {r.is_full_pipeline ? (
                        <Badge variant="success" className="inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>100% COMPLETO</span>
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>EN DESARROLLO</span>
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                    {onlyFullPipeline
                      ? "No se encontraron robots que hayan completado las 3 etapas en el período. (Prueba desactivar 'Solo Pipeline Completo' para ver robots en desarrollo)."
                      : "No se encontraron robots estrenados en el período seleccionado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
