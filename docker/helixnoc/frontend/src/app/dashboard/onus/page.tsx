"use client";
import { useEffect, useState } from "react";
import { Search, Plus, Router, Activity, Settings2, Filter } from "lucide-react";
import OnuDrawer from "@/components/OnuDrawer";

export default function ONUsPage() {
  const [onus, setOnus] = useState<any[]>([]);
  const [olts, setOlts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOnu, setSelectedOnu] = useState<any>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [oltFilter, setOltFilter] = useState("all");

  useEffect(() => {
    fetch("http://localhost:8000/api/olt/")
      .then(res => res.json())
      .then(data => setOlts(data))
      .catch(err => console.error("Error cargando OLTs:", err));
  }, []);

  const fetchOnus = () => {
    let url = `http://localhost:8000/api/onus/?limit=1000`;
    if (searchTerm) url += `&search=${searchTerm}`;
    if (statusFilter !== "all") url += `&status=${statusFilter}`;
    if (oltFilter !== "all") url += `&olt_id=${oltFilter}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        setOnus(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      fetchOnus();
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, statusFilter, oltFilter]);

  const openDrawer = (onu: any) => {
    setSelectedOnu(onu);
    setDrawerOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("working") || s.includes("online") || s.includes("enable")) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium w-max">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
          Online
        </span>
      );
    }
    if (s.includes("offline") || s.includes("los")) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium w-max">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
          Offline
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 text-xs font-medium w-max">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col relative overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">ONUs / Clientes</h1>
          <p className="text-slate-400 text-sm">Gestiona tus clientes de fibra óptica</p>
        </div>
        <div className="flex flex-wrap md:flex-nowrap gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar interfaz o SN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
          </div>
          
          <select 
            className="px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={oltFilter}
            onChange={(e) => setOltFilter(e.target.value)}
          >
            <option value="all">Todas las OLTs</option>
            {olts.map(olt => (
              <option key={olt.id} value={olt.id}>{olt.name}</option>
            ))}
          </select>

          <select 
            className="px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-300 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="online">🟢 Online (Working)</option>
            <option value="offline">🔴 Offline (LOS)</option>
          </select>

          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2 whitespace-nowrap">
            <Plus size={16} />
            Autorizar ONU
          </button>
        </div>
      </div>

      <div className="glass-panel flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase font-semibold sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Interfaz</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Nombre ONU</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Serial Number</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">OLT</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800">Estado</th>
                <th className="px-6 py-4 font-medium border-b border-slate-800 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                    <Activity className="animate-spin inline-block mr-2" size={20} />
                    Cargando ONUs...
                  </td>
                </tr>
              ) : onus.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                    <Router size={48} className="mx-auto mb-4 text-slate-600 opacity-50" />
                    <p>No se encontraron ONUs con los filtros aplicados.</p>
                  </td>
                </tr>
              ) : (
                onus.map((onu) => (
                  <tr key={onu.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-3 cursor-pointer" onClick={() => openDrawer(onu)}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors border border-blue-500/20">
                          <Router size={16} />
                        </div>
                        <span className="font-medium text-white group-hover:text-blue-400 transition-colors">{onu.interface}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {onu.name || <span className="text-slate-500 italic">Sin nombre</span>}
                        </div>
                        {onu.description && (
                          <div className="text-xs text-slate-400 mt-0.5">{onu.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-slate-300 font-mono text-sm">{onu.sn}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-slate-400 text-sm">{onu.olt_name}</span>
                    </td>
                    <td className="px-6 py-3">
                      {getStatusBadge(onu.status)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button 
                        onClick={() => openDrawer(onu)}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors flex items-center gap-2 ml-auto"
                      >
                        Gestionar <Settings2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center bg-slate-900/30">
          <span>Mostrando {onus.length} resultados</span>
          <div className="flex gap-2">
            <button className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">Anterior</button>
            <button className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">Siguiente</button>
          </div>
        </div>
      </div>
      
      <OnuDrawer 
        key={selectedOnu?.id || 'empty'}
        onu={selectedOnu} 
        isOpen={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
      />
    </div>
  );
}
