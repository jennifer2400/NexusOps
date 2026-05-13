import { ReactNode } from 'react';

interface Props {
  title?: string;
  children: ReactNode;
}

export default function DashboardLayout({
  title = 'NexusOps Dashboard',
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <aside className="fixed left-0 top-0 flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-900 p-6">
        <div>
          <h1 className="text-2xl font-bold">NexusOps</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Infrastructure Platform
          </p>
        </div>

        <nav className="mt-10 flex flex-col gap-3 text-sm text-zinc-300">
          <button className="rounded-lg bg-zinc-800 px-4 py-3 text-left transition hover:bg-zinc-700">
            Dashboard
          </button>

          <button className="rounded-lg px-4 py-3 text-left transition hover:bg-zinc-800">
            Containers
          </button>

          <button className="rounded-lg px-4 py-3 text-left transition hover:bg-zinc-800">
            Images
          </button>

          <button className="rounded-lg px-4 py-3 text-left transition hover:bg-zinc-800">
            Stacks
          </button>

          <button className="rounded-lg px-4 py-3 text-left transition hover:bg-zinc-800">
            Monitoring
          </button>
        </nav>
      </aside>

      <main className="ml-64 p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">{title}</h2>
            <p className="mt-1 text-zinc-400">
              Centralized Docker and infrastructure management
            </p>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
