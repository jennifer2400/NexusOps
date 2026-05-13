"use client";
import { useState, useEffect } from "react";
import { Play, ShieldAlert, Cpu, CheckCircle2, Lock, Search, Network } from "lucide-react";
import TemplatesTab from "./components/TemplatesTab";

export default function ProvisioningPage() {
  const [olts, setOlts] = useState<any[]>([]);
  const [selectedOlt, setSelectedOlt] = useState<number | null>(null);
  
  const [unconfiguredOnus, setUnconfiguredOnus] = useState<any[]>([]);
  const [loadingOnus, setLoadingOnus] = useState(false);
  const [selectedOnu, setSelectedOnu] = useState<any | null>(null);
  
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  
  const [speedProfiles, setSpeedProfiles] = useState<any[]>([]);
  const [vlanProfiles, setVlanProfiles] = useState<any[]>([]);
  const [selectedSpeedProfileId, setSelectedSpeedProfileId] = useState<number | null>(null);
  const [selectedVlanProfileId, setSelectedVlanProfileId] = useState<number | null>(null);
  
  const [variables, setVariables] = useState<any>({});
  
  const [dryRunResult, setDryRunResult] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Custom Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState("");
  
  const [activeTab, setActiveTab] = useState("discovery"); // 'discovery', 'templates', 'matrix'
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<any | null>(null);
  
  const [matrixData, setMatrixData] = useState<any[]>([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [matrixPonInterface, setMatrixPonInterface] = useState("");
  const [ponTelemetry, setPonTelemetry] = useState<any>(null);

  useEffect(() => {
    fetchOlts();
    fetchTemplates();
    fetchSpeedProfiles();
    fetchVlanProfiles();
  }, []);

  const fetchSpeedProfiles = async () => {
    const res = await fetch("http://localhost:8000/api/provisioning/speed-profiles/", { cache: 'no-store' });
    const data = await res.json();
    setSpeedProfiles(data);
  };

  const fetchVlanProfiles = async (oltId?: number) => {
    let url = "http://localhost:8000/api/provisioning/vlan-profiles/";
    if (oltId) url += `?olt_id=${oltId}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    setVlanProfiles(data);
  };

  useEffect(() => {
    if (selectedOlt) {
      fetchUnconfigured(selectedOlt);
      fetchVlanProfiles(selectedOlt);
    } else {
      setUnconfiguredOnus([]);
      setSelectedOnu(null);
      fetchVlanProfiles();
    }
  }, [selectedOlt]);

  useEffect(() => {
    if (selectedTemplateId) {
      const tmpl = templates.find(t => t.id === selectedTemplateId);
      if (tmpl && tmpl.commands_template) {
        // Extraer variables usando regex: {mivariable}
        const matches = [...tmpl.commands_template.matchAll(/\{([A-Za-z0-9_]+)\}/g)];
        let vars = matches.map(m => m[1]);
        if (tmpl.rollback_template) {
           const rMatches = [...tmpl.rollback_template.matchAll(/\{([A-Za-z0-9_]+)\}/g)];
           vars = [...vars, ...rMatches.map(m => m[1])];
        }
        
        const INTERNAL_VARIABLES = [
          "full_onu_interface", "onu_id", "pon_interface", 
          "tcont_index", "gemport_index", "gemport_name", 
          "service_port_index", "vport", "upstream_profile", 
          "downstream_profile", "vlan", "onu_sn", "onu_interface",
          "name", "description"
        ];
        
        // Quitar duplicados y variables auto-inyectadas o manejadas en secciones estáticas
        const uniqueVars = [...new Set(vars)].filter(v => {
          return !INTERNAL_VARIABLES.includes(v.toLowerCase());
        });
        setTemplateVariables(uniqueVars as string[]);
      }
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    let interval: any;
    if (jobId && jobStatus?.status !== "success" && jobStatus?.status !== "failed" && jobStatus?.status !== "rollback_success" && jobStatus?.status !== "rollback_failed" && jobStatus?.status !== "warning") {
      interval = setInterval(() => {
        fetch(`http://localhost:8000/api/provisioning/jobs/${jobId}`, { cache: 'no-store' })
          .then(res => res.json())
          .then(data => {
            if (!data) return;
            setJobStatus(data);
          });
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, jobStatus?.status]);

  useEffect(() => {
    if (jobStatus?.status === 'success') {
      setShowSuccessModal(true);
      setSelectedOnu(null);
      setActiveTemplate(null);
      setVariables({});
      setDryRunResult(null);
      if (selectedOlt) {
        fetchUnconfigured(selectedOlt);
      }
    } else if (jobStatus?.status === 'failed' || jobStatus?.status === 'rollback_success' || jobStatus?.status === 'rollback_failed') {
      setShowErrorModal(jobStatus.error_detail || "Error al adoptar la ONU en la OLT.");
    }
  }, [jobStatus?.status]);

  const fetchOlts = async () => {
    const res = await fetch("http://localhost:8000/api/olt/", { cache: 'no-store' });
    const data = await res.json();
    setOlts(data);
  };
  
  const fetchTemplates = async () => {
    const res = await fetch("http://localhost:8000/api/provisioning/templates", { cache: 'no-store' });
    const data = await res.json();
    setTemplates(data);
  };
  
  const fetchUnconfigured = async (id: number) => {
    setLoadingOnus(true);
    try {
      const res = await fetch(`http://localhost:8000/api/onus/${id}/unconfigured`, { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) {
        setUnconfiguredOnus(data);
      } else {
        setUnconfiguredOnus([]);
        if (data.detail) alert("Error: " + data.detail);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOnus(false);
    }
  };

  const fetchPonMatrix = async () => {
    if (!selectedOlt) {
      alert("Selecciona una OLT primero");
      return;
    }
    setLoadingMatrix(true);
    let pon_int = "gpon-olt_1/2/2"; // default fallback
    if (unconfiguredOnus.length > 0) pon_int = unconfiguredOnus[0].interface.split(":")[0];
    else if (selectedOnu) pon_int = selectedOnu.interface.split(":")[0];
    
    try {
      const res = await fetch(`http://localhost:8000/api/provisioning/pon-matrix/${selectedOlt}/${encodeURIComponent(pon_int)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setMatrixData(data.matrix);
        setMatrixPonInterface(data.pon_interface);
      } else {
        const errorData = await res.json();
        alert(errorData.detail);
      }
      
      const resTel = await fetch(`http://localhost:8000/api/provisioning/pon-telemetry/${selectedOlt}/${encodeURIComponent(pon_int)}`, { cache: 'no-store' });
      if (resTel.ok) {
        const dataTel = await resTel.json();
        setPonTelemetry(dataTel);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingMatrix(false);
  };

  const handleSimulate = async () => {
    if (!selectedOlt || !selectedOnu || !selectedTemplateId) return;
    setIsSimulating(true);
    try {
      const autoVars = {
        onu_interface: selectedOnu.interface,
        onu_sn: selectedOnu.sn
      };
      
      const payload = {
        olt_id: selectedOlt,
        onu_sn: selectedOnu.sn,
        template_id: selectedTemplateId,
        speed_profile_id: selectedSpeedProfileId || null,
        vlan_profile_id: selectedVlanProfileId || null,
        variables: { ...variables, ...autoVars },
        is_new_onu: true
      };
      const res = await fetch("http://localhost:8000/api/provisioning/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.detail === 'object' ? JSON.stringify(data.detail) : (data.detail || "Error de Simulación"));
      }
      setDryRunResult(data);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleExecute = () => {
    setShowConfirmModal(true);
  };

  const confirmExecution = async () => {
    setShowConfirmModal(false);
    try {
      const autoVars = {
        onu_interface: selectedOnu.interface,
        onu_sn: selectedOnu.sn
      };
      
      const payload = {
        olt_id: selectedOlt,
        onu_sn: selectedOnu.sn,
        template_id: selectedTemplateId,
        speed_profile_id: selectedSpeedProfileId || null,
        vlan_profile_id: selectedVlanProfileId || null,
        variables: { ...variables, ...autoVars },
        is_new_onu: true
      };
      const res = await fetch("http://localhost:8000/api/provisioning/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error iniciando ejecución");
      
      setJobId(data.job_id);
      
      // Initial state
      const initialJob = await fetch(`http://localhost:8000/api/provisioning/jobs/${data.job_id}`, { cache: 'no-store' });
      const initialData = await initialJob.json();
      setJobStatus(initialData);
      setDryRunResult(null); 
      
      // Auto-scroll to terminal
      setTimeout(() => {
        document.getElementById('terminal-view')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } catch (e: any) {
      alert("Error iniciando ejecución: " + e.message);
    }
  };

  const activeTemplate = templates.find(t => t.id === selectedTemplateId);

  const renderLogs = () => {
    if (!jobStatus || !jobStatus.logs) return "Esperando inicio de motor transaccional...";
    
    return jobStatus.logs.map((log: any, i: number) => {
       const isRollback = log.cmd.startsWith("[ROLLBACK]");
       const isVerify = log.cmd.startsWith("VERIFY");
       const isBackup = log.cmd.startsWith("BACKUP");
       
       return (
         <div key={`log-${i}`} className={`mb-2 pb-2 border-b border-slate-800/50 ${log.success ? '' : 'bg-red-500/10 p-2 rounded'}`}>
           <div className="flex justify-between items-center text-[10px] text-slate-500 mb-1">
             <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
             <span>{log.duration_ms}ms</span>
           </div>
           
           <div className={`font-bold ${isRollback ? 'text-orange-400' : isVerify ? 'text-blue-400' : isBackup ? 'text-purple-400' : log.success ? 'text-green-400' : 'text-red-400'}`}>
             &gt; {log.cmd}
           </div>
           
           <div className={`pl-2 mt-1 text-slate-400 whitespace-pre-wrap ${!log.success && 'text-red-300 font-bold'}`}>
             {log.res}
           </div>
         </div>
       );
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
          <Cpu className="text-blue-500" size={32} /> Aprovisionamiento Inteligente
        </h1>
        <p className="text-slate-400 mt-2 text-sm max-w-3xl">
          Motor transaccional GPON. Selecciona una OLT para buscar ONUs sin configurar. 
          Realiza una simulación (Dry Run) antes de ejecutar cambios en la red.
        </p>
      </div>

      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("discovery")}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "discovery" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          Auto-Descubrimiento
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "templates" ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          Plantillas Certificadas
        </button>
        <button
          onClick={() => { setActiveTab("matrix"); fetchPonMatrix(); }}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "matrix" ? "border-purple-500 text-purple-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}
        >
          Matriz PON
        </button>
      </div>

      {activeTab === "discovery" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* IZQUIERDA: ONUs Unconfigured */}
        <div className="glass-panel p-5 lg:col-span-1 h-[600px] flex flex-col">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Search size={18} className="text-blue-400" /> Auto-Descubrimiento
          </h2>
          
          <select 
            className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2.5 mb-4 text-sm focus:ring-blue-500"
            value={selectedOlt || ""}
            onChange={e => setSelectedOlt(Number(e.target.value))}
          >
            <option value="">-- Seleccionar OLT --</option>
            {olts.map(o => (
              <option key={o.id} value={o.id}>{o.name} ({o.ip_address})</option>
            ))}
          </select>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {!selectedOlt ? (
              <div className="text-center text-slate-500 mt-10">Selecciona una OLT para buscar ONUs.</div>
            ) : loadingOnus ? (
              <div className="text-center text-blue-400 mt-10 animate-pulse">Buscando ONUs...</div>
            ) : unconfiguredOnus.length === 0 ? (
              <div className="text-center text-green-400 mt-10 flex flex-col items-center gap-2">
                <CheckCircle2 size={32} />
                No hay ONUs pendientes.
              </div>
            ) : (
              unconfiguredOnus.map((onu, idx) => (
                <div 
                  key={idx} 
                  onClick={() => setSelectedOnu(onu)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedOnu?.sn === onu.sn ? 'bg-blue-500/20 border-blue-400' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}
                >
                  <div className="font-mono text-sm text-white font-bold">{onu.sn}</div>
                  <div className="text-xs text-slate-400 mt-1 flex justify-between">
                    <span>{onu.interface}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* DERECHA: Configuración y Preview */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="glass-panel p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Network size={18} className="text-blue-400" /> Parámetros de Plantilla
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Plantilla de Configuración</label>
                <select 
                  className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2.5 text-sm"
                  value={selectedTemplateId || ""}
                  onChange={e => {
                    setSelectedTemplateId(Number(e.target.value));
                    setVariables({});
                    setDryRunResult(null);
                  }}
                  disabled={!selectedOnu}
                >
                  <option value="">-- Seleccionar --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.vendor})</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">ONU Seleccionada</label>
                <input 
                  type="text" 
                  disabled 
                  value={selectedOnu ? `${selectedOnu.sn} (${selectedOnu.interface})` : "Selecciona una ONU"}
                  className="w-full bg-slate-800/50 border-slate-700 text-slate-300 rounded-lg p-2.5 text-sm cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Plan de Velocidad (Speed Profile)</label>
                <select 
                  className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2.5 text-sm"
                  value={selectedSpeedProfileId || ""}
                  onChange={e => setSelectedSpeedProfileId(Number(e.target.value) || null)}
                >
                  <option value="">-- Sin Plan (Manual) --</option>
                  {speedProfiles.filter(p => p.status === 'active').map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.download_mbps}M / {p.upload_mbps}M)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Servicio / VLAN</label>
                <select 
                  className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2.5 text-sm"
                  value={selectedVlanProfileId || ""}
                  onChange={e => setSelectedVlanProfileId(Number(e.target.value) || null)}
                >
                  <option value="">-- Sin VLAN (Manual) --</option>
                  {vlanProfiles.filter(p => p.status === 'active' && (!p.olt_id || p.olt_id === selectedOlt)).map(p => (
                    <option key={p.id} value={p.id}>VLAN {p.vlan_id} - {p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* IDENTIDAD ONU (Siempre Visible) */}
            <div className="mt-6 border-t border-slate-700/50 pt-5">
              <h3 className="text-sm font-semibold text-white mb-3">Identidad ONU</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nombre (Name)</label>
                  <input 
                    type="text" 
                    value={variables['name'] || ""}
                    onChange={e => setVariables({...variables, name: e.target.value})}
                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Ingresar nombre de la ONU..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Descripción (Description)</label>
                  <input 
                    type="text" 
                    value={variables['description'] || ""}
                    onChange={e => setVariables({...variables, description: e.target.value})}
                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Ingresar descripción..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Modelo ONU (ONU Type)</label>
                  <input 
                    list="onu_models_list"
                    type="text" 
                    value={variables['onu_type'] || ""}
                    onChange={e => setVariables({...variables, onu_type: e.target.value})}
                    className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Ej. ZTE-G711"
                  />
                  <datalist id="onu_models_list">
                    <option value="ZTE-G711">ZTE Genérico (ZTE-G711)</option>
                    <option value="ZTE-G">ZTE Bridge (ZTE-G)</option>
                    <option value="RL804GCW">ONU Grande</option>
                    <option value="RL801GW">ONU Pequeño</option>
                  </datalist>
                </div>
              </div>
            </div>

            {/* Dynamic Variables Form */}
            {activeTemplate && templateVariables.length > 0 && (
              <div className="mt-6 border-t border-slate-700/50 pt-5">
                <h3 className="text-sm font-semibold text-white mb-3">Variables Requeridas</h3>
                <div className="grid grid-cols-2 gap-4">
                  {templateVariables.map((v: string) => {
                    return (
                    <div key={v}>
                      <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">{v.replace(/_/g, ' ')}</label>
                      <input 
                        type="text" 
                        value={variables[v] || ""}
                        onChange={e => setVariables({...variables, [v]: e.target.value})}
                        className="w-full bg-slate-800 border-slate-700 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        placeholder={`Valor para ${v.replace(/_/g, ' ')}...`}
                      />
                    </div>
                  )})}
                </div>
              </div>
            )}
            
            {activeTemplate && (
              <div className="mt-6 flex gap-3">
                <button 
                  onClick={handleSimulate}
                  disabled={isSimulating}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Play size={16} /> {isSimulating ? "Simulando..." : "Simular Dry Run"}
                </button>
                
                <button 
                  onClick={handleExecute}
                  disabled={!dryRunResult || jobStatus?.status === 'pending' || jobStatus?.status === 'provisioning' || (dryRunResult.pre_flight_audit && dryRunResult.pre_flight_audit.errors.length > 0)}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  <ShieldAlert size={16} /> Ejecutar Transacción Real
                </button>
              </div>
            )}
          </div>

          {/* DRY RUN PREVIEW */}
          {dryRunResult && (!jobId || jobStatus?.status === 'failed' || jobStatus?.status === 'success') && (
            <div className="glass-panel p-6 border-l-4 border-l-slate-500">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-bold text-white mb-3">Resultado de Simulación (DRY RUN)</h2>
                {dryRunResult.allocated_resources && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs">
                    <div className="font-bold text-slate-300 mb-1 border-b border-slate-700 pb-1">Recursos Asignados (GPON Manager)</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                      <div className="text-slate-400">ONU ID: <span className="text-emerald-400 font-bold">{dryRunResult.allocated_resources.onu_id || 'N/A'}</span></div>
                      <div className="text-slate-400">TCONT: <span className="text-emerald-400 font-bold">{dryRunResult.allocated_resources.tcont || 'N/A'}</span></div>
                      <div className="text-slate-400">GEMPORT: <span className="text-emerald-400 font-bold">{dryRunResult.allocated_resources.gemport || 'N/A'}</span></div>
                      <div className="text-slate-400">SVC PORT: <span className="text-emerald-400 font-bold">{dryRunResult.allocated_resources.service_port || 'N/A'}</span></div>
                      <div className="text-slate-400">VPORT: <span className="text-emerald-400 font-bold">{dryRunResult.allocated_resources.vport || 'N/A'}</span></div>
                    </div>
                  </div>
                )}
                {dryRunResult.calculated_variables && (
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs mt-3 col-span-2">
                    <div className="font-bold text-slate-300 mb-2 border-b border-slate-700 pb-1">Configuración Calculada por HelixNOC</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                      {Object.entries(dryRunResult.calculated_variables).map(([k, v]) => {
                        const source = dryRunResult.source_of_values?.[k];
                        let sourceColor = "text-slate-500";
                        if (source?.includes("calculated") || source?.includes("default")) sourceColor = "text-blue-400";
                        if (source?.includes("read")) sourceColor = "text-purple-400";
                        
                        return (
                          <div key={k} className="bg-slate-900 border border-slate-800 p-2 rounded">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-0.5">{k.replace(/_/g, ' ')}</div>
                            <div className="text-white font-mono text-sm break-all">{String(v)}</div>
                            {source && <div className={`text-[9px] mt-1 ${sourceColor} truncate`}>src: {source}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              
              {dryRunResult.pre_flight_audit && (dryRunResult.pre_flight_audit.errors.length > 0 || dryRunResult.pre_flight_audit.warnings.length > 0) && (
                <div className="mb-4">
                  <div className="text-xs font-bold text-slate-400 mb-2 uppercase flex items-center gap-1"><ShieldAlert size={14} /> Quality & Pre-Flight Audit</div>
                  <div className="space-y-2">
                    {dryRunResult.pre_flight_audit.errors.map((err: string, i: number) => (
                      <div key={`err-${i}`} className="bg-red-500/10 border border-red-500/30 text-red-400 p-2.5 rounded text-sm flex items-start gap-2">
                        <span className="font-bold shrink-0">[BLOQUEO]</span> <span>{err}</span>
                      </div>
                    ))}
                    {dryRunResult.pre_flight_audit.warnings.map((warn: string, i: number) => (
                      <div key={`warn-${i}`} className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-2.5 rounded text-sm flex items-start gap-2">
                        <span className="font-bold shrink-0">[WARNING]</span> <span>{warn}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-blue-400 mb-1 font-bold">COMANDOS A EJECUTAR:</div>
                  <div className="bg-[#0a0a0a] p-3 rounded-lg border border-slate-800 font-mono text-xs text-blue-300 h-64 overflow-y-auto whitespace-pre">
                    {dryRunResult.commands.join("\n")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-red-400 mb-1 font-bold">ROLLBACK DE EMERGENCIA:</div>
                  <div className="bg-[#0a0a0a] p-3 rounded-lg border border-slate-800 font-mono text-xs text-red-300 h-64 overflow-y-auto whitespace-pre">
                    {dryRunResult.rollback && dryRunResult.rollback.length > 0 ? dryRunResult.rollback.join("\n") : "Ninguno"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LIVE TERMINAL FOR JOBS */}
          {jobId && jobStatus && (
            <div id="terminal-view" className={`glass-panel p-6 border-l-4 ${
              jobStatus.status === 'success' ? 'border-l-green-500' : 
              (jobStatus.status === 'pending' || jobStatus.status === 'provisioning' || jobStatus.status === 'validating' || jobStatus.status === 'connecting' || jobStatus.status === 'verifying') ? 'border-l-blue-500' : 
              jobStatus.status === 'warning' ? 'border-l-yellow-500' : 
              jobStatus.status === 'rollback_success' ? 'border-l-orange-500' : 'border-l-red-500'
            }`}>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Lock size={18} /> Terminal Transaccional
                </h2>
                <div className="flex items-center gap-3">
                  {jobStatus.error_detail && <span className="text-xs text-red-400">{jobStatus.error_detail}</span>}
                  <span className="text-xs font-mono font-bold px-3 py-1.5 bg-slate-800 rounded">
                    ESTADO: {jobStatus.status.toUpperCase()}
                  </span>
                </div>
              </div>
              
              <div className="bg-[#0a0a0a] p-4 rounded-lg border border-slate-800 font-mono text-[12px] h-80 overflow-y-auto whitespace-pre-wrap flex flex-col gap-2">
                {renderLogs()}
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {activeTab === "templates" && (
        <TemplatesTab 
          olts={olts} 
          templates={templates} 
          fetchTemplates={fetchTemplates} 
        />
      )}

      {activeTab === "matrix" && (
        <div className="glass-panel p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Network size={24} className="text-purple-400" /> Matriz Visual PON ({matrixPonInterface || 'N/A'})
            </h2>
            <div className="flex gap-4 text-xs font-medium">
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Online</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> Offline</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-700 border border-slate-600 rounded-sm"></div> Libre</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-500 rounded-sm"></div> Reservado</div>
            </div>
          </div>

          {loadingMatrix ? (
            <div className="text-center p-10 text-slate-400 animate-pulse">Cargando datos de la OLT...</div>
          ) : (
            <>
              {ponTelemetry && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-xs text-slate-400">Total ONUs</div>
                    <div className="text-2xl font-black text-white">{ponTelemetry.total}</div>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-xs text-slate-400">Online</div>
                    <div className="text-2xl font-black text-green-400">{ponTelemetry.online}</div>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-xs text-slate-400">Offline / LOS</div>
                    <div className="text-2xl font-black text-red-400">{ponTelemetry.offline + ponTelemetry.los}</div>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-xs text-slate-400">IDs Libres</div>
                    <div className="text-2xl font-black text-slate-300">{ponTelemetry.free_ids}</div>
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="text-xs text-slate-400">Ocupación</div>
                    <div className={`text-2xl font-black ${ponTelemetry.occupation_percent > 90 ? 'text-red-500' : 'text-blue-400'}`}>{ponTelemetry.occupation_percent}%</div>
                  </div>
                </div>
              )}
            
              <div className="grid grid-cols-8 md:grid-cols-16 gap-2">
                {matrixData.map(slot => (
                  <div 
                    key={slot.id}
                    title={slot.details ? `ONU ${slot.id}: ${slot.details}` : `ONU ${slot.id}: Libre`}
                    className={`aspect-square rounded flex items-center justify-center text-xs font-bold transition-all cursor-help
                      ${slot.status === 'online' ? 'bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30' : 
                        slot.status === 'offline' ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' :
                        slot.status === 'reserved' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 hover:bg-yellow-500/30 shadow-[0_0_10px_rgba(234,179,8,0.3)]' :
                        'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700 hover:text-slate-300'
                      }
                    `}
                  >
                    {slot.id}
                  </div>
                ))}
              </div>
              
              {ponTelemetry && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-slate-300 mb-3">Modelos Dominantes</h3>
                    <div className="space-y-2">
                      {ponTelemetry.top_models.map((m: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm bg-slate-800/50 p-2 rounded">
                          <span className="text-slate-400">{m.name}</span>
                          <span className="font-bold text-white">{m.count}</span>
                        </div>
                      ))}
                      {ponTelemetry.top_models.length === 0 && <div className="text-xs text-slate-500">Sin datos</div>}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-300 mb-3">VLANs Utilizadas</h3>
                    <div className="space-y-2">
                      {ponTelemetry.top_vlans.map((v: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm bg-slate-800/50 p-2 rounded">
                          <span className="text-slate-400">VLAN {v.vlan}</span>
                          <span className="font-bold text-white">{v.count}</span>
                        </div>
                      ))}
                      {ponTelemetry.top_vlans.length === 0 && <div className="text-xs text-slate-500">Sin datos</div>}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-300 mb-3">Planes de Servicio</h3>
                    <div className="space-y-2">
                      {ponTelemetry.top_plans.map((p: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm bg-slate-800/50 p-2 rounded">
                          <span className="text-slate-400">{p.plan}</span>
                          <span className="font-bold text-white">{p.count}</span>
                        </div>
                      ))}
                      {ponTelemetry.top_plans.length === 0 && <div className="text-xs text-slate-500">Sin datos</div>}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* CUSTOM MODALS */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
              <ShieldAlert size={32} className="text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">¿Confirmar Aprovisionamiento?</h3>
            <p className="text-slate-400 text-sm mb-6">
              Esta acción inyectará la configuración calculada directamente en la OLT real. ¿Estás seguro de continuar?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium">Cancelar</button>
              <button onClick={confirmExecution} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-bold shadow-lg shadow-blue-600/20">Sí, Ejecutar</button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-green-500/30 rounded-xl shadow-[0_0_50px_rgba(34,197,94,0.15)] w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-5 border-2 border-green-500/20">
              <CheckCircle2 size={40} className="text-green-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">¡Adopción Exitosa!</h3>
            <p className="text-slate-300 text-sm mb-6">
              La ONU <strong>{jobStatus?.onu_sn || "seleccionada"}</strong> ha sido aprovisionada y agregada exitosamente en la OLT.
            </p>
            <button onClick={() => setShowSuccessModal(false)} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-bold shadow-lg shadow-green-600/20">Continuar</button>
          </div>
        </div>
      )}

      {showErrorModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-red-500/30 rounded-xl shadow-[0_0_50px_rgba(239,68,68,0.15)] w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <AlertTriangle size={32} className="text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Error de Aprovisionamiento</h3>
            <p className="text-slate-300 text-sm mb-4">
              Ocurrió un problema al adoptar la ONU en la OLT.
            </p>
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded text-left font-mono overflow-y-auto max-h-32 mb-6">
              {showErrorModal}
            </div>
            <button onClick={() => setShowErrorModal("")} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium">Cerrar</button>
          </div>
        </div>
      )}

    </div>
  );
}
