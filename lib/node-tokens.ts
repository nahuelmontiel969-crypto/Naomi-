// lib/node-tokens.ts
//
// Mapea "token del nodo" -> "nodeId" sin guardar los tokens en texto plano
// en el registro ni en logs. Se define un token por nodo vía variables de
// entorno: NODE_TOKEN_<ID_EN_MAYUSCULAS>=<token-secreto>.
//
// Ejemplo .env del panel:
//   NODE_TOKEN_ORACLE_VM_1=8f2a...
//   NODE_TOKEN_ORACLE_VM_2=c91b...
//   NODE_TOKEN_HETZNER_1=771e...
//
// Así cada nodo tiene un secreto independiente y revocable sin tocar a
// los demás, y el mapeo vive solo en memoria del proceso (nunca en disco
// aparte del .env que ya proteges).

import crypto from "crypto";

function loadNodeTokenMap(): Map<string, string> {
  const map = new Map<string, string>(); // token -> nodeId
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^NODE_TOKEN_(.+)$/);
    if (match && value) {
      const nodeId = match[1].toLowerCase().replace(/_/g, "-");
      map.set(value, nodeId);
    }
  }
  return map;
}

// Se carga una sola vez al iniciar el proceso; si agregas un nodo nuevo,
// hace falta reiniciar el panel (o cambiar esto por lectura desde una
// tabla/Redis si el equipo crece mucho).
const tokenToNode = loadNodeTokenMap();

/**
 * Verifica el header Authorization: Bearer <token> de una request de nodo
 * y devuelve el nodeId correspondiente, o null si el token no es válido.
 * Usa comparación en tiempo constante para no filtrar el token por timing.
 */
export function verifyNodeToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  for (const [validToken, nodeId] of tokenToNode.entries()) {
    if (timingSafeEqual(token, validToken)) return nodeId;
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
