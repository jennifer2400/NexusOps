"use client";

import { useEffect, useState, useRef } from "react";
import { fetchContainersData, fetchContainerLogs } from "@/services/api";
import { toast } from "react-hot-toast";
import { 
  Terminal, 
  Play, 
  Pause, 
  Download, 
  Copy, 
  RefreshCcw, 
  Trash2,
  Clock,
  ChevronDown
} from "lucide-react";

// ==================================================
// LOGS VIEWER COMPONENT
// ==================================================
export default function LogsPage() {
  const [containers, setContainers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tailLines, setTailLines] = useState(100);
  const logEndRef = useRef<HTMLDivElement>(null);

  // FETCH CONTAINERS
  useEffect(() => {
    fetchContainersData().then(data => {
      setContainers(data);
      if (data.length > 0) setSelectedId(data[0].id);
    });
  }, []);

  // FETCH LOGS LOOP
  useEffect(() => {
    if (!selectedId || isPaused || !autoRefresh) return;

    const getLogs = async () => {
      try {
        const data = await fetchContainerLogs(selectedId, tailLines);
        setLogs(data.logs || "No logs available.");
      } catch (err) {
        console.error("Log fetch error:", err);
      }
    };

    getLogs();
    const interval = setInterval(getLogs, 4000);
    return () => clearInterval(interval);
  }, [selectedId, isPaused, autoRefresh, tailLines]);

  // AUTO SCROLL
  useEffect(() => {
    if (!isPaused) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isPaused]);

  // HANDLERS
  const handleCopy = () => {
    navigator.clipboard.writeText(logs);
    toast.success("Logs copied to clipboard");
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${selectedId.substring(0, 8)}_${new Date().toISOString()}.txt`;
    a.click();
    toast.success("Log file downloaded");
  };

  const handleClear = () => {
    setLogs("");
    toast.success("Local log view cleared");
  };

  // ==================================================
  // RENDER
  // ==================================================
  return (
    <div className="animate-in fade-in duration-500 flex flex-col h-[calc(100vh-160px)]">
      {/* TOOLBAR */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 bg-[#111827] p-4 rounded-2xl border border-gray-800 shadow-xl">
        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
            <Terminal size={24} />
          </div>
          <div className="flex-1 relative">
            <select 
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setLogs(""); }}
              className="w-full lg:w-64 bg-[#1E293B] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white appearance-none focus:border-blue-500 outline-none pr-10"
            >
              {containers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.state})</option>
              ))}
              {containers.length === 0 && <option>No containers found</option>}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={16} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center bg-[#1E293B] rounded-xl p-1 border border-gray-700">
            <button 
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all flex items-center gap-2 ${
                autoRefresh ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <RefreshCcw size={14} className={autoRefresh && !isPaused ? 'animate-spin' : ''} />
              {autoRefresh ? 'LIVE' : 'MANUAL'}
            </button>
            <button 
              onClick={() => setIsPaused(!isPaused)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all flex items-center gap-2 ${
                isPaused ? 'bg-yellow-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
              {isPaused ? 'RESUME' : 'PAUSE'}
            </button>
          </div>

          <select 
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value))}
            className="bg-[#1E293B] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-300 outline-none"
          >
            <option value={50}>50 Lines</option>
            <option value={100}>100 Lines</option>
            <option value={500}>500 Lines</option>
          </select>

          <div className="h-8 w-[1px] bg-gray-800 mx-2 hidden sm:block"></div>

          <div className="flex items-center gap-1">
            <button onClick={handleCopy} className="p-2.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-xl transition-all" title="Copy to Clipboard">
              <Copy size={20} />
            </button>
            <button onClick={handleDownload} className="p-2.5 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-xl transition-all" title="Download Logs">
              <Download size={20} />
            </button>
            <button onClick={handleClear} className="p-2.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-xl transition-all" title="Clear View">
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* TERMINAL AREA */}
      <div className="flex-1 bg-[#0F172A] rounded-2xl border border-gray-800 shadow-inner relative overflow-hidden flex flex-col font-mono text-sm group">
        {isPaused && (
          <div className="absolute top-12 right-6 z-20 flex items-center gap-2 bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-4 py-2 rounded-full backdrop-blur-md animate-pulse">
            <Pause size={14} fill="currentColor" />
            <span className="text-[10px] font-black tracking-widest uppercase">Console Paused</span>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80 border-b border-gray-800 text-[10px] text-gray-500 font-bold tracking-widest uppercase shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={12} />
            <span>Streaming: {selectedId.substring(0, 12)}</span>
          </div>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/30"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/30"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/30"></div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
          {logs ? (
            <div className="whitespace-pre-wrap break-all leading-relaxed text-gray-300 selection:bg-blue-500/30">
              {logs.split('\n').map((line, i) => (
                <div key={i} className="flex gap-4 hover:bg-white/[0.02] transition-colors -mx-2 px-2 rounded">
                  <span className="text-gray-700 select-none w-8 shrink-0 text-right text-[10px] mt-0.5">{i + 1}</span>
                  <span className={
                    line.toLowerCase().includes('error') ? 'text-red-400' :
                    line.toLowerCase().includes('warn') ? 'text-yellow-400' :
                    line.toLowerCase().includes('success') ? 'text-green-400' :
                    'text-gray-300'
                  }>
                    {line}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} className="h-4" />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4 opacity-50">
              <div className="w-12 h-12 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin"></div>
              <p className="font-bold tracking-widest uppercase text-xs">Awaiting log stream...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
