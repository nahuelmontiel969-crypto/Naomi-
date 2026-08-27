// lib/scheduler.ts
//
// Estrategia: "menor carga primero". Entre los nodos online, descarta los
// que ya están en su límite de jobs concurrentes (maxJobs) o saturados de
// CPU/RAM, y elige el que tenga más margen libre combinado.

import { listNodes, type NodeInfo } from "./node-registry";

const CPU_SATURATION_THRESHOLD = 90;
const RAM_SATURATION_THRESHOLD = 90;

export function pickNodeForJob(): NodeInfo | null {
  const candidates = listNodes().filter(
    (n) =>
      n.status === "online" &&
      n.activeJobs < n.maxJobs &&
      n.cpuPercent < CPU_SATURATION_THRESHOLD &&
      n.ramPercent < RAM_SATURATION_THRESHOLD
  );

  if (candidates.length === 0) return null;

  // "margen libre" combinado: más peso a CPU libre que a RAM libre,
  // porque en jobs de cómputo normalmente es el cuello de botella real.
  candidates.sort((a, b) => freeScore(b) - freeScore(a));
  return candidates[0];
}

function freeScore(n: NodeInfo): number {
  const cpuFree = 100 - n.cpuPercent;
  const ramFree = 100 - n.ramPercent;
  const slotFree = ((n.maxJobs - n.activeJobs) / n.maxJobs) * 100;
  return cpuFree * 0.5 + ramFree * 0.3 + slotFree * 0.2;
}
