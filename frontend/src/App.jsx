import React, { useState, useEffect } from "react";
import { UtilityStrip } from "./components/layout/UtilityStrip";
import { TopNav } from "./components/layout/TopNav";
import { FooterDark } from "./components/layout/FooterDark";
import { ConfigModal } from "./components/layout/ConfigModal";
import { DownloadView } from "./views/DownloadView";
import { ConversionView } from "./views/ConversionView";
import { MigrationView } from "./views/MigrationView";
import { AutoGenerateView } from "./views/AutoGenerateView";
import { MetricsView } from "./views/MetricsView";
import { api } from "./services/api";
import { LogSocket } from "./services/websocket";

export function App() {
  const [activeTab, setActiveTab] = useState("download");
  const [config, setConfig] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    loadAppConfig();

    const socket = new LogSocket((msg) => {
      setLogs((prev) => [...prev.slice(-300), msg]);
    });

    return () => socket.disconnect();
  }, []);

  const loadAppConfig = async () => {
    try {
      const res = await api.get("/config");
      setConfig(res.data.config || {});
      setDbConnected(res.data.db_connected || false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* 1. Utility Strip (36px Ink #1a1a1a) */}
      <UtilityStrip
        config={config}
        dbConnected={dbConnected}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Top Nav (64px White) with Metrics Tab */}
      <TopNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* 3. Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {activeTab === "download" && <DownloadView externalLogs={logs} />}
        {activeTab === "conversion" && <ConversionView externalLogs={logs} />}
        {activeTab === "migration" && <MigrationView externalLogs={logs} />}
        {activeTab === "autogenerate" && (
          <AutoGenerateView externalLogs={logs} onNavigateTab={setActiveTab} />
        )}
        {activeTab === "metrics" && <MetricsView />}
      </main>

      {/* 4. Footer Dark (Ink #1a1a1a) */}
      <FooterDark />

      {/* 5. Settings Modal */}
      <ConfigModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigSaved={loadAppConfig}
      />
    </div>
  );
}

export default App;
