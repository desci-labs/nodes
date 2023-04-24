import 'dotenv/config';
import 'reflect-metadata';
import fs from 'fs';
import path from 'path';

import * as Sentry from '@sentry/node';
import bodyParser from 'body-parser';
import express from 'express';
import fileupload from 'express-fileupload';
import morgan from 'morgan';

import routes from './routes';

export const app = express();

const ENABLE_SENTRY = process.env.NODE_ENV != 'dev';

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

// if (ENABLE_SENTRY) {
//   Sentry.init({
//     dsn: 'https://d508a5c408f34b919ccd94aac093e076@o1330109.ingest.sentry.io/6619754',
//     release: 'desci-nodes-media@' + process.env.npm_package_version,
//     integrations: [],
//     // Set tracesSampleRate to 1.0 to capture 100%
//     // of transactions for performance monitoring.
//     // We recommend adjusting this value in production
//     tracesSampleRate: 1.0,
//   });
//   app.use(Sentry.Handlers.requestHandler());
//   app.use(Sentry.Handlers.tracingHandler());
// }

app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(fileupload());

app.set('trust proxy', 2); // detect AWS ELB IP + cloudflare

try {
  const accessLogStream = fs.createWriteStream(path.join(__dirname, '../log/access.log'), {
    flags: 'a',
  });
  app.use(morgan('combined', { stream: accessLogStream }));
} catch (err) {
  console.log(err);
}
app.use(morgan('combined'));

app.get('/readyz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/', routes);

if (ENABLE_SENTRY) {
  app.use(Sentry.Handlers.errorHandler());
}

const port = process.env.PORT || 5454;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
