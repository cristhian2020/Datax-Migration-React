import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Play,
  FileSpreadsheet,
  Database,
  Table,
  Check,
  ArrowRight,
  ArrowLeft,
  Upload,
  Server,
  Search,
  Plus,
  Trash2,
  Save,
  GitPullRequest,
  FileCode,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Zap,
  Loader2,
  X,
  Folder,
  FolderGit2,
  FileText,
  ClipboardPaste,
  Edit3,
  AlertTriangle,
  Info,
  Sparkles,
  Download,
  Tag,
  Settings,
  Lightbulb,
  BarChart3,
  Pencil,
  Code2,
  Globe,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { api } from "../services/api";
import { Badge } from "../components/ui/Badge";
import { TerminalLogs } from "../components/ui/TerminalLogs";
import { Toast } from "../components/ui/Toast";

export function ConversionView({ externalLogs = [] }) {
  // Flow mode: "v1" (Migrar desde legado) or "v2" (Desarrollado en V2)
  const [convFlowMode, setConvFlowMode] = useState("v1");

  // Selection mode: "manual" (Ingresar código manualmente) or "scan" (Explorar familias escaneadas)
  const [selMode, setSelMode] = useState("manual");

  // Manual input values
  const [manualReportInput, setManualReportInput] = useState("D_BO_000000017_01");
  const [manualParentInput, setManualParentInput] = useState("C_BO_000000017");

  // Code source options: "github", "paste", "upload", "local"
  const [codeSourceMode, setCodeSourceMode] = useState("github");

  // GitHub PR states
  const [prSearchQuery, setPrSearchQuery] = useState("D_BO_000000017_01");
  const [prsList, setPrsList] = useState([]);
  const [selectedPrNumber, setSelectedPrNumber] = useState(null);
  const [prFiles, setPrFiles] = useState([]);
  const [selectedPrFile, setSelectedPrFile] = useState(null);
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [downloadingPrFilename, setDownloadingPrFilename] = useState(null);
  const [refactoringCode, setRefactoringCode] = useState(false);
  const [toast, setToast] = useState(null);

  // Families & Reports
  const [families, setFamilies] = useState([]);
  const [selectedParent, setSelectedParent] = useState("C_BO_000000017");
  const [familyDetail, setFamilyDetail] = useState(null);
  const [selectedSubReport, setSelectedSubReport] = useState("D_BO_000000017_01");
  const [reportDbInfo, setReportDbInfo] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [runningTestType, setRunningTestType] = useState(null);

  // Code editors
  const [v1Code, setV1Code] = useState("");
  const [v2Code, setV2Code] = useState("");
  const [isCodeModified, setIsCodeModified] = useState(false);

  // Stepper state: 1: Archivo y Código, 2: Pruebas, 3: Verificación SQL, 4: Plantilla SQLite, 5: Despliegue
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [localLogs, setLocalLogs] = useState([]);

  // Step 2 & 3 params
  const [sampleFile, setSampleFile] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [availableSamples, setAvailableSamples] = useState([]);

  // Step 3 SQLite and Replacements
  const [auditSubTab, setAuditSubTab] = useState("sqlite");
  const [sqliteData, setSqliteData] = useState(null);
  const [loadingSqlite, setLoadingSqlite] = useState(false);
  const [savingReplacements, setSavingReplacements] = useState(false);
  const [selectedReviewCols, setSelectedReviewCols] = useState([]);
  const [settingUpColumns, setSettingUpColumns] = useState(false);
  const [setupColumnsResult, setSetupColumnsResult] = useState(null);
  const [customColInput, setCustomColInput] = useState("");
  const [replacements, setReplacements] = useState([]);
  const [originalReplacements, setOriginalReplacements] = useState([]);
  const [replTableTarget, setReplTableTarget] = useState("");
  const [replSearch, setReplSearch] = useState("");
  const [newOrigVal, setNewOrigVal] = useState("");
  const [newFinalVal, setNewFinalVal] = useState("");

  // SSH Deploy
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState("");
  const [sshPass, setSshPass] = useState("");
  const [generateDagServer, setGenerateDagServer] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);
  const [trigCode, setTrigCode] = useState("");
  const [trigIdDl, setTrigIdDl] = useState(1);
  const [trigFile, setTrigFile] = useState("");
  const [latestDlInfo, setLatestDlInfo] = useState(null);
  const [triggeringDag, setTriggeringDag] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);

  useEffect(() => {
    if (selMode === "scan") {
      loadFamilies();
    } else {
      handleManualInspect(manualReportInput, manualParentInput);
    }
  }, [convFlowMode, selMode]);

  const loadFamilies = async () => {
    try {
      const endpoint = convFlowMode === "v1" ? "/conversion/v1-families" : "/conversion/v2-families";
      const res = await api.get(endpoint);
      const list = res.data.families || [];
      setFamilies(list);
      if (list.length > 0) {
        setSelectedParent(list[0].parent_code);
        loadFamily(list[0].parent_code);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadFamily = async (parentCode) => {
    try {
      const res = await api.get(`/conversion/family/${parentCode}`);
      setFamilyDetail(res.data);
      if (res.data.sub_reports?.length > 0) {
        const first = res.data.sub_reports[0].code;
        setSelectedSubReport(first);
        loadReportCode(first, parentCode);
      }
      if (res.data.samples?.length > 0) {
        setSampleFile(res.data.samples[0]);
        setAvailableSamples(res.data.samples);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadReportCode = async (code, parent) => {
    try {
      const res = await api.get(`/conversion/report-code/${code}?parent_code=${parent || selectedParent}`);
      setV1Code(res.data.v1_code || "");
      setV2Code(res.data.v2_code || res.data.refactored_code || "");
      setPrSearchQuery(code);
    } catch (e) {
      console.error(e);
    }
  };

  // Manual report inspection
  const handleManualInspect = async (repCode, parentCode) => {
    if (!repCode) return;
    try {
      const res = await api.post("/conversion/custom-family", {
        report_code: repCode,
        parent_code: parentCode,
      });
      setSelectedSubReport(repCode);
      setSelectedParent(res.data.parent_code);
      setReportDbInfo(res.data.db_info);
      setV1Code(res.data.v1_code || "");
      setV2Code(res.data.v2_code || res.data.refactored_code || "");
      if (res.data.samples?.length > 0) {
        setSampleFile(res.data.samples[0]);
        setAvailableSamples(res.data.samples);
      }
      setPrSearchQuery(repCode);
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualCodeChange = (e) => {
    const val = e.target.value.trim();
    setManualReportInput(val);
    const parts = val.split("_");
    const parent = parts.length >= 3 ? `C_${parts[1]}_${parts[2]}` : val.replace("D_", "C_");
    setManualParentInput(parent);
    handleManualInspect(val, parent);
  };

  // GitHub PR search
  const handleSearchPrs = async () => {
    setLoadingPrs(true);
    try {
      const res = await api.get(`/conversion/github/prs?search_query=${prSearchQuery}`);
      setPrsList(res.data.prs || []);
      if (res.data.prs?.length > 0) {
        handleSelectPr(res.data.prs[0].number);
      }
    } catch (e) {
      alert("Error consultando GitHub: " + (e.response?.data?.detail || e.message));
    } finally {
      setLoadingPrs(false);
    }
  };

  const handleSelectPr = async (prNumber) => {
    setSelectedPrNumber(prNumber);
    try {
      const res = await api.get(`/conversion/github/pr-files/${prNumber}`);
      const files = res.data.files || [];
      setPrFiles(files);
      const py = files.find((f) => f.is_py);
      if (py) {
        setSelectedPrFile(py);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadPrFile = async (fileObj, isSample = false) => {
    if (!fileObj) return;
    setDownloadingPrFilename(fileObj.filename);
    try {
      const res = await api.post("/conversion/github/download-file", {
        raw_url: fileObj.raw_url,
        contents_url: fileObj.contents_url,
        filename: fileObj.filename,
        is_sample: isSample,
        parent_code: selectedParent,
        report_code: selectedSubReport,
      });

      if (isSample) {
        setSampleFile(res.data.path);
        setAvailableSamples((prev) => Array.from(new Set([res.data.path, ...prev])));
        setToast({
          type: "success",
          title: "Muestra Descargada",
          message: `El archivo '${fileObj.filename}' fue descargado y vinculado exitosamente.`,
        });
      } else {
        setV2Code(res.data.content);
        setIsCodeModified(true);
        setToast({
          type: "success",
          title: res.data.was_refactored ? "Código Adaptado a Formato V2" : "Código Cargado al Editor",
          message: res.data.was_refactored
            ? `Se descargó '${fileObj.filename}' y se transformó automáticamente al estándar oficial V2 de DATAX (imports y estructura).`
            : `El archivo '${fileObj.filename}' fue descargado de GitHub y transferido al Editor V2.`,
        });
      }
    } catch (e) {
      setToast({
        type: "error",
        title: "Error al Cargar Archivo",
        message: e.response?.data?.detail || e.message || "Error descargando archivo de GitHub.",
      });
    } finally {
      setDownloadingPrFilename(null);
    }
  };

  const handleRefactorV2Code = async () => {
    if (!v2Code || !v2Code.trim()) {
      setToast({
        type: "warning",
        title: "Editor Vacío",
        message: "No hay código en el editor para adaptar.",
      });
      return;
    }
    setRefactoringCode(true);
    try {
      const res = await api.post("/conversion/refactor-code", {
        code: v2Code,
        report_code: selectedSubReport,
      });
      if (res.data.refactored_code) {
        setV2Code(res.data.refactored_code);
        setIsCodeModified(true);
        setToast({
          type: "success",
          title: "¡Formato V2 DATAX Aplicado!",
          message: `Código refactorizado exitosamente con importaciones oficiales ('from models.conversion.Conversion_Base...', tools) y clase ${selectedSubReport}.`,
        });
      }
    } catch (e) {
      setToast({
        type: "error",
        title: "Error al Adaptar Código",
        message: e.response?.data?.detail || e.message,
      });
    } finally {
      setRefactoringCode(false);
    }
  };

  const handleSaveV2Code = async () => {
    try {
      const res = await api.post("/conversion/save-code", {
        parent_code: selectedParent,
        report_code: selectedSubReport,
        code_content: v2Code,
      });
      setToast({
        type: "success",
        title: "Código Guardado",
        message: res.data.message || "Código guardado con éxito.",
      });
      setIsCodeModified(false);
    } catch (e) {
      setToast({
        type: "error",
        title: "Error al Guardar",
        message: e.response?.data?.detail || e.message,
      });
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post("/conversion/upload-sample", formData);
      setSampleFile(res.data.path);
      setAvailableSamples((prev) => Array.from(new Set([res.data.path, ...prev])));
      setToast({
        type: "success",
        title: "Archivo Subido",
        message: `Archivo '${file.name}' subido correctamente.`,
      });
    } catch (err) {
      setToast({
        type: "error",
        title: "Error de Subida",
        message: "No se pudo subir el archivo de muestra.",
      });
    }
  };

    const [validatingCode, setValidatingCode] = useState(false);

  const handleValidateCode = async () => {
    if (!v2Code) return;
    setValidatingCode(true);
    setLocalLogs((prev) => [...prev, `[VALIDACIÓN DATAX] Verificando estándares oficiales para ${selectedSubReport}...`]);
    try {
      const res = await api.post("/conversion/validate-code", {
        code: v2Code,
        robot_code: selectedSubReport,
        sample_path: sampleFile || (availableSamples.length > 0 ? availableSamples[0] : "")
      });
      if (res.data.success) {
        setLocalLogs((prev) => [
          ...prev,
          `[VALIDACIÓN OK] El código cumple 100% con los estándares DATAX: Regla estricta de 2 métodos, metadatos estructurados y conciliación exacta.`
        ]);
        setToast({
          type: "success",
          title: "Validación Exitosa",
          message: "¡El código cumple estrictamente con el formato oficial DATAX!",
        });
      } else {
        setLocalLogs((prev) => [
          ...prev,
          `[VALIDACIÓN ALERTA] Falló en etapa '${res.data.stage}': ${res.data.error}`
        ]);
        setToast({
          type: "warning",
          title: `Observación en validación (${res.data.stage})`,
          message: res.data.error,
          duration: 6000,
        });
      }
    } catch (e) {
      setLocalLogs((prev) => [...prev, `[VALIDACIÓN ERROR] ${e.response?.data?.detail || e.message}`]);
      setToast({
        type: "error",
        title: "Error de Validación",
        message: e.response?.data?.detail || e.message,
      });
    } finally {
      setValidatingCode(false);
    }
  };

  const handleRunTest = async (skipTextMatch = true) => {
    const testMode = skipTextMatch ? "pure" : "replacements";
    setRunningTestType(testMode);
    setLoading(true);
    const testTitle = skipTextMatch
      ? "Extracción Pura (Sin text_match)"
      : "Con Reemplazos (text_match activo hacia DATA_DB_BO_AUX)";
    setLocalLogs((prev) => [
      ...prev,
      `[CONV] Iniciando prueba de ${testTitle} para ${selectedSubReport}...`,
    ]);
    try {
      const res = await api.post("/conversion/run-test", {
        code: selectedSubReport,
        sample_file: sampleFile,
        skip_text_match: skipTextMatch,
        page_number: parseInt(pageNumber) || 1,
      });
      setTestResult({
        ...res.data,
        testType: testMode,
        testTitle: testTitle,
      });
      if (res.data.sqlite_created) {
        loadSqlite(selectedSubReport);
      }
      loadReplacements(selectedSubReport);
    } catch (e) {
      const errDetail = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [...prev, `[ERROR] ${errDetail}`]);
      setTestResult({
        success: false,
        diagnostics: [errDetail],
        testType: testMode,
        testTitle: testTitle,
      });
    } finally {
      setLoading(false);
      setRunningTestType(null);
    }
  };

  useEffect(() => {
    if ((step === 3 || step === 4) && selectedSubReport) {
      loadSqlite(selectedSubReport);
      if (step === 3) {
        loadReplacements(selectedSubReport);
      }
    }
  }, [step, selectedSubReport]);

  // Auto-sync selectedReviewCols from sqliteData
  useEffect(() => {
    if (sqliteData) {
      if (sqliteData.current_review_columns && sqliteData.current_review_columns.length > 0) {
        setSelectedReviewCols(sqliteData.current_review_columns);
      } else if (sqliteData.potential_hierarchy_columns && sqliteData.potential_hierarchy_columns.length > 0) {
        setSelectedReviewCols(sqliteData.potential_hierarchy_columns);
      }
    }
  }, [sqliteData]);

  const loadLatestDownloadInfo = async (code) => {
    try {
      const res = await api.get(`/conversion/latest-download/${code}`);
      if (res.data) {
        setLatestDlInfo(res.data);
        setTrigCode(code);
        setTrigIdDl(res.data.id_download || 1);
        setTrigFile(res.data.file || "");
      }
    } catch (e) {
      console.error("Error loading latest download:", e);
    }
  };

  useEffect(() => {
    if (step === 5 && selectedSubReport) {
      loadLatestDownloadInfo(selectedSubReport);
    }
  }, [step, selectedSubReport]);

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

  const loadSqlite = async (code) => {
    setLoadingSqlite(true);
    try {
      const res = await api.get(`/conversion/sqlite-data/${code}`);
      setSqliteData(res.data);
    } catch (e) {
      console.error("Error loading sqlite:", e);
      setSqliteData(null);
    } finally {
      setLoadingSqlite(false);
    }
  };

  const loadReplacements = async (code, searchVal = "") => {
    try {
      const res = await api.post("/conversion/replacements/query", {
        report_code: code,
        search: searchVal,
      });
      if (res.data.success) {
        setReplTableTarget(res.data.table_name);
        setReplacements(res.data.rows || []);
        setOriginalReplacements(JSON.parse(JSON.stringify(res.data.rows || [])));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleInsertReplacement = async () => {
    if (!newOrigVal && !newFinalVal) return;
    try {
      const res = await api.post("/conversion/replacements/insert", {
        report_code: selectedSubReport,
        original_value: newOrigVal,
        final_value: newFinalVal,
      });
      if (res.data.success) {
        setNewOrigVal("");
        setNewFinalVal("");
        loadReplacements(selectedSubReport);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteReplacement = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este reemplazo?")) return;
    try {
      const res = await api.post("/conversion/replacements/delete", {
        report_code: selectedSubReport,
        record_id: id,
      });
      if (res.data.success) {
        loadReplacements(selectedSubReport);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateReplacementRow = (index, field, value) => {
    setReplacements((prev) => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };
      if (field === "original_value") {
        row.srch_value = value
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      }
      updated[index] = row;
      return updated;
    });
  };

  const modifiedRowsCount = replacements.reduce((count, r, idx) => {
    const orig = originalReplacements[idx];
    if (!orig) return count;
    if (
      orig.original_value !== r.original_value ||
      orig.final_value !== r.final_value ||
      orig.srch_value !== r.srch_value
    ) {
      return count + 1;
    }
    return count;
  }, 0);

  const handleSaveAllReplacements = async () => {
    setSavingReplacements(true);
    try {
      const res = await api.post("/conversion/replacements/update", {
        report_code: selectedSubReport,
        original_data: originalReplacements,
        edited_data: replacements,
      });
      if (res.data.success) {
        setToast({
          type: "success",
          message: `Cambios guardados exitosamente en ${res.data.table || "DATA_DB_BO_AUX"}! (Actualizados: ${res.data.updated || 0} | Insertados: ${res.data.inserted || 0} | Eliminados: ${res.data.deleted || 0})`,
        });
        loadReplacements(selectedSubReport);
      } else {
        setToast({
          type: "error",
          message: `Error al guardar cambios: ${res.data.error || "Error desconocido"}`,
        });
      }
    } catch (e) {
      console.error(e);
      setToast({
        type: "error",
        message: "Error al conectar con el servidor: " + (e.response?.data?.detail || e.message),
      });
    } finally {
      setSavingReplacements(false);
    }
  };

  const handleSetupColumns = async () => {
    setSettingUpColumns(true);
    setSetupColumnsResult(null);
    try {
      const res = await api.post("/conversion/setup-columns", {
        report_code: selectedSubReport,
        parent_code: familyDetail?.parent_code || selectedParent,
        custom_columns: selectedReviewCols.length > 0 ? selectedReviewCols : null,
      });
      if (res.data.success) {
        setSetupColumnsResult({
          success: true,
          message: "¡Tabla 'columns_to_review' configurada exitosamente en la plantilla SQLite!",
          review_columns: res.data.review_columns,
          tables: res.data.tables,
        });
        loadSqlite(selectedSubReport);
      } else {
        setSetupColumnsResult({
          success: false,
          message: `Error al configurar columns_to_review: ${res.data.error || "Desconocido"}`,
        });
      }
    } catch (e) {
      setSetupColumnsResult({
        success: false,
        message: "Error de conexión: " + (e.response?.data?.detail || e.message),
      });
    } finally {
      setSettingUpColumns(false);
    }
  };

  const handleDeployConversion = async () => {
    if (!sshPass) {
      alert("Por favor introduce la contraseña del servidor SSH.");
      return;
    }
    setDeploying(true);
    setDeployResult(null);
    const parent = familyDetail?.parent_code || selectedParent;
    setLocalLogs((prev) => [...prev, `[DEPLOY] Iniciando despliegue de familia ${parent} al servidor ${sshHost}...`]);
    try {
      const res = await api.post("/conversion/deploy", {
        parent_code: parent,
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
        generate_dag_server: generateDagServer,
      });
      setDeployResult(res.data);
      if (res.data.success) {
        setLocalLogs((prev) => [...prev, `[DEPLOY OK] Familia ${parent} desplegada y DAG generado exitosamente.`]);
      } else {
        setLocalLogs((prev) => [...prev, `[DEPLOY ERROR] Falló el despliegue.`]);
      }
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [...prev, `[DEPLOY ERROR] ${err}`]);
      setDeployResult({ success: false, logs: [err] });
    } finally {
      setDeploying(false);
    }
  };

  const handleTriggerConversionDag = async () => {
    if (!sshPass) {
      alert("Por favor introduce la contraseña del servidor SSH para conectar.");
      return;
    }
    setTriggeringDag(true);
    setTriggerResult(null);
    const dagId = familyDetail?.parent_code || selectedParent;
    setLocalLogs((prev) => [...prev, `[AIRFLOW] Disparando DAG ${dagId} con code=${trigCode}, id_download=${trigIdDl}...`]);
    try {
      const res = await api.post("/conversion/trigger-dag", {
        dag_id: dagId,
        code: trigCode || selectedSubReport,
        id_download: parseInt(trigIdDl) || 1,
        file_path: trigFile,
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
      });
      setTriggerResult(res.data);
      if (res.data.success) {
        setLocalLogs((prev) => [...prev, `[AIRFLOW OK] DAG ${dagId} activado exitosamente en Airflow.`]);
      } else {
        setLocalLogs((prev) => [...prev, `[AIRFLOW WARN] El comando de disparo terminó con advertencias.`]);
      }
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [...prev, `[AIRFLOW ERROR] ${err}`]);
      setTriggerResult({ success: false, output: err });
    } finally {
      setTriggeringDag(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Band */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#e8e8e8]">
        <div>
          <div className="flex items-center gap-2">
            <span className="hp-chevron" />
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">Robots de Conversión (C_...)</h1>
          </div>
          <p className="text-xs text-[#636363] mt-1">
            Asistente por pasos para aplanamiento contable, metadatos jerárquicos (nv1..nvN), GitHub PR y tabla de reemplazos
          </p>
        </div>

        {/* Work flow modes */}
        <div className="inline-flex p-1 bg-[#f7f7f7] rounded-[4px] border border-[#e8e8e8]">
          <button
            onClick={() => setConvFlowMode("v1")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-all flex items-center gap-1.5 ${
              convFlowMode === "v1" ? "bg-[#1a1a1a] text-white shadow-xs" : "text-[#636363] hover:text-[#1a1a1a]"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Migrar desde V1 (Legado)</span>
          </button>
          <button
            onClick={() => setConvFlowMode("v2")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-all flex items-center gap-1.5 ${
              convFlowMode === "v2" ? "bg-[#1a1a1a] text-white shadow-xs" : "text-[#636363] hover:text-[#1a1a1a]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Código Nuevo / En V2</span>
          </button>
        </div>
      </div>

      {/* Mode Selection: Manual Code Input vs Scan Folder */}
      <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-[8px] p-4 space-y-4">
        <div className="flex items-center gap-6 text-xs font-semibold">
          <span className="text-[#636363]">Modo de Selección:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sel_mode"
              checked={selMode === "manual"}
              onChange={() => setSelMode("manual")}
              className="accent-[#024ad8]"
            />
            <span className="text-[#1a1a1a] flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-[#024ad8]" />
              Ingresar código del reporte manualmente (GitHub / Jira / Nuevo)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sel_mode"
              checked={selMode === "scan"}
              onChange={() => setSelMode("scan")}
              className="accent-[#024ad8]"
            />
            <span className="text-[#1a1a1a] flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-amber-500" />
              Explorar familias escaneadas en el repositorio
            </span>
          </label>
        </div>

        {selMode === "manual" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#e8e8e8]">
            <div>
              <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
                Código del Reporte (ej: D_BO_000000017_01):
              </label>
              <input
                type="text"
                value={manualReportInput}
                onChange={handleManualCodeChange}
                className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none focus:border-[#1a1a1a]"
                placeholder="D_BO_XXXXXXXXX_YY"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
                Código de Familia (deducido automáticamente):
              </label>
              <input
                type="text"
                value={manualParentInput}
                onChange={(e) => setManualParentInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-[#f0f0f0] text-slate-700 outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#e8e8e8]">
            <div>
              <label className="text-xs font-bold text-[#1a1a1a] block mb-1">1. Selecciona Familia:</label>
              <select
                value={selectedParent}
                onChange={(e) => {
                  setSelectedParent(e.target.value);
                  loadFamily(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
              >
                {families.map((f) => (
                  <option key={f.parent_code} value={f.parent_code}>
                    {f.parent_code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#1a1a1a] block mb-1">2. Sub-reporte a migrar/probar:</label>
              <select
                value={selectedSubReport}
                onChange={(e) => {
                  setSelectedSubReport(e.target.value);
                  loadReportCode(e.target.value, selectedParent);
                }}
                className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
              >
                {familyDetail?.sub_reports?.map((sub) => (
                  <option key={sub.code} value={sub.code}>
                    {sub.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Stepper Navigation */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { num: 1, title: "Paso 1: Archivo y Código" },
          { num: 2, title: "Paso 2: Pruebas (Extracción)" },
          { num: 3, title: "Paso 3: Verificación SQL" },
          { num: 4, title: "Paso 4: Plantilla SQLite" },
          { num: 5, title: "Paso 5: Despliegue al Servidor" },
        ].map((s) => (
          <button
            key={s.num}
            onClick={() => setStep(s.num)}
            className={`p-3 rounded-[4px] border text-left text-xs transition-all ${
              step === s.num
                ? "bg-[#1a1a1a] text-white border-[#1a1a1a] font-bold shadow-sm"
                : "bg-white text-[#636363] border-[#e8e8e8] hover:border-[#1a1a1a]"
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          PASO 1: ARCHIVO Y CÓDIGO (GITHUB PR, PEGAR CÓDIGO, SUBIR)
          ───────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Metadata banner from platform_db */}
          {reportDbInfo && (
            <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-[8px] p-3 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[#1a1a1a] flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[#024ad8]" />
                  Metadatos en BD:
                </span>
                <span className="text-[#3d3d3d]">{reportDbInfo.name || "Sin nombre registrado"}</span>
                <span className="mx-2 text-slate-300">•</span>
                <span className="text-[#636363]">Storage: <code>{reportDbInfo.storage_table || "-"}</code></span>
                <span className="mx-2 text-slate-300">•</span>
                <span className="text-[#636363]">Reemplazos: <code>{reportDbInfo.replacement_table || "-"}</code></span>
              </div>
              <Badge variant="primary">{selectedSubReport}</Badge>
            </div>
          )}

          {/* Sample file selection */}
          <div className="hp-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#1a1a1a] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#024ad8]" />
                <span>Archivo de Muestra para Pruebas</span>
              </h3>
              <label className="hp-btn hp-btn-outline text-xs cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Subir Nueva Muestra</span>
                <input type="file" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {availableSamples.length > 0 ? (
              <div>
                <label className="text-xs text-[#636363] block mb-1">Muestras detectadas en la carpeta / attachments:</label>
                <select
                  value={sampleFile}
                  onChange={(e) => setSampleFile(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
                >
                  {availableSamples.map((s, idx) => (
                    <option key={idx} value={s}>
                      {s.split(/[\\/]/).pop()} ({s})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-[4px] text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>No se detectó ninguna muestra (.xlsx, .pdf, .csv). Puedes subir una con el botón de arriba o descargarla desde un Pull Request abajo.</span>
              </div>
            )}
          </div>

          {/* Code Origin Switch */}
          <div className="hp-card p-6 space-y-4">
            <h3 className="font-bold text-sm text-[#1a1a1a] flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#024ad8]" />
              <span>Origen del Código del Robot</span>
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="code_src"
                  checked={codeSourceMode === "github"}
                  onChange={() => setCodeSourceMode("github")}
                  className="accent-[#024ad8]"
                />
                <span className="text-[#1a1a1a] flex items-center gap-1.5">
                  <GitPullRequest className="w-3.5 h-3.5 text-purple-600" />
                  Cargar desde Pull Request de GitHub (Pasantes)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="code_src"
                  checked={codeSourceMode === "paste"}
                  onChange={() => setCodeSourceMode("paste")}
                  className="accent-[#024ad8]"
                />
                <span className="text-[#1a1a1a] flex items-center gap-1.5">
                  <ClipboardPaste className="w-3.5 h-3.5 text-slate-600" />
                  Pegar código del pasante / freelancer
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="code_src"
                  checked={codeSourceMode === "local"}
                  onChange={() => setCodeSourceMode("local")}
                  className="accent-[#024ad8]"
                />
                <span className="text-[#1a1a1a] flex items-center gap-1.5">
                  <FolderGit2 className="w-3.5 h-3.5 text-amber-600" />
                  Código existente en repo local
                </span>
              </label>
            </div>

            {/* GITHUB PR SECTION */}
            {codeSourceMode === "github" && (
              <div className="bg-[#f7f7f7] border border-[#e8e8e8] rounded-[8px] p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={prSearchQuery}
                    onChange={(e) => setPrSearchQuery(e.target.value)}
                    placeholder="Filtrar PR por código o pasante..."
                    className="flex-1 px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
                  />
                  <button
                    onClick={handleSearchPrs}
                    disabled={loadingPrs}
                    className="hp-btn hp-btn-primary text-xs h-8 px-4"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{loadingPrs ? "Buscando..." : "Buscar PRs en GitHub"}</span>
                  </button>
                </div>

                {prsList.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-[#e8e8e8]">
                    <label className="text-xs font-bold text-[#1a1a1a] block">
                      Selecciona el Pull Request del pasante:
                    </label>
                    <select
                      value={selectedPrNumber || ""}
                      onChange={(e) => handleSelectPr(parseInt(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none"
                    >
                      {prsList.map((pr) => (
                        <option key={pr.number} value={pr.number}>
                          PR #{pr.number}: {pr.title} (por @{pr.author}) [{pr.branch}]
                        </option>
                      ))}
                    </select>

                    {prFiles.length > 0 && (
                      <div className="pt-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#1a1a1a] block">
                            Archivos disponibles en este PR:
                          </label>
                          {downloadingPrFilename && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#024ad8] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Cargando {downloadingPrFilename}...
                            </span>
                          )}
                        </div>

                        {downloadingPrFilename && (
                          <div className="flex items-center gap-2.5 p-2.5 bg-blue-50/90 border border-blue-200 rounded-[6px] text-xs text-[#024ad8] shadow-xs">
                            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[#024ad8]" />
                            <div className="flex-1">
                              Descargando <strong className="font-mono">{downloadingPrFilename}</strong> desde GitHub y cargando al editor...
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {prFiles.map((file, i) => (
                            <div
                              key={i}
                              className="p-2.5 bg-white border border-[#e8e8e8] rounded-[4px] flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileCode className="w-4 h-4 text-[#024ad8]" />
                                <span className="font-mono truncate">{file.filename}</span>
                              </div>
                              <button
                                onClick={() => handleDownloadPrFile(file, file.is_sample)}
                                disabled={downloadingPrFilename !== null}
                                className={`hp-btn text-[11px] h-7 px-2.5 flex items-center gap-1.5 transition-all ${
                                  downloadingPrFilename === file.filename
                                    ? "bg-blue-50 border border-blue-400 text-[#024ad8] cursor-wait shadow-xs"
                                    : downloadingPrFilename !== null
                                    ? "opacity-50 cursor-not-allowed border-[#e8e8e8] text-gray-400"
                                    : "hp-btn-outline-ink hover:border-[#024ad8] hover:text-[#024ad8]"
                                }`}
                              >
                                {downloadingPrFilename === file.filename ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin text-[#024ad8]" />
                                    <span>{file.is_sample ? "Descargando..." : "Cargando..."}</span>
                                  </>
                                ) : (
                                  <span className="flex items-center gap-1.5">
                                    <Download className="w-3 h-3 text-[#024ad8]" />
                                    {file.is_sample ? "Descargar Muestra" : "Cargar al Editor"}
                                  </span>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Monaco Editors Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              <div className="hp-card p-4">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e8e8e8]">
                  <span className="text-xs font-bold uppercase text-[#636363]">Código V1 Legado</span>
                  <Badge variant="outline">Referencia V1</Badge>
                </div>
                <div className="h-96 rounded-[4px] overflow-hidden border border-[#e8e8e8]">
                  <Editor
                    height="100%"
                    language="python"
                    value={v1Code || "# Sin código V1 para este reporte"}
                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
                    theme="light"
                  />
                </div>
              </div>

              <div className="hp-card p-4">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#e8e8e8]">
                  <span className="text-xs font-bold uppercase text-[#024ad8]">
                    Código V2 (Editable / Pasante / GitHub)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRefactorV2Code}
                      disabled={!v2Code || refactoringCode}
                      className="hp-btn text-xs h-7 px-3 flex items-center gap-1.5 border border-blue-400 bg-blue-50 text-[#024ad8] hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      title="Convierte automáticamente imports, try/except obsoletos y estructura a formato oficial DATAX V2"
                    >
                      {refactoringCode ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 fill-blue-500 text-blue-600" />
                      )}
                      <span>{refactoringCode ? "Adaptando a V2..." : "Adaptar a Formato V2"}</span>
                    </button>
                    <button
                      onClick={handleSaveV2Code}
                      className="hp-btn hp-btn-primary text-xs h-7 px-3"
                    >
                      <Save className="w-3 h-3" />
                      <span>Guardar en V2</span>
                    </button>
                    <Badge variant="primary">2 Métodos Estricto</Badge>
                  </div>
                </div>
                <div className="h-96 rounded-[4px] overflow-hidden border border-[#024ad8]/20">
                  <Editor
                    height="100%"
                    language="python"
                    value={v2Code || "# Pega aquí el código del pasante o cárgalo desde GitHub..."}
                    onChange={(val) => {
                      setV2Code(val || "");
                      setIsCodeModified(true);
                    }}
                    options={{ readOnly: false, minimap: { enabled: false }, fontSize: 12 }}
                    theme="light"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-[#e8e8e8]">
              <button onClick={() => setStep(2)} className="hp-btn hp-btn-primary text-xs">
                <span>Continuar a Pruebas de Extracción</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PASO 2: PRUEBAS (EXTRACCIÓN)
          ───────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="hp-card p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#e8e8e8] pb-4">
              <div>
                <h3 className="font-bold text-base text-[#1a1a1a] flex items-center gap-2">
                  <span>Pruebas de Conversión:</span>
                  <span className="font-mono text-[#024ad8]">{selectedSubReport}</span>
                </h3>
                <p className="text-xs text-[#636363] mt-0.5">
                  Ejecuta los dos tipos oficiales de pruebas del pipeline: extracción pura unitaria y validación con reemplazos en BD.
                </p>
              </div>
              <Badge variant="primary">{familyDetail?.parent_code || selectedParent}</Badge>
            </div>

            {/* Configuración de Entrada */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#f7f7f7] p-4 rounded-[6px] border border-[#e8e8e8]">
              <div>
                <label className="text-xs font-bold text-[#1a1a1a] block mb-1">
                  Archivo de Muestra Activo (Sample):
                </label>
                {availableSamples.length > 0 ? (
                  <select
                    value={sampleFile}
                    onChange={(e) => setSampleFile(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#c2c2c2] rounded-[4px] bg-white outline-none focus:border-[#024ad8]"
                  >
                    {availableSamples.map((s, idx) => (
                      <option key={idx} value={s}>
                        {s.split(/[\/]/).pop()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-amber-700 font-semibold p-2.5 bg-amber-50 rounded border border-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>No hay muestra seleccionada. Vuelve al Paso 1 y selecciona o sube un archivo.</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[#1a1a1a] block mb-1">Número de Página / Hoja:</label>
                <input
                  type="number"
                  value={pageNumber}
                  onChange={(e) => setPageNumber(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs border border-[#c2c2c2] rounded-[4px] outline-none bg-white focus:border-[#024ad8]"
                  min="1"
                />
              </div>
            </div>

            {/* LOS 2 BOTONES DE TEST OFICIALES */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#636363]">
                Selecciona el Tipo de Prueba a Ejecutar:
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BOTÓN 1: EXTRACCIÓN PURA */}
                <div className="p-4 border-2 border-[#e8e8e8] hover:border-[#024ad8]/40 rounded-[6px] bg-white transition-all space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="p-2 bg-blue-50 text-[#024ad8] rounded-[4px]">
                        <Play className="w-4 h-4" />
                      </span>
                      <div>
                        <h5 className="font-bold text-xs text-[#1a1a1a]">1. Extracción Pura (Sin text_match)</h5>
                        <span className="text-[11px] text-[#636363]">Paso 6: Unit test + Generación SQLite</span>
                      </div>
                    </div>
                    <p className="text-xs text-[#636363] leading-relaxed">
                      Ejecuta la extracción directa saltando la normalización de entidades. Verifica que todos los valores en la columna <code>valor</code> sean numéricos y genera el archivo <code>.sqlite</code> local en <code>models/conversion/</code>.
                    </p>
                  </div>
                  <button
                    onClick={() => handleRunTest(true)}
                    disabled={loading || !sampleFile}
                    className="w-full hp-btn hp-btn-outline-ink text-xs h-9 justify-center"
                  >
                    {runningTestType === "pure" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{runningTestType === "pure" ? "Ejecutando Extracción Pura..." : "1. Probar Extracción Pura"}</span>
                  </button>
                </div>

                {/* BOTÓN 2: CON REEMPLAZOS */}
                <div className="p-4 border-2 border-[#024ad8]/30 hover:border-[#024ad8] rounded-[6px] bg-[#024ad8]/5 transition-all space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="p-2 bg-[#024ad8] text-white rounded-[4px]">
                        <Database className="w-4 h-4" />
                      </span>
                      <div>
                        <h5 className="font-bold text-xs text-[#024ad8]">2. Con Reemplazos (text_match activo)</h5>
                        <span className="text-[11px] text-[#636363]">Paso 7: Normalización hacia DATA_DB_BO_AUX</span>
                      </div>
                    </div>
                    <p className="text-xs text-[#636363] leading-relaxed">
                      Ejecuta la extracción conectando con la base de datos auxiliar para normalizar entidades. Valida y actualiza los registros en la tabla de reemplazos correspondiente.
                    </p>
                  </div>
                  <button
                    onClick={() => handleRunTest(false)}
                    disabled={loading || !sampleFile}
                    className="w-full hp-btn hp-btn-primary text-xs h-9 justify-center"
                  >
                    {runningTestType === "replacements" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Database className="w-3.5 h-3.5" />
                    )}
                    <span>{runningTestType === "replacements" ? "Ejecutando con Reemplazos..." : "2. Probar con Reemplazos"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* BANNER DE RESULTADO DE PRUEBA */}
            {testResult && (
              <div className="space-y-3 pt-2">
                {testResult.success ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-[6px] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>¡Test de {testResult.testTitle} APROBADO (OK)!</span>
                      </div>
                      <Badge variant="primary">OK</Badge>
                    </div>

                    {testResult.sqlite_created && (
                      <div className="text-xs text-emerald-900 bg-white/70 p-2.5 rounded border border-emerald-200">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Archivo SQLite generado exitosamente:</span>
                        </p>
                        <code className="text-[11px] break-all text-[#1a1a1a]">{testResult.sqlite_path}</code>
                      </div>
                    )}

                    {testResult.testType === "replacements" && (
                      <div className="text-xs text-emerald-900 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>Se ha verificado/actualizado la tabla de reemplazos en <code>DATA_DB_BO_AUX</code>.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-300 rounded-[6px] space-y-2">
                    <div className="flex items-center gap-2 text-red-800 font-bold text-xs">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span>El test de {testResult.testTitle} falló.</span>
                    </div>

                    {testResult.diagnostics && testResult.diagnostics.length > 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs space-y-1 text-amber-900">
                        <p className="font-bold flex items-center gap-1.5">
                          <Lightbulb className="w-4 h-4 text-amber-600" />
                          <span>Diagnóstico Inteligente:</span>
                        </p>
                        <ul className="list-disc pl-5 space-y-0.5">
                          {testResult.diagnostics.map((d, i) => (
                            <li key={i} className="font-mono text-[11px]">{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* BOTONES DE NAVEGACIÓN */}
            <div className="mt-6 flex items-center justify-between pt-4 border-t border-[#e8e8e8]">
              <button onClick={() => setStep(1)} className="hp-btn hp-btn-outline-ink text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> Volver a Código (Paso 1)
              </button>
              <button
                onClick={() => setStep(3)}
                className="hp-btn hp-btn-primary text-xs"
              >
                <span>Continuar a Verificación SQL (Paso 3)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <TerminalLogs logs={[...externalLogs, ...localLogs]} title="Conversion Step Test Console" />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PASO 3: VERIFICACIÓN SQL (DATOS / REEMPLAZOS)
          ───────────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="hp-card p-6">
            <div className="flex items-center justify-between mb-4 border-b border-[#e8e8e8] pb-3">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setAuditSubTab("sqlite")}
                  className={`text-xs font-bold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 ${
                    auditSubTab === "sqlite"
                      ? "text-[#024ad8] border-b-2 border-[#024ad8]"
                      : "text-[#636363] hover:text-[#1a1a1a]"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Datos Extraídos SQLite (data_melted)</span>
                </button>
                <button
                  onClick={() => setAuditSubTab("replacements")}
                  className={`text-xs font-bold uppercase tracking-wider pb-1 transition-all flex items-center gap-1.5 ${
                    auditSubTab === "replacements"
                      ? "text-[#024ad8] border-b-2 border-[#024ad8]"
                      : "text-[#636363] hover:text-[#1a1a1a]"
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Tabla de Reemplazos (DATA_DB_BO_AUX)</span>
                  {modifiedRowsCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.2 bg-amber-400 text-amber-950 rounded-full text-[10px]">
                      {modifiedRowsCount}
                    </span>
                  )}
                </button>
              </div>

              <Badge variant="outline">{selectedSubReport}</Badge>
            </div>

            {auditSubTab === "sqlite" ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f7f7f7] p-3 rounded-[6px] border border-[#e8e8e8]">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-[#1a1a1a]">Tabla en SQLite:</span>
                    <Badge variant="primary">{sqliteData?.table || selectedSubReport}</Badge>
                    <span className="text-[#636363]">
                      • Total registros: <strong>{sqliteData?.total || 0}</strong> filas
                    </span>
                    {sqliteData?.path && (
                      <span className="text-[11px] text-slate-500 font-mono hidden md:inline truncate max-w-xs" title={sqliteData.path}>
                        ({sqliteData.path.split(/[\/]/).pop()})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => loadSqlite(selectedSubReport)}
                    disabled={loadingSqlite}
                    className="hp-btn hp-btn-outline-ink text-xs h-7 px-3 flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingSqlite ? "animate-spin" : ""}`} />
                    <span>{loadingSqlite ? "Cargando..." : "Recargar SQLite"}</span>
                  </button>
                </div>

                {loadingSqlite ? (
                  <div className="p-12 text-center text-xs text-[#636363] flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-[#024ad8]" />
                    <span>Cargando datos desde archivo SQLite...</span>
                  </div>
                ) : sqliteData?.data?.length > 0 ? (
                  <div className="overflow-x-auto border border-[#e8e8e8] rounded-[4px] max-h-96 shadow-xs">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#f7f7f7] border-b border-[#e8e8e8] text-[#1a1a1a] font-bold sticky top-0 z-10">
                        <tr>
                          {sqliteData.columns.map((c) => (
                            <th key={c} className="p-2.5 font-semibold text-[#1a1a1a] bg-[#f7f7f7]">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8e8e8] bg-white">
                        {sqliteData.data.slice(0, 100).map((row, i) => (
                          <tr key={i} className="hover:bg-blue-50/40 transition-colors">
                            {sqliteData.columns.map((c) => (
                              <td key={c} className="p-2.5 text-[#3d3d3d] font-mono whitespace-nowrap">
                                {String(row[c] ?? "-")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-10 text-center text-xs text-slate-500 bg-[#fbfbfb] border border-dashed border-[#dcdcdc] rounded-[6px] space-y-3">
                    <p className="font-semibold text-[#1a1a1a]">
                      No hay datos SQLite disponibles actualmente para {selectedSubReport}.
                    </p>
                    <p className="text-[#636363]">
                      Ejecuta primero la prueba en el <strong>Paso 2</strong> para generar el archivo local, o pulsa el botón para recargar.
                    </p>
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => setStep(2)}
                        className="hp-btn hp-btn-outline-ink text-xs h-8 px-4"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Volver a Pruebas (Paso 2)
                      </button>
                      <button
                        onClick={() => loadSqlite(selectedSubReport)}
                        className="hp-btn hp-btn-primary text-xs h-8 px-4"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Recargar Datos SQLite
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#f7f7f7] p-3.5 rounded-[6px] border border-[#e8e8e8]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#1a1a1a]">Tabla Auxiliar:</span>
                    <Badge variant="primary">{replTableTarget || "Cargando..."}</Badge>
                    <span className="text-xs text-[#636363]">
                      ({replacements.length} registros cargados)
                    </span>
                    {modifiedRowsCount > 0 && (
                      <span className="text-xs bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-[3px] font-bold animate-pulse flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                        <span>{modifiedRowsCount} cambio(s) pendiente(s) de guardar</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Buscar rubro o valor..."
                      value={replSearch}
                      onChange={(e) => {
                        setReplSearch(e.target.value);
                        loadReplacements(selectedSubReport, e.target.value);
                      }}
                      className="px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] bg-white outline-none focus:border-[#024ad8] w-48"
                    />
                    <button
                      onClick={() => loadReplacements(selectedSubReport, replSearch)}
                      className="hp-btn hp-btn-outline-ink text-xs h-8 px-2.5"
                      title="Descartar cambios no guardados y recargar desde BD"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleSaveAllReplacements}
                      disabled={savingReplacements || modifiedRowsCount === 0}
                      className={`hp-btn text-xs h-8 px-4 transition-all ${
                        modifiedRowsCount > 0
                          ? "hp-btn-primary font-bold shadow-md ring-2 ring-[#024ad8]/30"
                          : "hp-btn-outline text-[#636363] border-[#dcdcdc] opacity-70"
                      }`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingReplacements ? "Guardando..." : `Guardar Cambios (${modifiedRowsCount})`}</span>
                    </button>
                  </div>
                </div>

                {/* Formulario para agregar nuevo reemplazo */}
                <div className="bg-white p-3.5 rounded-[6px] border border-[#e8e8e8] shadow-xs space-y-2">
                  <span className="text-xs font-bold text-[#1a1a1a] block">
                    + Agregar Nuevo Reemplazo a la Tabla:
                  </span>
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <input
                      type="text"
                      placeholder="Valor Original (ej: CARTERA VIGENTE)"
                      value={newOrigVal}
                      onChange={(e) => setNewOrigVal(e.target.value)}
                      className="flex-1 w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] bg-white outline-none focus:border-[#024ad8]"
                    />
                    <input
                      type="text"
                      placeholder="Valor Final Normalizado (ej: Cartera Vigente)"
                      value={newFinalVal}
                      onChange={(e) => setNewFinalVal(e.target.value)}
                      className="flex-1 w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] bg-white outline-none focus:border-[#024ad8]"
                    />
                    <button
                      onClick={handleInsertReplacement}
                      disabled={!newOrigVal.trim() || !newFinalVal.trim()}
                      className="hp-btn hp-btn-ink text-xs h-8 px-4 w-full sm:w-auto justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar Reemplazo
                    </button>
                  </div>
                </div>

                {/* Tabla de Reemplazos con inputs editables */}
                <div className="overflow-x-auto border border-[#e8e8e8] rounded-[6px] max-h-96 shadow-xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#f7f7f7] border-b border-[#e8e8e8] text-[#1a1a1a] font-bold sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 w-14 text-center">ID</th>
                        <th className="p-2.5">Valor Original (Editable)</th>
                        <th className="p-2.5">Valor Búsqueda (srch)</th>
                        <th className="p-2.5">Valor Final Normalizado (Editable)</th>
                        <th className="p-2.5 w-24 text-center">Estado</th>
                        <th className="p-2.5 w-16 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e8e8] bg-white">
                      {replacements.map((r, idx) => {
                        const orig = originalReplacements[idx];
                        const isModified = orig && (
                          orig.original_value !== r.original_value ||
                          orig.final_value !== r.final_value ||
                          orig.srch_value !== r.srch_value
                        );

                        const handleSetupColumns = async () => {
    setSettingUpColumns(true);
    setSetupColumnsResult(null);
    try {
      const res = await api.post("/conversion/setup-columns", {
        report_code: selectedSubReport,
        parent_code: familyDetail?.parent_code || selectedParent,
        custom_columns: selectedReviewCols.length > 0 ? selectedReviewCols : null,
      });
      if (res.data.success) {
        setSetupColumnsResult({
          success: true,
          message: "¡Tabla 'columns_to_review' configurada exitosamente en la plantilla SQLite!",
          review_columns: res.data.review_columns,
          tables: res.data.tables,
        });
        loadSqlite(selectedSubReport);
      } else {
        setSetupColumnsResult({
          success: false,
          message: `Error al configurar columns_to_review: ${res.data.error || "Desconocido"}`,
        });
      }
    } catch (e) {
      setSetupColumnsResult({
        success: false,
        message: "Error de conexión: " + (e.response?.data?.detail || e.message),
      });
    } finally {
      setSettingUpColumns(false);
    }
  };

  const handleDeployConversion = async () => {
    if (!sshPass) {
      alert("Por favor introduce la contraseña del servidor SSH.");
      return;
    }
    setDeploying(true);
    setDeployResult(null);
    const parent = familyDetail?.parent_code || selectedParent;
    setLocalLogs((prev) => [...prev, `[DEPLOY] Iniciando despliegue de familia ${parent} al servidor ${sshHost}...`]);
    try {
      const res = await api.post("/conversion/deploy", {
        parent_code: parent,
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
        generate_dag_server: generateDagServer,
      });
      setDeployResult(res.data);
      if (res.data.success) {
        setLocalLogs((prev) => [...prev, `[DEPLOY OK] Familia ${parent} desplegada y DAG generado exitosamente.`]);
      } else {
        setLocalLogs((prev) => [...prev, `[DEPLOY ERROR] Falló el despliegue.`]);
      }
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [...prev, `[DEPLOY ERROR] ${err}`]);
      setDeployResult({ success: false, logs: [err] });
    } finally {
      setDeploying(false);
    }
  };

  const handleTriggerConversionDag = async () => {
    if (!sshPass) {
      alert("Por favor introduce la contraseña del servidor SSH para conectar.");
      return;
    }
    setTriggeringDag(true);
    setTriggerResult(null);
    const dagId = familyDetail?.parent_code || selectedParent;
    setLocalLogs((prev) => [...prev, `[AIRFLOW] Disparando DAG ${dagId} con code=${trigCode}, id_download=${trigIdDl}...`]);
    try {
      const res = await api.post("/conversion/trigger-dag", {
        dag_id: dagId,
        code: trigCode || selectedSubReport,
        id_download: parseInt(trigIdDl) || 1,
        file_path: trigFile,
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
      });
      setTriggerResult(res.data);
      if (res.data.success) {
        setLocalLogs((prev) => [...prev, `[AIRFLOW OK] DAG ${dagId} activado exitosamente en Airflow.`]);
      } else {
        setLocalLogs((prev) => [...prev, `[AIRFLOW WARN] El comando de disparo terminó con advertencias.`]);
      }
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [...prev, `[AIRFLOW ERROR] ${err}`]);
      setTriggerResult({ success: false, output: err });
    } finally {
      setTriggeringDag(false);
    }
  };

  return (
                          <tr
                            key={r.id || idx}
                            className={`transition-colors ${
                              isModified ? "bg-amber-50/70" : "hover:bg-[#f7f7f7]"
                            }`}
                          >
                            <td className="p-2.5 font-mono text-[#636363] text-center">{r.id || "-"}</td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={r.original_value || ""}
                                onChange={(e) => handleUpdateReplacementRow(idx, "original_value", e.target.value)}
                                className={`w-full px-2.5 py-1 text-xs font-mono rounded-[3px] border transition-all outline-none ${
                                  isModified && orig?.original_value !== r.original_value
                                    ? "border-amber-400 bg-amber-50 font-semibold"
                                    : "border-transparent hover:border-[#c2c2c2] focus:border-[#024ad8] focus:bg-white"
                                }`}
                                title="Haz clic para modificar el valor original"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={r.srch_value || ""}
                                onChange={(e) => handleUpdateReplacementRow(idx, "srch_value", e.target.value)}
                                className="w-full px-2.5 py-1 text-xs font-mono text-slate-500 rounded-[3px] border border-transparent hover:border-[#c2c2c2] focus:border-[#024ad8] focus:bg-white transition-all outline-none"
                                title="Valor de búsqueda normalizado"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={r.final_value || ""}
                                onChange={(e) => handleUpdateReplacementRow(idx, "final_value", e.target.value)}
                                className={`w-full px-2.5 py-1 text-xs font-mono font-bold text-[#024ad8] rounded-[3px] border transition-all outline-none ${
                                  isModified && orig?.final_value !== r.final_value
                                    ? "border-amber-400 bg-amber-50"
                                    : "border-transparent hover:border-[#c2c2c2] focus:border-[#024ad8] focus:bg-white"
                                }`}
                                title="Haz clic para modificar el valor final normalizado"
                              />
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              {isModified ? (
                                <span className="text-[10px] bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1">
                                  <Edit3 className="w-3 h-3 text-amber-800" />
                                  <span>Modificado</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Guardado
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                onClick={() => handleDeleteReplacement(r.id)}
                                className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition-colors"
                                title="Eliminar de la base de datos"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-[#e8e8e8]">
              <button onClick={() => setStep(2)} className="hp-btn hp-btn-outline-ink text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> Volver a Pruebas (Paso 2)
              </button>
              <button onClick={() => setStep(4)} className="hp-btn hp-btn-primary text-xs">
                <span>Avanzar a Plantilla (Paso 4)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PASO 4: PLANTILLA SQLITE (COLUMNS_TO_REVIEW)
          ───────────────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="hp-card p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#e8e8e8] pb-4">
            <div>
              <h3 className="font-bold text-base text-[#1a1a1a] flex items-center gap-2">
                <span>Configurar Plantilla SQLite (columns_to_review):</span>
                <span className="font-mono text-[#024ad8]">{selectedSubReport}</span>
              </h3>
              <p className="text-xs text-[#636363] mt-0.5">
                Define las columnas jerárquicas que la plataforma DATAX auditará y normalizará automáticamente contra la base de datos auxiliar.
              </p>
            </div>
            <Badge variant="primary">{familyDetail?.parent_code || selectedParent}</Badge>
          </div>

          {/* Banner Normativa DATAX (Paso 8 del Manual) */}
          <div className="bg-[#f0f4fe] border border-[#024ad8]/20 rounded-[6px] p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#024ad8]">
              <ShieldCheck className="w-4 h-4" />
              <span>Estándar Oficial DATAX Platform (Paso 8 del Manual):</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[#2d3748]">
              <li>La tabla interna del SQLite debe llamarse exactamente <strong><code>columns_to_review</code></strong>.</li>
              <li>La columna debe llamarse estrictamente <strong><code>column</code></strong>.</li>
              <li><strong>SOLO</strong> debe incluir niveles jerárquicos de texto (ej. <code>nv1</code>, <code>nv2</code>, ..., <code>nvN</code>).</li>
              <li><strong className="text-rose-700 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-rose-600" /> ESTRICTAMENTE PROHIBIDO:</strong> No incluir la columna <code>valor</code> ni metadatos (<code>file</code>, <code>titulo1..N</code>, <code>fecha</code>).</li>
            </ul>
          </div>

          {/* Estado del Archivo SQLite */}
          <div className="bg-[#f7f7f7] p-4 rounded-[6px] border border-[#e8e8e8] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#1a1a1a]">Archivo SQLite Local de Referencia:</span>
              <button
                onClick={() => loadSqlite(selectedSubReport)}
                disabled={loadingSqlite}
                className="hp-btn hp-btn-outline-ink text-xs h-7 px-3 flex items-center gap-1.5 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3 h-3 ${loadingSqlite ? "animate-spin" : ""}`} />
                <span>{loadingSqlite ? "Consultando..." : "Actualizar Estado"}</span>
              </button>
            </div>

            {sqliteData?.path ? (
              <div className="space-y-2 text-xs">
                <div className="p-2.5 bg-white border border-[#e8e8e8] rounded-[4px] font-mono break-all text-[#1a1a1a] flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-[#024ad8] shrink-0" />
                  <span>{sqliteData.path}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#636363]">Estado de columns_to_review:</span>
                    {sqliteData.has_columns_to_review ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3" /> Configurada ({sqliteData.current_review_columns?.length || 0} columnas)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        <AlertCircle className="w-3 h-3" /> Pendiente de Inicializar
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[#636363]">Tablas en el SQLite:</span>
                    <span className="font-mono font-semibold text-[#1a1a1a]">
                      [{sqliteData.tables?.join(", ") || "-"}]
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>No se encontró el archivo SQLite para {selectedSubReport}.</span>
                </p>
                <p>Debes ejecutar la prueba en el Paso 2 para que se genere la base de datos de auditoría local.</p>
                <button onClick={() => setStep(2)} className="hp-btn hp-btn-outline text-xs h-7 px-3 border-red-300 text-red-700">
                  <ArrowLeft className="w-3 h-3" /> Ir al Paso 2 para Ejecutar Test
                </button>
              </div>
            )}
          </div>

          {/* Configuración Interactiva de Columnas */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a1a1a]">
              Columnas Jerárquicas a Incluir en <code>columns_to_review</code>:
            </h4>

            {sqliteData?.potential_hierarchy_columns && sqliteData.potential_hierarchy_columns.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {sqliteData.potential_hierarchy_columns.map((col) => {
                  const isChecked = selectedReviewCols.includes(col);
                  const handleDeployConversion = async () => {
    if (!sshPass) {
      alert("Por favor introduce la contraseña del servidor SSH.");
      return;
    }
    setDeploying(true);
    setDeployResult(null);
    const parent = familyDetail?.parent_code || selectedParent;
    setLocalLogs((prev) => [...prev, `[DEPLOY] Iniciando despliegue de familia ${parent} al servidor ${sshHost}...`]);
    try {
      const res = await api.post("/conversion/deploy", {
        parent_code: parent,
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
        generate_dag_server: generateDagServer,
      });
      setDeployResult(res.data);
      if (res.data.success) {
        setLocalLogs((prev) => [...prev, `[DEPLOY OK] Familia ${parent} desplegada y DAG generado exitosamente.`]);
      } else {
        setLocalLogs((prev) => [...prev, `[DEPLOY ERROR] Falló el despliegue.`]);
      }
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [...prev, `[DEPLOY ERROR] ${err}`]);
      setDeployResult({ success: false, logs: [err] });
    } finally {
      setDeploying(false);
    }
  };

  const handleTriggerConversionDag = async () => {
    if (!sshPass) {
      alert("Por favor introduce la contraseña del servidor SSH para conectar.");
      return;
    }
    setTriggeringDag(true);
    setTriggerResult(null);
    const dagId = familyDetail?.parent_code || selectedParent;
    setLocalLogs((prev) => [...prev, `[AIRFLOW] Disparando DAG ${dagId} con code=${trigCode}, id_download=${trigIdDl}...`]);
    try {
      const res = await api.post("/conversion/trigger-dag", {
        dag_id: dagId,
        code: trigCode || selectedSubReport,
        id_download: parseInt(trigIdDl) || 1,
        file_path: trigFile,
        host: sshHost,
        port: parseInt(sshPort),
        username: sshUser,
        password: sshPass,
      });
      setTriggerResult(res.data);
      if (res.data.success) {
        setLocalLogs((prev) => [...prev, `[AIRFLOW OK] DAG ${dagId} activado exitosamente en Airflow.`]);
      } else {
        setLocalLogs((prev) => [...prev, `[AIRFLOW WARN] El comando de disparo terminó con advertencias.`]);
      }
    } catch (e) {
      const err = e.response?.data?.detail || e.message;
      setLocalLogs((prev) => [...prev, `[AIRFLOW ERROR] ${err}`]);
      setTriggerResult({ success: false, output: err });
    } finally {
      setTriggeringDag(false);
    }
  };

  return (
                    <label
                      key={col}
                      className={`flex items-center gap-2.5 p-3 rounded-[6px] border cursor-pointer transition-all ${
                        isChecked
                          ? "bg-blue-50/70 border-[#024ad8] text-[#024ad8] font-bold shadow-xs"
                          : "bg-white border-[#e8e8e8] text-[#3d3d3d] hover:border-[#c2c2c2]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedReviewCols(selectedReviewCols.filter((c) => c !== col));
                          } else {
                            setSelectedReviewCols([...selectedReviewCols, col]);
                          }
                        }}
                        className="accent-[#024ad8] w-4 h-4"
                      />
                      <span className="font-mono text-xs">{col}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-[#fbfbfb] border border-dashed border-[#dcdcdc] rounded-[6px] text-xs text-[#636363]">
                Cargando o no se detectaron columnas jerárquicas automáticamente en la tabla. Puedes añadirlas manualmente abajo.
              </div>
            )}

            {/* Agregar columna manual opcional */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Añadir nivel manual (ej: nv2, nv3)..."
                value={customColInput}
                onChange={(e) => setCustomColInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customColInput.trim()) {
                    const val = customColInput.trim();
                    if (!selectedReviewCols.includes(val)) {
                      setSelectedReviewCols([...selectedReviewCols, val]);
                    }
                    setCustomColInput("");
                  }
                }}
                className="px-3 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8] w-64 bg-white"
              />
              <button
                type="button"
                onClick={() => {
                  const val = customColInput.trim();
                  if (val && !selectedReviewCols.includes(val)) {
                    setSelectedReviewCols([...selectedReviewCols, val]);
                    setCustomColInput("");
                  }
                }}
                className="hp-btn hp-btn-outline-ink text-xs h-8 px-3"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir
              </button>
            </div>

            <div className="text-xs text-[#636363]">
              Columnas seleccionadas actualmente:{" "}
              {selectedReviewCols.length > 0 ? (
                <span className="font-mono font-bold text-[#024ad8]">
                  [{selectedReviewCols.join(", ")}]
                </span>
              ) : (
                <span className="text-amber-700 italic">Ninguna seleccionada (se recomienda al menos nv1).</span>
              )}
            </div>
          </div>

          {/* Botón de Inicialización y Acción */}
          <div className="pt-2">
            <button
              onClick={handleSetupColumns}
              disabled={settingUpColumns || !sqliteData?.path}
              className="hp-btn hp-btn-primary text-xs h-10 px-6 font-bold shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${settingUpColumns ? "animate-spin" : ""}`} />
              <span>
                {settingUpColumns
                  ? "Configurando columns_to_review..."
                  : "Configurar e Inicializar columns_to_review"}
              </span>
            </button>
          </div>

          {/* Banner de resultado */}
          {setupColumnsResult && (
            <div
              className={`p-4 rounded-[6px] border text-xs space-y-1.5 ${
                setupColumnsResult.success
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                  : "bg-red-50 border-red-300 text-red-900"
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {setupColumnsResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600" />
                )}
                <span>{setupColumnsResult.message}</span>
              </div>
              {setupColumnsResult.review_columns && (
                <p className="font-mono text-[11px] text-[#1a1a1a]">
                  Columnas activas en la tabla: [{setupColumnsResult.review_columns.join(", ")}]
                </p>
              )}
            </div>
          )}

          {/* Navegación */}
          <div className="pt-4 flex items-center justify-between border-t border-[#e8e8e8]">
            <button onClick={() => setStep(3)} className="hp-btn hp-btn-outline-ink text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a Verificación SQL (Paso 3)
            </button>
            <button onClick={() => setStep(5)} className="hp-btn hp-btn-primary text-xs">
              <span>Avanzar a Despliegue al Servidor (Paso 5)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PASO 5: DESPLIEGUE AL SERVIDOR Y DISPARO REMOTO DE DAG
          ───────────────────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-6">
          {/* Card 1: Despliegue al Servidor (Fase 1: Infraestructura & SFTP) */}
          <div className="hp-card p-6 space-y-5 border-t-4 border-t-[#024ad8] bg-white shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#e8e8e8] pb-4">
              <div>
                <h3 className="font-bold text-base text-[#1a1a1a] flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#024ad8]" />
                  <span>Fase 1: Despliegue al Servidor Remoto y Generación de DAG:</span>
                  <span className="font-mono text-[#024ad8]">{familyDetail?.parent_code || selectedParent}</span>
                </h3>
                <p className="text-xs text-[#636363] mt-0.5">
                  Transfiere la familia completa de conversión (.py y .sqlite) vía SFTP y compila el DAG en Airflow Docker.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-slate-300 text-slate-600 bg-slate-50 font-mono text-[11px] inline-flex items-center gap-1">
                  <Globe className="w-3 h-3 text-slate-500" />
                  <span>SFTP / Docker</span>
                </Badge>
                <Badge variant="primary">{selectedSubReport}</Badge>
              </div>
            </div>

            {/* Parámetros SSH */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#f8fafc] p-4 rounded-[8px] border border-slate-200 shadow-2xs">
              <div>
                <label className="text-xs font-bold text-[#1a1a1a] block mb-1">Host Servidor:</label>
                <input
                  type="text"
                  value={sshHost}
                  onChange={(e) => setSshHost(e.target.value)}
                  placeholder="Desde .env..."
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-[4px] outline-none bg-white focus:border-[#024ad8] focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#1a1a1a] block mb-1">Puerto SSH:</label>
                <input
                  type="number"
                  value={sshPort}
                  onChange={(e) => setSshPort(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-[4px] outline-none bg-white focus:border-[#024ad8] focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#1a1a1a] block mb-1">Usuario SSH:</label>
                <input
                  type="text"
                  value={sshUser}
                  onChange={(e) => setSshUser(e.target.value)}
                  placeholder="Desde .env..."
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-[4px] outline-none bg-white focus:border-[#024ad8] focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#1a1a1a] block mb-1">Contraseña SSH / sudo:</label>
                <input
                  type="password"
                  placeholder="Contraseña (o configurada en .env)"
                  value={sshPass}
                  onChange={(e) => setSshPass(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-[4px] outline-none bg-white focus:border-[#024ad8] focus:ring-1 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-[#1a1a1a] pt-1">
              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={generateDagServer}
                  onChange={(e) => setGenerateDagServer(e.target.checked)}
                  className="accent-[#024ad8] w-4 h-4"
                />
                <span>Generar DAG de conversión automáticamente en Airflow (Docker)</span>
              </label>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-[#e8e8e8]">
              <button onClick={() => setStep(4)} className="hp-btn hp-btn-outline-ink text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> Volver a Plantilla (Paso 4)
              </button>

              <button
                onClick={handleDeployConversion}
                disabled={deploying}
                className="hp-btn hp-btn-primary text-xs h-9 px-5 font-bold shadow-sm"
              >
                {deploying ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Server className="w-3.5 h-3.5" />
                )}
                <span>
                  {deploying
                    ? "Subiendo y Generando DAG..."
                    : `Subir al Servidor y Crear DAG ${familyDetail?.parent_code || selectedParent}`}
                </span>
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
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span>
                    {deployResult.success
                      ? `¡Despliegue de ${familyDetail?.parent_code || selectedParent} exitoso en el servidor remoto!`
                      : "Ocurrieron errores durante el despliegue."}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: SUB-SECCIÓN DISPARO REMOTO EN AIRFLOW (Fase 2: Orquestación & Runtime) */}
          <div className="rounded-[16px] p-6 space-y-5 border-2 border-indigo-200/90 border-t-4 border-t-amber-500 bg-linear-to-br from-[#f0f5ff] via-[#e8efff] to-[#f4f1fd] shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-200/60 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="p-1 rounded-md bg-amber-400/20 text-amber-600">
                    <Zap className="w-4 h-4 fill-amber-500 text-amber-600" />
                  </div>
                  <h4 className="font-bold text-base text-[#0e3191]">
                    Fase 2: Ejecución del DAG en Airflow (Trigger Remoto)
                  </h4>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                    Airflow Runtime
                  </span>
                </div>
                <p className="text-xs text-indigo-950/70 mt-1">
                  Ejecuta el comando <code>airflow dags trigger</code> dentro del contenedor worker de Airflow con parámetros de prueba.
                </p>
              </div>

              <button
                onClick={() => loadLatestDownloadInfo(selectedSubReport)}
                className="hp-btn text-xs h-7 px-3 bg-white text-indigo-900 border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 shadow-2xs shrink-0"
                title="Consultar última descarga en platform_db"
              >
                <RefreshCw className="w-3 h-3 text-indigo-600" /> Recargar Descarga
              </button>
            </div>

            {/* Banner de última descarga detectada */}
            {latestDlInfo && (
              <div className="p-3.5 bg-white/90 border border-indigo-200/80 rounded-[8px] text-xs text-indigo-950 space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-2 font-bold flex-wrap">
                  <span className="text-indigo-900 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Última Descarga detectada en BD:</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[11px] font-mono font-semibold">
                    ID #{latestDlInfo.id_download}
                  </span>
                  {latestDlInfo.downloaded_to && (
                    <span className="text-indigo-700 font-medium">Corte: <strong className="font-mono">{latestDlInfo.downloaded_to}</strong></span>
                  )}
                </div>
                {latestDlInfo.file && (
                  <p className="font-mono text-[11px] text-slate-600 truncate" title={latestDlInfo.file}>
                    Archivo: {latestDlInfo.file}
                  </p>
                )}
              </div>
            )}

            {/* Inputs de configuración para trigger */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-[8px] border border-indigo-100 shadow-xs">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Código de Reporte (--conf 'code'):
                </label>
                <input
                  type="text"
                  value={trigCode}
                  onChange={(e) => setTrigCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-[4px] outline-none bg-slate-50/50 focus:bg-white focus:border-[#024ad8] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  ID de Descarga (--conf 'id_download'):
                </label>
                <input
                  type="number"
                  value={trigIdDl}
                  onChange={(e) => setTrigIdDl(parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-[4px] outline-none bg-slate-50/50 focus:bg-white focus:border-[#024ad8] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Ruta Descargada (--conf 'file'):
                </label>
                <input
                  type="text"
                  value={trigFile}
                  onChange={(e) => setTrigFile(e.target.value)}
                  placeholder="\\10.0.0.16\downloaded_files\..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-[4px] outline-none bg-slate-50/50 focus:bg-white focus:border-[#024ad8] focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* Botón Disparar DAG */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleTriggerConversionDag}
                disabled={triggeringDag}
                className="hp-btn text-xs h-10 px-6 font-bold text-white rounded-[6px] shadow-md bg-linear-to-r from-[#024ad8] via-indigo-600 to-[#1d5ce6] hover:from-[#0e3191] hover:to-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {triggeringDag ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                )}
                <span>
                  {triggeringDag
                    ? "Disparando DAG en Airflow..."
                    : `Disparar DAG ${familyDetail?.parent_code || selectedParent} en Airflow`}
                </span>
              </button>
            </div>

            {/* Resultado de Airflow Trigger */}
            {triggerResult && (
              <div className="space-y-2 pt-2">
                <div
                  className={`p-3 rounded-[6px] border text-xs font-bold flex items-center gap-2 ${
                    triggerResult.success
                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                      : "bg-amber-50 border-amber-300 text-amber-900"
                  }`}
                >
                  {triggerResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                  <span>
                    {triggerResult.success
                      ? `¡DAG ${familyDetail?.parent_code || selectedParent} disparado exitosamente en Airflow!`
                      : "El comando de disparo terminó con advertencias o error."}
                  </span>
                </div>

                {triggerResult.output && (
                  <div className="bg-[#1a1a1a] text-emerald-400 p-3 rounded-[4px] text-xs font-mono max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{triggerResult.output}</pre>
                  </div>
                )}
              </div>
            )}
          </div>

          <TerminalLogs logs={[...externalLogs, ...localLogs]} title="Conversion Deploy & Airflow Console" />
        </div>
      )}

      {/* Modern Toast Notification */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
