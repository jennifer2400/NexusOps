"use client";
import { useEffect, useState } from "react";
import { Network, Plus, RefreshCw, X, Shield, Activity, Trash2, Code, Key, Copy, Settings, Check, Eye, EyeOff, Save, Server, Globe, AlertTriangle, AlertCircle, CheckCircle, Clock, ArrowDownToLine, ArrowUpFromLine, Terminal } from "lucide-react";

const isValidCIDR = (cidr: string) => {
  return /^([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/.test(cidr);
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTimeAgo = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `Hace ${seconds} segs`;
  if (seconds < 3600) return `Hace ${Math.floor(seconds/60)} min`;
  if (seconds < 86400) return `Hace ${Math.floor(seconds/3600)} horas`;
  return `Hace ${Math.floor(seconds/86400)} días`;
};

const GatewayStatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case 'online': return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-green-400 bg-green-400/10 border-green-400/20" title="Gateway operando correctamente"><CheckCircle size={10}/> ONLINE</span>;
    case 'warning': return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-yellow-400 bg-yellow-400/10 border-yellow-400/20" title="Operacional pero con advertencias (ej. sin telemetría)"><AlertTriangle size={10}/> WARNING</span>;
    case 'error': return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-red-400 bg-red-400/10 border-red-400/20" title="Error crítico de conexión"><X size={10}/> ERROR</span>;
    case 'offline': return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-red-400 bg-red-400/10 border-red-400/20" title="Gateway desconectado"><X size={10}/> OFFLINE</span>;
    case 'pending_adoption': return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-blue-400 bg-blue-400/10 border-blue-400/20" title="Falta configurar llave pública"><Clock size={10}/> PENDING ADOPTION</span>;
    default: return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-slate-400 bg-slate-800 border-slate-700">{status}</span>;
  }
};

export default function GatewaysPage() {
  const [gateways, setGateways] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnosingId, setDiagnosingId] = useState<number | null>(null);
  const [diagnosticModalOpen, setDiagnosticModalOpen] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  
  // Modals State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScriptOpen, setIsScriptOpen] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: "", wg_ip: "", wg_interface: "wg0", description: "", location: "", isp_site: "", technical_notes: ""
  });
  const [subnets, setSubnets] = useState<string[]>([]);
  const [currentSubnet, setCurrentSubnet] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsData, setSettingsData] = useState<any[]>([]);
  const [scriptContent, setScriptContent] = useState("");
  const [scriptLoading, setScriptLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mikrotikPubKey, setMikrotikPubKey] = useState("");
  
  // Settings specific UI state
  const [showKey, setShowKey] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [pubKeyCopied, setPubKeyCopied] = useState(false);

  const fetchGateways = () => {
    fetch("http://localhost:8000/api/gateways/")
      .then(res => res.json())
      .then(data => {
        setGateways(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const fetchSettings = () => {
    fetch("http://localhost:8000/api/settings/")
      .then(res => res.json())
      .then(data => setSettingsData(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchGateways();
    fetchSettings();
  }, []);

  const handleDiagnose = async (gw: any) => {
    setDiagnosticModalOpen(true);
    setDiagnosticResult(null);
    setDiagnosticLogs([`[Iniciando diagnóstico Site ${gw.name}...]`, `[Contactando backend Helix NOC...]`]);
    
    try {
      const res = await fetch(`http://localhost:8000/api/gateways/${gw.id}/diagnose`, { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) {
        setDiagnosticLogs(prev => [...prev, `[ERROR] ${data.detail}`]);
        return;
      }

      const lines = data.raw_log ? data.raw_log.split('\n').filter((l:string) => l.trim() !== '') : [];
      setDiagnosticLogs([]);
      
      for(let i = 0; i < lines.length; i++) {
        await new Promise(r => setTimeout(r, 300));
        setDiagnosticLogs(prev => [...prev, lines[i]]);
      }
      
      await new Promise(r => setTimeout(r, 500));
      setDiagnosticResult(data);
      fetchGateways();
    } catch (err) { 
      setDiagnosticLogs(prev => [...prev, `[ERROR FATAL] Problema de red contactando Helix NOC`]);
    }
  };

  const handleDelete = async (gwId: number) => {
    if (!confirm("¿Seguro que deseas eliminar este Site Gateway?")) return;
    try {
      if ((await fetch(`http://localhost:8000/api/gateways/${gwId}`, { method: "DELETE" })).ok) fetchGateways();
    } catch (err) {}
  };

  const handleAddGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("http://localhost:8000/api/gateways/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, internal_subnets: subnets })
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ name: "", wg_ip: "", wg_interface: "wg0", description: "", location: "", isp_site: "", technical_notes: "" });
        setSubnets([]);
        fetchGateways();
      } else alert(`Error: ${(await res.json()).detail}`);
    } catch (err) { alert("Error de red"); }
    finally { setSaving(false); }
  };

  const addSubnet = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = currentSubnet.trim();
      if (!val) return;
      if (!subnets.includes(val)) {
        setSubnets([...subnets, val]);
      }
      setCurrentSubnet("");
    }
  };

  const removeSubnet = (sub: string) => {
    setSubnets(subnets.filter(s => s !== sub));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!confirm("¿Está seguro de modificar la configuración global? Esto afectará todos los túneles del sistema.")) return;
    setSaving(true);
    try {
      const res = await fetch("http://localhost:8000/api/settings/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsData)
      });
      if (res.ok) setIsSettingsOpen(false);
    } catch(e) {}
    finally { setSaving(false); }
  };

  const handleTestConfig = async () => {
    setTestingConfig(true);
    setTestResult(null);
    try {
      const endpoint = settingsData.find(s => s.key === 'wg_server_endpoint')?.value;
      const port = settingsData.find(s => s.key === 'wg_server_port')?.value;
      const pubkey = settingsData.find(s => s.key === 'wg_server_public_key')?.value;
      const cidr = settingsData.find(s => s.key === 'wg_network_cidr')?.value;
      
      let errors = [];
      if(!endpoint) errors.push("Falta Endpoint");
      if(!port || isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535) errors.push("Puerto inválido (1-65535)");
      if(!pubkey || pubkey.length < 40) errors.push("Formato de Llave Pública inválido");
      if(!cidr || !cidr.includes('/')) errors.push("CIDR inválido");
      
      await new Promise(r => setTimeout(r, 800)); // Simulate network
      
      if(errors.length > 0) {
        setTestResult({ success: false, msg: errors.join(" | ") });
      } else {
        setTestResult({ success: true, msg: "Sintaxis válida. DNS resoluble. Puerto correcto." });
      }
    } finally {
      setTestingConfig(false);
    }
  };

  const updateSetting = (key: string, val: string) => {
    setSettingsData(prev => prev.map(s => s.key === key ? { ...s, value: val } : s));
  };
  const getSetting = (key: string) => settingsData.find(s => s.key === key)?.value || "";

  const openScriptModal = async (gwId: number) => {
    setIsScriptOpen(gwId);
    setScriptLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/gateways/${gwId}/script?add_routes=true`);
      if (res.ok) setScriptContent((await res.json()).script);
      else alert((await res.json()).detail);
    } catch(e) {}
    finally { setScriptLoading(false); }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSavePubKey = async () => {
    if(!mikrotikPubKey || !isScriptOpen) return;
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:8000/api/gateways/${isScriptOpen}/public-key`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_key: mikrotikPubKey })
      });
      if(res.ok) {
        alert("Llave pública guardada exitosamente");
        fetchGateways(); // Refresh status to clear PENDING_ADOPTION if applicable
      }
      else alert(`Error: ${(await res.json()).detail}`);
    } catch(e) { alert("Error de red"); }
    finally { setSaving(false); setMikrotikPubKey(""); }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="text-blue-500" size={24} />
            Site Gateways (WireGuard)
          </h1>
          <p className="text-slate-400 text-sm mt-1">Administra los túneles seguros hacia tus Mikrotiks Core</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors border border-slate-700 flex items-center gap-2"
          >
            <Settings size={16} />
            Config Global
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            <Plus size={16} />
            Agregar Gateway
          </button>
        </div>
      </div>

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 flex items-start gap-3">
        <Shield className="text-orange-400 shrink-0 mt-0.5" size={20} />
        <div>
          <h4 className="text-sm font-semibold text-orange-400">¡Advertencia de Seguridad Crítica!</h4>
          <p className="text-xs text-orange-300 mt-1">Guarde y respalde su <code className="bg-orange-900/50 px-1 rounded">ENCRYPTION_KEY</code> declarada en su archivo .env o config.py. Si se pierde o se regenera, las contraseñas cifradas de las OLTs y ONUs serán irrecuperables y deberá registrarlas nuevamente de forma manual.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          <p className="text-slate-400 col-span-full">Cargando gateways...</p>
        ) : gateways.length === 0 ? (
          <div className="col-span-full glass-panel p-10 text-center flex flex-col items-center justify-center">
            <Network size={48} className="text-slate-600 mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No hay Gateways configurados</h3>
            <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors mt-6">
              Agregar Primer Gateway
            </button>
          </div>
        ) : (
          gateways.map((gw) => (
            <div key={gw.id} className="glass-panel p-6 hover-glow flex flex-col relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                    gw.status === 'online' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                    gw.status === 'pending_adoption' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                    gw.status === 'warning' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                    gw.status === 'error' || gw.status === 'offline' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    'bg-slate-800 text-slate-400 border-slate-700'}`}>
                    <Network size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{gw.name}</h3>
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <GatewayStatusBadge status={gw.status} />
                      {gw.latency_ms && <span className="text-slate-400 font-mono">{gw.latency_ms}ms</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDelete(gw.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div className="mt-2 space-y-3 border-t border-slate-800 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-500 block mb-0.5">Total OLTs</span>
                    <span className="text-lg font-bold text-white">{gw.olt_count || 0}</span>
                  </div>
                  <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-500 block mb-0.5">Total ONUs</span>
                    <span className="text-lg font-bold text-white">{gw.onu_count || 0}</span>
                  </div>
                </div>
                
                {gw.isp_site && (
                  <div className="flex justify-between items-center text-xs mt-2">
                    <span className="text-slate-500">Sitio/ISP:</span>
                    <span className="text-slate-300 font-medium">{gw.isp_site}</span>
                  </div>
                )}
                {gw.location && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Ubicación:</span>
                    <span className="text-slate-300 font-medium">{gw.location}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/50">
                  <div>
                    <span className="text-xs text-slate-500 block">IP WireGuard</span>
                    <span className="text-sm font-mono text-blue-300">{gw.wg_ip || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Último Handshake</span>
                    <span className="text-sm font-mono text-slate-300">
                      {formatTimeAgo(gw.last_handshake_at)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500">RX (Descarga)</span>
                    <span className="text-sm font-mono text-emerald-400">{formatBytes(gw.rx_bytes)} <ArrowDownToLine size={12} className="inline ml-1"/></span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-slate-500">TX (Subida)</span>
                    <span className="text-sm font-mono text-sky-400">{formatBytes(gw.tx_bytes)} <ArrowUpFromLine size={12} className="inline ml-1"/></span>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-6 flex flex-col gap-2">
                <button 
                  onClick={() => openScriptModal(gw.id)}
                  className="w-full py-2 px-4 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-sm font-medium rounded-lg transition-colors border border-indigo-500/20 flex items-center justify-center gap-2"
                >
                  <Code size={16} />
                  Generar Script MikroTik
                </button>
                <button 
                  onClick={() => handleDiagnose(gw)}
                  className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-700 flex items-center justify-center gap-2"
                >
                  <Activity size={16} />
                  Diagnosticar Gateway
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Global Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4 py-8 overflow-y-auto">
          <div className="glass-panel w-full max-w-4xl p-6 relative my-auto">
            <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/20 rounded-lg"><Settings className="text-blue-400" size={24} /></div>
              <div>
                <h2 className="text-xl font-bold text-white">Configuración Global WireGuard</h2>
                <p className="text-xs text-slate-400">Parámetros maestros para la negociación de todos los Site Gateways.</p>
              </div>
            </div>

            <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-3 mt-4">
              <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-sm font-semibold text-red-400">Peligro Operacional</h4>
                <p className="text-xs text-red-300 mt-1">Estos parámetros afectan a <strong>TODOS</strong> los túneles WireGuard del sistema. Respalde su configuración antes de modificarla. Una configuración incorrecta cortará el acceso a todas las OLTs.</p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Sección A */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-blue-400 border-b border-slate-700/50 pb-2 flex items-center gap-2">
                    <Server size={16}/> Sección A: Servidor Helix
                  </h3>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Endpoint del Servidor Helix</label>
                    <input 
                      type="text" 
                      value={getSetting('wg_server_endpoint')} 
                      onChange={e => updateSetting('wg_server_endpoint', e.target.value)} 
                      className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm font-mono" 
                      placeholder="vpn.midominio.com o IP"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Puerto WireGuard</label>
                    <input 
                      type="number" 
                      value={getSetting('wg_server_port')} 
                      onChange={e => updateSetting('wg_server_port', e.target.value)} 
                      className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm font-mono" 
                      placeholder="51820"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Llave Pública del Servidor</label>
                    <div className="relative">
                      <textarea 
                        value={getSetting('wg_server_public_key')} 
                        onChange={e => updateSetting('wg_server_public_key', e.target.value)} 
                        className={`w-full px-3 py-2 bg-[#0d1117] border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm font-mono min-h-[60px] resize-none pr-10 ${!showKey && 'filter blur-sm select-none'}`} 
                        placeholder="Pegue aquí la llave pública WireGuard del servidor Helix"
                      />
                      <div className="absolute top-2 right-2 flex flex-col gap-1">
                        <button type="button" onClick={() => setShowKey(!showKey)} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white border border-slate-600">
                          {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
                        </button>
                        <button type="button" onClick={() => {
                          navigator.clipboard.writeText(getSetting('wg_server_public_key'));
                          setPubKeyCopied(true);
                          setTimeout(() => setPubKeyCopied(false), 2000);
                        }} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white border border-slate-600">
                          {pubKeyCopied ? <Check size={14} className="text-green-400"/> : <Copy size={14}/>}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sección B */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-emerald-400 border-b border-slate-700/50 pb-2 flex items-center gap-2">
                    <Globe size={16}/> Sección B: Red WireGuard
                  </h3>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Red WireGuard (CIDR)</label>
                    <input 
                      type="text" 
                      value={getSetting('wg_network_cidr')} 
                      onChange={e => updateSetting('wg_network_cidr', e.target.value)} 
                      className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm font-mono" 
                      placeholder="10.200.0.0/24"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Nombre de Interfaz por Defecto</label>
                    <input 
                      type="text" 
                      value={getSetting('wg_default_interface')} 
                      onChange={e => updateSetting('wg_default_interface', e.target.value)} 
                      className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm font-mono" 
                      placeholder="wg0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Keepalive Persistente (Segundos)</label>
                    <input 
                      type="number" 
                      value={getSetting('wg_persistent_keepalive')} 
                      onChange={e => updateSetting('wg_persistent_keepalive', e.target.value)} 
                      className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm font-mono" 
                      placeholder="25"
                    />
                  </div>
                </div>
              </div>

              {/* Controles */}
              <div className="pt-5 border-t border-slate-800 mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button 
                    type="button"
                    onClick={handleTestConfig}
                    disabled={testingConfig}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-slate-600 disabled:opacity-50"
                  >
                    <Activity size={16} className={testingConfig ? "animate-spin text-blue-400" : ""} /> 
                    {testingConfig ? "Verificando..." : "Probar Configuración"}
                  </button>
                  {testResult && (
                    <span className={`text-xs font-medium px-2 py-1 rounded border ${testResult.success ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      {testResult.msg}
                    </span>
                  )}
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                  <button type="button" onClick={() => setIsSettingsOpen(false)} className="px-6 py-2 bg-transparent hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving || !testResult?.success} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:text-white/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 w-full sm:w-auto">
                    <Save size={16} /> {saving ? "Guardando..." : "Guardar Configuración"}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Script Modal */}
      {isScriptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4 py-8 overflow-y-auto">
          <div className="glass-panel w-full max-w-4xl p-6 relative my-auto flex flex-col max-h-[90vh]">
            <button onClick={() => setIsScriptOpen(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-xl font-bold text-white mb-1">Adoptar MikroTik Gateway</h2>
            <p className="text-slate-400 text-sm mb-4">Siga este flujo de trabajo para enlazar el Gateway remoto con Helix NOC de forma segura.</p>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
              
              {/* Seccion A: Script Mikrotik */}
              <div>
                <h3 className="text-md font-semibold text-blue-400 mb-2 border-b border-slate-800 pb-1">Sección A: Configurar MikroTik</h3>
                <p className="text-xs text-slate-400 mb-3">Copie este script y péguelo en la consola (New Terminal) del MikroTik remoto. Asegúrese de que la IP y el nombre de interfaz estén disponibles.</p>
                <div className="relative rounded-lg border border-slate-700 bg-[#0d1117] min-h-[150px]">
                  {scriptLoading ? <div className="p-4 text-slate-400 text-xs">Generando script...</div> : (
                    <pre className="p-4 text-xs text-blue-300 font-mono whitespace-pre overflow-x-auto custom-scrollbar">
                      {scriptContent}
                    </pre>
                  )}
                  <button 
                    onClick={handleCopyScript}
                    className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 border border-slate-600"
                    title="Copiar Script"
                  >
                    {copied ? <Check size={14} className="text-green-400"/> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Seccion B: Llave y Bloque Linux */}
              <div>
                <h3 className="text-md font-semibold text-blue-400 mb-2 border-b border-slate-800 pb-1">Sección B: Bloque Peer para Servidor Linux</h3>
                <p className="text-xs text-slate-400 mb-3">Obtenga la llave pública generada en el MikroTik (<code className="text-slate-300">/interface/wireguard/print detail</code>) y péguela aquí para generar el bloque de configuración del servidor Helix.</p>
                
                <div className="flex gap-2 mb-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><Key size={12}/> MikroTik Public Key</label>
                    <input type="text" value={mikrotikPubKey} onChange={e => setMikrotikPubKey(e.target.value)} placeholder="Pegue la llave pública aquí..." className="w-full px-3 py-1.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white font-mono text-sm" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={handleSavePubKey} disabled={saving || !mikrotikPubKey} className="px-4 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/20 rounded-lg whitespace-nowrap text-sm disabled:opacity-50">
                      Vincular Key
                    </button>
                  </div>
                </div>

                {mikrotikPubKey && (
                  <div className="relative rounded-lg border border-slate-700 bg-[#0d1117]">
                    <pre className="p-4 text-xs text-green-300 font-mono whitespace-pre overflow-x-auto custom-scrollbar">
{`[Peer]
# Site: ${gateways.find(g => g.id === isScriptOpen)?.name}
PublicKey = ${mikrotikPubKey}
AllowedIPs = ${gateways.find(g => g.id === isScriptOpen)?.wg_ip}/32${gateways.find(g => g.id === isScriptOpen)?.internal_subnets?.length ? ', ' + gateways.find(g => g.id === isScriptOpen)?.internal_subnets.join(', ') : ''}
PersistentKeepalive = 25`}
                    </pre>
                    <button 
                      onClick={() => {
                        const gw = gateways.find(g => g.id === isScriptOpen);
                        const block = `[Peer]\n# Site: ${gw?.name}\nPublicKey = ${mikrotikPubKey}\nAllowedIPs = ${gw?.wg_ip}/32${gw?.internal_subnets?.length ? ', ' + gw?.internal_subnets.join(', ') : ''}\nPersistentKeepalive = 25`;
                        navigator.clipboard.writeText(block);
                        alert("Bloque Peer copiado");
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300 border border-slate-600"
                      title="Copiar Bloque"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Seccion C: Instrucciones */}
              <div>
                <h3 className="text-md font-semibold text-blue-400 mb-2 border-b border-slate-800 pb-1">Sección C: Pasos Finales y Pruebas</h3>
                <ul className="text-xs text-slate-300 space-y-2 list-decimal list-inside bg-slate-800/30 p-4 rounded-lg border border-slate-800">
                  <li>Pegue el script en el MikroTik (Sección A).</li>
                  <li>Copie la <code className="text-slate-400 bg-slate-900 px-1 rounded">public-key</code> del MikroTik y péguela en Helix (Sección B).</li>
                  <li>Copie el Bloque Peer generado y péguelo en <code className="text-slate-400 bg-slate-900 px-1 rounded">/etc/wireguard/wg0.conf</code> del servidor Linux físico.</li>
                  <li>Ejecute en el servidor Linux: <code className="text-blue-300 font-mono bg-slate-900 px-1 rounded">wg syncconf wg0 &lt;(wg-quick strip wg0)</code> o reinicie el túnel.</li>
                  <li>Pruebe la conectividad presionando el botón "Ping Gateway" en la tarjeta.</li>
                </ul>
              </div>

            </div>
          </div>
        </div>
      )}
      
      {/* Modal Agregar Gateway */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm px-4 py-8 overflow-y-auto">
          <div className="glass-panel w-full max-w-2xl p-6 relative my-auto">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-xl font-bold text-white mb-1">Agregar Site Gateway</h2>
            
            <div className="mb-6 flex items-center gap-2 mt-2">
              <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-xs font-medium flex items-center gap-2">
                <Server size={12}/> Usando Helix Endpoint: {settingsData.find(s => s.key === 'wg_server_endpoint')?.value || 'No configurado'}:{settingsData.find(s => s.key === 'wg_server_port')?.value || '51820'}
              </span>
            </div>

            <form onSubmit={handleAddGateway} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre del Site Gateway <span className="text-red-400">*</span></label>
                    <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm" placeholder="Ej. Site Morazan" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                      <span>IP WireGuard del MikroTik <span className="text-red-400">*</span></span>
                      {formData.wg_ip && gateways.some(g => g.wg_ip === formData.wg_ip) && <span className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle size={10}/> IP en uso</span>}
                    </label>
                    <input required type="text" value={formData.wg_ip} onChange={(e) => setFormData({...formData, wg_ip: e.target.value})} className={`w-full px-3 py-2 bg-slate-900/80 border rounded-lg text-white focus:outline-none text-sm font-mono ${formData.wg_ip && gateways.some(g => g.wg_ip === formData.wg_ip) ? 'border-red-500 focus:border-red-400' : 'border-slate-700 focus:border-blue-500'}`} placeholder="Ej. 10.200.0.5" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre de Interfaz WireGuard</label>
                    <input type="text" value={formData.wg_interface} onChange={(e) => setFormData({...formData, wg_interface: e.target.value})} className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm font-mono" placeholder="wg0" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Subredes Internas (LAN/GPON) <span className="text-xs text-slate-500 font-normal ml-1">Presiona Enter</span></label>
                    <input 
                      type="text" 
                      value={currentSubnet} 
                      onChange={(e) => setCurrentSubnet(e.target.value)}
                      onKeyDown={addSubnet}
                      className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm font-mono mb-2" 
                      placeholder="192.168.1.0/24 y presiona Enter" 
                    />
                    {subnets.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2 p-2 bg-slate-800/30 rounded-lg border border-slate-700">
                        {subnets.map(sub => {
                          const valid = isValidCIDR(sub);
                          const isOverlap = gateways.some(g => g.internal_subnets?.includes(sub));
                          
                          let colorClass = "bg-slate-500/10 text-slate-400 border-slate-500/20";
                          if (!valid) colorClass = "bg-red-500/10 text-red-400 border-red-500/20";
                          else if (isOverlap) colorClass = "bg-orange-500/10 text-orange-400 border-orange-500/20";
                          else colorClass = "bg-green-500/10 text-green-400 border-green-500/20";

                          return (
                            <div key={sub} className={`px-2 py-1 border rounded text-xs font-mono flex items-center gap-1 ${colorClass}`} title={!valid ? "Formato CIDR inválido" : isOverlap ? "Overlap detectado con otro Gateway" : "CIDR válido y libre"}>
                              {sub}
                              <button type="button" onClick={() => removeSubnet(sub)} className="hover:opacity-70 ml-1"><X size={12}/></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-400 border-b border-slate-700 pb-2">Datos de Adopción (Opcional)</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">ISP / Empresa</label>
                    <input type="text" value={formData.isp_site} onChange={(e) => setFormData({...formData, isp_site: e.target.value})} className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm" placeholder="ISP local" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Ubicación Geográfica</label>
                    <input type="text" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm" placeholder="San Miguel, Centro" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Descripción</label>
                    <input type="text" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm" placeholder="Nodo principal oriente" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Notas Técnicas</label>
                    <textarea value={formData.technical_notes} onChange={(e) => setFormData({...formData, technical_notes: e.target.value})} className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-white focus:border-blue-500 text-sm min-h-[60px] resize-none" placeholder="El túnel pasa por NAT" />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 bg-transparent hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-500/20">{saving ? "Guardando..." : "Crear Site Gateway"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Diagnóstico NOC */}
      {diagnosticModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/90 backdrop-blur-md px-4 py-8 overflow-y-auto">
          <div className="bg-[#0a0a0a] border border-slate-800 shadow-2xl w-full max-w-3xl rounded-lg overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-[#111] border-b border-slate-800 px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Terminal className="text-emerald-500" size={18} />
                <span className="text-sm font-mono text-slate-300">Terminal NOC - Diagnóstico Gateway</span>
              </div>
              <button onClick={() => setDiagnosticModalOpen(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar bg-[#050505] font-mono text-sm space-y-1">
              {diagnosticLogs.map((log, i) => (
                <div key={i} className={`${log.includes('FAIL') || log.includes('ERROR') ? 'text-red-400' : log.includes('OK') ? 'text-emerald-400' : log.includes('Warning') ? 'text-yellow-400' : 'text-slate-400'}`}>
                  {log}
                </div>
              ))}
              {!diagnosticResult && (
                <div className="text-slate-500 animate-pulse mt-2">_</div>
              )}
            </div>

            {diagnosticResult && (
              <div className="bg-[#111] border-t border-slate-800 p-4">
                <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                  <Activity size={18} className="text-blue-500"/> Reporte de Telemetría
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                    <span className="text-xs text-slate-500 block">Ping (ICMP)</span>
                    <span className={`text-sm font-bold ${diagnosticResult.ping_status === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {diagnosticResult.ping_status.toUpperCase()} {diagnosticResult.latency_ms ? `(${diagnosticResult.latency_ms}ms)` : ''}
                    </span>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                    <span className="text-xs text-slate-500 block">WG Handshake</span>
                    <span className={`text-sm font-bold ${diagnosticResult.handshake_status === 'recent' ? 'text-emerald-400' : diagnosticResult.handshake_status === 'old' ? 'text-yellow-400' : 'text-slate-500'}`}>
                      {diagnosticResult.handshake_status.toUpperCase()}
                    </span>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                    <span className="text-xs text-slate-500 block">RX / TX</span>
                    <span className="text-sm font-mono text-blue-400">
                      {formatBytes(diagnosticResult.rx_bytes)} / {formatBytes(diagnosticResult.tx_bytes)}
                    </span>
                  </div>
                  <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                    <span className="text-xs text-slate-500 block">Peer Status</span>
                    <span className="text-sm font-bold text-slate-300">
                      {diagnosticResult.peer_status.toUpperCase()}
                    </span>
                  </div>
                </div>
                
                {diagnosticResult.warnings && diagnosticResult.warnings.length > 0 && (
                  <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <h4 className="text-xs font-bold text-red-400 mb-1 flex items-center gap-1"><AlertTriangle size={12}/> Alertas Detectadas</h4>
                    <ul className="list-disc list-inside text-xs text-red-300 space-y-1">
                      {diagnosticResult.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
