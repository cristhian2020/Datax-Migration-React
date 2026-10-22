import React from "react";

export function FooterDark() {
  return (
    <footer className="bg-[#1a1a1a] text-[#ffffff] border-t border-[#292929] mt-20 py-10 px-8 select-none">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-sm">
        <div className="flex items-center gap-4">
          <div className="w-7 h-7 bg-[#024ad8] text-white flex items-center justify-center font-bold text-xs rounded-[2px] -skew-x-12">
            DX
          </div>
          <div>
            <div className="font-semibold text-white">DATAX Platform Engineering</div>
            <div className="text-xs text-slate-400">Estandarización y Migración Inteligente V1 a V2</div>
          </div>
        </div>

        <div className="flex items-center gap-8 text-xs text-slate-400">
          <span>Estándares Oficiales DATAX</span>
          <span>•</span>
          <span>Arquitectura 2 Métodos</span>
          <span>•</span>
          <span>Airflow V2 & Docker Workers</span>
        </div>

        <div className="text-xs text-slate-500">
          © {new Date().getFullYear()} DATAX. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
