import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  FileText,
  Bot,
  BookOpen,
  CheckSquare,
  Code2,
  Download,
  Search,
  Paperclip,
  ArrowRight,
  ExternalLink,
  Copy,
  RefreshCw,
  Check,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { api } from "../services/api";
import { Badge } from "../components/ui/Badge";
import { TerminalLogs } from "../components/ui/TerminalLogs";

export function AutoGenerateView({ externalLogs = [] }) {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const [storyDetail, setStoryDetail] = useState(null);
  const [convertImage, setConvertImage] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [downloadingAtt, setDownloadingAtt] = useState(null);

  const [reportCode, setReportCode] = useState("D_BO_000000051_01");
  const [robotType, setRobotType] = useState("conversion");
  const [samplePath, setSamplePath] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [localLogs, setLocalLogs] = useState([]);

  // Guide subtab
  const [activeTab, setActiveTab] = useState("agent"); // "agent" or "guides"
  const [guideCategory, setGuideCategory] = useState("conversion");

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    let res = [...tasks];
    if (statusFilter !== "all") {
      res = res.filter(
        (t) => (t.status || "").toLowerCase() === statusFilter.toLowerCase()
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter(
        (t) =>
          (t.subject || "").toLowerCase().includes(q) ||
          (t.robot_code || "").toLowerCase().includes(q) ||
          (t.assigned_to || "").toLowerCase().includes(q) ||
          String(t.ref || "").includes(q)
      );
    }
    setFilteredTasks(res);
  }, [tasks, searchQuery, statusFilter]);

  const loadTasks = async () => {
    try {
      setLocalLogs((prev) => [...prev, "[Taiga] Consultando historias de usuario..."]);
      const res = await api.get("/autogenerate/taiga-tasks");
      const list = res.data.tasks || [];
      setTasks(list);
      setFilteredTasks(list);
      setLocalLogs((prev) => [
        ...prev,
        `[Taiga] ${list.length} historias obtenidas exitosamente.`,
      ]);
      if (list.length > 0 && !selectedTask) {
        handleSelectTask(list[0]);
      }
    } catch (e) {
      console.error(e);
      setLocalLogs((prev) => [
        ...prev,
        `[Taiga Error] ${e.response?.data?.detail || e.message}`,
      ]);
    }
  };

  const handleSelectTask = async (task) => {
    setSelectedTask(task);
    setReportCode(task.robot_code || "D_BO_000000001_01");
    setRobotType(task.task_type === "download" ? "download" : "conversion");

    // Pre-populate instructions if relevant metadata exists
    let extra = "";
    if (task.main_url) extra += `URL: ${task.main_url}\n`;
    if (task.page_number && task.page_number > 1)
      extra += `Página: ${task.page_number}\n`;
    if (task.decimal_separator)
      extra += `Separador decimal: ${task.decimal_separator}\n`;
    if (task.key_words) extra += `Palabras clave: ${task.key_words}\n`;
    setInstructions(extra.trim());

    // Fetch attachments and detailed story
    try {
      const res = await api.get(`/autogenerate/story/${task.ref}`);
      setStoryDetail(res.data.detail);
        const convImg = res.data.convert_image || res.data.detail?.convert_image || "";
        setConvertImage(convImg);
        if (convImg) {
          extra = `EJEMPLO OFICIAL DE NIVELES (Convert Image):\n${convImg}\n\n` + extra;
          setInstructions(extra.trim());
        }
      const rawAtts = res.data.attachments || [];
      const sortedAtts = [...rawAtts].sort((a, b) => {
        const isDataA = /\.(xlsx|xls|pdf|csv)$/i.test(a.name || "");
        const isDataB = /\.(xlsx|xls|pdf|csv)$/i.test(b.name || "");
        return isDataB - isDataA;
      });
      setAttachments(sortedAtts);
    } catch (err) {
      setStoryDetail(null);
        setConvertImage("");
      setAttachments([]);
    }
  };

  const handleDownloadAttachment = async (att) => {
    setDownloadingAtt(att.id);
    const fname = att.name || "sample.xlsx";
    setLocalLogs((prev) => [
      ...prev,
      `[Taiga] Descargando adjunto ${fname} a attachtments/...`,
    ]);
    try {
      const res = await api.post("/autogenerate/download-attachment", {
        attachment_url: att.url,
        filename: fname,
      });
      setSamplePath(res.data.path);
      setLocalLogs((prev) => [
        ...prev,
        `[Taiga] Archivo guardado en ${res.data.path}`,
      ]);
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[Taiga Error] No se pudo descargar el adjunto: ${
          e.response?.data?.detail || e.message
        }`,
      ]);
    } finally {
      setDownloadingAtt(null);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setLocalLogs((prev) => [
      ...prev,
      `[IA Agente] Analizando requerimientos y generando robot ${reportCode}...`,
    ]);
    try {
      const res = await api.post("/autogenerate/generate-robot", {
        report_code: reportCode,
        robot_type: robotType,
        sample_path: samplePath,
        instructions: instructions,
      }, { timeout: 180000 });
      setGeneratedCode(res.data.robot_code || "");
      setSummary(res.data.summary || []);
      setLocalLogs((prev) => [
        ...prev,
        `[IA Agente] Robot ${reportCode} generado exitosamente bajo estándares DATAX.`,
      ]);
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[IA ERROR] ${e.response?.data?.detail || e.message}`,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleTestRobot = async () => {
    if (!generatedCode) return;
    setTesting(true);
    setLocalLogs((prev) => [
      ...prev,
      `[Validador] Ejecutando suite de pruebas sobre ${reportCode}...`,
    ]);
    try {
      const res = await api.post("/autogenerate/test-robot", {
        report_code: reportCode,
        robot_code: generatedCode,
        sample_path: samplePath,
        robot_type: robotType,
      });
      if (res.data.success) {
        setLocalLogs((prev) => [
          ...prev,
          `[Validador OK] El robot cumple con todos los estándares DATAX.`,
        ]);
      } else {
        setLocalLogs((prev) => [
          ...prev,
          `[Validador ALERTA] Fallas detectadas: ${
            res.data.error || "Revisar logs detallados."
          }`,
        ]);
      }
    } catch (e) {
      setLocalLogs((prev) => [
        ...prev,
        `[Validador Error] ${e.response?.data?.detail || e.message}`,
      ]);
    } finally {
      setTesting(false);
    }
  };

  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setLocalLogs((prev) => [
        ...prev,
        `[Portapapeles] Código de ${reportCode} copiado.`,
      ]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-6 border-b border-[#e8e8e8]">
        <div>
          <div className="flex items-center gap-2">
            <span className="hp-chevron" />
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">
              AutoGenerate: Agente Autónomo IA (Taiga) (BETA)
            </h1>
          </div>
          <p className="text-xs text-[#636363] mt-1">
            Integración nativa con Taiga Kanban, descarga automática de muestras y generación cognitiva de robots con cumplimiento estricto DATAX
          </p>
        </div>

        <div className="inline-flex p-1 bg-[#f7f7f7] rounded-[4px] border border-[#e8e8e8]">
          <button
            onClick={() => setActiveTab("agent")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-all flex items-center gap-1.5 ${
              activeTab === "agent"
                ? "bg-[#1a1a1a] text-white shadow-xs"
                : "text-[#636363] hover:text-[#1a1a1a]"
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Agente Generador</span>
          </button>
          <button
            onClick={() => setActiveTab("guides")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-all flex items-center gap-1.5 ${
              activeTab === "guides"
                ? "bg-[#1a1a1a] text-white shadow-xs"
                : "text-[#636363] hover:text-[#1a1a1a]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Guías & Checklist DATAX</span>
          </button>
        </div>
      </div>

      {activeTab === "agent" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Columna Izquierda: Drawer de Historias Taiga */}
          <div className="lg:col-span-4 space-y-4">
            <div className="hp-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#024ad8] animate-pulse" />
                  <span className="text-xs font-bold uppercase text-[#1a1a1a]">
                    Historias Taiga ({filteredTasks.length}/{tasks.length})
                  </span>
                </div>
                <button
                  onClick={loadTasks}
                  title="Recargar historias de Taiga"
                  className="p-1 text-[#636363] hover:text-[#024ad8] rounded-[4px] hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Buscador */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, nombre o ref..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#e8e8e8] rounded-[4px] outline-none focus:border-[#024ad8]"
                />
              </div>

              {/* Filtros de Estado */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
                {["all", "New", "In progress", "Revision", "Ready for test", "Done"].map(
                  (st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-2 py-0.5 rounded-[3px] font-medium whitespace-nowrap transition-colors ${
                        statusFilter === st
                          ? "bg-[#024ad8] text-white"
                          : "bg-slate-100 text-[#636363] hover:bg-slate-200"
                      }`}
                    >
                      {st === "all" ? "Todos" : st}
                    </button>
                  )
                )}
              </div>

              {/* Lista Scrollable */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {filteredTasks.length > 0 ? (
                  filteredTasks.map((t) => {
                    const isSelected = selectedTask?.id === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => handleSelectTask(t)}
                        className={`p-2.5 rounded-[4px] border cursor-pointer transition-all ${
                          isSelected
                            ? "border-[#024ad8] bg-blue-50/40 shadow-xs"
                            : "border-[#e8e8e8] bg-white hover:border-slate-400"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-[11px] font-bold text-[#024ad8]">
                            {t.robot_code || `US #${t.ref}`}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
                            style={{
                              backgroundColor: t.status_color || "#636363",
                            }}
                          >
                            {t.status}
                          </span>
                        </div>
                        <div className="text-xs text-[#1a1a1a] line-clamp-2 font-medium">
                          {t.subject}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#636363]">
                          <span>{t.assigned_to || "Sin asignar"}</span>
                          <span className="uppercase text-[9px] font-bold tracking-wider text-slate-400">
                            {t.task_type}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-xs text-slate-400 italic">
                    No se encontraron historias que coincidan
                  </div>
                )}
              </div>
            </div>

            {/* Requerimientos y Parámetros del Robot */}
            <div className="hp-card p-4 space-y-3">
              <span className="text-xs font-bold uppercase text-[#1a1a1a] block border-b border-[#e8e8e8] pb-1.5">
                Configuración del Robot
              </span>

              <div>
                <label className="text-[11px] font-bold text-[#636363] block mb-1">
                  Código de Reporte:
                </label>
                <input
                  type="text"
                  value={reportCode}
                  onChange={(e) => setReportCode(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold text-[#024ad8] border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#636363] block mb-1">
                  Tipo de Robot:
                </label>
                <select
                  value={robotType}
                  onChange={(e) => setRobotType(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] bg-white outline-none focus:border-[#024ad8]"
                >
                  <option value="conversion">Conversión (Excel/PDF → 2 Métodos)</option>
                  <option value="download">Descarga (Web Scraping / API - 4 Tipos)</option>
                </select>
              </div>

              {/* Adjuntos en Taiga */}
              {attachments.length > 0 && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-[4px] space-y-2">
                  <div className="text-[11px] font-bold text-[#1a1a1a] flex items-center gap-1.5">
                    <Paperclip className="w-3 h-3 text-[#024ad8]" />
                    <span>Archivos Adjuntos en Taiga ({attachments.length}):</span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {attachments.map((att) => {
                      const isData = /\.(xlsx|xls|pdf|csv)$/i.test(att.name || "");
                      return (
                        <div
                          key={att.id}
                          className={`flex items-center justify-between text-[11px] p-1.5 rounded border transition-all ${
                            isData ? "bg-emerald-50/50 border-emerald-200" : "bg-white border-[#e8e8e8]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate max-w-[200px]" title={att.name}>
                            <span className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase tracking-wider ${
                              isData ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                            }`}>
                              {isData ? "Datos" : "Img"}
                            </span>
                            <span className="truncate text-xs font-mono">{att.name}</span>
                          </div>
                          <button
                            onClick={() => handleDownloadAttachment(att)}
                            disabled={downloadingAtt === att.id}
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded flex items-center gap-1 text-white transition-all ${
                              isData ? "bg-emerald-600 hover:bg-emerald-700 shadow-xs" : "bg-slate-500 hover:bg-slate-600"
                            }`}
                          >
                            <Download className="w-3 h-3" />
                            <span>{downloadingAtt === att.id ? "Bajando..." : isData ? "Usar Datos" : "Descargar"}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                {convertImage && (
                  <div className="p-2.5 rounded-[4px] border border-amber-200 bg-amber-50/50 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <Table className="w-3.5 h-3.5 text-amber-700" />
                      <span>Ejemplo de Niveles en Taiga (Convert Image):</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-700 max-h-32 overflow-y-auto whitespace-pre-wrap bg-white p-2 rounded border border-amber-200">
                      {convertImage}
                    </div>
                  </div>
                )}

                <label className="text-[11px] font-bold text-[#636363] block mb-1">
                  Ruta Muestra (Excel/PDF):
                </label>
                <input
                  type="text"
                  placeholder="attachtments/archivo.xlsx"
                  value={samplePath}
                  onChange={(e) => setSamplePath(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#636363] block mb-1">
                  Instrucciones Especiales / Metadata:
                </label>
                <textarea
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Ej: Columna A contiene romanos y B nombres; usar celdas pivote..."
                  className="w-full px-3 py-1.5 text-xs border border-[#c2c2c2] rounded-[4px] outline-none focus:border-[#024ad8]"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full hp-btn hp-btn-primary text-xs py-2.5 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{loading ? "Analizando y Generando con IA..." : "Generar Robot Cognitivo"}</span>
              </button>
            </div>
          </div>

          {/* Columna Derecha: Editor Monaco + Acciones + Consola */}
          <div className="lg:col-span-8 space-y-4">
            <div className="hp-card p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#e8e8e8]">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-[#024ad8]" />
                  <span className="text-xs font-bold uppercase text-[#1a1a1a]">
                    Código del Robot Generado ({reportCode})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="primary">DATAX Compliant</Badge>
                  <button
                    onClick={handleCopyCode}
                    disabled={!generatedCode}
                    className="px-2.5 py-1 text-xs font-medium border border-[#c2c2c2] rounded-[4px] hover:bg-slate-50 flex items-center gap-1.5 text-[#1a1a1a]"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copiar</span>
                  </button>
                  <button
                    onClick={handleTestRobot}
                    disabled={!generatedCode || testing}
                    className="hp-btn hp-btn-secondary text-xs px-3 py-1 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 text-[#024ad8]" />
                    <span>{testing ? "Validando..." : "Validar Estándares"}</span>
                  </button>
                </div>
              </div>

              <div className="h-[460px] rounded-[4px] overflow-hidden border border-[#e8e8e8]">
                <Editor
                  height="100%"
                  language="python"
                  value={
                    generatedCode ||
                    `# ==============================================================================
# ROBOT DATAX GENERATOR
# Selecciona una historia de Taiga a la izquierda y presiona 'Generar Robot Cognitivo'.
# El agente analizará la muestra, aplicará la regla estricta de 2 métodos o los 4 tipos
# de descarga oficial, y escribirá código 100% compliant listo para producción.
# ==============================================================================`
                  }
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily: "JetBrains Mono, Menlo, monospace",
                    scrollBeyondLastLine: false,
                  }}
                  theme="light"
                />
              </div>

              {summary.length > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[4px]">
                  <div className="text-xs font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Resumen Cognitivo de Generación:</span>
                  </div>
                  <ul className="text-xs text-emerald-800 space-y-0.5 list-disc pl-4">
                    {summary.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <TerminalLogs
              logs={[...externalLogs, ...localLogs]}
              title="Taiga & Cognitive Loop Logs"
            />
          </div>
        </div>
      ) : (
        /* Pestaña de Guías Oficiales DATAX */
        <div className="hp-card p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-[#e8e8e8] pb-3 text-xs">
            {[
              { id: "conversion", label: "Guía Conversión (2 Métodos)", icon: BookOpen },
              { id: "download", label: "Guía Descarga (4 Tipos)", icon: Download },
              { id: "checklist", label: "Checklist de Calidad", icon: CheckSquare },
              { id: "templates", label: "Plantillas Canónicas", icon: Code2 },
            ].map((g) => {
              const IconComp = g.icon;
              return (
                <button
                  key={g.id}
                  onClick={() => setGuideCategory(g.id)}
                  className={`pb-1 font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
                    guideCategory === g.id
                      ? "text-[#024ad8] border-b-2 border-[#024ad8]"
                      : "text-[#636363] hover:text-[#1a1a1a]"
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{g.label}</span>
                </button>
              );
            })}
          </div>

          <div className="prose prose-sm max-w-none text-xs text-[#3d3d3d] space-y-4 leading-relaxed">
            {guideCategory === "conversion" && (
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-[#1a1a1a]">
                  Regla de Oro de la Clase Robot de Conversión (Estricta)
                </h4>
                <p>
                  La clase del reporte (nombrada con el código del reporte, ej.{" "}
                  <code>D_BO_000000051_01</code>, y referenciada como{" "}
                  <code>Robot = D_BO_...</code>) debe contener{" "}
                  <strong>ÚNICA Y EXCLUSIVAMENTE DOS MÉTODOS</strong>:
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>
                    <code>
                      def extraction(self, file_path: str, key_words: str,
                      template_path: str = "", page_number: int = 1, format: str
                      = "%Y-%m-%d") -&gt; tuple:
                    </code>
                  </li>
                  <li>
                    <code>
                      def validate_data_results(self, dataframe: pd.DataFrame,
                      decimal_separator: str = ",", TOLERANCE: float = 6.0)
                      -&gt; bool:
                    </code>
                  </li>
                </ol>
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-[4px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>PROHIBIDO:</strong> No definir constructor{" "}
                    <code>__init__</code>, no definir métodos auxiliares en{" "}
                    <code>self</code> (ej. <code>self._limpiar()</code>), y no
                    hardcodear listas extensas de nombres de cuentas.
                  </div>
                </div>
              </div>
            )}

            {guideCategory === "download" && (
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-[#1a1a1a]">
                  Los 4 Tipos Oficiales de Robots de Descarga
                </h4>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Tipo I (Descarga Asistida por Plataforma):</strong>{" "}
                    Implementa <code>get_file_url()</code> y{" "}
                    <code>compare_files()</code>.
                  </li>
                  <li>
                    <strong>Tipo II (Descarga Controlada + Comparación):</strong>{" "}
                    Implementa <code>verify_download()</code> y{" "}
                    <code>compare_files()</code>.
                  </li>
                  <li>
                    <strong>Tipo III (Pipeline Integrado / APIs / REST):</strong>{" "}
                    Implementa <code>check_new_data()</code>. Recrea{" "}
                    <code>tmp/</code> y retorna lista de diccionarios con llaves
                    exactas <code>{"{'tmp_path', 'updated_to', 'download_url'}"}</code>.
                  </li>
                  <li>
                    <strong>Tipo IV (Descarga por Lote con Prefijo de Fecha):</strong>{" "}
                    Implementa <code>get_data()</code> con archivos nombrados con
                    formato ISO <code>YYYY-MM-DD_...</code>.
                  </li>
                </ul>
              </div>
            )}

            {guideCategory === "checklist" && (
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[#1a1a1a]">
                  Checklist Obligatorio para Pull Requests
                </h4>
                <ul className="space-y-2 text-xs">
                  {[
                    "PEP 8 estricto (4 espacios, comentarios y nombres en inglés).",
                    "Sin listas de strings quemadas o hardcodeadas.",
                    "Uso de celdas pivote y sangrías (indent_level).",
                    "Retorno de validate_data_results(): False si es válido, True si hay error.",
                    "Limpieza y recreación rigurosa de carpetas temporales tmp/.",
                    "Suite de tests unitarios finalizando en OK.",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {guideCategory === "templates" && (
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-[#1a1a1a]">
                  Estructura Canónica: Robot de Conversión
                </h4>
                <pre className="p-3 bg-[#111] text-emerald-400 font-mono text-[11px] rounded-[4px] overflow-x-auto">
{`import os
import pandas as pd
from conversion_tools import to_numeric_datax

class D_BO_000000051_01:
    def extraction(self, file_path: str, key_words: str, template_path: str = "", page_number: int = 1, format: str = "%Y-%m-%d") -> tuple:
        metadata_dict = {
            "file_name": os.path.basename(file_path),
            "titles": ["Título 1", "Título 2"],
            "page_number": int(page_number)
        }
        # Procesamiento estructural con celdas pivote
        # df_melted columns: [nv1, nv2, ..., fecha, valor]
        return (metadata_dict, df_melted)

    def validate_data_results(self, dataframe: pd.DataFrame, decimal_separator: str = ",", TOLERANCE: float = 6.0) -> bool:
        # Reconciliación matemática: retorna False si cuadra
        return False

Robot = D_BO_000000051_01`}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
