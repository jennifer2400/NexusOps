import SystemStatusCard from './SystemStatusCard';

interface Props {
  containers?: number;
  stacks?: number;
  cpu?: string;
  memory?: string;
}

export default function InfrastructureOverview({
  containers = 0,
  stacks = 0,
  cpu = '0%',
  memory = '0GB',
}: Props) {
  return (
    <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <SystemStatusCard
        title="Containers"
        value={String(containers)}
        status="online"
        subtitle="Docker active workloads"
      />

      <SystemStatusCard
        title="Stacks"
        value={String(stacks)}
        status="online"
        subtitle="Compose deployments"
      />

      <SystemStatusCard
        title="CPU Usage"
        value={cpu}
        status="warning"
        subtitle="Real-time infrastructure load"
      />

      <SystemStatusCard
        title="Memory"
        value={memory}
        status="online"
        subtitle="System memory usage"
      />
    </section>
  );
}
