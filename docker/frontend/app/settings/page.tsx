export default function SettingsPage() {
  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
          <p className="text-gray-400 mt-1">Configure your NexusOps platform.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold shadow transition-colors">
          Save Changes
        </button>
      </div>

      <div className="bg-[#111827] rounded-xl border border-gray-800 p-6 max-w-2xl">
        <form className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Docker Engine URL</label>
            <input 
              type="text" 
              className="w-full bg-[#1E293B] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500" 
              defaultValue="unix:///var/run/docker.sock"
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Platform Theme</label>
            <select className="w-full bg-[#1E293B] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500" disabled>
              <option>Dark (Default)</option>
            </select>
          </div>
          <p className="text-xs text-yellow-500">Settings persistence will be enabled in Phase 2.</p>
        </form>
      </div>
    </div>
  );
}
