type Props = {
  title: string;
  value: string;
  status?: 'online' | 'offline' | 'warning';
  subtitle?: string;
};

export default function SystemStatusCard({
  title,
  value,
  status = 'online',
  subtitle,
}: Props) {
  const statusColor = {
    online: 'border-green-500',
    offline: 'border-red-500',
    warning: 'border-yellow-500',
  };

  return (
    <div
      className={`rounded-2xl border-l-4 ${statusColor[status]} bg-zinc-900 p-5 shadow-lg`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm text-zinc-400">{title}</h3>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
          )}
        </div>

        <div className="h-3 w-3 rounded-full bg-current opacity-80" />
      </div>
    </div>
  );
}
