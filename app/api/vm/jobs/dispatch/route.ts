// app/api/vm/jobs/dispatch/route.ts
//
// El panel recibe la solicitud de job (desde el móvil), el scheduler elige
// el nodo con más capacidad libre, y se reenvía la ejecución al
// worker-agent de ese nodo vía su endpoint interno /jobs/run.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware-helpers";
import { pickNodeForJob } from "@/lib/scheduler";
import { getNode } from "@/lib/node-registry";

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const job = await req.json(); // { command, cwd, ... } — el shape que ya usa tu agente

  const node = pickNodeForJob();
  if (!node) {
    return NextResponse.json(
      { error: "no hay nodos disponibles con capacidad libre" },
      { status: 503 }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${nodeBaseUrl(node.id)}/jobs/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env[`NODE_TOKEN_${node.id.toUpperCase()}`]}`,
      },
      body: JSON.stringify(job),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const result = await res.json();
    return NextResponse.json({ nodeId: node.id, ...result });
  } catch (e) {
    clearTimeout(timer);
    return NextResponse.json(
      { error: "fallo al despachar al nodo", nodeId: node.id, detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 }
    );
  }
}

// Mapea id de nodo -> URL de su túnel/endpoint interno.
// En prod: guarda esto en variables de entorno o en el propio registro
// (agrégalo como campo `internalUrl` en NodeInfo cuando el nodo hace heartbeat).
function nodeBaseUrl(nodeId: string): string {
  const url = getNode(nodeId);
  if (!url) throw new Error(`nodo ${nodeId} no encontrado`);
  return process.env[`NODE_URL_${nodeId.toUpperCase()}`] ?? "";
}
