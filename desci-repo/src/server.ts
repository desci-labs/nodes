import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const ENABLE_TELEMETRY = process.env.NODE_ENV === 'production';
const IS_DEV = !ENABLE_TELEMETRY;

// @ts-check
import 'dotenv/config';
import 'reflect-metadata';
import path from 'path';

import express from 'express';
import type { Express, Request } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import type { Server as HttpServer } from 'http';
import { v4 } from 'uuid';

import { als, logger } from './logger.js';
import routes from './routes/index.js';
// import SocketServer from './wsServer.js';

import { fileURLToPath } from 'url';
import { socket as wsSocket } from './repo.js';

import { extractAuthToken, extractUserFromToken } from './middleware/permissions.js';
import { pinoHttp } from 'pino-http';
import { RequestWithUser } from './middleware/guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverUuid = v4();

const allowlist = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:61440',
  'http://localhost:3002',
  'http://host.docker.internal:3000',
  'http://host.docker.internal:3002',
  'http://127.0.0.1:3000',
  'https://nodes.desci.com',
  'https://nodes-dev.desci.com',
  'https://nodes-demo.desci.com',
  'd2195goqok3wlx.amplifyapp.com',
  'd3ge8gcb3rt5iw.amplifyapp.com',
  'desci.com',
  'gitpod.io',
  'loca.lt' /** NOT SECURE */,
  'vercel.app' /** NOT SECURE */,
];

function getRemoteAddress(req: Request) {
  let xForwardedFor = req.headers['x-forwarded-for'];
  xForwardedFor = Array.isArray(xForwardedFor) ? xForwardedFor.join(',') : xForwardedFor;
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  } else {
    return req.socket.remoteAddress;
  }
}

class AppServer {
  #readyResolvers: ((value: any) => void)[] = [];

  #isReady = false;

  app: Express;
  server: HttpServer;
  port: number;

  constructor() {
    this.app = express();

    this.#initSerialiser();

    this.app.use(function (req, res, next) {
      const origin = req.headers.origin;
      if (
        allowlist.indexOf(origin!) !== -1 ||
        allowlist.filter((a) => a.indexOf('http') != 0 && origin && origin.endsWith(a)).length
      ) {
        res.setHeader('Access-Control-Allow-Origin', origin!);
        res.setHeader(
          'Access-Control-Allow-Headers',
          'X-Requested-With,Content-Type,Authorization,sentry-trace,baggage',
        );
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        // if (req.headers['set-cookie']) {
        //   res.setHeader('set-cookie', req.headers['set-cookie']);
        // }
      }
      next();
    });

    // attach trace id to every request
    this.app.use((req: RequestWithUser, res, next) => {
      req.traceId = v4();
      req.callerTraceId = req.headers['x-api-remote-traceid'] as string;

      res.header('X-Desci-Trace-Id', req.traceId);
      res.header('X-Desci-Request-Trace-Id', req.headers['x-api-remote-traceid']);

      als.run({ traceId: req.traceId, callerTraceId: req.callerTraceId, timing: [new Date()] }, () => {
        next();
      });
    });

    // init telementry
    this.#initTelemetry();

    this.app.use(bodyParser.json({ limit: '100mb' }));
    this.app.use(bodyParser.urlencoded({ extended: false }));

    this.app.set('trust proxy', 2); // detect AWS ELB IP + cloudflare

    this.app.use(cors());

    this.app.get('/readyz', (_, res) => {
      res.status(200).json({ status: 'ok' });
    });

    this.app.use('/', routes);
    this.app.get('/id', (_, res) => {
      res.status(200).json({ id: serverUuid });
    });

    this.port = process.env.PORT ? parseInt(process.env.PORT) : 5484;
    logger.info(`Server starting on port ${this.port}`);
    this.server = this.app.listen(this.port, () => {
      this.#isReady = true;
      this.#readyResolvers.forEach((resolve) => resolve(true));
      logger.info(`Server running on port ${this.port}`);
    });

    wsSocket.on('listening', () => {
      logger.info({ module: 'WebSocket SERVER', port: wsSocket.address() }, 'WebSocket Server Listening');
    });
    wsSocket.on('connection', async (socket, request) => {
      try {
        logger.info({ module: 'WebSocket SERVER' }, 'WebSocket Connection Attempt');
        const token = await extractAuthToken(request as Request);
        const authUser = await extractUserFromToken(token!);
        if (!authUser) {
          socket.close(); // Close connection if user is not authorized
          return;
        }
        logger.info(
          { module: 'WebSocket SERVER', id: authUser.id, name: authUser.name },
          'WebSocket Connection Authorised',
        );
        socket.on('message', (message) => {
          // Handle incoming messages
          // console.log(`Received message: ${message}`);
        });
        // Additional event listeners (e.g., 'close', 'error') can be set up here
      } catch (error) {
        socket.close(); // Close the connection in case of an error
        logger.error(error, 'Error during WebSocket connection');
      }
    });
  }

  #initSerialiser() {
    this.app.use(
      pinoHttp({
        logger,
        customProps: (req: RequestWithUser) => ({
          traceId: (als.getStore() as any)?.traceId,
          callerTraceId: req.headers['x-api-remote-traceid'],
          http: 1,
          remoteAddress: getRemoteAddress(req),
        }),
        serializers: {
          res: (res) => {
            if (IS_DEV) {
              return {
                responseTime: res.responseTime,
                status: res.statusCode,
              };
            } else {
              return res;
            }
          },
          req: (req) => {
            if (IS_DEV) {
              return {
                query: req.query,
                params: req.params,
                method: req.method,
                url: req.url,
              };
            } else {
              return req;
            }
          },
        },
      }),
    );
  }

  #initTelemetry() {
    if (ENABLE_TELEMETRY) {
      logger.info('[DeSci Repo] Telemetry enabled');
      Sentry.init({
        dsn: 'https://d508a5c408f34b919ccd94aac093e076@o1330109.ingest.sentry.io/6619754',
        release: 'desci-nodes-repo@' + process.env.npm_package_version,
        integrations: [nodeProfilingIntegration()],
        // Set tracesSampleRate to 1.0 to capture 100%
        // of transactions for performance monitoring.
        // We recommend adjusting this value in production
        tracesSampleRate: 1.0,
        profilesSampleRate: 1.0,
      });
      // Sentry.setupExpressErrorHandler(this.app);
      this.app.use(Sentry.expressErrorHandler());
    } else {
      logger.info('[DeSci Repo] Telemetry disabled');
    }
  }

  async ready() {
    if (this.#isReady) {
      return true;
    }

    return new Promise((resolve) => {
      this.#readyResolvers.push(resolve);
    });
  }
}

export const server = new AppServer();
