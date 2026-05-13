'use client';

import { useState } from 'react';

export default function DeploymentWizard() {
  const [projectName, setProjectName] = useState('');
  const [template, setTemplate] = useState('nextjs');

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">
          Deployment Wizard
        </h2>

        <p className="mt-2 text-sm text-zinc-400">
          Launch websites, APIs and Docker stacks from templates.
        </p>
      </div>

      <div className="grid gap-5">
        <div>
          <label className="mb-2 block text-sm text-zinc-300">
            Project Name
          </label>

          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="my-business-site"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-300">
            Template
          </label>

          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-zinc-500"
          >
            <option value="nextjs">Next.js Website</option>
            <option value="wordpress">WordPress</option>
            <option value="fastapi">FastAPI API</option>
            <option value="nginx">NGINX Static Site</option>
          </select>
        </div>

        <button className="mt-4 rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:opacity-90">
          Prepare Deployment
        </button>
      </div>
    </div>
  )
}
