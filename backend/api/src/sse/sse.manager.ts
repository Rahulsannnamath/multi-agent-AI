// apps/api/src/sse/sse.manager.ts
// Server-Sent Events for real-time frontend updates

import type { Response } from 'express';

interface SSEClient {
  id: string;
  projectId: string;
  res: Response;
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  addClient(clientId: string, projectId: string, res: Response): void {
    this.clients.set(clientId, { id: clientId, projectId, res });
    res.on('close', () => {
      this.clients.delete(clientId);
    });
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  sendToProject(projectId: string, event: { type: string; data: unknown }): void {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const client of this.clients.values()) {
      if (client.projectId === projectId || client.projectId === '*') {
        try {
          client.res.write(payload);
        } catch {
          this.clients.delete(client.id);
        }
      }
    }
  }

  broadcast(event: { type: string; data: unknown }): void {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const client of this.clients.values()) {
      try {
        client.res.write(payload);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }
}

export const sseManager = new SSEManager();
