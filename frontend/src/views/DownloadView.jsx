import React, { useState, useEffect } from "react";
import {
  Download,
  Play,
  Server,
  Code,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Calendar,
  ArrowRight,
  Database,
  CheckCircle2,
  GitPullRequest,
  Upload,
  Save,
  Copy,
  FileText,
  ExternalLink,
  Search,
  Loader2,
  Package,
  Zap,
  Clock,
  Folder,
  Edit3,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { api } from "../services/api";
import { Badge } from "../components/ui/Badge";
import { TerminalLogs } from "../components/ui/TerminalLogs";
import { Toast } from "../components/ui/Toast";

export function DownloadView({ externalLogs = [] }) {
  const [flowMode, setFlowMode] = useState("v2"); // Default to V2 as requested, options: "v1", "v2"
  const [v2SelectMode, setV2SelectMode] = useState("dropdown"); // "dropdown" or "manual"
  const [robots, setRobots] = useState([]);
  const [selectedCode, setSelectedCode] = useState("D_BO_000000271");
  const [manualCode, setManualCode] = useState("D_BO_000000271");
  const [detail, setDetail] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState("code"); // "code", "test", "deploy"
  const [loading, setLoading] = useState(false);
  const [localLogs, setLocalLogs] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);
  const [canForceDag, setCanForceDag] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);

  // V2 Code Source
  const [codeSource, setCodeSource] = useState("local"); // "local", "github", "upload", "manual"
  const [editorCode, setEditorCode] = useState("");
  const [savingCode, setSavingCode] = useState(false);

  // GitHub PRs state
  const [githubPrs, setGithubPrs] = useState([]);
  const [prSearchQuery, setPrSearchQuery] = useState("");
  const [selectedPr, setSelectedPr] = useState(null);
  const [prFiles, setPrFiles] = useState([]);
  const [selectedPrFile, setSelectedPrFile] = useState("");
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [downloadingPrFile, setDownloadingPrFile] = useState(false);
  const [toast, setToast] = useState(null);

  // Options
  const [skipTest, setSkipTest] = useState(false);
  const [generateDag, setGenerateDag] = useState(true);
  const [testDate, setTestDate] = useState("2024-01-01");
  const [dbDateInput, setDbDateInput] = useState("2024-01-01");

  // SSH Deploy
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState("");
  const [sshPass, setSshPass] = useState("");
  const [generateDagServer, setGenerateDagServer] = useState(true);
  const [triggerDagServer, setTriggerDagServer] = useState(false);
  const [testingSsh, setTestingSsh] = useState(false);

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
        console.error("Error al cargar credenciales de .env en DownloadView:", e);
      }
    };
    fetchSshConfigFromEnv();
  }, []);

  useEffect(() => {
    loadRobots();
  }, [flowMode]);

  const loadRobots = async () => {
    setLoading(true);
    try {
      const endpoint = flowMode === "v1" ? "/download/v1-robots" : "/download/v2-robots";
      const res = await api.get(endpoint);
      const list = res.data.robots || [];
      setRobots(list);
      if (list.length > 0) {
        const initial = list.find((r) => r.code === "D_BO_000000271") ? "D_BO_000000271" : list[0].code;
        setSelectedCode(initial);
        setManualCode(initial);
        loadDetail(initial);
      } else {
        loadDetail(selectedCode);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (code) => {
    if (!code) return;
    try {
      const res = await api.get(`/download/robot/${code}`);
      setDetail(res.data);
      const initialCode = res.data.v2_code || res.data.refactored_code || res.data.v1_code || "";
      setEditorCode(initialCode);
      if (res.data.db_info?.updated_to) {
        const dt = String(res.data.db_info.updated_to);
        setTestDate(dt);
        setDbDateInput(dt);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectRobot = (code) => {
    setSelectedCode(code);
    setManualCode(code);
    loadDetail(code);
    setDiagnostics([]);
    setCanForceDag(false);
    setDeploySuccess(false);
  };

  const handleManualCodeSubmit = () => {
    const code = manualCode.trim();
    if (code) {
      setSelectedCode(code);
      loadDetail(code);
    }
  };

  // GitHub Integration
  const handleFetchGithubPrs = async () => {
    setLoadingPrs(true);
    setLocalLogs((prev) => [...prev, `[GitHub] Consultando PRs para ${selectedCode}...`]);
    try {
      const query = prSearchQuery || selectedCode;
      const res = await api.get(`/download/github/prs?search_query=${encodeURIComponent(query)}`);
      setGithubPrs(res.data.prs || []);
      setLocalLogs((prev) => [
        ...prev,
        `[GitHub] ${res.data.prs?.length || 0} PRs encontrados en ${res.data.repo}`,
      ]);
      if (res.data.prs?.length > 0) {
        handleSelectPr(res.data.prs[0]);
      }
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[GitHub Error] ${e.response?.data?.detail || e.message}`,
      ]);
    } finally {
      setLoadingPrs(false);
    }
  };

  const handleSelectPr = async (pr) => {
    setSelectedPr(pr);
    try {
      const res = await api.get(`/download/github/pr-files/${pr.number}`);
      const pyFiles = (res.data.files || []).filter((f) => f.is_py || f.filename.endsWith(".py"));
      setPrFiles(pyFiles);
      if (pyFiles.length > 0) {
        setSelectedPrFile(pyFiles[0].filename);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadPrFile = async () => {
    if (!selectedPr || !selectedPrFile) return;
    const fileObj = prFiles.find((f) => f.filename === selectedPrFile);
    if (!fileObj) return;

    setDownloadingPrFile(true);
    setLocalLogs((prev) => [
      ...prev,
      `[GitHub] Descargando ${selectedPrFile} del PR #${selectedPr.number}...`,
    ]);
    try {
      const res = await api.post("/download/github/download-file", {
        raw_url: fileObj.raw_url,
        contents_url: fileObj.contents_url,
        filename: fileObj.filename,
      });
      setEditorCode(res.data.content || "");
      setLocalLogs((prev) => [
        ...prev,
        `[GitHub] Código cargado exitosamente en el editor Monaco.`,
      ]);
      setToast({
        type: "success",
        title: "Código Cargado al Editor",
        message: `El archivo '${selectedPrFile}' fue descargado y cargado en el editor Monaco.`,
      });
    } catch (e) {
      const errMsg = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [
        ...prev,
        `[GitHub Error] ${errMsg}`,
      ]);
      setToast({
        type: "error",
        title: "Error al Cargar Archivo",
        message: errMsg || "Error descargando archivo de GitHub.",
      });
    } finally {
      setDownloadingPrFile(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          setEditorCode(text);
          setLocalLogs((prev) => [
            ...prev,
            `[Local] Archivo ${file.name} cargado al editor.`,
          ]);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleSaveCode = async () => {
    if (!editorCode.trim()) return;
    setSavingCode(true);
    try {
      const res = await api.post("/download/save-code", {
        code: selectedCode,
        code_content: editorCode,
      });
      setLocalLogs((prev) => [...prev, `[GUARDADO] ${res.data.message}`]);
      loadDetail(selectedCode);
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[ERROR] Falló al guardar: ${e.response?.data?.detail || e.message}`,
      ]);
    } finally {
      setSavingCode(false);
    }
  };

  const handleMigrate = async () => {
    setLoading(true);
    setDiagnostics([]);
    setCanForceDag(false);
    setLocalLogs((prev) => [...prev, `[INIT] Iniciando migración de ${selectedCode}...`]);
    try {
      const res = await api.post("/download/migrate", {
        code: selectedCode,
        skip_test: skipTest,
        skip_dag: !generateDag,
        test_updated_to: testDate,
      }, { timeout: 300000 });
      if (res.data.logs) {
        setLocalLogs((prev) => [...prev, ...res.data.logs]);
      }
      if (res.data.diagnostics) {
        setDiagnostics(res.data.diagnostics);
      }
      if (res.data.can_force_dag) {
        setCanForceDag(true);
      }
      loadDetail(selectedCode);
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[ERROR] Falló migración: ${e.response?.data?.detail || e.message}`,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleTestV2 = async () => {
    setLoading(true);
    setLocalLogs((prev) => [
      ...prev,
      `[TEST V2] Ejecutando suite de pruebas unitarias sobre ${selectedCode}...`,
    ]);
    try {
      const res = await api.post("/download/test-v2", {
        code: selectedCode,
        test_updated_to: testDate,
      }, { timeout: 300000 });
      if (res.data.logs) {
        setLocalLogs((prev) => [...prev, ...res.data.logs]);
      }
      if (res.data.success) {
        setLocalLogs((prev) => [
          ...prev,
          `[TEST OK] Suite de pruebas completada con éxito.`,
        ]);
      } else {
        setLocalLogs((prev) => [
          ...prev,
          `[TEST ADVERTENCIA] Hubo observaciones en la prueba.`,
        ]);
      }
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[ERROR TEST] ${e.response?.data?.detail || e.message}`,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleForceDag = async () => {
    try {
      const res = await api.post("/download/force-dag", { code: selectedCode });
      setLocalLogs((prev) => [...prev, `[DAG] ${res.data.message}`]);
      loadDetail(selectedCode);
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[ERROR] Error generando DAG: ${e.message}`,
      ]);
    }
  };

  const handleUpdateDbDate = async () => {
    try {
      const res = await api.post("/download/update-db-date", {
        code: selectedCode,
        new_date: dbDateInput,
      });
      setLocalLogs((prev) => [...prev, `[DB] ${res.data.message}`]);
      loadDetail(selectedCode);
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[DB ERROR] Error actualizando fecha: ${e.message}`,
      ]);
    }
  };

  const handleDeploy = async () => {
    setLoading(true);
    setDeploySuccess(false);
    setLocalLogs((prev) => [
      ...prev,
      `[DEPLOY] Subiendo ${selectedCode} al servidor ${sshHost}:${sshPort}...`,
    ]);
    try {
      const res = await api.post("/download/deploy", {
        code: selectedCode,
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
        generate_dag_server: generateDagServer,
        trigger_dag: triggerDagServer,
      });
      if (res.data.logs) {
        setLocalLogs((prev) => [...prev, ...res.data.logs]);
      }
      if (res.data.success) {
        setDeploySuccess(true);
        setLocalLogs((prev) => [
          ...prev,
          `[DEPLOY OK] ${selectedCode} desplegado exitosamente en el servidor.`,
        ]);
      } else {
        setLocalLogs((prev) => [
          ...prev,
          `[DEPLOY ERROR] Hubo un error en el despliegue. Revisa los logs.`,
        ]);
      }
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[DEPLOY ERROR] ${e.response?.data?.detail || e.message}`,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleTestSsh = async () => {
    setTestingSsh(true);
    setLocalLogs((prev) => [
      ...prev,
      `[SSH TEST] Probando conexión con ${sshUser}@${sshHost}:${sshPort}...`,
    ]);
    try {
      const res = await api.post("/config/test-ssh", {
        host: sshHost,
        port: parseInt(sshPort) || 22,
        user: sshUser,
        password: sshPass,
      });
      if (res.data?.success) {
        setToast({
          type: "success",
          title: "Conexión SSH Exitosa",
          message: res.data.message || `Conectado correctamente a ${sshHost}:${sshPort}`,
        });
        setLocalLogs((prev) => [
          ...prev,
          `[SSH TEST OK] ${res.data.message || "Conexión exitosa"}`,
        ]);
      } else {
        setToast({
          type: "error",
          title: "Fallo de Conexión SSH",
          message: res.data.message || "No se pudo conectar al servidor SSH.",
        });
        setLocalLogs((prev) => [
          ...prev,
          `[SSH TEST ERROR] ${res.data.message || "Fallo de conexión"}`,
        ]);
      }
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setToast({
        type: "error",
        title: "Error SSH",
        message: err,
      });
      setLocalLogs((prev) => [...prev, `[SSH TEST ERROR] ${err}`]);
    } finally {
      setTestingSsh(false);
    }
  };

  const handleCopyCode = () => {
    if (editorCode) {
      navigator.clipboard.writeText(editorCode);
      setLocalLogs((prev) => [
        ...prev,
        `[Portapapeles] Código de ${selectedCode} copiado.`,
      ]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Band */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#e8e8e8]">
        <div>
          <div className="flex items-center gap-2">
            <span className="hp-chevron" />
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">
              Robots de Descarga (D_...)
            </h1>
          </div>
          <p className="text-xs text-[#636363] mt-1">
            Estandarización V1 → V2 o Validación, Pruebas y Despliegue de robots nuevos desarrollados en V2
          </p>
        </div>

        {/* Flow Mode Switch */}
        <div className="inline-flex p-1 bg-[#f7f7f7] rounded-[4px] border border-[#e8e8e8]">
          <button
            onClick={() => {
              setFlowMode("v1");
              setActiveSubTab("code");
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-all flex items-center gap-1.5 ${
              flowMode === "v1"
                ? "bg-[#1a1a1a] text-white shadow-xs"
                : "text-[#636363] hover:text-[#1a1a1a]"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Migrar desde V1 (Legado)</span>
          </button>
          <button
            onClick={() => {
              setFlowMode("v2");
              setActiveSubTab("code");
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-all flex items-center gap-1.5 ${
              flowMode === "v2"
                ? "bg-[#1a1a1a] text-white shadow-xs"
                : "text-[#636363] hover:text-[#1a1a1a]"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Código V2 Existente / Nuevo</span>
          </button>
        </div>
      </div>

      {/* Robot Selection & Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-1 hp-card p-4 space-y-2">
          {flowMode === "v1" ? (
            <>
              <label className="text-xs font-bold text-[#1a1a1a] uppercase block">
                Robot V1 a Migrar ({robots.length}):
              </label>
              <select
                value={selectedCode}
                onChange={(e) => handleSelectRobot(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none focus:border-[#024ad8]"
              >
                {robots.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} {r.already_migrated ? " [Migrado]" : ""}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1a1a1a] uppercase block">
                  Robot V2:
                </label>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    onClick={() => setV2SelectMode("dropdown")}
                    className={`px-1.5 py-0.5 rounded ${
                      v2SelectMode === "dropdown"
                        ? "bg-[#1a1a1a] text-white font-bold"
                        : "text-[#636363] hover:text-[#1a1a1a]"
                    }`}
                  >
                    Lista
                  </button>
                  <button
                    onClick={() => setV2SelectMode("manual")}
                    className={`px-1.5 py-0.5 rounded ${
                      v2SelectMode === "manual"
                        ? "bg-[#1a1a1a] text-white font-bold"
                        : "text-[#636363] hover:text-[#1a1a1a]"
                    }`}
                  >
                    Manual
                  </button>
                </div>
              </div>

              {v2SelectMode === "dropdown" ? (
                <select
                  value={selectedCode}
                  onChange={(e) => handleSelectRobot(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none focus:border-[#024ad8]"
                >
                  {robots.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="D_BO_000000271"
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
                  />
                  <button
                    onClick={handleManualCodeSubmit}
                    className="px-2.5 py-1.5 text-xs bg-[#024ad8] text-white rounded-[4px] hover:bg-[#023eb5]"
                  >
                    OK
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="hp-card p-4 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-[#636363] uppercase">
            Estado en Repo V2
          </span>
          <div className="mt-1 flex items-center gap-2">
            {detail?.already_migrated ? (
              <Badge variant="success" className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> MIGRADO
              </Badge>
            ) : (
              <Badge variant="warning" className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> PENDIENTE
              </Badge>
            )}
            {detail?.has_dag && <Badge variant="primary">DAG ACTIVO</Badge>}
          </div>
        </div>

        <div className="hp-card p-4 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-[#636363] uppercase">
            Tipo de Descarga
          </span>
          <div className="mt-1 font-bold text-sm text-[#1a1a1a]">
            {detail?.db_info?.download_type || "No especificado"}
          </div>
        </div>

        <div className="hp-card p-4 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-[#636363] uppercase">
            Última Descarga (BD)
          </span>
          <div className="mt-1 font-mono text-xs text-[#024ad8] font-bold">
            {String(detail?.db_info?.updated_to || "-")}
          </div>
        </div>
      </div>

      {detail?.db_info?.name && (
        <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-[8px] p-3 text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#1a1a1a]">{detail.db_info.name}</span>
            <span className="text-[#636363]">·</span>
            <a
              href={detail.db_info.main_url}
              target="_blank"
              rel="noreferrer"
              className="text-[#024ad8] hover:underline flex items-center gap-1"
            >
              <span>{detail.db_info.main_url}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <Badge variant="outline">
            Schedule: {detail.db_info.schedule_interval || "@daily"}
          </Badge>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="border-b border-[#e8e8e8] flex items-center gap-6">
        <button
          onClick={() => setActiveSubTab("code")}
          className={`pb-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
            activeSubTab === "code"
              ? "text-[#024ad8] border-b-2 border-[#024ad8]"
              : "text-[#636363] hover:text-[#1a1a1a]"
          }`}
        >
          <Code className="w-4 h-4" />
          <span>
            {flowMode === "v1"
              ? "1. Comparativa de Código (V1 vs V2)"
              : "1. Gestión de Código del Robot (V2)"}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("test")}
          className={`pb-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
            activeSubTab === "test"
              ? "text-[#024ad8] border-b-2 border-[#024ad8]"
              : "text-[#636363] hover:text-[#1a1a1a]"
          }`}
        >
          <Play className="w-4 h-4" />
          <span>
            {flowMode === "v1"
              ? "2. Ejecutar Migración & Pruebas"
              : "2. Pruebas Unitarias & DAG"}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("deploy")}
          className={`pb-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
            activeSubTab === "deploy"
              ? "text-[#024ad8] border-b-2 border-[#024ad8]"
              : "text-[#636363] hover:text-[#1a1a1a]"
          }`}
        >
          <Server className="w-4 h-4" />
          <span>3. Despliegue Remoto SFTP / Docker</span>
        </button>
      </div>

      {/* SUBTAB 1: CÓDIGO */}
      {activeSubTab === "code" && (
        <>
          {flowMode === "v1" ? (
            /* Flujo V1: Comparativa Side-by-Side */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="hp-card p-4">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e8e8e8]">
                  <span className="text-xs font-bold uppercase text-[#636363]">
                    Código Original (V1 Legado)
                  </span>
                  <Badge variant="outline">V1 Legado</Badge>
                </div>
                <div className="h-[480px] rounded-[4px] overflow-hidden border border-[#e8e8e8]">
                  <Editor
                    height="100%"
                    language="python"
                    value={detail?.v1_code || "# Sin código V1 disponible"}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                    }}
                    theme="light"
                  />
                </div>
              </div>

              <div className="hp-card p-4">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e8e8e8]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase text-[#024ad8]">
                      {detail?.already_migrated
                        ? "Código Estandarizado (V2 Guardado)"
                        : "Código Refactorizado Sugerido (V2)"}
                    </span>
                    <Badge variant="primary">V2 Estandarizado</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyCode}
                      className="px-2.5 py-1 text-xs border border-[#c2c2c2] rounded-[4px] hover:bg-slate-50 flex items-center gap-1.5 text-[#1a1a1a]"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar</span>
                    </button>
                    <button
                      onClick={handleSaveCode}
                      disabled={savingCode}
                      className="hp-btn hp-btn-primary text-xs px-3 py-1 flex items-center gap-1.5"
                      title="Guardar este código directamente en models/download/<codigo>/<codigo>.py en V2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingCode ? "Guardando..." : "Guardar en Repo V2"}</span>
                    </button>
                  </div>
                </div>
                <div className="h-[480px] rounded-[4px] overflow-hidden border border-[#024ad8]/20">
                  <Editor
                    height="100%"
                    language="python"
                    value={editorCode || detail?.refactored_code || "# Generando código..."}
                    onChange={(val) => setEditorCode(val || "")}
                    options={{
                      readOnly: false,
                      minimap: { enabled: false },
                      fontSize: 12,
                    }}
                    theme="light"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Flujo V2: Entorno Completo con Selector de Origen (Local, GitHub PR, Archivo, Directo) */
            <div className="space-y-4">
              <div className="hp-card p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e8] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase text-[#1a1a1a]">
                      Origen del Código para {selectedCode}:
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {[
                      { id: "local", label: "Archivo Local V2", icon: Folder },
                      { id: "github", label: "GitHub Pull Request", icon: GitPullRequest },
                      { id: "upload", label: "Subir Archivo .py", icon: Upload },
                      { id: "manual", label: "Editor Libre", icon: Edit3 },
                    ].map((src) => {
                      const IconComp = src.icon;
                      return (
                        <button
                          key={src.id}
                          onClick={() => setCodeSource(src.id)}
                          className={`px-3 py-1 rounded-[4px] font-semibold transition-all flex items-center gap-1.5 ${
                            codeSource === src.id
                              ? "bg-[#024ad8] text-white shadow-xs"
                              : "bg-slate-100 text-[#636363] hover:bg-slate-200"
                          }`}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                          <span>{src.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-panel GitHub PR */}
                {codeSource === "github" && (
                  <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-[6px] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#024ad8]">
                        <GitPullRequest className="w-4 h-4" />
                        <span>Cargar desde Pull Request de GitHub (Pasantes)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Buscar por código..."
                          value={prSearchQuery}
                          onChange={(e) => setPrSearchQuery(e.target.value)}
                          className="px-2.5 py-1 text-xs border border-blue-200 rounded-[4px] bg-white outline-none focus:border-[#024ad8]"
                        />
                        <button
                          onClick={handleFetchGithubPrs}
                          disabled={loadingPrs}
                          className="px-3 py-1 text-xs bg-[#024ad8] text-white font-semibold rounded-[4px] hover:bg-[#023eb5]"
                        >
                          {loadingPrs ? "Buscando..." : "Buscar PRs"}
                        </button>
                      </div>
                    </div>

                    {githubPrs.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="text-[11px] font-bold text-[#1a1a1a] block mb-1">
                            Seleccionar Pull Request:
                          </label>
                          <select
                            value={selectedPr?.number || ""}
                            onChange={(e) => {
                              const found = githubPrs.find(
                                (p) => p.number === parseInt(e.target.value)
                              );
                              if (found) handleSelectPr(found);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-blue-200 rounded-[4px] bg-white outline-none"
                          >
                            {githubPrs.map((p) => (
                              <option key={p.number} value={p.number}>
                                #{p.number}: {p.title} (@{p.author})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#1a1a1a] block mb-1">
                            Archivo Python (.py) en el PR:
                          </label>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedPrFile}
                              onChange={(e) => setSelectedPrFile(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-blue-200 rounded-[4px] bg-white outline-none"
                            >
                              {prFiles.map((f) => (
                                <option key={f.filename} value={f.filename}>
                                  {f.filename}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleDownloadPrFile}
                              disabled={downloadingPrFile || !selectedPrFile}
                              className="px-3 py-1.5 text-xs bg-[#1a1a1a] text-white font-semibold rounded-[4px] hover:bg-black whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {downloadingPrFile && <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />}
                              <span>{downloadingPrFile ? "Cargando al editor..." : "Cargar al Editor"}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-blue-900/70 italic py-1">
                        Presiona "Buscar PRs" para consultar los PRs abiertos en el repositorio oficial.
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-panel Upload */}
                {codeSource === "upload" && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-[6px] flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#1a1a1a] block">
                        Subir archivo de código (.py):
                      </span>
                      <span className="text-[11px] text-[#636363]">
                        Carga directamente el script descargado desde GitHub o entregado por el desarrollador.
                      </span>
                    </div>
                    <label className="px-3 py-1.5 text-xs bg-[#1a1a1a] text-white font-semibold rounded-[4px] cursor-pointer hover:bg-black flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Examinar Archivo</span>
                      <input
                        type="file"
                        accept=".py"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {/* Monaco Editor Full Width */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-[#024ad8]">
                      Editor Monaco ({selectedCode}.py)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyCode}
                        className="px-2.5 py-1 text-xs border border-[#c2c2c2] rounded-[4px] hover:bg-slate-50 flex items-center gap-1.5 text-[#1a1a1a]"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copiar</span>
                      </button>
                      <button
                        onClick={handleSaveCode}
                        disabled={savingCode}
                        className="hp-btn hp-btn-primary text-xs px-3 py-1 flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingCode ? "Guardando..." : "Guardar en Repo V2"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="h-[480px] rounded-[4px] overflow-hidden border border-[#e8e8e8]">
                    <Editor
                      height="100%"
                      language="python"
                      value={editorCode || `# models/download/${selectedCode}/${selectedCode}.py`}
                      onChange={(val) => setEditorCode(val || "")}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        fontFamily: "JetBrains Mono, Menlo, monospace",
                      }}
                      theme="light"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* SUBTAB 2: PRUEBAS & MIGRACIÓN */}
      {activeSubTab === "test" && (
        <div className="space-y-4">
          <div className="hp-card p-6 space-y-6">
            <h3 className="font-bold text-sm text-[#1a1a1a]">
              {flowMode === "v1"
                ? "Opciones de Ejecución de Migración (V1 → V2)"
                : `Pruebas Unitarias & Generación de DAG para ${selectedCode}`}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {flowMode === "v1" && (
                <>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="chk_skip_test"
                      checked={skipTest}
                      onChange={(e) => setSkipTest(e.target.checked)}
                      className="rounded-[3px] accent-[#024ad8] w-4 h-4"
                    />
                    <label htmlFor="chk_skip_test" className="text-xs text-[#1a1a1a] font-medium">
                      Omitir test unitario (migrar solo archivos y DAG)
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="chk_gen_dag"
                      checked={generateDag}
                      onChange={(e) => setGenerateDag(e.target.checked)}
                      className="rounded-[3px] accent-[#024ad8] w-4 h-4"
                    />
                    <label htmlFor="chk_gen_dag" className="text-xs text-[#1a1a1a] font-medium">
                      Generar automáticamente el DAG en dags/download
                    </label>
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
                  Fecha de corte para prueba (updated_to):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
                  />
                  <button
                    onClick={() => setTestDate("2024-01-01")}
                    className="px-2 py-1 text-[10px] bg-[#f7f7f7] border border-[#e8e8e8] rounded-[3px] hover:bg-white"
                  >
                    2024
                  </button>
                  <button
                    onClick={() => setTestDate("2020-01-01")}
                    className="px-2 py-1 text-[10px] bg-[#f7f7f7] border border-[#e8e8e8] rounded-[3px] hover:bg-white"
                  >
                    Histórico
                  </button>
                </div>
              </div>
            </div>

            {/* Inline DB Manager */}
            <div className="bg-slate-50 border border-[#e8e8e8] rounded-[6px] p-4 text-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#024ad8]" />
                <span className="font-bold text-[#1a1a1a]">
                  Gestión `updated_to` en Base de Datos para {selectedCode}:
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={dbDateInput}
                  onChange={(e) => setDbDateInput(e.target.value)}
                  className="px-2.5 py-1 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none"
                  placeholder="YYYY-MM-DD o NULL"
                />
                <button
                  onClick={handleUpdateDbDate}
                  className="hp-btn hp-btn-outline-ink text-xs h-7.5 px-3"
                >
                  Actualizar en BD
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-[#e8e8e8] flex items-center justify-between">
              <button
                onClick={handleForceDag}
                className="hp-btn hp-btn-outline-ink text-xs flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Generar / Forzar DAG de Airflow</span>
              </button>

              {flowMode === "v1" ? (
                <button
                  onClick={handleMigrate}
                  disabled={loading}
                  className="hp-btn hp-btn-primary text-xs flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{loading ? "Migrando..." : "Ejecutar Migración Completa"}</span>
                </button>
              ) : (
                <button
                  onClick={handleTestV2}
                  disabled={loading}
                  className="hp-btn hp-btn-primary text-xs flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>{loading ? "Ejecutando Test..." : "Ejecutar Prueba Unitaria V2"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: DESPLIEGUE SFTP / DOCKER */}
      {activeSubTab === "deploy" && (
        <div className="hp-card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-4">
            <div>
              <h3 className="font-bold text-sm text-[#1a1a1a]">
                Despliegue Remoto al Servidor ({selectedCode})
              </h3>
              <p className="text-xs text-[#636363] mt-0.5">
                Transfiere por SFTP a <code>models/download/{selectedCode}</code> y ejecuta <code>main-generate.py</code> en el contenedor Airflow
              </p>
            </div>
            {deploySuccess && (
              <Badge variant="success" className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> DESPLEGADO EXITOSAMENTE
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
                Servidor Host SSH:
              </label>
              <input
                type="text"
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="Desde .env..."
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
                Puerto SSH:
              </label>
              <input
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
                Usuario SSH:
              </label>
              <input
                type="text"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                placeholder="Desde .env..."
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
                Contraseña SSH:
              </label>
              <input
                type="password"
                value={sshPass}
                onChange={(e) => setSshPass(e.target.value)}
                placeholder="Contraseña configurada en .env"
                className="w-full px-2.5 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-[6px] space-y-3">
            <span className="text-xs font-bold text-[#1a1a1a] block">
              Opciones de Automatización Remota:
            </span>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-xs text-[#1a1a1a] cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateDagServer}
                  onChange={(e) => setGenerateDagServer(e.target.checked)}
                  className="rounded-[3px] accent-[#024ad8] w-4 h-4"
                />
                <span>Ejecutar generador de DAGs en Docker (<code>main-generate.py</code>)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-[#1a1a1a] cursor-pointer">
                <input
                  type="checkbox"
                  checked={triggerDagServer}
                  onChange={(e) => setTriggerDagServer(e.target.checked)}
                  className="rounded-[3px] accent-[#024ad8] w-4 h-4"
                />
                <span>Disparar DAG en Airflow al finalizar (<code>airflow dags trigger</code>)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleTestSsh}
              disabled={testingSsh || !sshHost}
              className="hp-btn hp-btn-outline-ink text-xs px-4 py-2 flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingSsh ? "animate-spin" : ""}`} />
              <span>{testingSsh ? "Verificando..." : "Probar Conexión SSH"}</span>
            </button>

            <button
              onClick={handleDeploy}
              disabled={loading}
              className="hp-btn hp-btn-primary text-xs px-6 py-2.5 flex items-center gap-2"
            >
              <Server className="w-4 h-4" />
              <span>{loading ? "Subiendo al Servidor..." : "Subir al Servidor & Generar DAG"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Terminal Logs Console */}
      <TerminalLogs logs={[...externalLogs, ...localLogs]} title="Download Process Output" />

      {/* Modern Toast Notification */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
