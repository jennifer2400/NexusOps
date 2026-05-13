"use client";

import { useNav } from "@/context/NavContext";
import { Menu, User, Search } from "lucide-react";

export default function TopNav() {
  const { toggle } = useNav();

  return (
    <header className="bg-[#0B1120] border-b border-gray-800 p-4 sticky top-0 z-30 backdrop-blur-md bg-opacity-80">
      <div className="flex justify-between items-center max-w-screen-2xl mx-auto w-full">
        <div className="flex items-center gap-4">
          <button 
            onClick={toggle}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 md:hidden transition-colors"
            title="Open Menu"
          >
            <Menu size={24} />
          </button>
          
          <div className="md:hidden font-bold text-xl bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            NexusOps
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs text-green-400 font-bold uppercase tracking-wider">Node: Local</span>
          </div>


          <div className="flex items-center gap-3 pl-2 sm:pl-4 border-l border-gray-800 ml-2">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-bold text-gray-200">Admin User</p>
              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter leading-none">Superadmin</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20 cursor-pointer hover:scale-105 transition-transform">
              <User size={20} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
