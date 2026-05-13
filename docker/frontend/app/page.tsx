"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchDashboardData, fetchStatsData } from "@/services/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

// ==================================================
// DASHBOARD COMPONENT
// ==================================================
export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [statsData, setStatsData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  // ==================================================
  // DATA FETCHING LOOP
  // ==================================================
  const loadData = async () => {
    try {
      const [dash, stats] = await Promise.all([
        fetchDashboardData(),
        fetchStatsData()
      ]);
      setDashboardData(dash);
      setStatsData(stats);
      
      if (stats?.raw) {
        setHistory(prev => {
          const newHistory = [...prev, { time: new Date().toLocaleTimeString(), cpu: stats.raw.cpu, ram: stats.raw.mem_percent }];
          return newHistory.slice(-20); // Keep last 20 data points
        });
      }
    } catch (error) {
      console.error("Dashboard metrics failed to load.", error);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  // ==================================================
  // FORMATTERS
  // ==================================================
  const formatUptime = (seconds: number) => {
    if (!seconds) return "Loading...";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
  };

  // ==================================================
  // RENDER
  // ==================================================
  return (
    <div className="animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Infrastructure NOC</h2>
          <p className="text-gray-400 mt-1">Real-time Docker & Host monitoring.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/stacks" className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg font-semibold shadow-lg transition-colors flex items-center gap-2">
            <span>+</span> Deploy Stack
          </Link>
        </div>
      </div>

      {/* QUICK STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-sm relative overflow-hidden group hover:border-blue-500/50 transition-colors">
          <div className="relative z-10">
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-2">Total Containers</h3>
            <p className="text-4xl font-bold text-white group-hover:scale-105 transition-transform origin-left">{dashboardData?.containers ?? "-"}</p>
          </div>
          <div className="absolute -bottom-4 -right-4 text-gray-800 opacity-20 text-8xl group-hover:opacity-30 transition-opacity">📦</div>
        </div>

        <div className="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-sm relative overflow-hidden group hover:border-green-500/50 transition-colors">
          <div className="relative z-10">
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-2">Services Status</h3>
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dashboardData?.services === 'Online' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${dashboardData?.services === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
              </span>
              <p className="text-4xl font-bold text-white">{dashboardData?.services || "---"}</p>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 text-gray-800 opacity-20 text-8xl group-hover:opacity-30 transition-opacity">⚡</div>
        </div>

        <div className="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-sm relative overflow-hidden group hover:border-purple-500/50 transition-colors">
          <div className="relative z-10">
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-2">Host CPU</h3>
            <p className="text-4xl font-bold text-blue-400">{statsData?.cpu_usage || "-%"}</p>
          </div>
          <div className="absolute -bottom-4 -right-4 text-gray-800 opacity-20 text-8xl group-hover:opacity-30 transition-opacity">💻</div>
        </div>
        
        <div className="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-sm relative overflow-hidden group hover:border-yellow-500/50 transition-colors">
          <div className="relative z-10">
            <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-2">Host Uptime</h3>
            <p className="text-2xl font-bold text-yellow-400 mt-2">{formatUptime(statsData?.uptime_seconds)}</p>
          </div>
          <div className="absolute -bottom-4 -right-4 text-gray-800 opacity-20 text-8xl group-hover:opacity-30 transition-opacity">⏱️</div>
        </div>
      </div>

      {/* LIVE CHARTS SECTION */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
            <h3 className="text-xl font-bold">CPU Usage (Live)</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="time" stroke="#4b5563" fontSize={12} tickMargin={10} />
                <YAxis stroke="#4b5563" fontSize={12} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', borderColor: '#374151', borderRadius: '8px', color: '#fff' }} 
                  itemStyle={{ color: '#60A5FA', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="cpu" name="CPU" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCpu)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse"></div>
            <h3 className="text-xl font-bold">Memory Usage (Live)</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="time" stroke="#4b5563" fontSize={12} tickMargin={10} />
                <YAxis stroke="#4b5563" fontSize={12} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', borderColor: '#374151', borderRadius: '8px', color: '#fff' }} 
                  itemStyle={{ color: '#A78BFA', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="ram" name="RAM" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorRam)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* DETAILED METRICS GRID */}
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><span>📊</span> System Resources Details</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-[#1E293B] border border-gray-800 p-5 rounded-xl flex items-center justify-between shadow-sm hover:bg-gray-800 transition-colors">
          <div>
            <p className="text-sm text-gray-400 mb-1">RAM Storage</p>
            <p className="text-xl font-semibold text-gray-200">{statsData?.memory_usage || "---"}</p>
          </div>
          <div className="text-purple-400 bg-purple-500/10 p-3 rounded-lg text-xl">💾</div>
        </div>
        <div className="bg-[#1E293B] border border-gray-800 p-5 rounded-xl flex items-center justify-between shadow-sm hover:bg-gray-800 transition-colors">
          <div>
            <p className="text-sm text-gray-400 mb-1">Disk Usage</p>
            <p className="text-xl font-semibold text-gray-200">{statsData?.disk_usage || "---"}</p>
          </div>
          <div className="text-yellow-400 bg-yellow-500/10 p-3 rounded-lg text-xl">💿</div>
        </div>
        <div className="bg-[#1E293B] border border-gray-800 p-5 rounded-xl flex items-center justify-between shadow-sm hover:bg-gray-800 transition-colors">
          <div>
            <p className="text-sm text-gray-400 mb-1">Network I/O</p>
            <p className="text-xl font-semibold text-gray-200">{statsData?.network_io || "---"}</p>
          </div>
          <div className="text-green-400 bg-green-500/10 p-3 rounded-lg text-xl">🌐</div>
        </div>
        <div className="bg-[#1E293B] border border-gray-800 p-5 rounded-xl flex items-center justify-between shadow-sm hover:bg-gray-800 transition-colors">
          <div>
            <p className="text-sm text-gray-400 mb-1">Docker Engine</p>
            <p className="text-xl font-semibold text-gray-200">{dashboardData?.docker_engine || "---"}</p>
          </div>
          <div className="text-blue-400 bg-blue-500/10 p-3 rounded-lg text-xl">🐳</div>
        </div>
      </div>
    </div>
  );
}