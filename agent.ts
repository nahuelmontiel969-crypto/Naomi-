// worker-agent/agent.ts
//
// Se instala en CADA nodo (VM/host) que quieras sumar al clúster.
// Corre como servicio systemd propio (independiente del terminal-agent
// que ya tienes). Dos responsabilidades:
//   1. Cada 5s reporta su CPU/RAM/disco al panel central.
//   2. Expone un endpoint local para recibir y ejecutar jobs.

import express from "express";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const NODE_ID = process.env.NODE_ID!; // ej: "oracle-vm-2"
const NODE_TOKEN = process.env.NODE_TOKEN!; // token de este nodo, dado por el panel
const PANEL_URL = process.env.PANEL_URL!; // ej: https://tu-panel.example.com
const MAX_JOBS = Number(process.env.MAX_JOBS ?? 2);
const PORT = Number(process.env.AGENT_PORT ?? 8090);

let activeJobs = 0;

async function reportHeartbeat() {
  const cpuPercent = await currentCpuPercent();
  const ramPercent = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;

  try {
    await fetch(`${PANEL_URL}/api/vm/nodes/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NODE_TOKEN}`,
      },
      body: JSON.stringify({
        label: NODE_ID,
        cpuPercent,
        ramPercent,
        diskPercent: 0, // TODO: calcular con `df` si lo necesitas en el dashboard
        activeJobs,
        maxJobs: MAX_JOBS,
      }),
    });
  } catch {
    // Si el panel no responde, el nodo simplemente se verá "offline" allá.
    // No rompemos el agente por un heartbeat fallido.
  }
}

function currentCpuPercent(): Promise<number> {
  return new Promise((resolve) => {
    const start = os.cpus();
    setTimeout(() => {
      const end = os.cpus();
      let idleDiff = 0, totalDiff = 0;
      for (let i = 0; i < start.length; i++) {
        const s = start[i].times, e = end[i].times;
        const idle = e.idle - s.idle;
        const total = (e.user - s.user) + (e.nice - s.nice) + (e.sys - s.sys) + idle + (e.irq - s.irq);
        idleDiff += idle;
        totalDiff += total;
      }
      resolve(100 - (100 * idleDiff) / totalDiff);
    }, 200);
  });
}

const app = express();
app.use(express.json());

app.post("/jobs/run", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${NODE_TOKEN}`) return res.status(401).json({ error: "unauthorized" });

  if (activeJobs >= MAX_JOBS) {
    return res.status(503).json({ error: "nodo saturado, reintentar en otro" });
  }

  const { command, cwd } = req.body;
  activeJobs++;
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout: 5 * 60_000 });
    res.json({ ok: true, stdout, stderr });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    activeJobs--;
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[worker-agent:${NODE_ID}] escuchando en 127.0.0.1:${PORT} (detrás de túnel)`);
  setInterval(reportHeartbeat, 5000);
  reportHeartbeat();
});
