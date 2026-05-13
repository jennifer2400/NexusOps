"use client";
import { useEffect, useState } from "react";
import { Server, Plus, RefreshCw, MoreVertical, Wifi, X, Wrench } from "lucide-react";
import OltToolsDrawer from "./components/OltToolsDrawer";
function formatBps(bps: number) {
  if (!bps || bps === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return parseFloat((bps / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function OLTsPage() {
  const [olts, setOlts] = useState<any[]>([]);
  const [gateways, setGateways] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logModalData, setLogModalData] = useState<any>(null);
  
  const [isToolsDrawerOpen, setIsToolsDrawerOpen] = useState(false);
  const [activeOltForTools, setActiveOltForTools] = useState<any>(null);
  
  const [editingOltId, setEditingOltId] = useState<number | null>(null);
  const [showMenuId, setShowMenuId] = useState<number | null>(null);
  const [activeJobs, setActiveJobs] = useState<{[key: number]: any}>({});

  const [formData, setFormData] = useState({
    name: "",
    ip_address: "",
    port: 23,
    username: "",
    password: "",
    protocol: "telnet",
    vendor: "ZTE",
    hardware_model: "C320",
    firmware_version: "",
    snmp_port: 161,
    snmp_community: "public",
    auto_detect_capabilities: true,
    supported_onus: [] as string[],
    site_gateway_id: ""
  });
  const [saving, setSaving] = useState(false);

  const onuOptions = [
    "ZTE F660", "ZTE F670L", "ZTE F680", "ZTE F601", "ZTE F609",
    "Huawei HG8245H", "Huawei EG8145V5", "Huawei HG8546M",
    "VSOL V2801", "VSOL V2802RH", "VSOL HG323AC",
    "CDATA FD511", "CDATA FD511G",
    "TP-Link GPON", "Fiberhome AN5506", "Genericas / Otros"
  ];

  const handleOnuToggle = (onu: string) => {
    setFormData(prev => ({
      ...prev,
      supported_onus: prev.supported_onus.includes(onu) 
        ? prev.supported_onus.filter(o => o !== onu)
        : [...prev.supported_onus, onu]
    }));
  };

  const fetchOlts = () => {
    fetch("http://localhost:8000/api/olt/")
      .then(res => res.json())
      .then(data => {
        setOlts(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOlts();
    fetchGateways();
    
    // Polling interval para SyncJobs
    const interval = setInterval(() => {
      pollJobs();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const pollJobs = async () => {
    // Para simplificar, obtenemos jobs solo si la pestaña está activa
    if (document.hidden) return;
    
    // Podríamos pedir por cada OLT, o un endpoint global, pero pediremos por cada OLT habilitada
    olts.forEach(async (olt) => {
      if (!olt.is_enabled) return;
      try {
        const res = await fetch(`http://localhost:8000/api/olt/${olt.id}/sync/jobs?limit=1`);
        if (res.ok) {
          const jobs = await res.json();
          if (jobs.length > 0) {
            setActiveJobs(prev => ({ ...prev, [olt.id]: jobs[0] }));
            // Si acaba de terminar de sincronizar, actualizamos las OLTs
            if (jobs[0].status === "success" || jobs[0].status === "failed") {
               // Solo refetch si no estamos ya en success (evita infinitos re-renders, usamos cache simple)
               // (La lógica real de invalidate se puede refinar, aquí recargamos OLTs pasivamente cada cierto tiempo)
               // Para no saturar, podemos dejar que solo el boton de "Ping IP" o recarga manual refresque las stats totales
            }
          }
        }
      } catch (e) {}
    });
  };

  const fetchGateways = () => {
    fetch("http://localhost:8000/api/gateways/")
      .then(res => res.json())
      .then(data => setGateways(data))
      .catch(err => console.error("Error fetching gateways:", err));
  };

  const handleSync = async (oltId: number) => {
    setSyncingId(oltId);
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${oltId}/sync?sync_mode=full`, {
        method: "POST"
      });
      if(res.ok) {
        // En vez de alert, el polling va a recoger el job en unos segundos
        pollJobs();
      } else {
        const data = await res.json();
        alert("Error de la API: " + data.detail);
      }
    } catch (err) {
      alert("Error de red al sincronizar OLT.");
    } finally {
      setTimeout(() => setSyncingId(null), 2000);
    }
  };

  const openLogModal = async (jobId: number) => {
    try {
      const res = await fetch(`http://localhost:8000/api/olt/sync/logs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setLogModalData(data);
        setIsLogModalOpen(true);
        setShowMenuId(null);
      }
    } catch (e) {
      alert("Error al cargar los logs.");
    }
  };

  const handleAddOlt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { ...formData };
      if (payload.site_gateway_id === "") payload.site_gateway_id = null;
      if (payload.snmp_port === "") payload.snmp_port = null;
      if (payload.snmp_community === "") payload.snmp_community = null;
      
      const res = await fetch("http://localhost:8000/api/olt/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ 
          name: "", ip_address: "", port: 23, username: "", password: "", protocol: "telnet",
          vendor: "ZTE", hardware_model: "C320", firmware_version: "", snmp_port: 161, snmp_community: "public", auto_detect_capabilities: true, supported_onus: [], site_gateway_id: ""
        });
        fetchOlts();
      } else {
        const errorData = await res.json();
        alert(`Error: ${typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al guardar la OLT");
    } finally {
      setSaving(false);
    }
  };

  const handleEditOlt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { ...formData };
      if (!payload.password) delete payload.password; // Don't send empty password if not changed
      if (payload.site_gateway_id === "") payload.site_gateway_id = null;
      if (payload.snmp_port === "") payload.snmp_port = null;
      if (payload.snmp_community === "") payload.snmp_community = null;
      
      const res = await fetch(`http://localhost:8000/api/olt/${editingOltId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsEditModalOpen(false);
        setEditingOltId(null);
        fetchOlts();
      } else {
        const errorData = await res.json();
        alert(`Error: ${typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)}`);
      }
    } catch (err) {
      alert("Error al actualizar la OLT");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOlt = async (oltId: number) => {
    if (!confirm("¿Está absolutamente seguro de eliminar esta OLT? Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch(`http://localhost:8000/api/olt/${oltId}`, { method: "DELETE" });
      if (res.ok) {
        fetchOlts();
      } else {
        const data = await res.json();
        alert(`Error: ${data.detail}`);
      }
    } catch (err) { alert("Error al eliminar OLT"); }
  };

  const openEditModal = (olt: any) => {
    setFormData({
      name: olt.name, ip_address: olt.ip_address, port: olt.port, username: "", password: "", protocol: olt.protocol,
      vendor: olt.vendor || "ZTE", hardware_model: olt.hardware_model || "C320", firmware_version: olt.firmware_version || "",
      snmp_port: olt.snmp_port || 161, snmp_community: olt.snmp_community || "", auto_detect_capabilities: olt.auto_detect_capabilities,
      supported_onus: olt.supported_onus || [], site_gateway_id: olt.site_gateway_id || ""
    });
    setEditingOltId(olt.id);
    setShowMenuId(null);
    setIsEditModalOpen(true);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestión de OLTs</h1>
          <p className="text-slate-400 text-sm">Visualiza, agrega y sincroniza tus equipos GPON</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            <Plus size={16} />
            Agregar OLT
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          <p className="text-slate-400 col-span-full">Cargando equipos...</p>
        ) : olts.length === 0 ? (
          <div className="col-span-full glass-panel p-10 text-center flex flex-col items-center justify-center">
            <Server size={48} className="text-slate-600 mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No hay OLTs registradas</h3>
            <p className="text-slate-400 mb-6">Comienza agregando tu primera OLT para empezar a monitorear la red.</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Agregar Primera OLT
            </button>
          </div>
        ) : (
          olts.map((olt) => {
            const isCooldown = olt.next_sync_allowed_at && new Date(olt.next_sync_allowed_at) > new Date();
            const hasWarnings = olt.consecutive_sync_failures > 0 && !isCooldown;

            return (
            <div key={olt.id} className={`glass-panel p-6 hover-glow flex flex-col relative ${!olt.is_enabled ? 'opacity-60' : ''} ${isCooldown ? 'border-orange-500/50 shadow-orange-500/10' : hasWarnings ? 'border-yellow-500/30' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${olt.is_enabled ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                    <Server size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      {olt.name} {olt.is_enabled ? '' : '(Deshabilitada)'}
                      {isCooldown && <span className="text-[10px] uppercase tracking-wider bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30">Cooldown</span>}
                      {hasWarnings && <span className="text-[10px] uppercase tracking-wider bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">Warning</span>}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${olt.last_ping_status === 'online' ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${olt.last_ping_status === 'online' ? 'bg-green-400' : 'bg-red-400'}`}></span> {olt.last_ping_status ? olt.last_ping_status.toUpperCase() : 'UNKNOWN'}
                      </span>
                      <span className="text-slate-400 font-mono">{olt.ip_address}:{olt.port}</span>
                      {olt.last_ping_latency_ms && <span className="text-slate-400 font-mono text-[10px]">{olt.last_ping_latency_ms}ms</span>}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 z-20">
                  <button onClick={() => {
                    if (activeJobs[olt.id]) {
                      openLogModal(activeJobs[olt.id].id);
                    } else {
                      alert("Aún no hay trabajos de sincronización en caché para esta OLT.");
                    }
                  }} className="text-slate-400 hover:text-blue-400 transition-colors p-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-md" title="Ver Logs Técnicos">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                  </button>
                  <button onClick={() => openEditModal(olt)} className="text-slate-400 hover:text-white transition-colors p-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-md" title="Editar OLT">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => handleDeleteOlt(olt.id)} className="text-slate-400 hover:text-red-400 transition-colors p-1.5 bg-slate-800/50 hover:bg-red-400/10 rounded-md" title="Eliminar OLT">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </div>
              
              <div className="mt-2 grid grid-cols-3 gap-4 border-t border-slate-800 pt-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Wifi size={12}/> Total ONUs</p>
                  <p className="text-xl font-bold text-white">{olt.onu_count}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Hardware</p>
                  <p className="text-sm font-medium text-slate-300">{olt.vendor} {olt.hardware_model}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">Tráfico OLT</p>
                  {olt.last_total_in_bps === 0 && olt.last_total_out_bps === 0 ? (
                    <p className="text-xs text-slate-400 mt-1">Esperando lectura SNMP</p>
                  ) : (
                    <div className="text-xs font-mono text-slate-300">
                      <div className="text-emerald-400">↓ {formatBps(olt.last_total_in_bps || 0)}</div>
                      <div className="text-blue-400">↑ {formatBps(olt.last_total_out_bps || 0)}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-slate-400 border-t border-slate-800/50 pt-3">
                <div>
                  <span className="block text-slate-500 mb-0.5">WireGuard Gateway</span>
                  <span className="text-slate-300">{olt.site_gateway_id ? gateways.find(g => g.id === olt.site_gateway_id)?.name : "Directo"}</span>
                </div>
                <div>
                  <span className="block text-slate-500 mb-0.5">Último Sync</span>
                  {activeJobs[olt.id] && activeJobs[olt.id].status === "running" ? (
                    <span className="text-blue-400 font-medium animate-pulse">Sincronizando ({activeJobs[olt.id].progress_percent}%)</span>
                  ) : activeJobs[olt.id] && activeJobs[olt.id].status === "failed" ? (
                    <span className="text-red-400 font-medium">Fallido (Ver Log)</span>
                  ) : isCooldown ? (
                    <span className="text-orange-400 font-medium">Pausa hasta {new Date(olt.next_sync_allowed_at).toLocaleTimeString()}</span>
                  ) : (
                    <span className="text-slate-300">{olt.last_sync_at ? new Date(olt.last_sync_at).toLocaleString() : "Nunca"}</span>
                  )}
                </div>
              </div>

              <div className="mt-auto pt-4 flex flex-col gap-2">
                  <button 
                    onClick={() => {
                      setActiveOltForTools(olt);
                      setIsToolsDrawerOpen(true);
                    }}
                    className="col-span-2 py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors border border-slate-700 flex items-center justify-center gap-2"
                  >
                    <Wrench size={14} /> Herramientas Avanzadas
                  </button>
                <button 
                  onClick={() => handleSync(olt.id)}
                  disabled={syncingId === olt.id || !olt.is_enabled || (activeJobs[olt.id] && activeJobs[olt.id].status === "running") || isCooldown}
                  className="w-full py-2.5 px-4 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-sm font-medium rounded-lg transition-colors border border-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
                >
                  <RefreshCw size={16} className={(syncingId === olt.id || (activeJobs[olt.id] && activeJobs[olt.id].status === "running")) ? "animate-spin" : ""} />
                  {(activeJobs[olt.id] && activeJobs[olt.id].status === "running") ? activeJobs[olt.id].current_step || "Procesando..." : isCooldown ? "En Cooldown" : syncingId === olt.id ? "Iniciando..." : "Sincronizar ONUs"}
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* Modal Agregar OLT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4 py-8 overflow-y-auto">
          <div className="glass-panel w-full max-w-4xl p-6 relative my-auto">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-white mb-1">Agregar Nueva OLT Multi-Vendor</h2>
            <p className="text-slate-400 text-sm mb-6">Configura la identidad, hardware y capacidades del equipo.</p>
            
            <form onSubmit={handleAddOlt} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Credenciales de Red */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">1. Credenciales de Red</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre Identificador</label>
                    <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="Ej: OLT Principal ZTE" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Dirección IP</label>
                      <input required type="text" value={formData.ip_address} onChange={(e) => setFormData({...formData, ip_address: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="10.0.0.1" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Puerto CLI</label>
                      <input required type="number" value={formData.port} onChange={(e) => setFormData({...formData, port: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="23" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Protocolo</label>
                      <select value={formData.protocol} onChange={(e) => setFormData({...formData, protocol: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors">
                        <option value="telnet">Telnet</option>
                        <option value="ssh">SSH</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Usuario CLI</label>
                      <input required type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="admin" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Contraseña CLI</label>
                    <input required type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="••••••••" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Site Gateway (WireGuard)</label>
                    <select value={formData.site_gateway_id} onChange={(e) => setFormData({...formData, site_gateway_id: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors">
                      <option value="">Ninguno (Conexión Directa)</option>
                      {gateways.map(gw => (
                        <option key={gw.id} value={gw.id}>{gw.name} ({gw.wg_ip})</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Opcional. Túnel por el cual conectarse a este equipo.</p>
                  </div>
                </div>

                {/* 2. Hardware OLT */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">2. Hardware OLT</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Vendor (Fabricante)</label>
                      <select value={formData.vendor} onChange={(e) => setFormData({...formData, vendor: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors">
                        <option value="ZTE">ZTE</option>
                        <option value="Huawei">Huawei</option>
                        <option value="VSOL">VSOL</option>
                        <option value="Nokia">Nokia</option>
                        <option value="Fiberhome">Fiberhome</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Modelo OLT</label>
                      <input type="text" value={formData.hardware_model} onChange={(e) => setFormData({...formData, hardware_model: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="Ej: C320, MA5800" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Versión Firmware (Opcional)</label>
                    <input type="text" value={formData.firmware_version} onChange={(e) => setFormData({...formData, firmware_version: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="Ej: V2.1.0" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Puerto SNMP</label>
                      <input type="number" value={formData.snmp_port} onChange={(e) => setFormData({...formData, snmp_port: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="161" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">SNMP Community</label>
                      <input type="text" value={formData.snmp_community} onChange={(e) => setFormData({...formData, snmp_community: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="public" />
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.auto_detect_capabilities ? 'bg-blue-600 border-blue-600' : 'bg-slate-900/50 border-slate-600 group-hover:border-blue-500'}`}>
                        {formData.auto_detect_capabilities && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <input type="checkbox" checked={formData.auto_detect_capabilities} onChange={(e) => setFormData({...formData, auto_detect_capabilities: e.target.checked})} className="hidden" />
                      <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Auto-detectar capacidades después de guardar</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 3. Matriz de Compatibilidad ONU */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-4">3. Matriz de Compatibilidad ONU</h3>
                <p className="text-xs text-slate-400 mb-4">Selecciona los modelos de ONU certificados que podrán ser aprovisionados inteligentemente en este chasis.</p>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  {onuOptions.map(onu => (
                    <label key={onu} className="flex items-center gap-2 cursor-pointer group p-2 rounded-lg hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700">
                      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${formData.supported_onus.includes(onu) ? 'bg-blue-600 border-blue-600' : 'bg-slate-900 border-slate-600 group-hover:border-blue-500'}`}>
                        {formData.supported_onus.includes(onu) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <input type="checkbox" checked={formData.supported_onus.includes(onu)} onChange={() => handleOnuToggle(onu)} className="hidden" />
                      <span className="text-xs font-medium text-slate-300 truncate">{onu}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-800 pt-5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-700">Cancelar</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50">
                  {saving ? "Guardando Equipo..." : "Registrar OLT"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar OLT */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4 py-8 overflow-y-auto">
          <div className="glass-panel w-full max-w-4xl p-6 relative my-auto">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
            <h2 className="text-xl font-bold text-white mb-1">Editar OLT Multi-Vendor</h2>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 mb-4 text-sm text-orange-300">
              Advertencia: Si modifica la IP o el Gateway asociado, se reevaluarán las rutas de seguridad.
            </div>
            
            <form onSubmit={handleEditOlt} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Credenciales de Red */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">1. Credenciales de Red</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre Identificador</label>
                    <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Dirección IP</label>
                      <input required type="text" value={formData.ip_address} onChange={(e) => setFormData({...formData, ip_address: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Puerto CLI</label>
                      <input required type="number" value={formData.port} onChange={(e) => setFormData({...formData, port: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Protocolo</label>
                      <select value={formData.protocol} onChange={(e) => setFormData({...formData, protocol: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors">
                        <option value="telnet">Telnet</option>
                        <option value="ssh">SSH</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Usuario CLI</label>
                      <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Nueva Contraseña (Opcional)</label>
                    <input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" placeholder="Dejar en blanco para mantener actual" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Site Gateway (WireGuard)</label>
                    <select value={formData.site_gateway_id} onChange={(e) => setFormData({...formData, site_gateway_id: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors">
                      <option value="">Ninguno (Conexión Directa)</option>
                      {gateways.map(gw => (
                        <option key={gw.id} value={gw.id}>{gw.name} ({gw.wg_ip})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 2. Hardware OLT */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-2">2. Hardware OLT</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Vendor (Fabricante)</label>
                      <select value={formData.vendor} onChange={(e) => setFormData({...formData, vendor: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors">
                        <option value="ZTE">ZTE</option>
                        <option value="Huawei">Huawei</option>
                        <option value="VSOL">VSOL</option>
                        <option value="Nokia">Nokia</option>
                        <option value="Fiberhome">Fiberhome</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Modelo OLT</label>
                      <input type="text" value={formData.hardware_model} onChange={(e) => setFormData({...formData, hardware_model: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Versión Firmware</label>
                    <input type="text" value={formData.firmware_version} onChange={(e) => setFormData({...formData, firmware_version: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Puerto SNMP</label>
                      <input type="number" value={formData.snmp_port || ""} onChange={(e) => setFormData({...formData, snmp_port: e.target.value === "" ? 161 : parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">SNMP Community</label>
                      <input type="text" value={formData.snmp_community || ""} onChange={(e) => setFormData({...formData, snmp_community: e.target.value})} className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm transition-colors" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-800 pt-5">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-700">Cancelar</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Logs de Sync */}
      {isLogModalOpen && logModalData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f172a]/90 backdrop-blur-sm px-4 py-8 overflow-y-auto">
          <div className="glass-panel w-full max-w-4xl p-0 relative my-auto border-slate-700 overflow-hidden flex flex-col h-[80vh]">
            <div className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <h2 className="text-sm font-mono text-slate-400 ml-2">syslog - Helix NOC Sync Daemon (Job #{logModalData.id})</h2>
              </div>
              <button onClick={() => setIsLogModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            
            <div className="p-4 bg-black/50 flex-1 overflow-y-auto custom-scrollbar font-mono text-xs text-green-400 whitespace-pre-wrap leading-relaxed">
              {logModalData.raw_log || "No hay logs registrados para este Job."}
              {logModalData.status === "running" && <span className="animate-pulse">_</span>}
            </div>

            <div className="bg-slate-900 border-t border-slate-800 p-3 shrink-0 flex justify-between items-center">
              <span className="text-xs text-slate-500">Estado Final: <strong className={`uppercase ${logModalData.status === 'success' ? 'text-green-500' : logModalData.status === 'failed' ? 'text-red-500' : 'text-blue-500'}`}>{logModalData.status}</strong></span>
              <button onClick={() => setIsLogModalOpen(false)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded transition-colors border border-slate-700">Cerrar Terminal</button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer de Herramientas Avanzadas */}
      <OltToolsDrawer 
        isOpen={isToolsDrawerOpen}
        onClose={() => setIsToolsDrawerOpen(false)}
        olt={activeOltForTools}
      />
    </div>
  );
}
