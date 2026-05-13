import React, { useState } from 'react';
import { 
  X, Info, Activity, Wrench, Settings, AlertTriangle, 
  RefreshCw, Power, Server, ShieldAlert, Wifi, 
  Trash2, Play, PauseCircle, Terminal, Clock, Database
} from 'lucide-react';

const globalConfigCache: Record<string, { data: any, fetched_at: number }> = {};

interface OnuDrawerProps {
  onu: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function OnuDrawer({ onu, isOpen, onClose }: OnuDrawerProps) {
  const [activeTab, setActiveTab] = useState('details');
  const [realPower, setRealPower] = useState<any>(null);
  const [loadingPower, setLoadingPower] = useState(false);
  const [powerError, setPowerError] = useState("");

  const [realDetails, setRealDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const [realNetwork, setRealNetwork] = useState<any>(null);
  const [loadingNetwork, setLoadingNetwork] = useState(false);
  const [networkError, setNetworkError] = useState("");

  // Configuration Engine States
  const [configState, setConfigState] = useState<any>(null);
  const [draftConfig, setDraftConfig] = useState<any>({ identity: { name: "", description: "" } });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState("");
  
  const [patchPreview, setPatchPreview] = useState<any>(null);
  const [isPatching, setIsPatching] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState("");
  const [commitResult, setCommitResult] = useState<any>(null);
  const [transactionError, setTransactionError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Deletion state
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // Loading UX state
  const [loadingStep, setLoadingStep] = useState(0);

  // Reset state when onu changes or drawer closes
  React.useEffect(() => {
    setActiveTab('details');
    setRealPower(null);
    setPowerError("");
    setRealDetails(null);
    setDetailsError("");
    setRealNetwork(null);
    setNetworkError("");
    setConfigState(null);
    setDraftConfig({ identity: { name: "", description: "" } });
    setPatchPreview(null);
    setCommitResult(null);
    setConfigError("");
    setTransactionStatus("");
    setTransactionError("");
    setTransactionError("");
    setShowConfirmModal(false);
    
    // Reset deletion
    setDeleteConfirmationText("");
    setIsDeleting(false);
    setDeleteError("");
    setDeleteSuccess(false);
  }, [onu?.id, isOpen]);

  const fetchPower = async () => {
    if (!onu) return;
    setLoadingPower(true);
    setPowerError("");
    try {
      const res = await fetch(`http://localhost:8000/api/onus/${onu.id}/power`);
      if (res.ok) {
        const data = await res.json();
        setRealPower(data);
      } else {
        const err = await res.json();
        setPowerError(err.detail || "Error leyendo potencia");
      }
    } catch (e) {
      setPowerError("Error de conexión");
    } finally {
      setLoadingPower(false);
    }
  };

  const fetchDetails = async () => {
    if (!onu) return;
    setLoadingDetails(true);
    setDetailsError("");
    setLoadingNetwork(true);
    setNetworkError("");
    try {
      const res = await fetch(`http://localhost:8000/api/onus/${onu.id}/details`);
      if (res.ok) {
        const data = await res.json();
        setRealDetails(data);
      } else {
        const err = await res.json();
        setDetailsError(err.detail || "Error leyendo detalles");
      }
      
      const resNet = await fetch(`http://localhost:8000/api/onus/${onu.id}/network`);
      if (resNet.ok) {
        const netData = await resNet.json();
        setRealNetwork(netData);
      } else {
        const err = await resNet.json();
        setNetworkError(err.detail || "Error leyendo red");
      }
    } catch (e) {
      setDetailsError("Error de conexión");
      setNetworkError("Error de conexión");
    } finally {
      setLoadingDetails(false);
      setLoadingNetwork(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'power' && !realPower && !loadingPower && !powerError) {
      fetchPower();
    }
    if (activeTab === 'details' && !realDetails && !loadingDetails && !detailsError) {
      fetchDetails();
    }
    if (activeTab === 'config' && !configState && !loadingConfig && !configError) {
      fetchConfigState();
    }
  }, [activeTab]);

  const fetchConfigState = async (forceRefresh = false) => {
    if (!onu || !onu.id) {
      setConfigError("Esta ONU aún no ha sido autorizada en el sistema. Debe adoptarla primero para poder modificar su configuración.");
      return;
    }
    
    // Cache check
    if (!forceRefresh && globalConfigCache[onu.id]) {
      const cached = globalConfigCache[onu.id];
      const ageMs = Date.now() - (cached.fetched_at * 1000);
      if (ageMs < 5 * 60 * 1000) { // 5 minutes cache
        setConfigState(cached.data);
        setDraftConfig({
          identity: {
            name: cached.data.identity?.name || "",
            description: cached.data.identity?.description || ""
          }
        });
        return;
      }
    }
    
    setLoadingConfig(true);
    setConfigError("");
    setPatchPreview(null);
    setCommitResult(null);
    setLoadingStep(0);
    
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 30000); // 30s timeout
    
    // UX Loading Stepper Simulation
    const stepInterval = setInterval(() => {
      setLoadingStep(prev => (prev < 3 ? prev + 1 : prev));
    }, 2000);
    
    try {
      const res = await fetch(`http://localhost:8000/api/onu-config/${onu.id}/state`, {
        signal: abortController.signal
      });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        setConfigState(data);
        setDraftConfig({
          identity: {
            name: data.identity?.name || "",
            description: data.identity?.description || ""
          }
        });
        globalConfigCache[onu.id] = { data, fetched_at: data.fetched_at || (Date.now() / 1000) };
      } else {
        const err = await res.json();
        let errMsg = "Error leyendo estado de configuración";
        if (err.detail) {
          errMsg = Array.isArray(err.detail) ? err.detail.map((e:any) => e.msg).join(', ') : err.detail;
        }
        setConfigError(errMsg);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setConfigError("La OLT tardó demasiado en responder (Timeout > 30s). Reintentar.");
      } else {
        setConfigError("Error de red conectando con el backend");
      }
    } finally {
      clearInterval(stepInterval);
      setLoadingConfig(false);
    }
  };

  const fetchAuditHistory = async () => {
    if (!onu) return;
    setLoadingAudit(true);
    setShowAuditModal(true);
    try {
      const res = await fetch(`http://localhost:8000/api/onu-config/${onu.id}/audit-history`);
      if (res.ok) {
        const data = await res.json();
        setAuditHistory(data);
      }
    } catch (e) {
      console.error("Error fetching audit history", e);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handlePreviewPatch = async () => {
    if (!onu || !configState) return;
    setIsPatching(true);
    setCommitResult(null);
    try {
      const res = await fetch(`http://localhost:8000/api/onu-config/${onu.id}/patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_state: configState,
          desired_state: draftConfig
        })
      });
      if (res.ok) {
        const data = await res.json();
        setPatchPreview(data);
      } else {
        const err = await res.json();
        alert(err.detail || "Error generando preview");
      }
    } catch (e) {
      alert("Error de red");
    } finally {
      setIsPatching(false);
    }
  };

  const handleCommitPatch = async () => {
    if (!onu || !patchPreview || !patchPreview.commands.length) return;
    setShowConfirmModal(true);
  };

  const executeCommit = async () => {
    if (configState?.onu_interface && configState.onu_interface !== onu.interface) {
      setTransactionStatus("failed");
      setTransactionError("Mismatch de ONU: El estado cargado no corresponde a la ONU seleccionada.");
      setShowConfirmModal(false);
      return;
    }
    
    setShowConfirmModal(false);
    setIsPatching(true);
    setTransactionError("");
    try {
      setTransactionStatus("validating");
      await new Promise(r => setTimeout(r, 600));
      
      setTransactionStatus("backing_up");
      await new Promise(r => setTimeout(r, 800));
      
      setTransactionStatus("patching");
      
      const res = await fetch(`http://localhost:8000/api/onu-config/${onu.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_onu_id: onu.id,
          patch_data: patchPreview,
          current_state: configState,
          desired_state: draftConfig
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        setTransactionStatus("verifying");
        await new Promise(r => setTimeout(r, 800));
        setTransactionStatus("success");
        setCommitResult(data);
        // Refresh local state after successful commit
        setTimeout(() => fetchConfigState(), 2000);
      } else {
        let errorMsg = data.detail || "Error ejecutando commit";
        if (Array.isArray(errorMsg)) {
            errorMsg = errorMsg.map((e:any) => e.msg).join(', ');
        }
        
        if (typeof errorMsg === 'string' && errorMsg.includes("Rollback")) {
          setTransactionStatus("rollback");
          await new Promise(r => setTimeout(r, 1000));
        }
        setTransactionStatus("failed");
        setTransactionError(errorMsg);
      }
    } catch (e) {
      setTransactionStatus("failed");
      setTransactionError("Error de red conectando con el servidor");
    } finally {
      setIsPatching(false);
    }
  };

  const handleDeleteOnu = async () => {
    if (!window.confirm("¿Está completamente seguro de que desea eliminar esta ONU de la OLT y del sistema?")) return;
    
    setIsDeleting(true);
    setDeleteError("");
    
    try {
      const res = await fetch(`http://localhost:8000/api/provisioning/onu/${onu.olt_id}/${encodeURIComponent(onu.interface)}`, {
        method: 'DELETE'
      });
      
      const data = await res.json().catch(() => ({ detail: "Error de red o de parseo JSON" }));
      if (!res.ok) {
        // If it's a 404, it means the ONU is already deleted. We can treat it as a success.
        if (res.status === 404) {
          setDeleteSuccess(true);
          setTimeout(() => {
            onClose();
            window.location.reload();
          }, 2000);
          return;
        }

        let errorMsg = data.detail || "Error al eliminar ONU";
        if (typeof errorMsg === 'object') {
          errorMsg = Array.isArray(errorMsg) ? errorMsg.map((e: any) => e.msg).join(', ') : JSON.stringify(errorMsg);
        }
        throw new Error(errorMsg);
      }
      
      setDeleteSuccess(true);
      // Let the user see success message before closing
      setTimeout(() => {
        onClose();
        // optionally refresh parent list
        window.location.reload();
      }, 2000);
      
    } catch (e: any) {
      setDeleteError(typeof e.message === 'string' ? e.message : JSON.stringify(e));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  // Use real data from ONU prop, falling back if not set
  const crmName = onu?.name || "Sin nombre asignado";

  const getPowerColor = (power: number | null) => {
    if (power === null) return "text-slate-400";
    if (power >= -25 && power <= -8) return "text-green-400"; // Excellent/Good
    if (power >= -28 && power < -25) return "text-yellow-400"; // Warning
    return "text-red-500"; // Critical
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`fixed right-0 top-0 h-full w-full sm:w-[450px] md:w-[550px] lg:w-[600px] bg-[#0b1120] border-l border-slate-800 z-50 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-900/50">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-white">{onu?.interface}</h2>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                Online
              </span>
            </div>
            <p className="text-slate-400 font-mono text-sm">{onu?.sn}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-800 px-2 bg-slate-900/30">
          {[
            { id: 'details', icon: Info, label: 'Detalles' },
            { id: 'power', icon: Activity, label: 'Potencia' },
            { id: 'tools', icon: Wrench, label: 'Herramientas' },
            { id: 'config', icon: Settings, label: 'Config' },
            { id: 'critical', icon: AlertTriangle, label: 'Críticas' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'border-blue-500 text-blue-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* TAB: DETALLES */}
          {activeTab === 'details' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">Configuración de la ONU</h3>
                  {realDetails && <p className="text-xs text-slate-400">Datos obtenidos de la OLT: {new Date().toLocaleTimeString()}</p>}
                </div>
                <button 
                  onClick={fetchDetails}
                  disabled={loadingDetails || loadingNetwork}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors flex items-center gap-2 border border-slate-700 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={(loadingDetails || loadingNetwork) ? "animate-spin text-blue-400" : ""} /> 
                  {(loadingDetails || loadingNetwork) ? "Consultando..." : "Refrescar"}
                </button>
              </div>

              {(loadingDetails || loadingNetwork) ? (
                <div className="glass-panel p-10 flex flex-col items-center justify-center text-center">
                  <Activity size={32} className="animate-spin text-blue-500 mb-4" />
                  <p className="text-slate-300 font-medium">Cargando Detalles desde la OLT...</p>
                </div>
              ) : (detailsError || networkError) ? (
                <div className="glass-panel border-red-500/20 bg-red-500/5 p-6 flex flex-col items-center justify-center text-center overflow-hidden">
                  <AlertTriangle size={32} className="text-red-400 mb-4" />
                  <p className="text-red-400 font-medium mb-2">Error de Comunicación OLT</p>
                  <div className="w-full bg-black/50 p-3 rounded text-left overflow-y-auto max-h-32 text-xs font-mono text-red-300 whitespace-pre-wrap">
                    {detailsError || networkError}
                  </div>
                  <button onClick={fetchDetails} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors text-sm">
                    Reintentar Conexión
                  </button>
                </div>
              ) : (
                <>
                  <div className="glass-panel p-5">
                    <h3 className="text-white font-semibold mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                      <Server size={16} className="text-blue-400"/> Información General
                    </h3>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Cliente CRM</p>
                        <p className="text-sm text-white font-medium">{crmName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Nombre OLT (Real)</p>
                        <p className="text-sm text-blue-300 font-mono font-bold bg-blue-500/10 px-2 py-0.5 rounded w-max">
                          {realDetails?.olt_name_config || "Sin nombre configurado"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Descripción OLT</p>
                        <p className="text-sm text-white">{realDetails?.description || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Tipo de ONU (Modelo)</p>
                        <p className="text-sm text-white">{realDetails?.onu_type || "Desconocido"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-slate-500 mb-1">Dirección MAC / SN Extendido</p>
                        <p className="text-sm text-slate-300 font-mono">{realDetails?.mac_sn || "N/A"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel p-5">
                    <h3 className="text-white font-semibold mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                      <Activity size={16} className="text-green-400"/> Estado de Red (WAN)
                    </h3>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Modo WAN</p>
                        <p className="text-sm font-medium">
                          {realNetwork?.is_router 
                            ? <span className="text-blue-400">Router {realNetwork.wan_mode ? `(${realNetwork.wan_mode})` : ''}</span> 
                            : <span className="text-slate-300">Bridge (Solo transporte)</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Estado PPPoE/WAN</p>
                        <p className="text-sm font-medium">
                          {!realNetwork?.is_router ? (
                            <span className="text-slate-500">No gestionado por ONU</span>
                          ) : realNetwork?.wan_status === "Connected" ? (
                            <span className="text-green-400">Connected</span>
                          ) : (
                            <span className="text-red-400">{realNetwork?.wan_status || "Disconnected"}</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">IP WAN</p>
                        <p className="text-sm text-slate-300 font-mono">
                          {!realNetwork?.is_router ? "N/A (Modo Bridge)" : (realNetwork?.wan_ip || "No disponible")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">PPPoE User</p>
                        <p className="text-sm text-white font-mono">
                          {realNetwork?.pppoe_user || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">VLAN / Perfil (OLT)</p>
                        <p className="text-sm text-white">
                          VLAN {realNetwork?.vlan || "N/A"} - {realNetwork?.profile || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Uptime (OLT)</p>
                        <p className="text-sm text-white">{realDetails?.uptime || "No disponible"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-slate-500 mb-1">Distancia Fibra (OLT)</p>
                        <p className="text-sm text-white">{realDetails?.distance || "No disponible"}</p>
                      </div>
                    </div>
                  </div>

                  {realDetails?.raw_output && (
                    <div className="glass-panel overflow-hidden border-slate-800">
                      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 text-xs text-slate-400 font-semibold uppercase flex justify-between items-center">
                        <span>Respuesta Cruda (Detail Info & Running Config)</span>
                        <Server size={12} />
                      </div>
                      <div className="bg-black/60 p-4 overflow-y-auto max-h-48 text-xs font-mono text-green-400/80 whitespace-pre-wrap leading-relaxed">
                        {realDetails.raw_output}
                        {realNetwork?.raw_output && "\n\n" + realNetwork.raw_output}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB: POTENCIA OPTICA */}
          {activeTab === 'power' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">Métricas Ópticas Actuales</h3>
                  {realPower && <p className="text-xs text-slate-400">Última lectura: {new Date().toLocaleTimeString()}</p>}
                </div>
                <button 
                  onClick={fetchPower}
                  disabled={loadingPower}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded transition-colors flex items-center gap-2 border border-slate-700 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loadingPower ? "animate-spin text-blue-400" : ""} /> 
                  {loadingPower ? "Consultando ZTE..." : "Refrescar"}
                </button>
              </div>
              
              {loadingPower ? (
                <div className="glass-panel p-10 flex flex-col items-center justify-center text-center">
                  <Activity size={32} className="animate-spin text-blue-500 mb-4" />
                  <p className="text-slate-300 font-medium">Leyendo parámetros en vivo...</p>
                  <p className="text-xs text-slate-500 mt-1">Conectando a {onu?.olt_name} vía Telnet</p>
                </div>
              ) : powerError ? (
                <div className="glass-panel border-red-500/20 bg-red-500/5 p-6 flex flex-col items-center justify-center text-center overflow-hidden">
                  <AlertTriangle size={32} className="text-red-400 mb-4" />
                  <p className="text-red-400 font-medium mb-2">Error de Comunicación OLT</p>
                  <div className="w-full bg-black/50 p-3 rounded text-left overflow-y-auto max-h-32 text-xs font-mono text-red-300 whitespace-pre-wrap">
                    {powerError}
                  </div>
                  <button onClick={fetchPower} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors text-sm">
                    Reintentar Conexión
                  </button>
                </div>
              ) : realPower ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-panel p-5 flex flex-col items-center justify-center text-center">
                      <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Potencia RX (ONU)</p>
                      <p className={`text-3xl font-bold mb-1 ${getPowerColor(realPower.rx_onu)}`}>
                        {realPower.rx_onu ?? "--"} <span className="text-lg opacity-50 font-normal">dBm</span>
                      </p>
                      {realPower.rx_onu !== null && (
                         <span className={`text-xs px-2 py-0.5 rounded-full border ${realPower.rx_onu >= -25 ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                           {realPower.rx_onu >= -25 ? 'Óptima' : 'Crítica'}
                         </span>
                      )}
                    </div>
                    <div className="glass-panel p-5 flex flex-col items-center justify-center text-center">
                      <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Potencia TX (ONU)</p>
                      <p className="text-3xl font-bold text-white mb-1">
                        {realPower.tx_onu ?? "--"} <span className="text-lg text-slate-500 font-normal">dBm</span>
                      </p>
                      <span className="text-xs text-slate-500">Normal</span>
                    </div>
                  </div>

                  <div className="glass-panel p-5">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
                      <span className="text-sm font-medium text-slate-300">Temperatura del Módulo</span>
                      <span className="text-sm text-yellow-400 font-mono">{realPower.temp ?? "--"} °C</span>
                    </div>
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800">
                      <span className="text-sm font-medium text-slate-300">RX Óptico OLT</span>
                      <span className={`text-sm font-mono ${getPowerColor(realPower.rx_olt)}`}>{realPower.rx_olt ?? "--"} dBm</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-300">TX Óptico OLT (SFP)</span>
                      <span className="text-sm text-white font-mono">~ +3.5 dBm</span>
                    </div>
                  </div>

                  {realPower.raw_output && (
                    <div className="glass-panel overflow-hidden border-slate-800">
                      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 text-xs text-slate-400 font-semibold uppercase flex justify-between items-center">
                        <span>Respuesta Cruda (Telnet Debug)</span>
                        <Server size={12} />
                      </div>
                      <div className="bg-black/60 p-4 overflow-y-auto max-h-48 text-xs font-mono text-green-400/80 whitespace-pre-wrap leading-relaxed">
                        {realPower.raw_output}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* TAB: HERRAMIENTAS */}
          {activeTab === 'tools' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-white font-semibold mb-2">Herramientas Rápidas</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button className="glass-panel p-4 flex flex-col items-center justify-center text-center hover-glow group transition-all">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-110 transition-transform">
                    <Power size={20} />
                  </div>
                  <span className="text-sm font-medium text-white mb-1">Reiniciar ONU</span>
                  <span className="text-xs text-slate-400">Soft-reboot remoto</span>
                </button>
                
                <button className="glass-panel p-4 flex flex-col items-center justify-center text-center hover-glow group transition-all">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3 group-hover:scale-110 transition-transform">
                    <Activity size={20} />
                  </div>
                  <span className="text-sm font-medium text-white mb-1">Ping de Diagnóstico</span>
                  <span className="text-xs text-slate-400">Verificar latencia WAN</span>
                </button>
                
                <button className="glass-panel p-4 flex flex-col items-center justify-center text-center hover-glow group transition-all">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 mb-3 group-hover:scale-110 transition-transform">
                    <Server size={20} />
                  </div>
                  <span className="text-sm font-medium text-white mb-1">Estado PPPoE</span>
                  <span className="text-xs text-slate-400">Verificar autenticación</span>
                </button>

                <button className="glass-panel p-4 flex flex-col items-center justify-center text-center hover-glow group transition-all">
                  <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400 mb-3 group-hover:scale-110 transition-transform">
                    <RefreshCw size={20} />
                  </div>
                  <span className="text-sm font-medium text-white mb-1">Sincronizar Datos</span>
                  <span className="text-xs text-slate-400">Forzar lectura OLT</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB: CONFIGURACION (OPERATIONAL CONSOLE) */}
          {activeTab === 'config' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {loadingConfig ? (
                <div className="glass-panel p-10 flex flex-col items-center justify-center text-center">
                  <Activity size={32} className="animate-spin text-blue-500 mb-4" />
                  <p className="text-slate-300 font-medium">
                    {loadingStep === 0 && "Conectando con OLT..."}
                    {loadingStep === 1 && "Leyendo running-config de la ONU..."}
                    {loadingStep === 2 && "Parseando estado actual..."}
                    {loadingStep === 3 && "Preparando formulario seguro..."}
                  </p>
                  <p className="text-slate-500 text-xs mt-2">Esta operación en vivo puede tomar hasta 20 segundos.</p>
                </div>
              ) : configError ? (
                <div className="glass-panel border-red-500/20 bg-red-500/5 p-6 flex flex-col items-center justify-center text-center">
                  <AlertTriangle size={32} className="text-red-400 mb-4" />
                  <p className="text-red-400 font-medium mb-2">Error leyendo configuración</p>
                  <div className="text-xs text-red-300">{configError}</div>
                  <button onClick={fetchConfigState} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 text-sm">
                    Reintentar
                  </button>
                </div>
              ) : configState ? (
                <>
                  {/* METADATOS Y FUENTE */}
                  <div className="flex flex-wrap gap-2 items-center justify-between bg-slate-900/30 p-3 rounded-lg border border-slate-800">
                    <div className="flex gap-3 items-center">
                      <span className="flex items-center gap-1 text-[11px] font-mono uppercase font-bold bg-black/40 px-2 py-1 rounded text-slate-400">
                        <Database size={12} className={configState.fetched_at ? "text-blue-400" : "text-green-400"} />
                        Fuente: {configState.fetched_at && Date.now() - (configState.fetched_at * 1000) > 10000 ? 'Caché Temporal' : 'OLT en vivo'}
                      </span>
                      {configState.fetched_at && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Clock size={12} />
                          hace {Math.round((Date.now() - (configState.fetched_at * 1000)) / 1000)} seg
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={() => fetchConfigState(true)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] uppercase font-bold rounded flex items-center gap-2 transition-colors border border-slate-700"
                    >
                      <RefreshCw size={12} />
                      Refrescar desde OLT
                    </button>
                  </div>

                  {/* SECCION 1: Identidad ONU */}
                  <div className="glass-panel p-5">
                    <h3 className="text-white font-semibold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
                      <Info size={16} className="text-blue-400" /> Identidad ONU
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Nombre (Name)</label>
                        <input 
                          type="text" 
                          value={draftConfig.identity.name}
                          onChange={(e) => setDraftConfig({...draftConfig, identity: {...draftConfig.identity, name: e.target.value}})}
                          className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded p-2 text-white text-sm outline-none" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Descripción (Description)</label>
                        <input 
                          type="text" 
                          value={draftConfig.identity.description}
                          onChange={(e) => setDraftConfig({...draftConfig, identity: {...draftConfig.identity, description: e.target.value}})}
                          className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded p-2 text-white text-sm outline-none" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECCION 2: Modo WAN (Próximamente) */}
                  <div className="glass-panel p-5 opacity-50 pointer-events-none border-dashed border-slate-700">
                    <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                      <Server size={16} /> Modo WAN
                      <span className="ml-auto text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">FASE 2</span>
                    </h3>
                    <p className="text-xs text-slate-400">La configuración de Bridge/Router PPPoE será habilitada en la próxima fase.</p>
                  </div>

                  {/* SECCION 3: Wi-Fi (Próximamente) */}
                  <div className="glass-panel p-5 opacity-50 pointer-events-none border-dashed border-slate-700">
                    <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                      <Wifi size={16} /> Configuración WiFi
                      <span className="ml-auto text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">FASE 3</span>
                    </h3>
                    <p className="text-xs text-slate-400">Integración pendiente con perfiles OMCI.</p>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex gap-3">
                    <button 
                      onClick={fetchAuditHistory}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-700"
                    >
                      Historial de Cambios
                    </button>
                    <button 
                      onClick={handlePreviewPatch}
                      disabled={isPatching}
                      className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isPatching && !patchPreview ? <Activity size={16} className="animate-spin" /> : <Play size={16} />}
                      Generar Preview Técnico
                    </button>
                  </div>

                  {/* SECCION 6: Preview Técnico & Commit */}
                  {patchPreview && (
                    <div className="glass-panel p-6 border-l-4 border-l-blue-500 mt-6 animate-in slide-in-from-bottom-4 duration-500">
                      <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                        <Terminal size={18} className="text-blue-400" /> Preview de Cambios (Dry-Run)
                      </h3>
                      
                      {patchPreview.commands.length === 0 ? (
                        <div className="text-center p-4 text-slate-400 text-sm bg-slate-900 rounded">
                          No hay cambios detectados para aplicar.
                        </div>
                      ) : (
                        <>
                          <div className="mb-4 bg-slate-900 border border-slate-800 rounded-lg p-4">
                            <h4 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Diff Visual (Valores Modificados)</h4>
                            <div className="space-y-2">
                              {configState.identity.name !== draftConfig.identity.name && (
                                <div className="grid grid-cols-2 gap-2 text-sm font-mono bg-black/40 p-2 rounded">
                                  <div className="text-red-400 line-through">- name {configState.identity.name || '""'}</div>
                                  <div className="text-green-400">+ name {draftConfig.identity.name || '""'}</div>
                                </div>
                              )}
                              {configState.identity.description !== draftConfig.identity.description && (
                                <div className="grid grid-cols-2 gap-2 text-sm font-mono bg-black/40 p-2 rounded">
                                  <div className="text-red-400 line-through">- description {configState.identity.description || '""'}</div>
                                  <div className="text-green-400">+ description {draftConfig.identity.description || '""'}</div>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-[10px] text-green-400 font-bold mb-1 uppercase tracking-wider">Comandos a Inyectar</div>
                              <pre className="bg-[#0a0a0a] border border-green-900/50 p-3 rounded text-[11px] font-mono text-green-300 h-40 overflow-y-auto custom-scrollbar">
                                {patchPreview.commands.join("\n")}
                              </pre>
                            </div>
                            <div>
                              <div className="text-[10px] text-orange-400 font-bold mb-1 uppercase tracking-wider">Rollback de Emergencia</div>
                              <pre className="bg-[#0a0a0a] border border-orange-900/50 p-3 rounded text-[11px] font-mono text-orange-300 h-40 overflow-y-auto custom-scrollbar">
                                {patchPreview.rollback.join("\n")}
                              </pre>
                            </div>
                          </div>
                          
                          <div className="bg-slate-900/50 p-3 rounded mb-4 text-xs text-slate-400 flex items-start gap-2">
                            <ShieldAlert size={14} className="text-blue-400 shrink-0 mt-0.5" />
                            <p>El motor realizará un backup automático de la ONU antes de ejecutar esta transacción. Si ocurre un error de sintaxis en la OLT, se ejecutará el rollback automáticamente.</p>
                          </div>
                          
                          {/* Transactional Chips */}
                          {transactionStatus && transactionStatus !== "success" && (
                            <div className="mb-4 flex flex-wrap gap-2 justify-center border-t border-slate-800 pt-4">
                              <span className={`text-[10px] px-2 py-1 rounded border ${transactionStatus === 'validating' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>Validando Lock</span>
                              <span className={`text-[10px] px-2 py-1 rounded border ${transactionStatus === 'backing_up' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>Backup</span>
                              <span className={`text-[10px] px-2 py-1 rounded border ${transactionStatus === 'patching' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 animate-pulse' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>Inyectando Patch</span>
                              <span className={`text-[10px] px-2 py-1 rounded border ${transactionStatus === 'verifying' ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>Verificando</span>
                              {transactionStatus === 'rollback' && <span className="text-[10px] px-2 py-1 rounded border bg-orange-500/20 text-orange-400 border-orange-500/50 animate-pulse">Ejecutando Rollback</span>}
                              {transactionStatus === 'failed' && <span className="text-[10px] px-2 py-1 rounded border bg-red-500/20 text-red-400 border-red-500/50">Fallido</span>}
                            </div>
                          )}

                          {commitResult ? (
                            <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg flex items-start gap-3">
                              <div className="w-8 h-8 shrink-0 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">✓</div>
                              <div>
                                <div className="text-green-400 font-bold text-sm">Transacción Exitosa</div>
                                <div className="text-green-300/70 text-xs mb-2">Los cambios fueron aplicados en la OLT.</div>
                                <div className="bg-black/30 px-2 py-1 rounded text-[10px] font-mono text-slate-400 border border-slate-800">
                                  Patch SHA256: <span className="text-slate-300">{patchPreview.hash || "N/A"}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              {transactionError && (
                                <div className="mb-4 bg-red-500/10 border border-red-500/30 p-4 rounded-lg flex items-start gap-3">
                                  <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                                  <div>
                                    <div className="text-red-400 font-bold text-sm mb-1">Transacción Fallida</div>
                                    <div className="text-red-300/80 text-xs whitespace-pre-wrap">{transactionError}</div>
                                  </div>
                                </div>
                              )}
                              <button 
                                onClick={handleCommitPatch}
                                disabled={isPatching}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                              >
                                {isPatching ? <Activity size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                                Confirmar y Ejecutar Transacción
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* TAB: CRITICAS */}
          {activeTab === 'critical' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="p-4 border border-orange-500/30 bg-orange-500/10 rounded-lg">
                <h3 className="text-orange-400 font-bold mb-2 flex items-center gap-2">
                  <PauseCircle size={18} /> Suspensión de Servicio
                </h3>
                <p className="text-sm text-slate-300 mb-4">
                  Bloquea temporalmente el acceso a Internet del cliente. Esto se realiza de manera segura mediante plantillas (ej. aislando la VLAN o bajando el perfil).
                </p>
                <button className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded text-sm transition-colors w-full sm:w-auto">
                  Suspender Cliente
                </button>
              </div>

              <div className="p-4 border border-red-500/30 bg-red-500/10 rounded-lg">
                <h3 className="text-red-400 font-bold mb-2 flex items-center gap-2">
                  <Trash2 size={18} /> Desautorizar y Eliminar
                </h3>
                <p className="text-sm text-slate-300 mb-4">
                  Esta acción realizará un backup de la configuración en ejecución, eliminará completamente la ONU de la OLT, limpiará los puertos de servicio asociados y la marcará como eliminada en el sistema.
                </p>
                
                {deleteSuccess ? (
                  <div className="bg-green-500/20 text-green-400 p-3 rounded text-sm font-medium border border-green-500/30 flex items-center justify-center gap-2">
                    <ShieldAlert size={16} /> ¡ONU Eliminada Exitosamente! Cerrando...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deleteError && (
                       <div className="bg-red-500/20 border border-red-500/40 p-3 rounded text-xs text-red-300">
                         <strong>Error:</strong> {deleteError}
                       </div>
                    )}
                    <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded mb-3">
                      <p className="text-sm text-orange-400 font-medium">¡Atención!</p>
                      <p className="text-xs text-orange-300/80 mt-1">Esta acción es irreversible y desconectará al cliente permanentemente.</p>
                    </div>
                    <button 
                      onClick={handleDeleteOnu}
                      disabled={isDeleting}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded text-sm transition-colors w-full flex items-center justify-center gap-2"
                    >
                      {isDeleting ? <Activity size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                      {isDeleting ? "Ejecutando Job Transaccional..." : "Eliminar ONU Definitivamente"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
      
      {/* AUDIT MODAL */}
      {showAuditModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Terminal size={18} className="text-blue-400" /> Historial de Configuración y Auditoría
              </h3>
              <button onClick={() => setShowAuditModal(false)} className="p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
              {loadingAudit ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Activity size={32} className="animate-spin text-blue-500 mb-4" />
                  <p className="text-slate-400">Cargando historial...</p>
                </div>
              ) : auditHistory.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  No hay registros de auditoría para esta ONU.
                </div>
              ) : (
                <div className="space-y-4">
                  {auditHistory.map((audit: any, idx: number) => (
                    <div key={idx} className="border border-slate-800 bg-slate-900/30 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${audit.status === 'success' ? 'bg-green-500/20 text-green-400' : audit.status === 'rollback_success' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>
                            {audit.status}
                          </span>
                          <span className="text-slate-400 text-xs">
                            {new Date(audit.created_at).toLocaleString()}
                          </span>
                          <span className="text-slate-500 text-xs flex items-center gap-1">
                            <Info size={12} /> {audit.created_by || 'Auto'}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 bg-black/40 px-2 py-1 rounded">
                          {audit.patch_hash_sha256 ? audit.patch_hash_sha256.substring(0, 16) + '...' : 'N/A'}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Patch Inyectado</p>
                          <pre className="bg-[#0a0a0a] border border-slate-800 p-2 rounded text-[11px] font-mono text-blue-300 h-32 overflow-y-auto custom-scrollbar">
                            {(audit.generated_patch || []).join('\n') || 'Ninguno'}
                          </pre>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Output OLT</p>
                          <pre className="bg-[#0a0a0a] border border-slate-800 p-2 rounded text-[11px] font-mono text-slate-400 h-32 overflow-y-auto custom-scrollbar">
                            {audit.raw_cli_output || audit.error_message || 'Sin output'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6 relative z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-yellow-500 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold text-white">¿Confirmar Ejecución?</h3>
            </div>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              Estás a punto de inyectar configuración <span className="font-bold text-white">en tiempo real</span> en la OLT productiva para la interfaz <span className="font-mono text-blue-400">{onu?.interface}</span>.
              <br /><br />
              El motor realizará un backup automáticamente, pero si el comando contiene errores lógicos, podría afectar el servicio.
            </p>
            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-2">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={executeCommit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-bold shadow-lg shadow-blue-500/20"
              >
                Sí, Inyectar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
