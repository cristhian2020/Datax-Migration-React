import React from "react";
import { Download, RefreshCw, Truck, Sparkles, BarChart3 } from "lucide-react";

export function TopNav({ activeTab, onSelectTab }) {
  const tabs = [
    { id: "download", label: "Robots de Descarga", icon: Download, tag: "D_..." },
    { id: "conversion", label: "Robots de Conversión", icon: RefreshCw, tag: "C_..." },
    { id: "migration", label: "Robots de Migración", icon: Truck, tag: "M_..." },
    { id: "autogenerate", label: "AutoGenerate (IA)", icon: Sparkles, tag: "Taiga (Beta)" },
    { id: "metrics", label: "Métricas", icon: BarChart3, tag: "Auditoría" },
  ];

  return (
    <header className="bg-white border-b border-[#e8e8e8] h-16 px-6 sticky top-0 z-40 flex items-center justify-between">
      <div className="flex items-center gap-8">
        {/* Brand Lockup */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 bg-[#1a1a1a] rounded-[4px] overflow-hidden">
            <span className="text-white font-bold text-lg tracking-tighter">DX</span>
            <div className="absolute right-0 top-0 bottom-0 w-2 bg-[#024ad8] -skew-x-12" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-[#1a1a1a]">DATAX PLATFORM</div>
            <div className="text-[10px] uppercase font-semibold text-[#636363] tracking-wider">
              Migration Studio V2
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`relative px-4 h-16 flex items-center gap-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-[#024ad8] font-semibold"
                    : "text-[#3d3d3d] hover:text-[#1a1a1a]"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-[#024ad8]" : "text-[#636363]"}`} />
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isActive ? "bg-[#c9e0fc] text-[#0e3191]" : "bg-[#f7f7f7] text-[#636363]"
                  }`}
                >
                  {tab.tag}
                </span>

                {/* HP Electric Blue 2.5px Bottom Indicator */}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#024ad8]" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold px-2.5 py-1 bg-[#f7f7f7] border border-[#e8e8e8] text-[#1a1a1a] rounded-[4px]">
          V1 ➔ V2 Enterprise
        </span>
      </div>
    </header>
  );
}
