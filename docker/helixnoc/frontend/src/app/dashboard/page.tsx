"use client";
import { useEffect, useState } from "react";
import { Server, Users, AlertCircle, Activity, ArrowDown, ArrowUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function formatBps(bps: number) {
  if (!bps || bps === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return parseFloat((bps / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString + "Z"); // asumiendo UTC
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return `Hace ${diffInSeconds} segs`;
  if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} h`;
  return `Hace ${Math.floor(diffInSeconds / 86400)} d`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    total_olts: 0,
    total_onus: 0,
    critical_alarms: 0,
    total_in_bps: 0,
    total_out_bps: 0
  });
  const [trafficHistory, setTrafficHistory] = useState<any[]>([]);
  const [recentAlarms, setRecentAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    // 1. Stats
    fetch("http://localhost:8000/api/stats/dashboard")
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error(err));

    // 2. Traffic History
    fetch("http://localhost:8000/api/stats/traffic/history?minutes=60")
      .then(res => res.json())
      .then(data => {
        // Parse time for charts (e.g. "HH:MM")
        const formatted = data.map((d: any) => {
           const timePart = d.timestamp.split(" ")[1];
           return { ...d, time: timePart, in_mbps: d.in_bps / 1000000, out_mbps: d.out_bps / 1000000 };
        });
        setTrafficHistory(formatted);
      })
      .catch(err => console.error(err));

    // 3. Recent Alarms
    fetch("http://localhost:8000/api/alarms/recent")
      .then(res => res.json())
      .then(data => {
        setRecentAlarms(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Resumen de Red</h1>
          <p className="text-slate-400 text-sm">Monitoreo en tiempo real de OLTs y ONUs</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20 flex items-center gap-2">
            <Activity size={16} />
            Aprovisionar ONU
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-panel p-5 hover-glow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-400 text-sm font-medium">OLTs Activas</h3>
            <Server size={18} className="text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-white">
            {loading ? "..." : stats.total_olts}
          </p>
          <div className="mt-2 text-xs text-green-400 flex items-center">
            <span className="mr-1">↑</span> 100% Online
          </div>
        </div>

        <div className="glass-panel p-5 hover-glow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-400 text-sm font-medium">Total ONUs</h3>
            <Users size={18} className="text-indigo-400" />
          </div>
          <p className="text-3xl font-bold text-white">
            {loading ? "..." : stats.total_onus}
          </p>
          <div className="mt-2 text-xs text-indigo-400 flex items-center">
            Sincronizadas desde BD
          </div>
        </div>

        <div className="glass-panel p-5 hover-glow border-l-2 border-l-red-500">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-400 text-sm font-medium">Alarmas Críticas</h3>
            <AlertCircle size={18} className="text-red-400" />
          </div>
          <p className="text-3xl font-bold text-white">
            {loading ? "..." : stats.critical_alarms}
          </p>
          <div className="mt-2 text-xs text-red-400 flex items-center">
            Problemas activos reportados
          </div>
        </div>

        <div className="glass-panel p-5 hover-glow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-400 text-sm font-medium">Tráfico OLT</h3>
            <Activity size={18} className="text-green-400" />
          </div>
          {stats.total_in_bps === 0 && stats.total_out_bps === 0 ? (
            <p className="text-sm font-bold text-slate-400 mt-2">Esperando primera lectura SNMP</p>
          ) : (
            <div className="mt-1 flex flex-col space-y-1">
               <div className="flex items-center text-sm font-bold text-white">
                 <ArrowDown size={14} className="text-emerald-500 mr-1"/>
                 {formatBps(stats.total_in_bps)}
               </div>
               <div className="flex items-center text-sm font-bold text-white">
                 <ArrowUp size={14} className="text-blue-500 mr-1"/>
                 {formatBps(stats.total_out_bps)}
               </div>
               <div className="text-xs text-slate-500 pt-1 border-t border-slate-700/50 mt-1">
                 Total: {formatBps(stats.total_in_bps + stats.total_out_bps)}
               </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel p-6 h-96 flex flex-col">
          <h3 className="text-white font-medium mb-4">Tráfico en Tiempo Real (Última hora)</h3>
          <div className="flex-1 w-full bg-slate-900/30 rounded-lg p-2">
            {trafficHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trafficHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickMargin={10} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `${val} M`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                    formatter={(value: any, name: any) => [`${(value || 0).toFixed(2)} Mbps`, name === "in_mbps" ? "Entrada" : "Salida"]}
                    labelStyle={{ color: '#94a3b8', marginBottom: '5px' }}
                  />
                  <Line type="monotone" dataKey="in_mbps" name="in_mbps" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="out_mbps" name="out_mbps" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center border border-slate-700/50 border-dashed rounded-lg">
                <p className="text-slate-500 text-sm animate-pulse">Esperando datos de tráfico SNMP...</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="glass-panel p-6 h-96 flex flex-col">
          <h3 className="text-white font-medium mb-4">Últimas Alarmas</h3>
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            {recentAlarms.length > 0 ? recentAlarms.map((alarm) => (
              <div key={alarm.id} className={`p-3 rounded-lg border ${alarm.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' : alarm.severity === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-slate-800/50 border-slate-700/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${alarm.severity === 'critical' ? 'text-red-400' : alarm.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'}`}>
                    {alarm.alarm_type.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-500">{formatRelativeTime(alarm.created_at)}</span>
                </div>
                <p className="text-sm text-slate-300 font-medium">{alarm.title}</p>
                {alarm.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{alarm.description}</p>}
                {alarm.olt_name && <p className="text-xs text-slate-500 mt-2 pt-1 border-t border-slate-700/30">{alarm.olt_name}</p>}
              </div>
            )) : (
               <div className="h-full flex items-center justify-center">
                 <p className="text-slate-500 text-sm">No hay alarmas recientes</p>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
