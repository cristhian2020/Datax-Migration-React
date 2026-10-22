import React, { useState, useEffect } from "react";
import { X, Save, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../../services/api";

export function ConfigModal({ isOpen, onClose, onConfigSaved }) {
  const [cfg, setCfg] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      const res = await api.get("/config");
      setCfg(res.data.config || {});
    } catch (e) {
      setMsg({ type: "error", text: "Error cargando configuración" });
    }
  };

  const handleChange = (key, value) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await api.post("/config", cfg);
      setMsg({ type: "success", text: res.data.message });
      if (onConfigSaved) onConfigSaved();
    } catch (e) {
      setMsg({ type: "error", text: "Error guardando configuración" });
    } finally {
      setLoading(false);
    }
  };

  const testDb = async () => {
    try {
      const res = await api.post("/config/test-db");
      setMsg({ type: res.data.success ? "success" : "error", text: res.data.message });
    } catch (e) {
      setMsg({ type: "error", text: "Fallo al probar la base de datos" });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-[16px] max-w-2xl w-full border border-[#e8e8e8] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-[#e8e8e8] flex items-center justify-between bg-[#f7f7f7]">
          <div>
            <h3 className="font-bold text-lg text-[#1a1a1a]">Configuración de Entorno (.env)</h3>
            <p className="text-xs text-[#636363]">Parámetros de repositorios, base de datos y credenciales</p>
          </div>
          <button onClick={onClose} className="p-1 text-[#636363] hover:text-[#1a1a1a]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          {msg && (
            <div
              className={`p-3 rounded-[4px] flex items-center gap-2 ${
                msg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {msg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="font-semibold block mb-1 text-[#1a1a1a]">Ruta Repositorio Antiguo (V1):</label>
              <input
                type="text"
                value={cfg.old_repo || ""}
                onChange={(e) => handleChange("old_repo", e.target.value)}
                className="w-full px-3 py-2 border border-[#c2c2c2] rounded-[4px] font-mono focus:border-[#1a1a1a] outline-none"
              />
            </div>

            <div className="col-span-2">
              <label className="font-semibold block mb-1 text-[#1a1a1a]">Ruta Repositorio Nuevo (V2):</label>
              <input
                type="text"
                value={cfg.new_repo || ""}
                onChange={(e) => handleChange("new_repo", e.target.value)}
                className="w-full px-3 py-2 border border-[#c2c2c2] rounded-[4px] font-mono focus:border-[#1a1a1a] outline-none"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1 text-[#1a1a1a]">DB Host:</label>
              <input
                type="text"
                value={cfg.db_host || ""}
                onChange={(e) => handleChange("db_host", e.target.value)}
                className="w-full px-3 py-2 border border-[#c2c2c2] rounded-[4px] focus:border-[#1a1a1a] outline-none"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1 text-[#1a1a1a]">DB Puerto:</label>
              <input
                type="number"
                value={cfg.db_port || 5434}
                onChange={(e) => handleChange("db_port", parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-[#c2c2c2] rounded-[4px] focus:border-[#1a1a1a] outline-none"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1 text-[#1a1a1a]">DB Usuario:</label>
              <input
                type="text"
                value={cfg.db_user || ""}
                onChange={(e) => handleChange("db_user", e.target.value)}
                className="w-full px-3 py-2 border border-[#c2c2c2] rounded-[4px] focus:border-[#1a1a1a] outline-none"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1 text-[#1a1a1a]">DB Contraseña:</label>
              <input
                type="password"
                value={cfg.db_pass || ""}
                onChange={(e) => handleChange("db_pass", e.target.value)}
                className="w-full px-3 py-2 border border-[#c2c2c2] rounded-[4px] focus:border-[#1a1a1a] outline-none"
              />
            </div>

            <div className="col-span-2">
              <label className="font-semibold block mb-1 text-[#1a1a1a]">Google Gemini API Key:</label>
              <input
                type="password"
                value={cfg.gemini_api_key || ""}
                onChange={(e) => handleChange("gemini_api_key", e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 border border-[#c2c2c2] rounded-[4px] font-mono focus:border-[#1a1a1a] outline-none"
              />
            </div>

            <div className="col-span-2">
              <label className="font-semibold block mb-1 text-[#1a1a1a]">GitHub Token (PAT):</label>
              <input
                type="password"
                value={cfg.github_token || ""}
                onChange={(e) => handleChange("github_token", e.target.value)}
                className="w-full px-3 py-2 border border-[#c2c2c2] rounded-[4px] font-mono focus:border-[#1a1a1a] outline-none"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#f7f7f7] border-t border-[#e8e8e8] flex items-center justify-between">
          <button
            onClick={testDb}
            className="hp-btn hp-btn-outline text-xs"
          >
            Probar Conexión BD
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="hp-btn hp-btn-outline-ink text-xs"
            >
              Cerrar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="hp-btn hp-btn-primary text-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? "Guardando..." : "Guardar Cambios"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
