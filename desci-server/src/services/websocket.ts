import { Server as SocketIOServer } from 'socket.io';

import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({ module: 'WebSocketService' });

export enum WebSocketEventType {
  NOTIFICATION = 'notification',
}

type WebsocketEventPayload = {
  type: WebSocketEventType;
  data?: any;
};

class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer | null = null;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  setServer(io: SocketIOServer) {
    this.io = io;
  }

  emitEvent(userId: number, payload: WebsocketEventPayload): void {
    if (!this.io) {
      logger.error('WebSocket server not initialized');
      return;
    }

    try {
      this.io.to(`user-${userId}`).emit('notification');
      logger.info({ userId, payload }, 'WebSocket event emitted successfully');
    } catch (error) {
      logger.error({ userId, payload, error }, 'Failed to emit WebSocket event');
    }
  }
}

export const wsService = WebSocketService.getInstance();
