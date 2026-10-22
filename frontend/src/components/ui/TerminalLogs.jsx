import React, { useRef, useEffect } from "react";
import { Terminal, Trash2 } from "lucide-react";

export function TerminalLogs({ logs = [], onClear, title = "Live Process Terminal", height = "h-64" }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-[#1a1a1a] text-[#f7f7f7] rounded-[16px] border border-[#3d3d3d] overflow-hidden shadow-2xl flex flex-col my-4">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#292929] border-b border-[#3d3d3d]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#296ef9]" />
          <span className="text-xs font-mono font-medium tracking-wide uppercase text-slate-300">
            {title}
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-2" />
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-[#3d3d3d] transition-colors"
            title="Limpiar logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        className={`${height} overflow-y-auto p-4 font-mono text-xs space-y-1.5 leading-relaxed bg-[#111111]`}
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">Esperando eventos y logs del proceso...</div>
        ) : (
          logs.map((log, index) => {
            const isError = /fail|error|exception|traceback/i.test(log.message || log);
            const isSuccess = /ok|success|exito|completado|ready/i.test(log.message || log);
            const isWarn = /warning|warn|alerta/i.test(log.message || log);

            let textColor = "text-slate-300";
            if (isError) textColor = "text-rose-400 font-medium";
            else if (isSuccess) textColor = "text-emerald-400";
            else if (isWarn) textColor = "text-amber-300";

            return (
              <div key={index} className={`flex items-start gap-2 ${textColor}`}>
                <span className="text-slate-600 select-none">&gt;</span>
                <span className="break-all whitespace-pre-wrap">{log.message || log}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
