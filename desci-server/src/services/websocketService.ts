// services/websocketService.ts
import { Server as HttpServer } from 'http';

import { createAdapter } from '@socket.io/redis-adapter';
import { ExtendedError, Server as SocketIOServer, Socket } from 'socket.io';

import { logger as parentLogger } from '../logger.js';
import { AuthenticatedSocket, socketsEnsureUser } from '../middleware/permissions.js';
import { redisClient } from '../redisClient.js';

const logger = parentLogger.child({ module: 'websocketService' });

export enum WebSocketEventType {
  NOTIFICATION = 'notification',
}

export type WebsocketEventPayload = {
  type: WebSocketEventType;
  data?: any;
};

let io: SocketIOServer | null = null;

const setupRedisAdapter = async (socketServer: SocketIOServer): Promise<void> => {
  const useRedis = !!process.env.REDIS_HOST;

  if (!useRedis) {
    logger.info('Redis host not configured. Skipping Redis adapter initialization.');
    return;
  }

  try {
    logger.info('Redis host configured. Initializing with Redis adapter.');

    if (!redisClient.isOpen) {
      logger.info('Waiting for Redis client to connect...');
      await new Promise<void>((resolve) => {
        redisClient.on('connect', () => {
          logger.info('Redis client connected');
          resolve();
        });
      });
    }

    const pubClient = redisClient;
    const subClient = pubClient.duplicate();
    await subClient.connect();

    socketServer.adapter(createAdapter(pubClient, subClient));

    logger.info(
      { redisHost: process.env.REDIS_HOST, redisPort: process.env.REDIS_PORT },
      'Redis adapter connected for WebSocket',
    );
  } catch (error) {
    logger.error({ error }, 'Failed to connect to Redis for WebSocket adapter. Continuing without Redis.');
  }
};

const setupEventHandlers = (socketServer: SocketIOServer) => {
  socketServer.on('error', () => {
    logger.info('websockets error');
  });

  socketServer.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('New socket connection');
    const { userId } = socket.data;
    const clientIp = socket.handshake.headers['x-real-ip'] || socket.handshake.address;
    logger.info({ userId, clientIp }, 'User connected');

    socket.on('authenticate', (userId: string) => {
      logger.info({ socketId: socket.id, userId }, `User ${userId} authenticated`);
      socket.join(`user-${userId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info({ userId, reason }, 'User disconnected');
    });

    socket.on('error', (error) => {
      logger.error({ userId, error }, 'Socket error occurred');
    });
  });

  socketServer.on('connect_error', (error) => {
    logger.error({ error }, 'Connection error occurred');
  });
};

export const initializeWebSockets = async (httpServer: HttpServer): Promise<void> => {
  if (io) {
    logger.warn('WebSocket server already initialized');
    return;
  }

  try {
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: true,
        credentials: true,
      },
    });

    // Set up authentication middleware
    io.use((socket: Socket, next: (err?: ExtendedError) => void) => {
      socketsEnsureUser(socket, next);
    });

    // Set up Redis adapter if configured
    await setupRedisAdapter(io);

    // Set up event handlers
    setupEventHandlers(io);

    logger.info('WebSocket server initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize WebSocket server');
    throw error;
  }
};

export const emitWebsocketEvent = (userId: number, payload: WebsocketEventPayload): void => {
  if (!io) {
    logger.error('WebSocket server not initialized');
    return;
  }

  try {
    io.to(`user-${userId}`).emit(payload.type, payload.data);
    logger.info({ userId, payload }, 'WebSocket event emitted successfully');
  } catch (error) {
    logger.error({ userId, payload, error }, 'Failed to emit WebSocket event');
  }
};

export const getIO = (): SocketIOServer | null => io;
