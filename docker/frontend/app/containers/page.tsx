"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchContainersData, actionContainer } from "@/services/api";
import { toast } from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import { 
  Search, 
  Filter, 
  Play, 
  Square, 
  RefreshCcw, 
  Trash2, 
  Box, 
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ExternalLink
} from "lucide-react";

// ==================================================
// CONTAINERS PAGE COMPONENT
// ==================================================
export default function ContainersPage() {
  const [containers, setContainers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // ==================================================
  // DATA FETCHING
  // ==================================================
  const loadContainers = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchContainersData();
      setContainers(data);
    } catch (error) {
      toast.error("Failed to connect to Docker daemon.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadContainers();
    const interval = setInterval(() => loadContainers(true), 5000);
    return () => clearInterval(interval);
  }, []);

  // ==================================================
  // SEARCH & FILTER LOGIC
  // ==================================================
  const filteredContainers = useMemo(() => {
    return containers.filter(container => {
      const matchesSearch = container.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           container.image.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterStatus === "all" || container.state.toLowerCase() === filterStatus.toLowerCase();
      return matchesSearch && matchesFilter;
    });
  }, [containers, searchTerm, filterStatus]);

  // PAGINATION
  const totalPages = Math.ceil(filteredContainers.length / itemsPerPage);
  const currentData = filteredContainers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ==================================================
  // ACTIONS
  // ==================================================
  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'delete') => {
    if (action === 'delete') {
      if (!confirm("⚠️ Permanent Delete: Are you sure?")) return;
    }
    
    setActionLoading(`${id}-${action}`);
    const toastId = toast.loading(`${action.toUpperCase()} in progress...`);
    
    try {
      await actionContainer(id, action);
      toast.success(`Success: ${action}`, { id: toastId });
      loadContainers(true);
    } catch (error) {
      toast.error(`Action failed: ${action}`, { id: toastId });
    } finally {
      setActionLoading(null);
    }
  };

  // ==================================================
  // RENDER
  // ==================================================
  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      {/* HEADER & FILTERS */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Box className="text-blue-500" /> Containers
          </h2>
          <p className="text-gray-400 mt-1">Real-time infrastructure management.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
          {/* SEARCH BAR RESTORED */}
          <div className="relative w-full sm:w-80 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search containers..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#111827] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-blue-500 outline-none transition-all placeholder:text-gray-600 focus:bg-[#1E293B]"
            />
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <select 
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="flex-1 sm:flex-none bg-[#111827] border border-gray-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="exited">Exited</option>
              <option value="restarting">Restarting</option>
            </select>
            
            <button 
              onClick={() => loadContainers()}
              className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl shadow-lg shadow-blue-600/10 transition-all"
            >
              <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      {/* TABLE BOX */}
      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-900/50 text-gray-500 text-[10px] uppercase tracking-[0.2em] font-black border-b border-gray-800">
                <th className="p-5">Container</th>
                <th className="p-5">Image Source</th>
                <th className="p-5">Status</th>
                <th className="p-5">Uptime</th>
                <th className="p-5">Networking</th>
                <th className="p-5 text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loading && containers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                       <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                       <p className="text-gray-500 animate-pulse">Syncing with Docker Engine...</p>
                    </div>
                  </td>
                </tr>
              ) : currentData.map((container) => (
                <tr key={container.id} className="hover:bg-blue-500/[0.02] transition-colors group">
                  <td className="p-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                        container.state === 'Running' ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'
                      }`}>
                        <Box size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-200 group-hover:text-blue-400 transition-colors cursor-default">{container.name}</p>
                        <p className="text-[10px] text-gray-600 font-mono tracking-tighter uppercase">{container.id.substring(0, 12)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-5">
                    <span className="bg-gray-800/50 border border-gray-700/50 px-2.5 py-1 rounded-lg text-xs font-mono text-gray-400">
                      {container.image.split('@')[0]}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 w-fit ${
                        container.state === 'Running' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
                        container.state === 'Exited' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                        'bg-gray-800 text-gray-500 border border-gray-700'
                      }`}>
                        {container.state === 'Running' && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>}
                        {container.state}
                      </span>
                      <p className="text-[10px] text-gray-600 max-w-[120px] truncate">{container.status}</p>
                    </div>
                  </td>
                  <td className="p-5 text-sm text-gray-400">
                    {container.started_at && container.state === 'Running' 
                      ? formatDistanceToNow(new Date(container.started_at)) 
                      : <span className="text-gray-700">---</span>}
                  </td>
                  <td className="p-5">
                    <div className="flex flex-wrap gap-1.5">
                      {container.ports && container.ports.length > 0 ? (
                        container.ports.map((p: string) => {
                          const [hostPort] = p.split(':');
                          return (
                            <a 
                              key={p}
                              href={`http://localhost:${hostPort}`}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-bold text-blue-400 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-1"
                            >
                              {p} <ExternalLink size={8} />
                            </a>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-gray-600 uppercase font-black tracking-widest italic">Internal Only</span>
                      )}
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-all duration-300">
                      {container.state !== 'Running' ? (
                        <button 
                          onClick={() => handleAction(container.id, 'start')}
                          disabled={actionLoading !== null}
                          className="bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-white p-2.5 rounded-xl transition-all"
                          title="Start Service"
                        >
                          <Play size={16} fill="currentColor" />
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleAction(container.id, 'restart')}
                            disabled={actionLoading !== null}
                            className="bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white p-2.5 rounded-xl transition-all"
                            title="Restart Service"
                          >
                            <RefreshCcw size={16} />
                          </button>
                          <button 
                            onClick={() => handleAction(container.id, 'stop')}
                            disabled={actionLoading !== null}
                            className="bg-yellow-500/10 hover:bg-yellow-500 text-yellow-400 hover:text-white p-2.5 rounded-xl transition-all"
                            title="Stop Service"
                          >
                            <Square size={16} fill="currentColor" />
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => handleAction(container.id, 'delete')}
                        disabled={actionLoading !== null}
                        className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white p-2.5 rounded-xl transition-all"
                        title="Destroy Container"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredContainers.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="p-20 text-center text-gray-600">
                    <Search size={40} className="mx-auto mb-4 opacity-20" />
                    <p className="text-xl font-bold">No matches found</p>
                    <p className="text-sm mt-1">Try adjusting your filters or search keywords.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="bg-gray-900/30 p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Showing <span className="text-gray-300">{((currentPage-1)*itemsPerPage)+1}</span> to <span className="text-gray-300">{Math.min(currentPage*itemsPerPage, filteredContainers.length)}</span> of <span className="text-gray-300">{filteredContainers.length}</span>
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-800 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-800 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
