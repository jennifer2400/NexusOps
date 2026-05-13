import { NexusOpsAPI } from '../lib/api';

export async function getInfrastructureOverview() {
  const [stats, containers, stacks] = await Promise.all([
    NexusOpsAPI.stats(),
    NexusOpsAPI.containers(),
    NexusOpsAPI.stacks(),
  ]);

  return {
    stats,
    containers,
    stacks,
  };
}
