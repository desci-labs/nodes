// @ts-check
import 'dotenv/config';
import 'reflect-metadata';
import * as child from 'child_process';
// import fs from 'fs';
import type { Server as HttpServer } from 'http';
// import path from 'path';
import { fileURLToPath } from 'url';

import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express, Request } from 'express';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { pinoHttp } from 'pino-http';
import { v4 } from 'uuid';

import { prisma } from './client.js';
// eslint-disable-next-line import/order
import routes from './routes/index.js';
import { orcidConnect } from './controllers/auth/orcid.js';
import { orcidCheck } from './controllers/auth/orcidNext.js';
import { logger } from './logger.js';
import { ensureUserIfPresent } from './middleware/ensureUserIfPresent.js';
import { errorHandler } from './middleware/errorHandler.js';
// import SocketServer from './wsServer.js';
import { extractAuthToken, extractUserFromToken } from './middleware/permissions.js';
// import { socket as wsSocket } from './repo.js';
const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

const ENABLE_TELEMETRY = process.env.NODE_ENV === 'production';
const IS_DEV = !ENABLE_TELEMETRY;

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

const serverUuid = v4();

class AppServer {
  #readyResolvers: ((value: any) => void)[] = [];

  #isReady = false;

  app: Express;
  server: HttpServer;
  port: number;
  // socketServer: SocketServer;

  constructor() {
    this.app = express();
    this.#initSerialiser();

    this.app.use(function (req, res, next) {
      const origin = req.headers.origin;
      if (
        allowlist.indexOf(origin) !== -1 ||
        allowlist.filter((a) => a.indexOf('http') != 0 && origin && origin.endsWith(a)).length
      ) {
        res.setHeader('Access-Control-Allow-Origin', origin);
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

    this.#attachProxies();
    this.#initTelemetry();

    this.app.use(helmet());
    this.app.use(bodyParser.json({ limit: '100mb' }));
    this.app.use(bodyParser.urlencoded({ extended: false }));

    this.app.use(cookieParser());
    this.app.set('trust proxy', 2); // detect AWS ELB IP + cloudflare

    this.#attachRouteHandlers();

    this.app.use(errorHandler);

    this.port = parseInt(process.env.PORT) || 5420;
    this.server = this.app.listen(this.port, () => {
      this.#isReady = true;
      this.#readyResolvers.forEach((resolve) => resolve(true));
      console.log(`Server running on port ${this.port}`);
    });

    // this.socketServer = new SocketServer(this.server, this.port);
    // wsSocket.on('listening', () => {
    //   logger.info({ module: 'WebSocket SERVER', port: wsSocket.address() }, 'WebSocket Server Listening');
    // });
    // wsSocket.on('connection', async (socket, request) => {
    //   try {
    //     const token = await extractAuthToken(request as Request);
    //     const authUser = await extractUserFromToken(token);
    //     if (!authUser) {
    //       socket.close(); // Close connection if user is not authorized
    //       return;
    //     }
    //     logger.info(
    //       { module: 'WebSocket SERVER', id: authUser.id, name: authUser.name },
    //       'WebSocket Connection Authorised',
    //     );
    //     socket.on('message', (message) => {
    //       // Handle incoming messages
    //       // console.log(`Received message: ${message}`);
    //     });
    //     // Additional event listeners (e.g., 'close', 'error') can be set up here
    //   } catch (error) {
    //     socket.close(); // Close the connection in case of an error
    //     logger.error(error, 'Error during WebSocket connection');
    //   }
    // });
  }

  get httpServer() {
    return this.httpServer;
  }

  async ready() {
    if (this.#isReady) {
      return true;
    }

    return new Promise((resolve) => {
      this.#readyResolvers.push(resolve);
    });
  }

  #attachRouteHandlers() {
    this.app.get('/readyz', (_, res) => {
      res.status(200).json({ status: 'ok' });
    });
    this.app.get('/version', (req, res) => {
      const revision = child.execSync('git rev-parse HEAD').toString().trim();
      // const sha256 = child.execSync('find /app/desci-server/dist -type f -exec sha256sum \\;').toString().trim();
      res.status(200).json({ revision });
    });
    this.app.get('/id', (req, res) => {
      res.status(200).json({ id: serverUuid, affinity: req.cookies['stickie-dev-ingress61'] });
    });
    this.app.get('/orcid', orcidConnect);
    this.app.post('/orcid/next', [ensureUserIfPresent], orcidCheck());
    this.app.use('/', routes);
  }

  #attachProxies() {
    this.app.use(
      createProxyMiddleware({
        target: process.env.NODES_MEDIA_SERVER_URL,
        changeOrigin: true,
        pathFilter: ['/v1/latex/upload', '/v1/latex/compile'],
      }),
    );
  }

  #initSerialiser() {
    this.app.use(
      pinoHttp({
        logger,
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
      logger.info('[DeSci Nodes] Telemetry enabled');
      Sentry.init({
        dsn: 'https://d508a5c408f34b919ccd94aac093e076@o1330109.ingest.sentry.io/6619754',
        release: 'desci-nodes-server@' + process.env.npm_package_version,
        integrations: [new Tracing.Integrations.Prisma({ client: prisma })],
        // Set tracesSampleRate to 1.0 to capture 100%
        // of transactions for performance monitoring.
        // We recommend adjusting this value in production
        tracesSampleRate: 1.0,
      });
      this.app.use(Sentry.Handlers.requestHandler());
      this.app.use(Sentry.Handlers.tracingHandler());
      this.app.use(Sentry.Handlers.errorHandler());
    } else {
      logger.info('[DeSci Nodes] Telemetry disabled');
    }
  }
}

export const server = new AppServer();
