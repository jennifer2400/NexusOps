"use client";
import React, { useState, useEffect } from "react";
import { X, Server, Activity, Terminal, ShieldAlert, FileText, Download, RotateCcw, AlertTriangle } from "lucide-react";

interface OltToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  olt: any;
}

export default function OltToolsDrawer({ isOpen, onClose, olt }: OltToolsDrawerProps) {
  const [activeTab, setActiveTab] = useState("hardware");
  const [boards, setBoards] = useState<any[]>([]);
  const [vlans, setVlans] = useState<string>("");
  const [runningConfig, setRunningConfig] = useState<string>("");
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [rebootConfirm, setRebootConfirm] = useState("");

  useEffect(() => {
    if (isOpen && olt) {
      if (activeTab === "hardware" && boards.length === 0) fetchHardware();
      if (activeTab === "vlans" && !vlans) fetchVlans();
      if (activeTab === "config" && !runningConfig) fetchRunningConfig();
      if (activeTab === "backups") fetchBackups();
    }
  }, [isOpen, olt, activeTab]);

  const fetchHardware = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${olt.id}/hardware`);
      if (res.ok) {
        const data = await res.json();
        setBoards(data.boards);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchVlans = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${olt.id}/vlans`);
      if (res.ok) {
        const data = await res.json();
        setVlans(data.raw_output);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchRunningConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${olt.id}/running-config`);
      if (res.ok) {
        const data = await res.json();
        setRunningConfig(data.config);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${olt.id}/backups`);
      if (res.ok) {
        const data = await res.json();
        setBackups(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${olt.id}/backups`, { method: "POST" });
      if (res.ok) {
        alert("Backup creado con éxito");
        fetchBackups();
      } else {
        alert("Error al crear backup");
      }
    } catch (e) {
      alert("Error de red");
    } finally {
      setLoading(false);
    }
  };

  const handleWriteConfig = async () => {
    if (!confirm("¿Guardar la configuración (write) de la OLT? Esto escribirá en la memoria NVRAM.")) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${olt.id}/write-config`, { method: "POST" });
      if (res.ok) {
        alert("Configuración guardada correctamente");
      } else {
        const d = await res.json();
        alert("Error: " + d.detail);
      }
    } catch (e) {
      alert("Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const handleReboot = async () => {
    if (rebootConfirm !== "REINICIAR OLT") {
      alert("Debes escribir REINICIAR OLT exactamente");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${olt.id}/reboot`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_text: rebootConfirm })
      });
      if (res.ok) {
        alert("Comando de reinicio enviado a la OLT. Se desconectará de la red.");
        setRebootConfirm("");
      } else {
        const d = await res.json();
        alert("Error: " + d.detail);
      }
    } catch (e) {
      alert("Error enviando reinicio");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !olt) return null;

  const tabs = [
    { id: "hardware", label: "Hardware", icon: <Server size={16} /> },
    { id: "vlans", label: "VLANs", icon: <Activity size={16} /> },
    { id: "config", label: "Running Config", icon: <Terminal size={16} /> },
    { id: "backups", label: "Backups", icon: <FileText size={16} /> },
    { id: "critical", label: "Acciones Críticas", icon: <ShieldAlert size={16} className="text-red-400"/> }
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[800px] bg-slate-900 border-l border-slate-800 z-50 flex flex-col shadow-2xl transition-transform transform translate-x-0">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Server className="text-blue-500" />
              Consola OLT: {olt.name}
            </h2>
            <p className="text-sm text-slate-400 mt-1">{olt.ip_address} | {olt.vendor} {olt.hardware_model}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id 
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
          {loading && (
            <div className="flex justify-center items-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-slate-400 font-mono text-sm">Consultando OLT por CLI...</span>
            </div>
          )}

          {!loading && activeTab === "hardware" && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white mb-4 border-b border-slate-800 pb-2">Tarjetas Instaladas</h3>
              <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/50 text-slate-300 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 font-medium">Slot</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Versión</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-300">
                    {boards.map((b, i) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-3 font-mono">{b.slot}</td>
                        <td className="px-4 py-3 font-medium text-blue-400">{b.type}</td>
                        <td className="px-4 py-3 font-mono text-xs">{b.version}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            b.status === 'INSERVICE' ? 'bg-emerald-500/10 text-emerald-400' :
                            b.status === 'STANDBY' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-red-500/10 text-red-400'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && activeTab === "vlans" && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white mb-4 border-b border-slate-800 pb-2">VLANs Configuradas</h3>
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 font-mono text-sm text-green-400 overflow-x-auto whitespace-pre-wrap">
                {vlans || "No hay datos"}
              </div>
            </div>
          )}

          {!loading && activeTab === "config" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                <h3 className="text-lg font-medium text-white">Running Config</h3>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors" onClick={() => {
                  const blob = new Blob([runningConfig], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `running_config_${olt.name}.txt`;
                  a.click();
                }}>
                  <Download size={14} /> Descargar
                </button>
              </div>
              <div className="bg-[#0c0c0c] p-4 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 h-[600px] overflow-y-auto whitespace-pre-wrap selection:bg-blue-500/30">
                {runningConfig || "Esperando configuración..."}
              </div>
            </div>
          )}

          {!loading && activeTab === "backups" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                <h3 className="text-lg font-medium text-white">Historial de Backups</h3>
                <button onClick={handleCreateBackup} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors">
                  <FileText size={16} /> Crear Backup Ahora
                </button>
              </div>
              
              <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/50 text-slate-300 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Archivo</th>
                      <th className="px-4 py-3 font-medium">Tamaño</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-300">
                    {backups.map((b, i) => (
                      <tr key={i} className="hover:bg-slate-800/20">
                        <td className="px-4 py-3 text-slate-400">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-xs text-blue-400">{b.filename}</td>
                        <td className="px-4 py-3 text-xs">{(b.file_size / 1024).toFixed(2)} KB</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-slate-800 text-slate-300 uppercase">
                            {b.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {backups.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No hay backups guardados</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && activeTab === "critical" && (
            <div className="space-y-8">
              
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-6">
                <div className="flex gap-4">
                  <div className="p-3 bg-orange-500/20 rounded-lg h-fit">
                    <FileText className="text-orange-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-orange-400 mb-2">Guardar Configuración</h3>
                    <p className="text-sm text-slate-300 mb-4">Ejecuta el comando <code>write</code> en la OLT para guardar la configuración running hacia la memoria flash. Haz esto después de aprovisionamientos masivos si no tienes autoguardado.</p>
                    <button onClick={handleWriteConfig} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-md text-sm font-medium transition-colors shadow-lg shadow-orange-500/20">
                      Ejecutar Write
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                <div className="flex gap-4">
                  <div className="p-3 bg-red-500/20 rounded-lg h-fit">
                    <AlertTriangle className="text-red-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-red-400 mb-2">Reiniciar OLT</h3>
                    <p className="text-sm text-slate-300 mb-4">
                      <strong>¡Peligro!</strong> Esto desconectará todas las ONUs de la OLT temporalmente y tumbará el servicio para todos los clientes asociados.
                    </p>
                    <div className="bg-black/30 p-4 rounded-lg border border-red-500/20">
                      <label className="block text-sm font-medium text-slate-400 mb-2">
                        Escribe <span className="text-red-400 font-mono">REINICIAR OLT</span> para confirmar
                      </label>
                      <div className="flex gap-3">
                        <input 
                          type="text" 
                          value={rebootConfirm}
                          onChange={(e) => setRebootConfirm(e.target.value)}
                          placeholder="REINICIAR OLT"
                          className="flex-1 px-3 py-2 bg-slate-900 border border-red-500/30 rounded-lg text-red-400 font-mono focus:outline-none focus:border-red-500"
                        />
                        <button 
                          onClick={handleReboot}
                          disabled={rebootConfirm !== "REINICIAR OLT"}
                          className="px-6 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <RotateCcw size={16} /> Enviar Reboot
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </>
  );
}
