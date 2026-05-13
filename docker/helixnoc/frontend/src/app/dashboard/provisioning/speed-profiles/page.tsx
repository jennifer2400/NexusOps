"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function SpeedProfilesPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    download_mbps: 0,
    upload_mbps: 0,
    upstream_profile: "",
    downstream_profile: "",
    uses_gpon_shaping: true
  });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/provisioning/speed-profiles/");
      const data = await res.json();
      setProfiles(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    try {
      await fetch("http://localhost:8000/api/provisioning/speed-profiles/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      setIsModalOpen(false);
      fetchProfiles();
    } catch (err) {
      alert("Error creating profile");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this profile?")) return;
    try {
      await fetch(`http://localhost:8000/api/provisioning/speed-profiles/${id}`, {
        method: "DELETE"
      });
      fetchProfiles();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Catálogo de Planes de Velocidad</h1>
          <p className="text-slate-400">Administra los Speed Profiles inyectables dinámicamente</p>
        </div>
        <div className="space-x-4">
          <Link href="/dashboard/provisioning/vlan-profiles" className="text-indigo-400 hover:text-indigo-300">
            Ver VLAN Profiles
          </Link>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            + Crear Plan
          </button>
        </div>
      </div>

      <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
              <th className="p-4 font-medium">Nombre de Plan</th>
              <th className="p-4 font-medium">Velocidad (DL / UL)</th>
              <th className="p-4 font-medium">Upstream Profile (TCONT)</th>
              <th className="p-4 font-medium">Downstream Profile (Gemport)</th>
              <th className="p-4 font-medium">GPON Shaping</th>
              <th className="p-4 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm text-slate-300 divide-y divide-slate-700">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">Cargando...</td></tr>
            ) : profiles.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">No hay planes creados.</td></tr>
            ) : (
              profiles.map(p => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 font-bold text-white">{p.name}</td>
                  <td className="p-4">{p.download_mbps} / {p.upload_mbps} Mbps</td>
                  <td className="p-4 font-mono text-xs text-emerald-400">{p.upstream_profile}</td>
                  <td className="p-4 font-mono text-xs text-emerald-400">{p.downstream_profile}</td>
                  <td className="p-4">
                    {p.uses_gpon_shaping ? (
                      <span className="bg-blue-900/30 text-blue-400 px-2 py-1 rounded text-xs">ON</span>
                    ) : (
                      <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-xs">OFF (Default)</span>
                    )}
                  </td>
                  <td className="p-4">
                    <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl w-full max-w-md shadow-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Crear Plan de Velocidad</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nombre Comercial</label>
                <input 
                  type="text" 
                  className="w-full bg-[#1e293b] border border-slate-700 rounded-lg p-2 text-white outline-none"
                  placeholder="Ej. Plan 100M Residencial"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Download (Mbps)</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#1e293b] border border-slate-700 rounded-lg p-2 text-white outline-none"
                    value={formData.download_mbps}
                    onChange={e => setFormData({...formData, download_mbps: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Upload (Mbps)</label>
                  <input 
                    type="number" 
                    className="w-full bg-[#1e293b] border border-slate-700 rounded-lg p-2 text-white outline-none"
                    value={formData.upload_mbps}
                    onChange={e => setFormData({...formData, upload_mbps: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Upstream Profile (TCONT)</label>
                <input 
                  type="text" 
                  className="w-full bg-[#1e293b] border border-slate-700 rounded-lg p-2 text-white font-mono outline-none"
                  placeholder="Ej. ADMINOLT-100-MEGAS-UP"
                  value={formData.upstream_profile}
                  onChange={e => setFormData({...formData, upstream_profile: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Downstream Profile (Gemport Traffic-Limit)</label>
                <input 
                  type="text" 
                  className="w-full bg-[#1e293b] border border-slate-700 rounded-lg p-2 text-white font-mono outline-none"
                  placeholder="Ej. ADMINOLT-100-MEGAS-DOWN"
                  value={formData.downstream_profile}
                  onChange={e => setFormData({...formData, downstream_profile: e.target.value})}
                />
              </div>

              <div className="flex items-center mt-2">
                <input 
                  type="checkbox" 
                  id="gpon_shaping"
                  checked={formData.uses_gpon_shaping}
                  onChange={e => setFormData({...formData, uses_gpon_shaping: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="gpon_shaping" className="text-sm text-slate-300">
                  Aplicar Shaping en GPON (Traffic-Limit Downstream)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white px-4 py-2">Cancelar</button>
              <button onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">Guardar Plan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
