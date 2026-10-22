import React, { useState, useEffect } from "react";
import { Truck, Play, Code, Database, Save, CheckCircle, CheckCircle2, Zap, Bot, Sparkles, RefreshCw, AlertTriangle, ArrowRight, Server, Copy, Table } from "lucide-react";
import Editor from "@monaco-editor/react";
import { api } from "../services/api";
import { Badge } from "../components/ui/Badge";
import { TerminalLogs } from "../components/ui/TerminalLogs";

export function MigrationView({ externalLogs = [] }) {
  // Flow mode: "conversion_sqlite" or "existing_v2"
  const [migFlowMode, setMigFlowMode] = useState("conversion_sqlite");

  // Output selection
  const [outputs, setOutputs] = useState([]);
  const [existingRobots, setExistingRobots] = useState([]);
  const [selectedParent, setSelectedParent] = useState("");
  const [selectedReport, setSelectedReport] = useState("");
  const [selectedSqlite, setSelectedSqlite] = useState("");
  const [dbMigInfo, setDbMigInfo] = useState(null);
  const [structInfo, setStructInfo] = useState(null);

  // Tabs: "config", "preview", "deploy"
  const [activeTab, setActiveTab] = useState("config");

  // AI Agent & Configuration state
  const [analyzingAgent, setAnalyzingAgent] = useState(false);
  const [agentResult, setAgentResult] = useState(null);
  const [useOfflineHeuristic, setUseOfflineHeuristic] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Migration fields
  const [chosenMetric, setChosenMetric] = useState("precio");
  const [chosenUnit, setChosenUnit] = useState("BOB");
  const [customUnit, setCustomUnit] = useState("");
  const [chosenFactor, setChosenFactor] = useState(1.0);
  const [isMixed, setIsMixed] = useState(false);

  // Generated code
  const [sqlCode, setSqlCode] = useState("");
  const [pyCode, setPyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [localLogs, setLocalLogs] = useState([]);

  // SSH Deploy
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState("");
  const [sshPass, setSshPass] = useState("");
  const [trigMigCode, setTrigMigCode] = useState("");
  const [trigMigId, setTrigMigId] = useState(1);
  const [trigMigPath, setTrigMigPath] = useState("");
  const [latestConvInfo, setLatestConvInfo] = useState(null);
  const [triggeringMigDag, setTriggeringMigDag] = useState(false);
  const [triggerMigResult, setTriggerMigResult] = useState(null);
  const [deployResult, setDeployResult] = useState(null);

  const metricOptions = [
    "precio", "tasa", "moneda", "porcentaje", "tipo_cambio", "volumen",
    "energia", "potencia", "indice", "ratio", "conteo", "temperatura", "precipitacion"
  ];

  const commonUnits = [
    "BOB", "USD", "UFV", "BOB/USD", "BOB/UFV", "%", "veces", "puntos",
    "USD/Tn", "GBP/Tn", "EUR/Tn", "USD/Bbl", "USc/lb",
    "unidades", "reclamos", "personas", "casos", "cuentas", "transacciones", "operaciones",
    "GWh", "MWh", "kWh", "Wh", "GW", "MW", "kW",
    "Tn", "Kg", "m3", "MMpcd", "Bbl", "litros", "°C", "mm"
  ];

  useEffect(() => {
    loadOutputs();
  }, [migFlowMode]);

  const loadOutputs = async () => {
    try {
      const res = await api.get("/migration/outputs");
      const list = res.data.outputs || [];
      const ex = res.data.existing_migration_robots || [];
      setOutputs(list);
      setExistingRobots(ex);

      if (list.length > 0) {
        setSelectedParent(list[0].parent_code);
        if (list[0].reports?.length > 0) {
          const firstRep = list[0].reports[0];
          setSelectedReport(firstRep.code);
          setSelectedSqlite(firstRep.sqlite_file);
          inspectReport(list[0].parent_code, firstRep.code, firstRep.sqlite_file);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };


  const fetchPreviewTable = async (
    sqliteFile = selectedSqlite,
    reportCode = selectedReport,
    metric = chosenMetric,
    unit = customUnit || chosenUnit,
    factor = chosenFactor,
    mixed = isMixed,
    customM = agentResult?.get_metric_code || "",
    customU = agentResult?.get_unit_code || ""
  ) => {
    if (!sqliteFile) return;
    setLoadingPreview(true);
    try {
      const res = await api.post("/migration/preview-table", {
        sqlite_file: sqliteFile,
        report_code: reportCode,
        metric,
        unit,
        factor,
        is_mixed: mixed,
        custom_metric_code: customM,
        custom_unit_code: customU,
        limit: 50,
      });
      setPreviewData(res.data);
    } catch (err) {
      console.error("Error fetching preview table:", err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const inspectReport = async (parentCode, reportCode, sqliteFile) => {
    setSelectedParent(parentCode);
    setSelectedReport(reportCode);
    setSelectedSqlite(sqliteFile);
    setAgentResult(null);

    try {
      const res = await api.get(`/migration/inspect?sqlite_file=${encodeURIComponent(sqliteFile)}&report_code=${reportCode}&use_heuristic=${useOfflineHeuristic}`);
      setDbMigInfo(res.data.db_info);
      const st = res.data.structure || {};
      setStructInfo(st);

      // Defaults
      if (st.suggested_metric) setChosenMetric(st.suggested_metric);
      if (st.suggested_unit) setChosenUnit(st.suggested_unit);
      if (st.suggested_factor) setChosenFactor(st.suggested_factor);
      if (st.has_mixed_rows || st.has_multi_currency || st.has_multiple_facts) setIsMixed(true);

      // Auto generate draft code
      generateDraftCode(parentCode, reportCode, sqliteFile, st.suggested_metric, st.suggested_unit, st.suggested_factor, st.has_mixed_rows);

      if (res.data.preview && res.data.preview.rows?.length > 0) {
        setPreviewData(res.data.preview);
      } else {
        fetchPreviewTable(sqliteFile, reportCode, st.suggested_metric, st.suggested_unit, st.suggested_factor, st.has_mixed_rows);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Run AI Agent SQLite Analysis
  const handleRunAiAgent = async () => {
    if (!selectedSqlite) return;
    setAnalyzingAgent(true);
    try {
      const res = await api.post("/migration/analyze-sqlite", {
        sqlite_file: selectedSqlite,
        report_code: selectedReport,
      });
      setAgentResult(res.data);
      if (res.data.base_metric) setChosenMetric(res.data.base_metric);
      if (res.data.base_unit) setChosenUnit(res.data.base_unit);
      if (res.data.conversion_factor) setChosenFactor(res.data.conversion_factor);
      if (res.data.is_mixed !== undefined) setIsMixed(res.data.is_mixed);

      if (res.data.preview && res.data.preview.rows?.length > 0) {
        setPreviewData(res.data.preview);
      } else {
        fetchPreviewTable(
          selectedSqlite,
          selectedReport,
          res.data.base_metric || chosenMetric,
          res.data.base_unit || chosenUnit,
          res.data.conversion_factor || chosenFactor,
          res.data.is_mixed !== undefined ? res.data.is_mixed : isMixed,
          res.data.get_metric_code,
          res.data.get_unit_code
        );
      }

      // Re-generate draft with agent codes
      generateDraftCode(
        selectedParent,
        selectedReport,
        selectedSqlite,
        res.data.base_metric || chosenMetric,
        res.data.base_unit || chosenUnit,
        res.data.conversion_factor || chosenFactor,
        res.data.is_mixed,
        res.data.get_metric_code,
        res.data.get_unit_code
      );
    } catch (e) {
      alert("Error ejecutando Agente IA: " + (e.response?.data?.detail || e.message));
    } finally {
      setAnalyzingAgent(false);
    }
  };

  const generateDraftCode = async (parentCode, reportCode, sqliteFile, metric, unit, factor, mixed, customM = "", customU = "") => {
    try {
      const res = await api.post("/migration/generate", {
        parent_code: parentCode,
        report_code: reportCode,
        sqlite_file: sqliteFile,
        report_name: dbMigInfo?.name || "",
        metric: metric || chosenMetric,
        unit: customUnit || unit || chosenUnit,
        factor: factor || chosenFactor,
        has_mixed_rows: mixed !== undefined ? mixed : isMixed,
        custom_metric_code: customM || agentResult?.get_metric_code || "",
        custom_unit_code: customU || agentResult?.get_unit_code || "",
      });
      setSqlCode(res.data.sql_code || "");
      setPyCode(res.data.py_code || "");
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await api.post("/migration/save", {
        parent_code: selectedParent.replace("C_", "M_"),
        report_code: selectedReport,
        sql_content: sqlCode,
        py_content: pyCode,
      });
      alert(res.data.message || "Archivos guardados en V2 con éxito!");
      setLocalLogs((prev) => [...prev, `[SAVE] ${res.data.message}`]);
    } catch (e) {
      alert("Error guardando: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const loadLatestConversionInfo = async (code) => {
    if (!code) return;
    try {
      const res = await api.get(`/migration/latest-conversion/${code}`);
      if (res.data) {
        setLatestConvInfo(res.data);
        setTrigMigCode(code);
        setTrigMigId(res.data.id_conversion || 1);
        setTrigMigPath(res.data.conversion_path || "");
      }
    } catch (e) {
      console.error("Error loading latest conversion:", e);
    }
  };

  useEffect(() => {
    if (activeTab === "deploy" && selectedReport) {
      loadLatestConversionInfo(selectedReport);
    }
  }, [activeTab, selectedReport]);

  const handleTriggerMigrationDag = async () => {
    if (!sshPass) {
      alert("Por favor introduce la contraseña del servidor SSH para conectar.");
      return;
    }
    setTriggeringMigDag(true);
    setTriggerMigResult(null);
    const dagId = selectedParent.replace("C_", "M_");
    setLocalLogs((prev) => [...prev, `[AIRFLOW] Disparando DAG de migración ${dagId} con code=${trigMigCode}, id_conversion=${trigMigId}...`]);
    try {
      const res = await api.post("/migration/trigger-dag", {
        dag_id: dagId,
        code: trigMigCode || selectedReport,
        id_conversion: parseInt(trigMigId) || 1,
        conversion_path: trigMigPath,
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
      });
      setTriggerMigResult(res.data);
      if (res.data.success) {
        setLocalLogs((prev) => [...prev, `[AIRFLOW OK] DAG de migración ${dagId} activado exitosamente en Airflow.`]);
      } else {
        setLocalLogs((prev) => [...prev, `[AIRFLOW WARN] El comando de disparo terminó con advertencias.`]);
      }
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [...prev, `[AIRFLOW ERROR] ${err}`]);
      setTriggerMigResult({ success: false, output: err });
    } finally {
      setTriggeringMigDag(false);
    }
  };

  // Cargar credenciales SSH sensibles dinámicamente desde .env vía backend
  useEffect(() => {
    const fetchSshConfigFromEnv = async () => {
      try {
        const res = await api.get("/config");
        if (res.data?.config) {
          const cfg = res.data.config;
          if (cfg.ssh_host) setSshHost(cfg.ssh_host);
          if (cfg.ssh_port) setSshPort(cfg.ssh_port);
          if (cfg.ssh_user) setSshUser(cfg.ssh_user);
          if (cfg.ssh_pass) setSshPass(cfg.ssh_pass);
        }
      } catch (e) {
        console.error("Error al cargar credenciales de .env:", e);
      }
    };
    fetchSshConfigFromEnv();
  }, []);

  const handleDeploy = async () => {
    setLoading(true);
    setDeployResult(null);
    try {
      const res = await api.post("/migration/deploy", {
        parent_code: selectedParent.replace("C_", "M_"),
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
      });
      if (res.data.logs) {
        setLocalLogs((prev) => [...prev, ...res.data.logs]);
      }
      setDeployResult(res.data);
      alert(res.data.message || "Despliegue completado!");
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setDeployResult({ success: false, message: err });
      alert("Error desplegando: " + err);
    } finally {
      setLoading(false);
    }
  };

  const activeReports = outputs.find((o) => o.parent_code === selectedParent)?.reports || [];

  return (
    <div className="space-y-6">
      {/* Header Band */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#e8e8e8]">
        <div>
          <div className="flex items-center gap-2">
            <span className="hp-chevron" />
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">Robots de Migración (M_... / PostgreSQL)</h1>
          </div>
          <p className="text-xs text-[#636363] mt-1">
            Generación inteligente con Agente IA / Motor Heurístico de DDL SQL y scripts Python para persistir datos desde SQLite a PostgreSQL
          </p>
        </div>

        <div className="inline-flex p-1 bg-[#f7f7f7] rounded-[4px] border border-[#e8e8e8]">
          <button
            onClick={() => setMigFlowMode("conversion_sqlite")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-all ${
              migFlowMode === "conversion_sqlite" ? "bg-[#1a1a1a] text-white shadow-xs" : "text-[#636363] hover:text-[#1a1a1a]"
            }`}
          >
            🔄 Generar desde SQLite de Conversión
          </button>
          <button
            onClick={() => setMigFlowMode("existing_v2")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-all ${
              migFlowMode === "existing_v2" ? "bg-[#1a1a1a] text-white shadow-xs" : "text-[#636363] hover:text-[#1a1a1a]"
            }`}
          >
            ✨ Robots Existentes en V2
          </button>
        </div>
      </div>

      {/* Selectors Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#f7f7f7] border border-[#e8e8e8] rounded-[8px] p-4">
        <div>
          <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
            1. Familia de Conversión / Migración ({outputs.length}):
          </label>
          <select
            value={selectedParent}
            onChange={(e) => {
              const p = e.target.value;
              setSelectedParent(p);
              const fam = outputs.find((o) => o.parent_code === p);
              if (fam?.reports?.length > 0) {
                inspectReport(p, fam.reports[0].code, fam.reports[0].sqlite_file);
              }
            }}
            className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
          >
            {outputs.map((o) => (
              <option key={o.parent_code} value={o.parent_code}>
                {o.parent_code} ➔ {o.migration_parent} ({o.reports?.length || 0} reportes)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
            2. Reporte a Migrar ({activeReports.length}):
          </label>
          <select
            value={selectedReport}
            onChange={(e) => {
              const repCode = e.target.value;
              const repObj = activeReports.find((r) => r.code === repCode);
              if (repObj) {
                inspectReport(selectedParent, repObj.code, repObj.sqlite_file);
              }
            }}
            className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
          >
            {activeReports.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} {r.has_conversion_py ? "✓" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metadata info banner */}
      {dbMigInfo && (
        <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-[8px] p-3 text-xs flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-bold text-[#1a1a1a]">📊 Metadatos en BD: </span>
            <span className="text-[#3d3d3d]">{dbMigInfo.name || "Sin nombre"}</span>
            <span className="mx-2">•</span>
            <span className="text-[#636363]">Storage Table: <code>{dbMigInfo.storage_table || "-"}</code></span>
            <span className="mx-2">•</span>
            <span className="text-[#636363]">Factor en BD: <code>{dbMigInfo.conversion_factor || 1}</code></span>
            <span className="mx-2">•</span>
            <span className="text-[#636363]">Decimal: <code>{dbMigInfo.decimal_separator || ","}</code></span>
          </div>
          <Badge variant="primary">{selectedReport}</Badge>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="border-b border-[#e8e8e8] flex items-center gap-6">
        <button
          onClick={() => setActiveTab("config")}
          className={`pb-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
            activeTab === "config"
              ? "text-[#024ad8] border-b-2 border-[#024ad8]"
              : "text-[#636363] hover:text-[#1a1a1a]"
          }`}
        >
          <Bot className="w-4 h-4" /> ⚙️ 1. Configuración & Agente IA
        </button>

        <button
          onClick={() => {
            setActiveTab("preview");
            generateDraftCode(selectedParent, selectedReport, selectedSqlite, chosenMetric, chosenUnit, chosenFactor, isMixed);
          }}
          className={`pb-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
            activeTab === "preview"
              ? "text-[#024ad8] border-b-2 border-[#024ad8]"
              : "text-[#636363] hover:text-[#1a1a1a]"
          }`}
        >
          <Code className="w-4 h-4" /> 📄 2. Previsualizar Código (.sql & .py)
        </button>

        <button
          onClick={() => setActiveTab("deploy")}
          className={`pb-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
            activeTab === "deploy"
              ? "text-[#024ad8] border-b-2 border-[#024ad8]"
              : "text-[#636363] hover:text-[#1a1a1a]"
          }`}
        >
          <Server className="w-4 h-4" /> 🚀 3. Guardar & Desplegar al Servidor
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: CONFIGURACIÓN & AGENTE IA
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "config" && (
        <div className="space-y-6">
          {/* AI AGENT CARD */}
          <div className="hp-card p-6 border-l-4 border-l-[#024ad8] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#024ad8]" />
                <h3 className="font-bold text-sm text-[#1a1a1a]">
                  🤖 Agente Analizador Inteligente de SQLite (Gemini / Heurístico)
                </h3>
              </div>
              <button
                onClick={handleRunAiAgent}
                disabled={analyzingAgent || !selectedSqlite}
                className="hp-btn hp-btn-primary text-xs"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>{analyzingAgent ? "Analizando SQLite..." : "🧠 Ejecutar Análisis con Agente IA"}</span>
              </button>
            </div>

            <p className="text-xs text-[#636363]">
              El Agente examina títulos, jerarquías multinivel (nv1..nvN), categorías únicas y la distribución numérica en SQLite para clasificar exactamente métricas homogéneas o mixtas (tasa, moneda, %, BOB, USD, UFV) y el factor de conversión correspondiente.
            </p>

            {agentResult && (
              <div className="bg-[#c9e0fc]/20 border border-[#024ad8]/30 rounded-[8px] p-4 text-xs space-y-2">
                <div className="flex items-center justify-between font-bold text-[#0e3191]">
                  <span>💡 Diagnóstico del Agente IA ({agentResult.source || "Motor Heurístico"}):</span>
                  <Badge variant="primary">Métrica: {agentResult.base_metric} | Unidad: {agentResult.base_unit} | Factor: {agentResult.conversion_factor}</Badge>
                </div>
                <div className="text-[#3d3d3d] whitespace-pre-line leading-relaxed">
                  {agentResult.explanation}
                </div>
                {agentResult.agent_warning && (
                  <div className="p-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-[4px] mt-2">
                    ⚠️ {agentResult.agent_warning}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* METRIC, UNIT, FACTOR FORM */}
          <div className="hp-card p-6 space-y-4">
            <h3 className="font-bold text-sm text-[#1a1a1a]">Ajustes de Clasificación para PostgreSQL</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-[#1a1a1a] block mb-1">Métrica Base:</label>
                  <select
                    value={chosenMetric}
                    onChange={(e) => setChosenMetric(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
                  >
                    {metricOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#1a1a1a] block mb-1">Unidad Métrica Base:</label>
                  <select
                    value={chosenUnit}
                    onChange={(e) => setChosenUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
                  >
                    {commonUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-[#636363] block mb-1">✍️ O escribir otra unidad personalizada (opcional):</label>
                  <input
                    type="text"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    placeholder="Ej: reclamos, unidades, GWh, etc."
                    className="w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-[#1a1a1a] block mb-1">Factor de Conversión:</label>
                  <input
                    type="number"
                    step="1"
                    value={chosenFactor}
                    onChange={(e) => setChosenFactor(parseFloat(e.target.value) || 1.0)}
                    className="w-full px-3 py-2 text-xs border border-[#c2c2c2] rounded-[4px] outline-none font-mono"
                  />
                  <span className="text-[11px] text-[#636363] block mt-1">
                    Multiplica el valor antes de insertarlo en PostgreSQL (ej: 1000000 para millones).
                  </span>
                </div>

                <div className="pt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMixed}
                      onChange={(e) => setIsMixed(e.target.checked)}
                      className="accent-[#024ad8] w-4 h-4 mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-bold text-[#1a1a1a] block">
                        🔀 Mapeo dinámico de Múltiples Hechos (Conteo, Porcentaje %, Monedas BOB/USD/UFV, etc.)
                      </span>
                      <span className="text-[11px] text-[#636363] block mt-0.5">
                        Detecta fila por fila si el valor corresponde a Porcentaje %, Moneda, Tipo de Cambio o Factores mixtos y clasifica dinámicamente cada registro.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Columns breakdown */}
            {structInfo && (
              <div className="pt-4 border-t border-[#e8e8e8] space-y-2 text-xs">
                <div className="font-bold text-[#1a1a1a]">📋 Columnas detectadas en SQLite para PostgreSQL:</div>
                <div className="grid grid-cols-2 gap-4 text-[#3d3d3d]">
                  <div>• <strong>Títulos:</strong> <code>{JSON.stringify(structInfo.title_cols || [])}</code></div>
                  <div>• <strong>Jerarquías:</strong> <code>{JSON.stringify(structInfo.nv_cols || [])}</code></div>
                  <div>• <strong>Tiempo y Valor:</strong> <code>["fecha", "valor"]</code></div>
                  <div>• <strong>Columnas de Migración:</strong> <code>["metrica", "unidad_metrica"]</code></div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-[#e8e8e8] flex justify-end">
              <button
                onClick={() => {
                  setActiveTab("preview");
                  generateDraftCode(selectedParent, selectedReport, selectedSqlite, chosenMetric, chosenUnit, chosenFactor, isMixed);
                }}
                className="hp-btn hp-btn-primary text-xs"
              >
                <span>Generar y Previsualizar Código</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        
          {/* TABLA DE VISTA PREVIA SIMULADA (POSTGRESQL) */}
          <div className="hp-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#e8e8e8]">
              <div>
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-[#024ad8]" />
                  <h3 className="font-bold text-sm text-[#1a1a1a]">
                    Vista Previa de Datos Simulada (PostgreSQL)
                  </h3>
                  {previewData?.total_rows > 0 && (
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#f0f0f0] text-[#3d3d3d] border border-[#e0e0e0]">
                      {previewData.total_rows.toLocaleString()} filas en SQLite
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#636363] mt-0.5">
                  Muestra cómo el robot clasificará cada fila con <code className="text-[#024ad8] font-bold">metrica_preview</code> y <code className="text-[#024ad8] font-bold">unidad_preview</code> antes de persistir a PostgreSQL.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchPreviewTable()}
                  disabled={loadingPreview || !selectedSqlite}
                  className="hp-btn hp-btn-outline-ink text-xs h-7 px-2.5 flex items-center gap-1.5"
                  title="Recalcular vista previa con los parámetros actuales"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPreview ? "animate-spin" : ""}`} />
                  <span>Actualizar Vista</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("preview");
                    generateDraftCode(selectedParent, selectedReport, selectedSqlite, chosenMetric, chosenUnit, chosenFactor, isMixed);
                  }}
                  className="hp-btn hp-btn-primary text-xs h-7 px-3 flex items-center gap-1.5"
                >
                  <span>Ver Código</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {loadingPreview ? (
              <div className="py-12 flex flex-col items-center justify-center text-xs text-[#636363] gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-[#024ad8]" />
                <span>Calculando y clasificando muestra de datos...</span>
              </div>
            ) : previewData?.rows && previewData.rows.length > 0 ? (
              <div className="border border-[#e8e8e8] rounded-[6px] overflow-hidden">
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#f7f7f7] text-[#1a1a1a] sticky top-0 border-b border-[#e8e8e8] z-10 select-none shadow-xs">
                      <tr>
                        <th className="py-2 px-3 font-semibold text-[#636363] text-[11px] uppercase tracking-wider w-10 text-center">
                          #
                        </th>
                        {previewData.columns.map((col) => {
                          const isMetric = col === "metrica_preview";
                          const isUnit = col === "unidad_preview";
                          const isVal = col === "valor";
                          return (
                            <th
                              key={col}
                              className={`py-2 px-3 font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap ${
                                isMetric || isUnit
                                  ? "bg-[#e8f1ff] text-[#024ad8] border-x border-[#024ad8]/20"
                                  : isVal
                                  ? "text-right"
                                  : "text-[#3d3d3d]"
                              }`}
                            >
                              {isMetric ? "⭐ metrica_preview" : isUnit ? "⭐ unidad_preview" : col}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e8e8] bg-white">
                      {previewData.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#f7f7f7] transition-colors">
                          <td className="py-1.5 px-3 text-[10px] text-center text-[#9e9e9e] font-mono">
                            {idx + 1}
                          </td>
                          {previewData.columns.map((col) => {
                            const val = row[col];
                            const isMetric = col === "metrica_preview";
                            const isUnit = col === "unidad_preview";
                            const isVal = col === "valor";
                            const isDate = col === "fecha";

                            if (isMetric) {
                              return (
                                <td key={col} className="py-1.5 px-3 bg-[#f5f8ff] border-x border-[#024ad8]/15 whitespace-nowrap">
                                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-[#024ad8]/10 text-[#024ad8]">
                                    {val || "-"}
                                  </span>
                                </td>
                              );
                            }
                            if (isUnit) {
                              return (
                                <td key={col} className="py-1.5 px-3 bg-[#f5f8ff] border-x border-[#024ad8]/15 whitespace-nowrap">
                                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#1a1a1a]/5 text-[#1a1a1a]">
                                    {val || "-"}
                                  </span>
                                </td>
                              );
                            }
                            if (isDate) {
                              return (
                                <td key={col} className="py-1.5 px-3 font-mono text-[11px] text-[#4d4d4d] whitespace-nowrap">
                                  {val || "-"}
                                </td>
                              );
                            }
                            if (isVal) {
                              return (
                                <td key={col} className="py-1.5 px-3 font-mono font-semibold text-right text-[#1a1a1a] whitespace-nowrap">
                                  {val !== null && val !== undefined ? Number(val).toLocaleString() : "-"}
                                </td>
                              );
                            }
                            return (
                              <td key={col} className="py-1.5 px-3 text-[#3d3d3d] whitespace-nowrap max-w-xs truncate" title={String(val || "")}>
                                {val || "-"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-[#f7f7f7] px-3 py-2 border-t border-[#e8e8e8] text-[11px] text-[#636363] flex items-center justify-between">
                  <span>Mostrando {previewData.rows.length} filas simuladas.</span>
                  <span>Columna local <code>file</code> excluida para PostgreSQL.</span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#636363] border border-dashed border-[#c2c2c2] rounded-[6px]">
                Seleccione un reporte con archivo SQLite válido para generar la vista previa.
              </div>
            )}
          </div>

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: PREVISUALIZAR CÓDIGO (.SQL & .PY)
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="hp-card p-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e8e8e8]">
                <span className="text-xs font-bold uppercase text-[#1a1a1a]">Script SQL DDL (CREATE TABLE)</span>
                <Badge variant="primary">PostgreSQL DDL</Badge>
              </div>
              <div className="h-96 rounded-[4px] overflow-hidden border border-[#e8e8e8]">
                <Editor
                  height="100%"
                  language="sql"
                  value={sqlCode}
                  onChange={(v) => setSqlCode(v || "")}
                  options={{ minimap: { enabled: false }, fontSize: 12 }}
                  theme="light"
                />
              </div>
            </div>

            <div className="hp-card p-4">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e8e8e8]">
                <span className="text-xs font-bold uppercase text-[#024ad8]">Robot Python (M_...py)</span>
                <div className="flex items-center gap-2">
                  <button onClick={handleSave} className="hp-btn hp-btn-primary text-xs h-7 px-3">
                    <Save className="w-3 h-3" />
                    <span>Guardar en V2</span>
                  </button>
                  <Badge variant="ink">Orquestador</Badge>
                </div>
              </div>
              <div className="h-96 rounded-[4px] overflow-hidden border border-[#024ad8]/20">
                <Editor
                  height="100%"
                  language="python"
                  value={pyCode}
                  onChange={(v) => setPyCode(v || "")}
                  options={{ minimap: { enabled: false }, fontSize: 12 }}
                  theme="light"
                />
              </div>
            </div>
          </div>


          {/* VISTA PREVIA DE LA TABLA EN TAB 2 */}
          {previewData?.rows?.length > 0 && (
            <div className="hp-card p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#e8e8e8]">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-[#024ad8]" />
                  <span className="text-xs font-bold uppercase text-[#1a1a1a]">Vista Previa de Filas y Clasificación de Hechos</span>
                  <Badge variant="primary">{previewData.rows.length} filas simuladas</Badge>
                </div>
                <button
                  onClick={() => fetchPreviewTable()}
                  disabled={loadingPreview}
                  className="hp-btn hp-btn-outline-ink text-xs h-6 px-2 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingPreview ? "animate-spin" : ""}`} />
                  <span>Recalcular</span>
                </button>
              </div>

              <div className="border border-[#e8e8e8] rounded-[4px] overflow-hidden max-h-60 overflow-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-[#f7f7f7] text-[#1a1a1a] sticky top-0 border-b border-[#e8e8e8] z-10 select-none shadow-xs">
                    <tr>
                      <th className="py-1.5 px-2.5 font-semibold text-[#636363] text-[10px] uppercase w-8 text-center">#</th>
                      {previewData.columns.map((col) => (
                        <th key={col} className={`py-1.5 px-2.5 font-semibold text-[10px] uppercase whitespace-nowrap ${
                          col.includes("preview") ? "bg-[#e8f1ff] text-[#024ad8]" : col === "valor" ? "text-right" : "text-[#3d3d3d]"
                        }`}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8e8] bg-white">
                    {previewData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#f7f7f7]">
                        <td className="py-1 px-2.5 text-[10px] text-center text-[#9e9e9e] font-mono">{idx + 1}</td>
                        {previewData.columns.map((col) => {
                          const val = row[col];
                          if (col === "metrica_preview") {
                            return (
                              <td key={col} className="py-1 px-2.5 bg-[#f5f8ff] whitespace-nowrap">
                                <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#024ad8]/10 text-[#024ad8]">{val || "-"}</span>
                              </td>
                            );
                          }
                          if (col === "unidad_preview") {
                            return (
                              <td key={col} className="py-1 px-2.5 bg-[#f5f8ff] whitespace-nowrap">
                                <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[#1a1a1a]/5 text-[#1a1a1a]">{val || "-"}</span>
                              </td>
                            );
                          }
                          if (col === "valor") {
                            return (
                              <td key={col} className="py-1 px-2.5 font-mono text-right font-semibold whitespace-nowrap">
                                {val !== null && val !== undefined ? Number(val).toLocaleString() : "-"}
                              </td>
                            );
                          }
                          return (
                            <td key={col} className="py-1 px-2.5 text-[#3d3d3d] whitespace-nowrap max-w-xs truncate" title={String(val || "")}>
                              {val || "-"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setActiveTab("config")} className="hp-btn hp-btn-outline-ink text-xs">
              Atrás a Configuración
            </button>
            <button onClick={() => setActiveTab("deploy")} className="hp-btn hp-btn-primary text-xs">
              Continuar a Despliegue <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: GUARDAR & DESPLEGAR AL SERVIDOR
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "deploy" && (
        <div className="space-y-4">
          <div className="hp-card p-6 space-y-4">
            <h3 className="font-bold text-sm text-[#1a1a1a]">
              Guardado y Despliegue de Migración: <span className="font-mono text-[#024ad8]">{selectedReport}</span>
            </h3>
            <p className="text-xs text-[#636363]">
              Transfiere el robot Python y el DDL SQL vía SFTP hacia <code>/home/datax-pds/...</code> y genera el DAG correspondiente en Airflow Docker.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="text-xs font-semibold text-[#1a1a1a] block mb-1">Host:</label>
                <input
                  type="text"
                  value={sshHost}
                  onChange={(e) => setSshHost(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#1a1a1a] block mb-1">Puerto:</label>
                <input
                  type="number"
                  value={sshPort}
                  onChange={(e) => setSshPort(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#1a1a1a] block mb-1">Usuario:</label>
                <input
                  type="text"
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#1a1a1a] block mb-1">Contraseña:</label>
                <input
                  type="password"
                  value={sshPass}
                  onChange={(e) => setSshPass(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] outline-none"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-[#e8e8e8]">
              <button onClick={handleSave} className="hp-btn hp-btn-outline-ink text-xs">
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Archivos Locales en V2</span>
              </button>

              <button
                onClick={handleDeploy}
                disabled={loading || !sshPass}
                className="hp-btn hp-btn-primary text-xs"
              >
                <Server className="w-3.5 h-3.5" />
                <span>{loading ? "Desplegando en Servidor..." : "Subir al Servidor y Crear DAG"}</span>
              </button>
            </div>
          
            {deployResult && (
              <div
                className={`p-4 rounded-[6px] border text-xs space-y-1.5 ${
                  deployResult.success
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                    : "bg-red-50 border-red-300 text-red-900"
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {deployResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  )}
                  <span>
                    {deployResult.success
                      ? `¡Despliegue de ${selectedParent.replace("C_", "M_")} exitoso en el servidor remoto!`
                      : "Ocurrieron errores durante el despliegue."}
                  </span>
                </div>
              </div>
            )}

          </div>

          {/* Card 2: SUB-SECCIÓN DISPARO REMOTO EN AIRFLOW PARA MIGRACIÓN */}
          <div className="hp-card p-6 space-y-4 border-2 border-[#024ad8]/20 bg-linear-to-b from-white to-[#f7f9fe]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e8e8e8] pb-3">
              <div>
                <h4 className="font-bold text-sm text-[#024ad8] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>Probar Ejecución del DAG de Migración en Airflow (Trigger Remoto)</span>
                </h4>
                <p className="text-xs text-[#636363] mt-0.5">
                  Ejecuta el comando <code>airflow dags trigger {selectedParent.replace("C_", "M_")}</code> dentro del contenedor worker de Airflow para persistir datos a PostgreSQL.
                </p>
              </div>

              <button
                onClick={() => loadLatestConversionInfo(selectedReport)}
                className="hp-btn hp-btn-outline-ink text-xs h-7 px-2.5 flex items-center gap-1.5"
                title="Consultar última conversión registrada en platform_db"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Recargar Conversión</span>
              </button>
            </div>

            {/* Banner de última conversión detectada */}
            {latestConvInfo && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-[6px] text-xs text-blue-900 space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <span>🎯 Última Conversión detectada en BD:</span>
                  <Badge variant="primary">ID #{latestConvInfo.id_conversion}</Badge>
                  {latestConvInfo.converted_to && (
                    <span className="text-blue-700">Corte: <strong>{latestConvInfo.converted_to}</strong></span>
                  )}
                </div>
                {latestConvInfo.conversion_path && (
                  <p className="font-mono text-[11px] text-slate-700 truncate" title={latestConvInfo.conversion_path}>
                    SQLite Remoto: {latestConvInfo.conversion_path}
                  </p>
                )}
              </div>
            )}

            {/* Inputs de configuración para trigger */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-3.5 rounded-[6px] border border-[#e8e8e8]">
              <div>
                <label className="text-xs font-semibold text-[#1a1a1a] block mb-1">
                  Código de Reporte (--conf 'code'):
                </label>
                <input
                  type="text"
                  value={trigMigCode}
                  onChange={(e) => setTrigMigCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#1a1a1a] block mb-1">
                  ID de Conversión (--conf 'id_conversion'):
                </label>
                <input
                  type="number"
                  value={trigMigId}
                  onChange={(e) => setTrigMigId(parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#1a1a1a] block mb-1">
                  Ruta de SQLite (--conf 'conversion_path'):
                </label>
                <input
                  type="text"
                  value={trigMigPath}
                  onChange={(e) => setTrigMigPath(e.target.value)}
                  placeholder="/mnt/datos1/data_process/..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
                />
              </div>
            </div>

            {/* Botón Disparar DAG */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleTriggerMigrationDag}
                disabled={triggeringMigDag || !sshPass}
                className="hp-btn hp-btn-primary text-xs h-10 px-6 font-bold shadow-md bg-linear-to-r from-[#024ad8] to-[#1d5ce6]"
              >
                {triggeringMigDag ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                )}
                <span>
                  {triggeringMigDag
                    ? "Disparando DAG en Airflow..."
                    : `⚡ Disparar DAG ${selectedParent.replace("C_", "M_")} en Airflow`}
                </span>
              </button>
            </div>

            {/* Resultado de Airflow Trigger */}
            {triggerMigResult && (
              <div className="space-y-2 pt-2">
                <div
                  className={`p-3 rounded-[6px] border text-xs font-bold flex items-center gap-2 ${
                    triggerMigResult.success
                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                      : "bg-amber-50 border-amber-300 text-amber-900"
                  }`}
                >
                  {triggerMigResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  <span>
                    {triggerMigResult.success
                      ? `¡DAG de migración ${selectedParent.replace("C_", "M_")} disparado exitosamente en Airflow!`
                      : "El comando de disparo terminó con advertencias o error."}
                  </span>
                </div>

                {triggerMigResult.output && (
                  <div className="bg-[#1a1a1a] text-emerald-400 p-3 rounded-[4px] text-xs font-mono max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{triggerMigResult.output}</pre>
                  </div>
                )}
              </div>
            )}
          </div>


          <TerminalLogs logs={[...externalLogs, ...localLogs]} title="Migration Deploy & Execution Console" />
        </div>
      )}
    </div>
  );
}
