export default function Header() {
  return (
    <header className="h-16 glass-panel border-x-0 border-t-0 rounded-none border-b border-[#1e293b] flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-medium text-white hidden sm:block">Centro de Operaciones</h2>
        <div className="flex items-center bg-slate-800/50 border border-slate-700 rounded-full px-3 py-1.5 ml-4">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
          <span className="text-xs text-slate-300 font-medium">Sistema Online</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-300 hover:text-white transition-colors">
          <span className="w-5 h-5 flex items-center justify-center">🔔</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-slate-900"></span>
        </button>
        <button className="p-2 text-slate-300 hover:text-white transition-colors">
          <span className="w-5 h-5 flex items-center justify-center">🔍</span>
        </button>
      </div>
    </header>
  );
}
