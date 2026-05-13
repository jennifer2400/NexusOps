interface StackItem {
  name: string;
  state: string;
  containers: number;
  running: number;
}

interface Props {
  stacks?: StackItem[];
}

export default function RecentStacksTable({
  stacks = [],
}: Props) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 shadow-lg">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h3 className="text-lg font-semibold text-white">
          Recent Deployments
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-6 py-3 text-left">Stack</th>
              <th className="px-6 py-3 text-left">State</th>
              <th className="px-6 py-3 text-left">Containers</th>
              <th className="px-6 py-3 text-left">Running</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800 text-zinc-300">
            {stacks.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                  No deployments available
                </td>
              </tr>
            ) : (
              stacks.map((stack) => (
                <tr key={stack.name}>
                  <td className="px-6 py-4 font-medium text-white">
                    {stack.name}
                  </td>

                  <td className="px-6 py-4">{stack.state}</td>

                  <td className="px-6 py-4">{stack.containers}</td>

                  <td className="px-6 py-4">{stack.running}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
