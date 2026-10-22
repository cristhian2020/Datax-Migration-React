import React from "react";

export function Badge({ children, variant = "ink", className = "" }) {
  const styles = {
    ink: "bg-[#1a1a1a] text-white border-transparent",
    outline: "bg-white text-[#1a1a1a] border-[#e8e8e8]",
    primary: "bg-[#c9e0fc] text-[#0e3191] border-[#024ad8]/20",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    coral: "bg-[#ff5050] text-white border-transparent font-bold",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[4px] border ${styles[variant] || styles.ink} ${className}`}
    >
      {children}
    </span>
  );
}
