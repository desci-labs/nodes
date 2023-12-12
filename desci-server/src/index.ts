import 'dotenv/config';
import 'reflect-metadata';
import { Repo, type RepoConfig } from '@automerge/automerge-repo';
import { NodeWSServerAdapter } from '@automerge/automerge-repo-network-websocket';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { pinoHttp } from 'pino-http';
import { WebSocketServer } from 'ws';

import './utils/response/customSuccess.js';
import { prisma } from './client.js';
import { orcidConnect } from './controllers/auth/orcid.js';
import { orcidCheck } from './controllers/auth/orcidNext.js';
import { logger } from './logger.js';
import { ensureUserIfPresent } from './middleware/ensureUserIfPresent.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

export const app = express();

const ENABLE_TELEMETRY = process.env.NODE_ENV === 'production';
const IS_DEV = !ENABLE_TELEMETRY;
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
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
} else {
  logger.info('[DeSci Nodes] Telemetry disabled');
}

app.use(
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
  'https://dev.desci.com',
  'https://nodes-devel.desci.com',
  'https://nodes-dev-vercel.desci.com',
  'https://nodes-v1.desci.com',
  'https://nodes-v1-dev.desci.com',
  'd2195goqok3wlx.amplifyapp.com',
  'd3ge8gcb3rt5iw.amplifyapp.com',
  'desci.com',
  'gitpod.io',
  'loca.lt' /** NOT SECURE */,
  'vercel.app' /** NOT SECURE */,
];

const corsOptionsDelegate = function (req, callback) {
  let corsOptions;
  const origin = req.header('Origin');
  const allowed = allowlist.indexOf(origin) !== -1;
  logger.info({ fn: 'corsOptionsDelegate', origin, allowed }, `in cors ${origin} ${allowed}`);
  if (allowed) {
    corsOptions = { origin: true, credentials: true }; // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false }; // disable CORS for this request
  }
  callback(null, corsOptions); // callback expects two parameters: error and options
};

// app.use(cors(corsOptionsDelegate));
app.use(function (req, res, next) {
  const origin = req.headers.origin;
  if (
    allowlist.indexOf(origin) !== -1 ||
    allowlist.filter((a) => a.indexOf('http') != 0 && origin && origin.endsWith(a)).length
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,sentry-trace,baggage');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    // if (req.headers['set-cookie']) {
    //   res.setHeader('set-cookie', req.headers['set-cookie']);
    // }
  }
  next();
});

app.use(
  createProxyMiddleware({
    target: process.env.NODES_MEDIA_SERVER_URL,
    changeOrigin: true,
    pathFilter: ['/v1/latex/upload', '/v1/latex/compile'],
  }),
);

// app.use(cors());
app.use(helmet());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: false }));
const oneYear = 1000 * 60 * 60 * 24 * 365;
// app.use(
//   session({
//     secret: process.env.SESSION_KEY,
//     resave: true,
//     saveUninitialized: true,
//     cookie: { maxAge: oneYear, ...(process.env.NODE_ENV == 'dev' ? {} : { sameSite: 'none', secure: true }) },
//     store: new PrismaSessionStore(prisma, {
//       checkPeriod: 2 * 60 * 1000, //ms
//       dbRecordIdIsSessionId: true,
//       dbRecordIdFunction: undefined,
//     }),
//   }),
// );
app.use(cookieParser());
app.set('trust proxy', 2); // detect AWS ELB IP + cloudflare

app.get('/readyz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/orcid', orcidConnect);
// orcid/next is the v2 orcid flow
app.post('/orcid/next', [ensureUserIfPresent], orcidCheck());

app.use('/', routes);

if (ENABLE_TELEMETRY) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use(errorHandler);

const port = process.env.PORT || 5420;
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
// const wsServer = new WebSocketServer({ noServer: true });
// const config = {
//   network: [new NodeWSServerAdapter(wsServer)],
// };
// const repo = new Repo(config);

// const server = app.listen(port, () => {
//   logger.info(`Server running on port ${port}`);
// });
