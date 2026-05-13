"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { fetchStacksData, deployStack, deleteStack } from "@/services/api";
import { toast } from "react-hot-toast";
import yaml from 'js-yaml';
import { AlertCircle, CheckCircle2, UploadCloud, X, Plus, RefreshCw, Trash2, FileText, Search, ExternalLink, Calendar } from "lucide-react";

// ==================================================
// STACKS (COMPOSE) PAGE COMPONENT
// ==================================================
export default function StacksPage() {
  const [stacks, setStacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [stackName, setStackName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==================================================
  // FETCHING DATA
  // ==================================================
  const loadStacks = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchStacksData();
      setStacks(data);
    } catch (error) {
      toast.error("Failed to load stacks from server.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadStacks();
    const interval = setInterval(() => loadStacks(true), 10000); // Silent refresh
    return () => clearInterval(interval);
  }, []);

  // ==================================================
  // SEARCH LOGIC
  // ==================================================
  const filteredStacks = useMemo(() => {
    return stacks.filter(stack => 
      stack.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [stacks, searchTerm]);

  // ==================================================
  // DRAG & DROP HANDLERS
  // ==================================================
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".yml") || file.name.endsWith(".yaml"))) {
      setSelectedFile(file);
    } else {
      toast.error("Please upload a valid .yml or .yaml file");
    }
  };

  // ==================================================
  // DEPLOYMENT HANDLER
  // ==================================================
  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stackName || !selectedFile) return;

    // 1. Validation: Name format
    if (!/^[a-z0-9-]+$/.test(stackName)) {
      toast.error("Stack name must be lowercase alphanumeric with dashes only.");
      return;
    }

    // 2. Validation: Duplicates (Frontend check)
    if (stacks.some(s => s.name.toLowerCase() === stackName.toLowerCase())) {
      toast.error(`A stack named "${stackName}" already exists.`);
      return;
    }
    
    // 3. Validation: YAML Syntax
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        yaml.load(content); // Validate syntax
        
        // Start deployment
        setDeploying(true);
        const toastId = toast.loading(`Deploying "${stackName}"...`);
        
        try {
          await deployStack(stackName, selectedFile);
          toast.success(`Stack "${stackName}" deployed successfully!`, { id: toastId });
          setShowModal(false);
          setStackName("");
          setSelectedFile(null);
          loadStacks();
        } catch (error: any) {
          console.error(error);
          toast.error(`Deploy Failed: ${error.message || "Unknown error"}`, { id: toastId, duration: 6000 });
        } finally {
          setDeploying(false);
        }
      } catch (err: any) {
        toast.error(`YAML Syntax Error: ${err.message}`, { duration: 5000 });
      }
    };
    reader.readAsText(selectedFile);
  };

  // ==================================================
  // DELETION HANDLER
  // ==================================================
  const handleDelete = async (name: string) => {
    if (!confirm(`⚠️ DANGER: Delete stack "${name}" and all its containers?`)) return;
    
    const toastId = toast.loading(`Removing stack ${name}...`);
    try {
      await deleteStack(name);
      toast.success(`Stack ${name} removed.`, { id: toastId });
      loadStacks();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    }
  };

  // ==================================================
  // RENDER
  // ==================================================
  return (
    <div className="animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Plus className="text-blue-500" /> Stacks
          </h2>
          <p className="text-gray-400 mt-1">Orchestrate systems with Docker Compose.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
          {/* SEARCH BAR - ONLY HERE */}
          <div className="relative w-full sm:w-80 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search stacks..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#111827] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-blue-500 outline-none transition-all placeholder:text-gray-600 focus:bg-[#1E293B]"
            />
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <button 
              onClick={() => loadStacks()}
              disabled={loading}
              className="flex-1 sm:flex-none bg-[#1E293B] hover:bg-gray-700 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={20} /> Deploy
            </button>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading && stacks.length === 0 ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-[#111827] border border-gray-800 h-44 rounded-2xl animate-pulse"></div>
          ))
        ) : filteredStacks.length === 0 ? (
          <div className="col-span-full text-center py-20 bg-[#111827] rounded-3xl border border-dashed border-gray-800">
            <div className="bg-gray-800/50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-500">
              {searchTerm ? <Search size={40} /> : <UploadCloud size={40} />}
            </div>
            <h3 className="text-2xl font-bold text-gray-400">
              {searchTerm ? `No results for "${searchTerm}"` : "No stacks active"}
            </h3>
            <p className="text-gray-500 mt-2">
              {searchTerm ? "Try another keyword." : "Deploy your first project to get started."}
            </p>
          </div>
        ) : filteredStacks.map(stack => (
          <div key={stack.name} className="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-sm hover:border-blue-500/30 transition-all relative group overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600/10 rounded-xl text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight leading-tight">{stack.name}</h3>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase mt-0.5">
                    <Calendar size={10} />
                    {stack.created_at || 'Unknown'}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleDelete(stack.name)}
                className="text-gray-600 hover:text-red-400 transition-all p-2 hover:bg-red-500/10 rounded-lg"
              >
                <Trash2 size={18} />
              </button>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 border ${
                stack.state === 'Running' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                stack.state === 'Partial' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                stack.state === 'Ghost' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                stack.state === 'External' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  stack.state === 'Running' ? 'bg-green-500 animate-pulse' :
                  stack.state === 'Ghost' ? 'bg-purple-500' :
                  'bg-current'
                }`}></div>
                {stack.state}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-gray-800/50 border border-gray-700/50 text-[10px] text-gray-400 font-black uppercase tracking-widest">
                {stack.containers} Services
              </span>
            </div>

            {/* PORTS SECTION */}
            {stack.published_ports && stack.published_ports.length > 0 && (
              <div className="mb-6 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Public Services</p>
                <div className="flex flex-wrap gap-2">
                  {stack.published_ports.map((p: string) => {
                    const [hostPort] = p.split(':');
                    return (
                      <div key={p} className="flex items-center gap-1 bg-[#1E293B] border border-gray-700 px-2 py-1 rounded-md">
                        <span className="text-[10px] font-bold text-blue-400">{p}</span>
                        <a 
                          href={`http://localhost:${hostPort}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-gray-500 hover:text-white transition-colors"
                        >
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 mt-auto">
               <div className="flex-1">
                  <div className="flex justify-between mb-1.5 px-0.5">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Status</span>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      {Math.round((stack.running / stack.containers) * 100) || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-800/50 h-1.5 rounded-full overflow-hidden border border-gray-800">
                    <div 
                      className={`h-full transition-all duration-1000 ${stack.state === 'Running' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]'}`}
                      style={{ width: `${(stack.running / stack.containers) * 100}%` }}
                    ></div>
                  </div>
               </div>

               {stack.published_ports && stack.published_ports.length > 0 && (
                 <a 
                   href={`http://localhost:${stack.published_ports[0].split(':')[0]}`}
                   target="_blank"
                   rel="noreferrer"
                   className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center shrink-0 group/btn"
                 >
                   <ExternalLink size={18} className="group-hover/btn:scale-110 transition-transform" />
                 </a>
               )}
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#111827] border border-gray-800 rounded-3xl w-full max-w-xl shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-200">
            {deploying && (
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-800">
                <div className="h-full bg-blue-500 animate-[loading_2s_infinite_linear]"></div>
              </div>
            )}
            
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-white">Deploy Stack</h3>
                  <p className="text-gray-400 text-sm mt-1">Upload a docker-compose.yml file</p>
                </div>
                <button 
                  onClick={() => !deploying && setShowModal(false)}
                  className="text-gray-500 hover:text-white p-2 rounded-full hover:bg-gray-800 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleDeploy} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">Internal Project Name</label>
                  <input 
                    type="text" 
                    value={stackName}
                    onChange={(e) => setStackName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="w-full bg-[#1E293B] border border-gray-700 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                    placeholder="e.g. backend-api"
                    disabled={deploying}
                    required
                  />
                </div>
                
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !deploying && fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
                    isDragging ? 'border-blue-500 bg-blue-500/5 scale-[1.02]' : 
                    deploying ? 'border-gray-800 bg-gray-900 cursor-not-allowed' : 
                    'border-gray-700 hover:border-gray-500 bg-[#1E293B] cursor-pointer'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden"
                    accept=".yml,.yaml"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    disabled={deploying}
                  />
                  
                  {selectedFile ? (
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-green-500/10 text-green-400 rounded-2xl flex items-center justify-center mb-4">
                        <CheckCircle2 size={32} />
                      </div>
                      <p className="text-white font-bold text-lg">{selectedFile.name}</p>
                      <p className="text-gray-500 text-sm mt-1">{(selectedFile.size / 1024).toFixed(1)} KB • Ready to deploy</p>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                        className="mt-4 text-xs text-red-400 hover:underline"
                      >
                        Change file
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-500">
                      <div className="w-16 h-16 bg-blue-500/5 text-blue-400 rounded-2xl flex items-center justify-center mb-4">
                        <UploadCloud size={32} />
                      </div>
                      <p className="text-lg font-bold text-gray-300">Drop your YAML here</p>
                      <p className="text-sm mt-1">or click to browse your files</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-6 py-3.5 rounded-xl text-gray-400 font-bold hover:text-white hover:bg-gray-800 transition-all"
                    disabled={deploying}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={deploying || !selectedFile || !stackName}
                    className="flex-[2] bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white px-6 py-3.5 rounded-xl font-bold shadow-xl shadow-blue-600/10 transition-all flex items-center justify-center gap-3"
                  >
                    {deploying ? (
                      <>
                        <RefreshCw size={20} className="animate-spin" />
                        Deploying Project...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={20} />
                        Confirm Deployment
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
