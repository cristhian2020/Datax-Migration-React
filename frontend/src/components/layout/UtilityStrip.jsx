import React from "react";
import { Database, GitBranch, Server, Settings, CheckCircle2, XCircle } from "lucide-react";

export function UtilityStrip({ config, dbConnected, onOpenSettings }) {
  return (
    <div className="bg-[#1a1a1a] text-[#ffffff] h-9 px-6 flex items-center justify-between text-xs font-normal border-b border-[#292929] select-none">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Platform DB:</span>
          {dbConnected ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" /> Online ({config?.db_host || "localhost"})
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-400 font-medium">
              <XCircle className="w-3 h-3" /> Offline
            </span>
          )}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">GitHub:</span>
          <span className="text-slate-200 font-mono">
            {config?.github_repo || "datax-platform/data-processing-modules"}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Dev Server:</span>
          <span className="text-slate-200">{config?.ssh_host || "10.0.0.16"}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white px-2 py-0.5 rounded transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-[#296ef9]" />
          <span>Configuración .env</span>
        </button>
      </div>
    </div>
  );
}
