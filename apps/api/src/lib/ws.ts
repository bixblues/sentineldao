import type { ServerWebSocket } from "bun";

type WSData = { id: string };

class WebSocketManager {
  private clients = new Map<string, ServerWebSocket<WSData>>();

  add(ws: ServerWebSocket<WSData>) {
    this.clients.set(ws.data.id, ws);
    console.log(`[WS] Client connected: ${ws.data.id} (total: ${this.clients.size})`);
  }

  remove(ws: ServerWebSocket<WSData>) {
    this.clients.delete(ws.data.id);
    console.log(`[WS] Client disconnected: ${ws.data.id} (total: ${this.clients.size})`);
  }

  broadcast(type: string, payload: unknown) {
    const message = JSON.stringify({ type, payload, timestamp: Date.now() });
    for (const [id, ws] of this.clients) {
      try {
        ws.send(message);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  get count() {
    return this.clients.size;
  }
}

export const wsManager = new WebSocketManager();
