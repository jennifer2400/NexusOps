"use client";
import React, { useState, useEffect } from "react";
import { ShieldCheck, Plus, Terminal, RefreshCw, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

export default function TemplatesTab({ olts, fetchTemplates, templates }: { olts: any[], fetchTemplates: () => void, templates: any[] }) {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  
  const [wizardOlt, setWizardOlt] = useState("");
  const [wizardInterface, setWizardInterface] = useState("");
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  
  const [templateForm, setTemplateForm] = useState({
    name: "",
    vendor: "ZTE",
    service_mode: "router",
    commands_template: "",
    notes: ""
  });
  
  const [isSaving, setIsSaving] = useState(false);

  const startExtraction = async () => {
    if (!wizardOlt || !wizardInterface) return;
    setIsExtracting(true);
    try {
      const res = await fetch(`http://localhost:8000/api/provisioning/extract-config/${wizardOlt}/${wizardInterface}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setExtractedData(data);
      setWizardStep(3);
    } catch (e: any) {
      alert("Error en extracción: " + e.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveTemplate = async (certified: boolean) => {
    if (!templateForm.name || !templateForm.commands_template) return alert("Nombre y comandos obligatorios");
    
    setIsSaving(true);
    try {
      const payload = {
        ...templateForm,
        certified,
        certification_status: certified ? "certified" : "draft",
        source_olt_id: parseInt(wizardOlt),
        source_onu_interface: wizardInterface,
        source_running_config: extractedData?.running_config_onu || ""
      };
      
      const res = await fetch("http://localhost:8000/api/provisioning/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        alert("Plantilla guardada");
        setIsWizardOpen(false);
        setWizardStep(1);
        fetchTemplates();
      } else {
        alert("Error guardando plantilla");
      }
    } catch (e) {
      alert("Error de red");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-emerald-500" />
            Repositorio de Plantillas Certificadas
          </h2>
          <p className="text-slate-400 text-sm mt-1">Las plantillas certificadas son seguras para ejecución real en producción.</p>
        </div>
        <button 
          onClick={() => setIsWizardOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Crear Plantilla desde ONU
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold text-white">{t.name}</h3>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono uppercase border border-slate-700">{t.vendor}</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs font-mono uppercase border border-blue-500/20">{t.service_mode}</span>
                {t.certified ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 flex items-center gap-1"><CheckCircle2 size={12}/> CERTIFICADA</span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-xs font-bold border border-yellow-500/20 flex items-center gap-1"><AlertTriangle size={12}/> DRAFT / NO CERTIFICADA</span>
                )}
              </div>
              
              <div className="text-sm text-slate-400 mb-4 line-clamp-1">{t.notes || "Sin notas"}</div>
              
              {t.source_onu_interface && (
                <div className="text-xs text-slate-500 font-mono bg-black/20 p-2 rounded border border-slate-800 inline-block mb-3">
                  Original Source: OLT {t.source_olt_id} | Interface {t.source_onu_interface} | Date: {new Date(t.created_at).toLocaleDateString()}
                </div>
              )}
              
            </div>
            
            <div className="w-[400px] h-32 bg-[#0c0c0c] rounded-lg border border-slate-800 p-3 overflow-y-auto">
              <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap">
                {t.commands_template}
              </pre>
            </div>
          </div>
        ))}
      </div>

      {isWizardOpen && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 rounded-t-2xl">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Terminal className="text-blue-500" size={20} /> Asistente de Extracción de Plantilla
              </h2>
              <button onClick={() => setIsWizardOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              
              {/* Wizard Sidebar */}
              <div className="w-full md:w-[350px] bg-slate-950 border-r border-slate-800 p-6 flex flex-col overflow-y-auto">
                <div className="space-y-6">
                  
                  {/* Step 1 */}
                  <div className={`transition-opacity ${wizardStep >= 1 ? 'opacity-100' : 'opacity-30'}`}>
                    <h3 className="text-sm font-bold text-blue-400 mb-3">1. Seleccionar ONU de Origen</h3>
                    <div className="space-y-3">
                      <select 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:border-blue-500"
                        value={wizardOlt} onChange={e => setWizardOlt(e.target.value)} disabled={wizardStep > 1}
                      >
                        <option value="">Seleccionar OLT</option>
                        {olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <input 
                        type="text" placeholder="Interfaz Ej: 1/1/1:5" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:border-blue-500 font-mono"
                        value={wizardInterface} onChange={e => setWizardInterface(e.target.value)} disabled={wizardStep > 1}
                      />
                      {wizardStep === 1 && (
                        <button 
                          onClick={startExtraction} disabled={isExtracting || !wizardOlt || !wizardInterface}
                          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg p-2 text-sm font-medium flex items-center justify-center gap-2"
                        >
                          {isExtracting ? <RefreshCw className="animate-spin" size={16} /> : <FileText size={16} />}
                          Extraer Configuración
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Step 2/3 Form */}
                  {wizardStep === 3 && (
                    <div className="animate-fade-in pt-4 border-t border-slate-800">
                      <h3 className="text-sm font-bold text-emerald-400 mb-3">2. Generar Plantilla</h3>
                      <p className="text-xs text-slate-400 mb-4">Copia los comandos relevantes de la terminal derecha al cuadro de abajo. Reemplaza valores como IPs o Usuarios con variables usando llaves: <code>{"{pppoe_user}"}</code>.</p>
                      
                      <div className="space-y-3">
                        <input type="text" placeholder="Nombre (Ej: ZTE Router PPPoE Normal)" 
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                          value={templateForm.name} onChange={e => setTemplateForm({...templateForm, name: e.target.value})}
                        />
                        <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                          value={templateForm.service_mode} onChange={e => setTemplateForm({...templateForm, service_mode: e.target.value})}
                        >
                          <option value="bridge">Modo Bridge</option>
                          <option value="router">Modo Router / PPPoE</option>
                        </select>
                        <textarea placeholder="Pega los comandos aquí y parametrizalos..."
                          className="w-full h-[200px] bg-black border border-blue-500/50 rounded-lg p-3 text-xs text-blue-400 font-mono focus:outline-none focus:border-blue-500 custom-scrollbar"
                          value={templateForm.commands_template} onChange={e => setTemplateForm({...templateForm, commands_template: e.target.value})}
                        />
                        
                        <div className="pt-4 border-t border-slate-800 flex flex-col gap-2">
                          <button onClick={() => handleSaveTemplate(false)} disabled={isSaving} className="w-full bg-slate-800 hover:bg-slate-700 text-white rounded-lg p-2 text-sm font-medium">Guardar como Draft</button>
                          <button onClick={() => handleSaveTemplate(true)} disabled={isSaving} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg p-2 text-sm font-medium shadow-lg shadow-emerald-600/20">Aprobar y Certificar Oficialmente</button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Extraction View */}
              <div className="flex-1 bg-black p-4 overflow-y-auto custom-scrollbar">
                {extractedData ? (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-emerald-500 font-bold text-xs uppercase mb-2 border-b border-emerald-900/50 pb-1">Running Config ONU</h4>
                      <pre className="text-slate-300 font-mono text-xs whitespace-pre-wrap">{extractedData.running_config_onu}</pre>
                    </div>
                    <div>
                      <h4 className="text-blue-500 font-bold text-xs uppercase mb-2 border-b border-blue-900/50 pb-1">WAN IP (PPPoE Status)</h4>
                      <pre className="text-slate-300 font-mono text-xs whitespace-pre-wrap">{extractedData.wan_ip}</pre>
                    </div>
                    <div>
                      <h4 className="text-purple-500 font-bold text-xs uppercase mb-2 border-b border-purple-900/50 pb-1">Running Config OLT Port</h4>
                      <pre className="text-slate-300 font-mono text-xs whitespace-pre-wrap">{extractedData.running_config_olt_port}</pre>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center flex-col text-slate-600">
                    <Terminal size={48} className="mb-4 opacity-20" />
                    <p>Ingresa una ONU a la izquierda para extraer su configuración en vivo.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
