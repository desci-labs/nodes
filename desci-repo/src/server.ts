// @ts-check
import fs from 'fs';
import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import 'dotenv/config';
import 'reflect-metadata';
import path from 'path';

import * as Sentry from '@sentry/node';
import morgan from 'morgan';
import type { Server as HttpServer } from 'http';

import routes from './routes/routes.js';
import SocketServer from './wsServer.js';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENABLE_SENTRY = process.env.NODE_ENV === 'production';

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
class AppServer {
  #readyResolvers: ((value: any) => void)[] = [];

  #isReady = false;

  app: Express;
  server: HttpServer;
  port: number;
  socketServer: SocketServer;

  constructor() {
    this.app = express();
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

    if (ENABLE_SENTRY) {
      Sentry.init({
        dsn: 'https://d508a5c408f34b919ccd94aac093e076@o1330109.ingest.sentry.io/6619754',
        release: 'desci-nodes-media@' + process.env.npm_package_version,
        integrations: [],
        // Set tracesSampleRate to 1.0 to capture 100%
        // of transactions for performance monitoring.
        // We recommend adjusting this value in production
        tracesSampleRate: 1.0,
      });
      this.app.use(Sentry.Handlers.requestHandler());
      this.app.use(Sentry.Handlers.tracingHandler());
    }

    this.app.use(bodyParser.json({ limit: '100mb' }));
    this.app.use(bodyParser.urlencoded({ extended: false }));

    this.app.set('trust proxy', 2); // detect AWS ELB IP + cloudflare

    try {
      const accessLogStream = fs.createWriteStream(path.join(__dirname, '../log/access.log'), {
        flags: 'a',
      });
      this.app.use(morgan('combined', { stream: accessLogStream }));
    } catch (err) {
      console.log(err);
    }

    this.app.use(cors());
    this.app.use(morgan('combined'));

    this.app.get('/readyz', (_, res) => {
      res.status(200).json({ status: 'ok' });
    });

    this.app.use('/', routes);

    if (ENABLE_SENTRY) {
      this.app.use(Sentry.Handlers.errorHandler());
    }

    this.port = parseInt(process.env.PORT) || 5484;
    this.server = this.app.listen(this.port, () => {
      this.#isReady = true;
      this.#readyResolvers.forEach((resolve) => resolve(true));
      console.log(`Server running on port ${this.port}`);
    });

    this.socketServer = new SocketServer(this.server, this.port);
    // this.repo = this.socketServer.repo;
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

  get repo() {
    return this.socketServer.repo;
  }
}

const server = new AppServer();
export default server;
