import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2, X } from "lucide-react";

export function Toast({ toast, onClose }) {
  if (!toast) return null;

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => {
        onClose();
      }, toast.duration || 4500);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  const typeConfig = {
    success: {
      border: "border-emerald-500/40",
      bg: "bg-[#141d17]/95",
      iconBg: "bg-emerald-500/20 text-emerald-400",
      titleColor: "text-emerald-300",
      icon: CheckCircle2,
    },
    error: {
      border: "border-rose-500/40",
      bg: "bg-[#211416]/95",
      iconBg: "bg-rose-500/20 text-rose-400",
      titleColor: "text-rose-300",
      icon: AlertCircle,
    },
    warning: {
      border: "border-amber-500/40",
      bg: "bg-[#211d13]/95",
      iconBg: "bg-amber-500/20 text-amber-400",
      titleColor: "text-amber-300",
      icon: AlertTriangle,
    },
    info: {
      border: "border-blue-500/40",
      bg: "bg-[#111827]/95",
      iconBg: "bg-blue-500/20 text-blue-400",
      titleColor: "text-blue-300",
      icon: Info,
    },
    loading: {
      border: "border-blue-500/40",
      bg: "bg-[#111827]/95",
      iconBg: "bg-blue-500/20 text-blue-400",
      titleColor: "text-blue-300",
      icon: Loader2,
      spin: true,
    },
  };

  const config = typeConfig[toast.type] || typeConfig.info;
  const Icon = config.icon;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full transition-all duration-300">
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border ${config.border} ${config.bg} text-white shadow-2xl backdrop-blur-md transition-all`}
        style={{
          boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        }}
      >
        <div className={`p-2 rounded-lg ${config.iconBg} shrink-0`}>
          <Icon className={`w-5 h-5 ${config.spin ? "animate-spin" : ""}`} />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          {toast.title && (
            <h4 className={`text-sm font-semibold tracking-tight ${config.titleColor}`}>
              {toast.title}
            </h4>
          )}
          <p className="text-xs text-slate-300 mt-0.5 leading-relaxed break-words whitespace-pre-line">
            {toast.message}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors shrink-0 -mr-1 -mt-1"
          title="Cerrar notificación"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
