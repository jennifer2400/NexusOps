import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen bg-[#0f172a] border-r border-[#1e293b] flex flex-col hidden md:flex fixed left-0 top-0 z-40">
      <div className="h-16 flex items-center justify-center border-b border-[#1e293b]">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          Helix NOC
        </h1>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-3 mt-4">Principal</div>
        <Link href="/dashboard" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-slate-300">
          <span className="w-5 h-5 mr-3 flex items-center justify-center">📊</span>
          Dashboard
        </Link>
        <Link href="/dashboard/olts" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
          <span className="w-5 h-5 mr-3 flex items-center justify-center">🌐</span>
          Red OLT
        </Link>
        <Link href="/dashboard/onus" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
          <span className="w-5 h-5 mr-3 flex items-center justify-center">🔌</span>
          ONUs / Clientes
        </Link>
        <Link href="/dashboard/provisioning" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
          <span className="w-5 h-5 mr-3 flex items-center justify-center">⚡</span>
          Aprovisionamiento
        </Link>
        <div className="pl-11 space-y-1">
          <Link href="/dashboard/provisioning/speed-profiles" className="block px-3 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
            Speed Profiles
          </Link>
          <Link href="/dashboard/provisioning/vlan-profiles" className="block px-3 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
            VLAN Profiles
          </Link>
        </div>
        <Link href="/dashboard/onu-models" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
          <span className="w-5 h-5 mr-3 flex items-center justify-center">📦</span>
          Catálogo Modelos ONU
        </Link>
        
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-3 mt-8">Operaciones</div>
        <Link href="/dashboard/gateways" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
          <span className="w-5 h-5 mr-3 flex items-center justify-center">🛡️</span>
          Site Gateways (VPN)
        </Link>
        <Link href="#" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
          <span className="w-5 h-5 mr-3 flex items-center justify-center">🛠️</span>
          Troubleshooting
        </Link>
        
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-3 mt-8">Sistema</div>
        <Link href="#" className="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
          <span className="w-5 h-5 mr-3 flex items-center justify-center">⚙️</span>
          Configuración
        </Link>
      </div>
      
      <div className="p-4 border-t border-[#1e293b]">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white shadow-[0_0_10px_rgba(59,130,246,0.6)]">
            AD
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">Admin</p>
            <p className="text-xs text-slate-400">admin@helix.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
