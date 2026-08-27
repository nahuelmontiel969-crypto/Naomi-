// lib/node-registry.ts
//
// Registro en memoria de los nodos del clúster. Cada nodo se anuncia
// periódicamente vía POST /api/vm/nodes/heartbeat. Si deja de anunciarse
// por más de NODE_TTL_MS, se marca offline (no se borra, para que siga
// visible en la pestaña Nodes con su último estado conocido).

export type NodeStatus = "online" | "offline";

export interface NodeInfo {
  id: string;
  label: string;
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  activeJobs: number;
  maxJobs: number;
  lastSeen: number;
  status: NodeStatus;
}

const NODE_TTL_MS = 15_000;
const nodes = new Map<string, NodeInfo>();

export function upsertNode(id: string, data: Omit<NodeInfo, "id" | "lastSeen" | "status">) {
  nodes.set(id, { ...data, id, lastSeen: Date.now(), status: "online" });
}

export function listNodes(): NodeInfo[] {
  const now = Date.now();
  for (const node of nodes.values()) {
    if (now - node.lastSeen > NODE_TTL_MS) node.status = "offline";
  }
  return Array.from(nodes.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function getNode(id: string): NodeInfo | undefined {
  return nodes.get(id);
}

/** Potencia agregada real del clúster, para mostrar en la pestaña Workers */
export function clusterSummary() {
  const online = listNodes().filter((n) => n.status === "online");
  return {
    totalNodes: nodes.size,
    onlineNodes: online.length,
    avgCpuPercent: avg(online.map((n) => n.cpuPercent)),
    avgRamPercent: avg(online.map((n) => n.ramPercent)),
    totalActiveJobs: online.reduce((s, n) => s + n.activeJobs, 0),
    totalCapacityJobs: online.reduce((s, n) => s + n.maxJobs, 0),
  };
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
