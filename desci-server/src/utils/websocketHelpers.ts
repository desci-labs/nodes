import { logger as parentLogger } from '../logger.js';
import { server } from '../server.js';

const logger = parentLogger.child({ module: 'WebSocketHelpers' });

export enum WebSocketEventType {
  NOTIFICATION = 'notification',
}

type WebsocketEventPayload = {
  type: WebSocketEventType;
  data?: any;
};

/*
 ** Emit a WebSocket event to a specific user, be aware this isn't securely authenticated, don't send sensitive data
 */
export const emitWebsocketEvent = (userId: number, payload: WebsocketEventPayload): void => {
  if (!server.io) {
    logger.error({ module: 'WebSocketHelpers::emitWebsocketEvent' }, 'WebSocket server not initialized');
    return;
  }

  try {
    server.io.to(`user-${userId}`).emit('notification');
    // server.io.to(`user-${userId}`).emit(payload.type, JSON.stringify(payload.data));
    logger.info(
      { module: 'WebSocketHelpers::emitWebsocketEvent', userId, payload },
      'WebSocket event emitted successfully',
    );
  } catch (error) {
    logger.error(
      { module: 'WebSocketHelpers::emitWebsocketEvent', userId, payload, error },
      'Failed to emit WebSocket event',
    );
  }
};
