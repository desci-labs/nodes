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
