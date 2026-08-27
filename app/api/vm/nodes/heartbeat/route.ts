// app/api/vm/nodes/heartbeat/route.ts
//
// Cada worker-agent hace POST aquí cada 5s con su propio token de nodo.
// Reutiliza tu mismo patrón de auth (token obligatorio), pero aquí el
// token identifica AL NODO, no a un usuario del panel.

import { NextRequest, NextResponse } from "next/server";
import { upsertNode, clusterSummary } from "@/lib/node-registry";
import { verifyNodeToken } from "@/lib/node-tokens";

export async function POST(req: NextRequest) {
  const nodeId = verifyNodeToken(req); // debe validar Authorization: Bearer <token-del-nodo>
  if (!nodeId) {
    return NextResponse.json({ error: "invalid node token" }, { status: 401 });
  }

  const body = await req.json();
  upsertNode(nodeId, {
    label: body.label ?? nodeId,
    cpuPercent: Number(body.cpuPercent) || 0,
    ramPercent: Number(body.ramPercent) || 0,
    diskPercent: Number(body.diskPercent) || 0,
    activeJobs: Number(body.activeJobs) || 0,
    maxJobs: Number(body.maxJobs) || 1,
  });

  return NextResponse.json({ ok: true, cluster: clusterSummary() });
}
