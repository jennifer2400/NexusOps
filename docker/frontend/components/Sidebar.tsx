"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNav } from "@/context/NavContext";
import { 
  LayoutDashboard, 
  Layers, 
  Container, 
  Database, 
  Terminal, 
  Settings, 
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import { useState } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close, isCollapsed, toggleCollapsed } = useNav();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const menuItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Stacks", href: "/stacks", icon: Layers },
    { name: "Containers", href: "/containers", icon: Container },
    { name: "Images", href: "/images", icon: Database },
    { name: "Logs", href: "/logs", icon: Terminal },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <>
      {/* MOBILE OVERLAY */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
          onClick={close}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-[#0F172A] border-r border-gray-800 flex flex-col transition-all duration-300 ease-in-out md:relative md:translate-x-0
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        ${isCollapsed ? "w-20" : "w-72"}
      `}>
        {/* LOGO AREA */}
        <div className={`flex items-center h-24 px-6 shrink-0 relative transition-all duration-300`}>
          <div className={`flex items-center gap-3 transition-opacity duration-300 ${isCollapsed ? "opacity-0 invisible" : "opacity-100 visible"}`}>
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-600/20">
               <ShieldCheck size={20} className="text-white" />
            </div>
            <h1 className="text-xl font-black bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent tracking-tighter uppercase">
              NexusOps
            </h1>
          </div>
          
          <button 
            onClick={close} 
            className="md:hidden ml-auto text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* COLLAPSE TOGGLE (DESKTOP) - MOVED OUTSIDE FOR VISIBILITY */}
        <button 
          onClick={toggleCollapsed}
          className={`
            hidden md:flex absolute -right-3 top-12 w-6 h-6 bg-blue-600 rounded-full items-center justify-center text-white border-2 border-[#0F172A] shadow-xl hover:scale-110 active:scale-95 transition-all z-[100]
            ${isCollapsed ? "rotate-180" : "rotate-0"}
          `}
        >
          <ChevronLeft size={14} strokeWidth={4} />
        </button>

        {/* NAVIGATION */}
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto overflow-x-hidden py-4 scrollbar-none">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <div 
                key={item.href} 
                className="relative"
                onMouseEnter={() => setHoveredItem(item.name)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <Link 
                  href={item.href} 
                  onClick={close}
                  className={`
                    flex items-center h-12 rounded-xl transition-all duration-200 group
                    ${isActive 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                      : "text-gray-400 hover:bg-gray-800/80 hover:text-white"
                    }
                    ${isCollapsed ? "justify-center px-0" : "px-4 gap-3"}
                  `}
                >
                  <Icon size={20} className={`shrink-0 ${isActive ? "text-white" : "text-gray-500 group-hover:text-gray-300"} transition-colors`} />
                  
                  {!isCollapsed && (
                    <span className="font-semibold text-sm truncate animate-in slide-in-from-left-2 duration-300">
                      {item.name}
                    </span>
                  )}

                  {/* ACTIVE INDICATOR */}
                  {isActive && !isCollapsed && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                  )}
                </Link>

                {/* TOOLTIP (ONLY COLLAPSED) */}
                {isCollapsed && hoveredItem === item.name && (
                  <div className="fixed left-20 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-xl z-[60] pointer-events-none whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-200">
                    {item.name}
                    <div className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-600 rotate-45 rounded-sm"></div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* FOOTER / NODE STATUS */}
        <div className={`p-4 mt-auto border-t border-gray-800/50 transition-all duration-300 ${isCollapsed ? "px-2" : "px-6"}`}>
          <div className={`bg-gray-800/40 border border-gray-700/50 rounded-2xl p-3 flex flex-col gap-2 ${isCollapsed ? "items-center" : "items-start"}`}>
            {!isCollapsed && <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Node Status</p>}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping opacity-75"></div>
              </div>
              {!isCollapsed && <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">Online</span>}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
