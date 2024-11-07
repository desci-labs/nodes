// @ts-check
import 'dotenv/config';
import 'reflect-metadata';
import * as child from 'child_process';
import type { Server as HttpServer } from 'http';

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express, Request } from 'express';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { pinoHttp } from 'pino-http';
import { Server as SocketIOServer } from 'socket.io';
import { v4 } from 'uuid';

import { orcidConnect } from './controllers/auth/orcid.js';
import { orcidCheck } from './controllers/auth/orcidNext.js';
import { NotFoundError } from './core/ApiError.js';
import { als, logger as parentLogger } from './logger.js';
import { RequestWithUser } from './middleware/authorisation.js';
import { ensureUserIfPresent } from './middleware/ensureUserIfPresent.js';
import { errorHandler } from './middleware/errorHandler.js';
import { extractAuthToken, extractUserFromToken } from './middleware/permissions.js';
import routes from './routes/index.js';
import { initializeWebSocketServer } from './websocketServer.js';
import { SubmissionQueueJob } from './workers/doiSubmissionQueue.js';
import { runWorkerUntilStopped } from './workers/publish.js';

// const __dirname = path.dirname(__filename);

const logger = parentLogger.child({
  module: 'server.ts',
});

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

  private _io: SocketIOServer | null = null;

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

    // Respond to probes before we do any other work on the request
    this.app.get('/readyz', (_, res) => {
      res.status(200).json({ status: 'ok' });
    });

    // attach user info to every request
    this.app.use(async (req: RequestWithUser, res, next) => {
      const token = await extractAuthToken(req);

      if (!token) {
        req.userAuth = 'anonymous';
      } else {
        const user = await extractUserFromToken(token);
        req.userAuth = `${user?.id}`;
      }

      next();
    });

    // attach trace id to every request
    this.app.use((req: RequestWithUser, res, next) => {
      req.traceId = v4();
      res.header('X-Desci-Trace-Id', req.traceId);

      als.run({ traceId: req.traceId, timing: [new Date()], userAuth: req.userAuth }, () => {
        next();
      });
    });

    this.app.use(helmet());
    this.app.use(bodyParser.json({ limit: '100mb' }));
    this.app.use(bodyParser.urlencoded({ extended: false }));

    this.app.use(cookieParser());
    this.app.set('trust proxy', 2); // detect AWS ELB IP + cloudflare

    // attach all app routes
    this.#attachRouteHandlers();

    // init telementry
    this.#initTelemetry();

    // attach proxy routes
    this.#attachProxies();

    // catch 404 errors and forward to error handler
    this.app.use((_req, _res, next) => next(new NotFoundError()));
    this.app.use(errorHandler);

    this.port = process.env.PORT ? parseInt(process.env.PORT) : 5420;
    this.server = this.app.listen(this.port, () => {
      this.#isReady = true;
      this.#readyResolvers.forEach((resolve) => resolve(true));
      console.log(`Server running on port ${this.port}`);
      if (process.env.NODE_ENV !== 'test') this.#attachWebsockets();
    });

    // start jobs
    // this.startJobs();
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

  async #attachWebsockets() {
    const maxRetries = 3;
    let retries = 0;
    const retryTimeout = 5000;

    while (retries < maxRetries) {
      try {
        this._io = await initializeWebSocketServer(this.server);
        this.app.set('io', this._io);
        logger.info('WebSocket server initialized successfully');
        return;
      } catch (error) {
        retries++;
        logger.error({ error, retries }, 'Failed to initialize WebSocket server, retrying...');
        await new Promise((resolve) => setTimeout(resolve, retryTimeout));
      }
    }

    logger.error('Failed to initialize WebSocket server after maximum retries');
  }

  // websockets getter
  get io(): SocketIOServer | null {
    return this._io;
  }

  #attachRouteHandlers() {
    this.app.get('/version', (req, res) => {
      const revision = child.execSync('git rev-parse HEAD').toString().trim();
      // const sha256 = child.execSync('find /app/desci-server/dist -type f -exec sha256sum \\;').toString().trim();
      res.status(200).json({ revision, npm: process.env.npm_package_version });
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
        autoLogging: {
          ignore: (req) => req.url === '/readyz',
        },
        customProps: (req: RequestWithUser, res) => ({
          userAuth: req.userAuth,
          traceId: (als.getStore() as any)?.traceId,
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
      logger.info('[DeSci Nodes] Telemetry enabled');
      Sentry.init({
        dsn: 'https://d508a5c408f34b919ccd94aac093e076@o1330109.ingest.sentry.io/6619754',
        release: 'desci-nodes-server@' + process.env.npm_package_version,
        integrations: [Sentry.prismaIntegration(), nodeProfilingIntegration()],
        // Set tracesSampleRate to 1.0 to capture 100%
        // of transactions for performance monitoring.
        // We recommend adjusting this value in production
        tracesSampleRate: 1.0,
        profilesSampleRate: 1.0,
      });
      Sentry.setupExpressErrorHandler(this.app);
    } else {
      logger.info('[DeSci Nodes] Telemetry disabled');
    }
  }

  async startJobs() {
    // start doi submission cron job
    SubmissionQueueJob.start();
  }
}
function getRemoteAddress(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  } else {
    return req.socket.remoteAddress;
  }
}
export const server = new AppServer();
