"use client";

import { useState, useEffect } from "react";
import { Edit2, Trash2, Plus, X, Image as ImageIcon } from "lucide-react";

export default function OnuModelsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    model_name: "",
    pon_type: "GPON",
    ethernet_ports: 1,
    voip_ports: 0,
    image_url: "",
    service_mode: "Bridging/Routing",
    wifi_ssids: 0,
    supports_catv: false
  });

  // Filters State
  const [filters, setFilters] = useState({
    id: "",
    model_name: "",
    pon_type: ""
  });

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/onu-models/");
      const data = await res.json();
      setModels(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleOpenModal = (model: any = null) => {
    if (model) {
      setEditingModel(model);
      setFormData({
        model_name: model.model_name || "",
        pon_type: model.pon_type || "GPON",
        ethernet_ports: model.ethernet_ports || 1,
        voip_ports: model.voip_ports || 0,
        image_url: model.image_url || "",
        service_mode: model.service_mode || "Bridging/Routing",
        wifi_ssids: model.wifi_ssids || 0,
        supports_catv: model.supports_catv || false
      });
    } else {
      setEditingModel(null);
      setFormData({
        model_name: "",
        pon_type: "GPON",
        ethernet_ports: 1,
        voip_ports: 0,
        image_url: "",
        service_mode: "Bridging/Routing",
        wifi_ssids: 0,
        supports_catv: false
      });
    }
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formDataObj = new FormData();
    formDataObj.append("file", file);
    
    setUploadingImage(true);
    try {
      const res = await fetch("http://localhost:8000/api/onu-models/upload-image", {
        method: "POST",
        body: formDataObj
      });
      const data = await res.json();
      if (data.url) {
        setFormData(prev => ({ ...prev, image_url: data.url }));
      }
    } catch (err) {
      alert("Error subiendo la imagen");
    }
    setUploadingImage(false);
  };

  const handleSave = async () => {
    try {
      const url = editingModel 
        ? `http://localhost:8000/api/onu-models/${editingModel.id}` 
        : "http://localhost:8000/api/onu-models/";
        
      const method = editingModel ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error("Error saving model");
      
      setIsModalOpen(false);
      fetchModels();
    } catch (err) {
      alert("Error al guardar el modelo");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Está seguro de eliminar este modelo?")) return;
    try {
      await fetch(`http://localhost:8000/api/onu-models/${id}`, { method: "DELETE" });
      fetchModels();
    } catch (err) {
      alert("Error al eliminar");
    }
  };

  const filteredModels = models.filter(m => {
    if (filters.id && !m.id.toString().includes(filters.id)) return false;
    if (filters.model_name && !m.model_name.toLowerCase().includes(filters.model_name.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Tipos de ONU</h1>
          <p className="text-slate-400">Gestión del catálogo de equipos y sus características</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Plus size={18} /> Agregar Nuevo Modelo
        </button>
      </div>

      <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-800/50 text-xs text-slate-400 border-b border-slate-700">
                <th className="p-3 font-medium cursor-pointer">ID ↓↑</th>
                <th className="p-3 font-medium">Imagen</th>
                <th className="p-3 font-medium cursor-pointer">Modelo ONU ↓↑</th>
                <th className="p-3 font-medium">Onus</th>
                <th className="p-3 font-medium cursor-pointer">Puertos Ethernet ↓↑</th>
                <th className="p-3 font-medium cursor-pointer">WiFi SSID ↓↑</th>
                <th className="p-3 font-medium cursor-pointer">Puertos VoIP ↓↑</th>
                <th className="p-3 font-medium cursor-pointer">CATV</th>
                <th className="p-3 font-medium text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-300 divide-y divide-slate-700">
              {loading ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-500">Cargando modelos...</td></tr>
              ) : filteredModels.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-500">No hay modelos encontrados.</td></tr>
              ) : (
                filteredModels.map(m => (
                  <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3 text-slate-400">{m.id}</td>
                    <td className="p-3">
                      {m.image_url ? (
                        <img src={m.image_url} alt={m.model_name} className="h-10 w-10 object-contain bg-white rounded p-1" />
                      ) : (
                        <div className="h-10 w-10 bg-slate-800 rounded flex items-center justify-center text-slate-500 border border-slate-700">
                          <ImageIcon size={16} />
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-medium text-slate-200">{m.model_name}</td>
                    <td className="p-3 text-slate-400">{m.detected_count || 0}</td>
                    <td className="p-3 text-slate-400">{m.ethernet_ports}</td>
                    <td className="p-3 text-slate-400">{m.wifi_ssids}</td>
                    <td className="p-3 text-slate-400">{m.voip_ports}</td>
                    <td className="p-3">
                      {m.supports_catv ? (
                        <span className="text-emerald-400 font-medium">Activo</span>
                      ) : (
                        <span className="text-amber-400 font-medium">Desactivado</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handleOpenModal(m)}
                          className="bg-sky-500 hover:bg-sky-400 text-white p-1.5 rounded transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(m.id)}
                          className="bg-rose-500 hover:bg-rose-400 text-white p-1.5 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 size={18} className="text-slate-400" />
                {editingModel ? `Editar Tipo de ONU - ${formData.model_name}` : "Agregar Nuevo Modelo"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-y-6 gap-x-8 bg-[#1e293b] p-6 rounded-lg border border-slate-700">
                
                <div className="col-span-2">
                  <label className="flex items-center text-sm font-medium text-slate-300 mb-2">
                    <span className="w-32">Modelo ONU</span>
                    <input 
                      type="text" 
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-md p-2 text-white outline-none focus:border-indigo-500"
                      value={formData.model_name}
                      onChange={e => setFormData({...formData, model_name: e.target.value})}
                      disabled={!!editingModel}
                    />
                  </label>
                </div>

                <div className="col-span-1">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <span className="w-32">Tipo PON</span>
                    <select 
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-md p-2 text-white outline-none focus:border-indigo-500"
                      value={formData.pon_type}
                      onChange={e => setFormData({...formData, pon_type: e.target.value})}
                    >
                      <option value="GPON">GPON</option>
                      <option value="EPON">EPON</option>
                      <option value="XPON">XPON</option>
                    </select>
                  </label>
                </div>

                <div className="col-span-1">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <span className="w-32">Modo</span>
                    <select 
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-md p-2 text-white outline-none focus:border-indigo-500"
                      value={formData.service_mode}
                      onChange={e => setFormData({...formData, service_mode: e.target.value})}
                    >
                      <option value="Bridging/Routing">Bridging/Routing</option>
                      <option value="Bridging">Bridging</option>
                      <option value="Routing">Routing</option>
                    </select>
                  </label>
                </div>

                <div className="col-span-1">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <span className="w-32">Puertos Ethernet</span>
                    <select 
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-md p-2 text-white outline-none focus:border-indigo-500"
                      value={formData.ethernet_ports}
                      onChange={e => setFormData({...formData, ethernet_ports: parseInt(e.target.value)})}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                      <option value={8}>8</option>
                    </select>
                  </label>
                </div>

                <div className="col-span-1">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <span className="w-32">WiFi SSIDs</span>
                    <select 
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-md p-2 text-white outline-none focus:border-indigo-500"
                      value={formData.wifi_ssids}
                      onChange={e => setFormData({...formData, wifi_ssids: parseInt(e.target.value)})}
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                    </select>
                  </label>
                </div>

                <div className="col-span-1">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <span className="w-32">Puertos VoIP</span>
                    <select 
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-md p-2 text-white outline-none focus:border-indigo-500"
                      value={formData.voip_ports}
                      onChange={e => setFormData({...formData, voip_ports: parseInt(e.target.value)})}
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                </div>

                <div className="col-span-1">
                  <div className="flex items-center text-sm font-medium text-slate-300">
                    <span className="w-32">CATV</span>
                    <div className="flex-1 flex items-center">
                      <button 
                        className={`w-14 h-8 rounded border transition-colors flex items-center justify-center font-bold text-xs ${formData.supports_catv ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-700 border-slate-600 text-slate-400"}`}
                        onClick={() => setFormData({...formData, supports_catv: !formData.supports_catv})}
                      >
                        {formData.supports_catv ? "Si" : "No"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 mt-2">
                  <div className="flex text-sm font-medium text-slate-300">
                    <span className="w-32 pt-2">Imagen URL</span>
                    <div className="flex-1">
                      {formData.image_url && (
                        <div className="mb-3 text-xs text-indigo-400">
                          Actualmente: {formData.image_url.split("/").pop()}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="http://... o ruta relativa"
                          className="flex-1 bg-slate-800 border border-slate-600 rounded-md p-2 text-white outline-none focus:border-indigo-500"
                          value={formData.image_url}
                          onChange={e => setFormData({...formData, image_url: e.target.value})}
                        />
                        <label className="bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-md px-4 py-2 cursor-pointer transition-colors text-slate-200 flex items-center justify-center">
                          {uploadingImage ? "Subiendo..." : "Explorar"}
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={handleImageUpload}
                            disabled={uploadingImage}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {formData.image_url && (
                   <div className="col-span-2 flex justify-center mt-4">
                     <img src={formData.image_url} className="max-h-48 object-contain bg-white rounded border border-slate-600 p-2" alt="Preview" />
                   </div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/30">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-md font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                disabled={!formData.model_name}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
