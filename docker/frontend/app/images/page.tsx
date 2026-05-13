"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchImagesData, deleteImage } from "@/services/api";
import { toast } from "react-hot-toast";
import { 
  Database, 
  Search, 
  RefreshCcw, 
  Trash2, 
  HardDrive, 
  Calendar,
  ChevronDown
} from "lucide-react";

// ==================================================
// IMAGES MANAGEMENT PAGE
// ==================================================
export default function ImagesPage() {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // FETCH IMAGES
  const loadImages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchImagesData();
      setImages(data);
    } catch (error) {
      toast.error("Failed to load Docker images.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
    const interval = setInterval(() => loadImages(true), 15000);
    return () => clearInterval(interval);
  }, []);

  // NO FILTER LOGIC
  const filteredImages = images;

  // DELETE HANDLER
  const handleDelete = async (id: string) => {
    if (!confirm("⚠️ Delete Image: Are you sure? This cannot be undone.")) return;
    
    const toastId = toast.loading("Purging image...");
    try {
      await deleteImage(id);
      toast.success("Image removed from local engine.", { id: toastId });
      loadImages(true);
    } catch (error: any) {
      toast.error(`Purge Failed: ${error.message}`, { id: toastId });
    }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Database className="text-blue-500" /> Image Registry
          </h2>
          <p className="text-gray-400 mt-1">Manage local storage and image layers.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button 
            onClick={() => loadImages()}
            className="bg-[#1E293B] hover:bg-gray-700 text-white p-2.5 rounded-xl border border-gray-700 transition-all"
          >
            <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* TABLE BOX */}
      <div className="bg-[#111827] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-900/50 text-gray-500 text-[10px] uppercase tracking-[0.2em] font-black border-b border-gray-800">
                <th className="p-5">Local Identity (ID)</th>
                <th className="p-5">Repository Tags</th>
                <th className="p-5">Size</th>
                <th className="p-5">Creation Date</th>
                <th className="p-5 text-right">Ops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loading && images.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                       <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                       <p className="text-gray-500">Scanning local registry...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredImages.map((img) => (
                <tr key={img.id} className="hover:bg-blue-500/[0.01] transition-colors group">
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-800 rounded-lg text-gray-500">
                        <Database size={16} />
                      </div>
                      <code className="text-xs text-blue-400 font-mono bg-blue-500/5 px-2 py-1 rounded-md">{img.id.substring(0, 15)}...</code>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex flex-wrap gap-1.5 max-w-[300px]">
                      {img.tags?.map((tag: string) => (
                        <span key={tag} className="bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded-md text-[10px] font-bold">
                          {tag}
                        </span>
                      )) || <span className="text-gray-600 italic text-[10px]">untagged / dangling</span>}
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-2 text-sm text-gray-300 font-mono">
                      <HardDrive size={14} className="text-gray-600" />
                      {img.size_mb} MB
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar size={14} />
                      {new Date(img.created).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="p-5 text-right">
                    <button 
                      onClick={() => handleDelete(img.id)}
                      className="text-gray-600 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all"
                      title="Purge Image"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredImages.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-20 text-center text-gray-500">
                    <Database size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="text-xl font-bold">No images in engine</p>
                    <p className="text-sm">Pull an image or deploy a stack to populate this list.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
