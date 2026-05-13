"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Server, Plus, ShieldAlert, CheckCircle, Activity, Box, Search, Trash2, ArrowRight, Loader2, Info, ChevronRight, XCircle } from "lucide-react";

export default function VlanProfilesPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [olts, setOlts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    vlan_id: 0,
    name: "",
    service_type: "internet",
    olt_id: 0,
    description: "",
    transport_mode: "tagged"
  });
  const [discoveredUplinks, setDiscoveredUplinks] = useState<any[]>([]);
  const [selectedUplinks, setSelectedUplinks] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  
  // Job State
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resVlan = await fetch("http://localhost:8000/api/provisioning/vlan-profiles/", { cache: 'no-store' });
      const dataVlan = await resVlan.json();
      setProfiles(dataVlan);

      const resOlt = await fetch("http://localhost:8000/api/olt/", { cache: 'no-store' });
      const dataOlt = await resOlt.json();
      setOlts(dataOlt);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleDiscoverUplinks = async () => {
    if (formData.olt_id === 0) {
      alert("Seleccione una OLT destino");
      return;
    }
    setStep(2);
    setIsDiscovering(true);
    try {
      const res = await fetch(`http://localhost:8000/api/discovery/uplinks/${formData.olt_id}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setDiscoveredUplinks(data.uplinks || []);
        setStep(3); // Move to selection
      } else {
        alert(data.detail);
        setStep(1);
      }
    } catch (err) {
      console.error(err);
      setStep(1);
    }
    setIsDiscovering(false);
  };

  const toggleUplink = (uplink: string, isDown: boolean, isAccess: boolean) => {
    if (isDown) return; // Blocked
    if (isAccess) {
      if (!confirm(`ADVERTENCIA: El puerto ${uplink} está en modo ACCESS. Configurar un trunk aquí puede causar disrupción. ¿Desea continuar?`)) return;
    }
    if (selectedUplinks.includes(uplink)) {
      setSelectedUplinks(selectedUplinks.filter(u => u !== uplink));
    } else {
      setSelectedUplinks([...selectedUplinks, uplink]);
    }
  };

  const handleDryRun = async () => {
    if (selectedUplinks.length === 0) {
      alert("Seleccione al menos un uplink para transportar la VLAN.");
      return;
    }
    setStep(5);
    try {
      const payload = {
        olt_id: formData.olt_id,
        vlan_id: formData.vlan_id,
        name: formData.name,
        selected_uplinks: selectedUplinks,
        transport_mode: formData.transport_mode
      };
      const res = await fetch("http://localhost:8000/api/provisioning/vlan-profiles/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail);
      setDryRunResult(data);
    } catch (err: any) {
      alert(err.message);
      setStep(3);
    }
  };

  const handleExecuteJob = async () => {
    setStep(6);
    try {
      const payload = {
        olt_id: formData.olt_id,
        vlan_id: formData.vlan_id,
        name: formData.name,
        service_type: formData.service_type,
        selected_uplinks: selectedUplinks,
        transport_mode: formData.transport_mode
      };
      const res = await fetch("http://localhost:8000/api/provisioning/vlan-profiles/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setJobId(data.job_id);
      } else {
        alert(data.detail);
        setStep(5);
      }
    } catch (err: any) {
      console.error(err);
      setStep(5);
    }
  };

  // Job Polling
  useEffect(() => {
    let interval: any;
    if (jobId && jobStatus?.status !== "success" && jobStatus?.status !== "failed" && jobStatus?.status !== "rollback_success" && jobStatus?.status !== "rollback_failed") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://localhost:8000/api/provisioning/vlan-profiles/job/${jobId}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            setJobStatus(data);
            if (["success", "failed", "rollback_success", "rollback_failed"].includes(data.status)) {
              clearInterval(interval);
              fetchData();
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this VLAN?")) return;
    try {
      await fetch(`http://localhost:8000/api/provisioning/vlan-profiles/${id}`, {
        method: "DELETE"
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const getOltName = (olt_id: number) => {
    if (!olt_id) return "Global";
    const olt = olts.find(o => o.id === olt_id);
    return olt ? olt.name : "Unknown";
  };

  const renderLogs = () => {
    if (!jobStatus || !jobStatus.logs) return null;
    return (
      <div className="bg-black/90 p-4 rounded-lg font-mono text-xs overflow-y-auto max-h-[300px] border border-slate-700 shadow-inner">
        {jobStatus.logs.map((log: any, i: number) => (
          <div key={i} className="mb-2">
            <div className="flex justify-between text-blue-400 mb-1">
              <span>{`> ${log.cmd}`}</span>
              <span className="text-slate-500">{log.duration_ms}ms</span>
            </div>
            <div className={`whitespace-pre-wrap pl-2 border-l-2 ${log.success ? 'border-emerald-500 text-slate-300' : 'border-red-500 text-red-400'}`}>
              {log.res || "OK"}
            </div>
          </div>
        ))}
        {jobStatus.status !== "success" && jobStatus.status !== "failed" && !jobStatus.status.includes("rollback") && (
          <div className="flex items-center gap-2 text-indigo-400 mt-4 animate-pulse">
            <Loader2 className="animate-spin" size={14} /> <span>Ejecutando...</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Catálogo de VLANs & Transporte</h1>
          <p className="text-slate-400">Administra las VLANs lógicas y su transporte físico (Trunks/LACP) hacia el Core</p>
        </div>
        <div className="space-x-4">
          <Link href="/dashboard/provisioning/speed-profiles" className="text-indigo-400 hover:text-indigo-300">
            Ver Speed Profiles
          </Link>
          <button 
            onClick={() => {
              setStep(1);
              setJobId(null);
              setJobStatus(null);
              setDryRunResult(null);
              setSelectedUplinks([]);
              setIsWizardOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Crear VLAN Carrier-Grade
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
              <th className="p-4 font-medium">VLAN ID</th>
              <th className="p-4 font-medium">Nombre</th>
              <th className="p-4 font-medium">Servicio</th>
              <th className="p-4 font-medium">Asignada a OLT</th>
              <th className="p-4 font-medium">Transporte Físico</th>
              <th className="p-4 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-300 divide-y divide-slate-700">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">Cargando topología...</td></tr>
            ) : profiles.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">No hay VLANs creadas.</td></tr>
            ) : (
              profiles.map(p => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 font-mono font-bold text-emerald-400 text-lg">{p.vlan_id}</td>
                  <td className="p-4 font-medium text-white">{p.name}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs uppercase border ${
                      p.service_type === 'internet' ? 'bg-blue-900/30 text-blue-400 border-blue-800/50' :
                      p.service_type === 'iptv' ? 'bg-purple-900/30 text-purple-400 border-purple-800/50' :
                      p.service_type === 'management' ? 'bg-red-900/30 text-red-400 border-red-800/50' :
                      'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {p.service_type}
                    </span>
                  </td>
                  <td className="p-4 text-slate-300">
                    <div className="flex items-center gap-2">
                      <Server size={14} className="text-slate-500" />
                      {getOltName(p.olt_id)}
                    </div>
                  </td>
                  <td className="p-4">
                    {p.status === 'pending_transport' ? (
                      <span className="text-yellow-500 flex items-center gap-1 text-xs font-bold"><Activity size={14}/> Pendiente</span>
                    ) : p.status === 'failed_transport' ? (
                      <span className="text-red-500 flex items-center gap-1 text-xs font-bold"><XCircle size={14}/> Fallido</span>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {p.allowed_on_uplinks ? JSON.parse(p.allowed_on_uplinks).map((up: string) => (
                          <span key={up} className="bg-slate-800 border border-slate-600 px-2 py-1 rounded text-xs text-slate-300">{up}</span>
                        )) : <span className="text-slate-500 text-xs">Ninguno</span>}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <button onClick={() => handleDelete(p.id)} className="text-slate-500 hover:text-red-400 transition-colors" title="Eliminar VLAN Lógica">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* WIZARD MODAL CARRIER-GRADE */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col h-[90vh]">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 rounded-t-xl">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Activity className="text-indigo-400" /> Asistente de Transporte VLAN
                </h2>
                <p className="text-sm text-slate-400 mt-1">Implementación Segura en Troncales L2</p>
              </div>
              <button onClick={() => setIsWizardOpen(false)} className="text-slate-500 hover:text-white p-2" title="Cerrar">✕</button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#0f172a]">
              
              {/* STEP 1: Datos Básicos */}
              {step === 1 && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="bg-blue-900/10 border border-blue-900/30 p-4 rounded-lg flex gap-3 text-blue-200 text-sm">
                    <Info className="shrink-0 mt-0.5 text-blue-400" size={18} />
                    <div>
                      <p className="font-bold text-blue-400 mb-1">Paso 1: Identidad de la VLAN</p>
                      <p>Defina los parámetros lógicos. Al presionar Siguiente, Helix se conectará a la OLT seleccionada para descubrir su topología física y los puertos uplink disponibles (XGEI, LACP).</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">VLAN ID *</label>
                      <input 
                        type="number" 
                        className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg p-3 text-white font-mono outline-none"
                        placeholder="Ej. 1330"
                        value={formData.vlan_id || ""}
                        onChange={e => setFormData({...formData, vlan_id: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">OLT Destino *</label>
                      <select 
                        className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg p-3 text-white outline-none"
                        value={formData.olt_id}
                        onChange={e => setFormData({...formData, olt_id: parseInt(e.target.value)})}
                      >
                        <option value={0}>-- Seleccione OLT --</option>
                        {olts.map(o => (
                          <option key={o.id} value={o.id}>{o.name} ({o.ip_address})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Tipo de Servicio *</label>
                      <select 
                        className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg p-3 text-white outline-none"
                        value={formData.service_type}
                        onChange={e => setFormData({...formData, service_type: e.target.value})}
                      >
                        <option value="internet">Internet</option>
                        <option value="iptv">IPTV</option>
                        <option value="management">Management</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Nombre Descriptivo *</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-lg p-3 text-white outline-none"
                        placeholder="Ej. VLAN ZONA NORTE"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Loading Discovery */}
              {step === 2 && (
                <div className="flex flex-col items-center justify-center h-full space-y-6">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-xl bg-indigo-500/30 animate-pulse"></div>
                    <Loader2 size={64} className="text-indigo-400 animate-spin relative" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-white mb-2">Descubriendo Transporte Físico...</h3>
                    <p className="text-slate-400">Analizando GEI, XGEI, Smartgroups y configuración LACP en la OLT.</p>
                  </div>
                </div>
              )}

              {/* STEP 3 & 4: Select Uplinks & Mode */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <h3 className="text-lg font-bold text-white">Selección de Uplinks</h3>
                      <p className="text-sm text-slate-400">Seleccione por dónde debe transitar la VLAN {formData.vlan_id}</p>
                    </div>
                    <div className="w-64">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Modo de Transporte L2</label>
                      <select 
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white outline-none text-sm font-bold"
                        value={formData.transport_mode}
                        onChange={e => setFormData({...formData, transport_mode: e.target.value})}
                      >
                        <option value="tagged">Tagged (Trunk) - Recomendado</option>
                        <option value="untagged">Untagged (Access)</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {discoveredUplinks.map((up: any) => {
                      const isDown = up.oper_state === 'down';
                      const isAccess = up.switchport_mode === 'access';
                      const isSelected = selectedUplinks.includes(up.interface);
                      const isSmartgroup = up.type === 'smartgroup';
                      
                      return (
                        <div 
                          key={up.interface}
                          onClick={() => toggleUplink(up.interface, isDown, isAccess)}
                          className={`border rounded-xl p-4 transition-all ${
                            isDown ? 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed' :
                            isSelected ? 'bg-indigo-900/30 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer' :
                            'bg-slate-800/80 border-slate-700 hover:border-slate-500 cursor-pointer'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <Box size={18} className={isSmartgroup ? 'text-purple-400' : 'text-blue-400'} />
                              <span className="font-bold text-white font-mono">{up.interface}</span>
                            </div>
                            <div className="flex gap-2">
                              {isSmartgroup && <span className="bg-purple-900 text-purple-300 text-[10px] px-1.5 py-0.5 rounded font-bold">LACP</span>}
                              {isDown ? (
                                <span className="bg-red-900/50 text-red-400 border border-red-800 text-[10px] px-1.5 py-0.5 rounded font-bold">DOWN</span>
                              ) : (
                                <span className="bg-emerald-900/50 text-emerald-400 border border-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-bold">UP</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="text-xs space-y-1.5 text-slate-400">
                            <div className="flex justify-between">
                              <span>Capacidad:</span>
                              <span className="text-slate-300 font-mono">{up.speed || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Switchport:</span>
                              <span className={`${isAccess ? 'text-yellow-400 font-bold' : 'text-slate-300'}`}>{up.switchport_mode}</span>
                            </div>
                            <div className="pt-2 mt-2 border-t border-slate-700">
                              <span className="block text-[10px] uppercase tracking-wider mb-1">VLANs Permitidas:</span>
                              <div className="flex flex-wrap gap-1">
                                {up.vlan_config && up.vlan_config.length > 0 ? up.vlan_config.map((vc: any, i: number) => (
                                  <span key={i} className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                                    {vc.vlans} ({vc.mode})
                                  </span>
                                )) : (
                                  <span className="text-[10px] text-slate-500">Ninguna configurada</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* STEP 5: Dry Run */}
              {step === 5 && dryRunResult && (
                <div className="space-y-6">
                  <div className="bg-emerald-900/10 border border-emerald-900/30 p-4 rounded-lg flex gap-3 text-emerald-200 text-sm">
                    <CheckCircle className="shrink-0 mt-0.5 text-emerald-400" size={18} />
                    <div>
                      <p className="font-bold text-emerald-400 mb-1">Paso 4: Auditoría Técnica Exitosa</p>
                      <p>Revise los comandos transaccionales que se ejecutarán en la troncal. El Motor de Transporte de Helix se asegurará de configurar la VLAN y agregarla a los uplinks de forma segura.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 font-bold text-slate-300 text-sm">
                        Pre-visualización de Comandos
                      </div>
                      <div className="p-4 font-mono text-xs text-blue-300 space-y-1">
                        {dryRunResult.commands.map((cmd: string, i: number) => (
                          <div key={i}>{cmd}</div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 font-bold text-slate-300 text-sm">
                        Impacto Estimado
                      </div>
                      <div className="p-4 text-sm text-slate-300 space-y-3">
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                          <span className="text-slate-400">VLAN Lógica</span>
                          <span className="font-bold text-emerald-400">Creación Segura</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                          <span className="text-slate-400">Uplinks Afectados</span>
                          <span className="font-bold text-white">{selectedUplinks.join(", ")}</span>
                        </div>
                        <div className="flex justify-between pb-2">
                          <span className="text-slate-400">Rollback</span>
                          <span className="font-bold text-indigo-400">Soportado</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: Execute Job / Terminal */}
              {step === 6 && (
                <div className="h-full flex flex-col">
                  <div className="mb-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Activity className="text-indigo-400" /> Terminal Transaccional (L2)
                    </h3>
                    {jobStatus && (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        jobStatus.status === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' :
                        jobStatus.status.includes('failed') || jobStatus.status.includes('rollback') ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                        'bg-blue-500/20 text-blue-400 border border-blue-500/50 animate-pulse'
                      }`}>
                        ESTADO: {jobStatus.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-hidden">
                    {renderLogs()}
                  </div>
                  
                  {jobStatus?.status === 'success' && (
                    <div className="mt-6 bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-4 text-center">
                      <CheckCircle className="mx-auto text-emerald-500 mb-2" size={32} />
                      <h3 className="text-emerald-400 font-bold text-lg mb-1">¡Transporte Completado!</h3>
                      <p className="text-emerald-200/70 text-sm mb-4">La VLAN se ha creado y propagado por los uplinks seleccionados correctamente.</p>
                      <button onClick={() => { setIsWizardOpen(false); fetchData(); }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-lg">
                        Finalizar
                      </button>
                    </div>
                  )}

                  {(jobStatus?.status.includes('failed') || jobStatus?.status.includes('rollback')) && (
                    <div className="mt-6 bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-center">
                      <ShieldAlert className="mx-auto text-red-500 mb-2" size={32} />
                      <h3 className="text-red-400 font-bold text-lg mb-1">Error en el Transporte L2</h3>
                      <p className="text-red-200/70 text-sm mb-4">{jobStatus.error_detail || "La OLT rechazó la configuración de Trunk. Se ejecutó el motor de rollback automático."}</p>
                      <button onClick={() => setIsWizardOpen(false)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-lg">
                        Cerrar
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Footer / Controls */}
            {step !== 6 && (
              <div className="p-5 border-t border-slate-800 bg-slate-900/80 rounded-b-xl flex justify-between items-center">
                <button 
                  onClick={() => setIsWizardOpen(false)} 
                  className="text-slate-400 hover:text-white px-4 py-2 font-medium"
                >
                  Cancelar
                </button>
                
                <div className="flex gap-3">
                  {step === 1 && (
                    <button 
                      onClick={handleDiscoverUplinks} 
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] flex items-center gap-2"
                    >
                      Descubrir Transporte <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 3 && (
                    <button 
                      onClick={handleDryRun} 
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] flex items-center gap-2"
                    >
                      Simular (Dry Run) <ArrowRight size={18} />
                    </button>
                  )}
                  {step === 5 && (
                    <button 
                      onClick={handleExecuteJob} 
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-2"
                    >
                      Ejecutar Job <CheckCircle size={18} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
