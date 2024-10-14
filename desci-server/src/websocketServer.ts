import { Server as HttpServer } from 'http';

import { createAdapter } from '@socket.io/redis-adapter';
import { ExtendedError, Server, Socket } from 'socket.io';

import { AuthenticatedSocket, socketsEnsureUser } from './internal.js';
import { logger as parentLogger } from './logger.js';
import redisClient from './redisClient.js';

export const initializeWebSocketServer = async (httpServer: HttpServer) => {
  const logger = parentLogger.child({
    module: 'WebsocketServer',
  });

  const io = new Server(httpServer);

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

  try {
    await subClient.connect();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info(
      { redisHost: process.env.REDIS_HOST, redisPort: process.env.REDIS_PORT },
      'Redis adapter connected for WebSocket',
    );
  } catch (error) {
    logger.error({ error }, 'Failed to connect to Redis for WebSocket adapter');
    throw error;
  }

  io.use((socket: Socket, next: (err?: ExtendedError) => void) => {
    socketsEnsureUser(socket, next);
  });

  io.on('error', () => {
    logger.info('websockets error');
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
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

  io.on('connect_error', (error) => {
    logger.error({ error }, 'Connection error occurred');
  });

  return io;
};
