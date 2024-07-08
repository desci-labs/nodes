// import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { logger as parentLogger } from './utils/logger.js';

const logger = parentLogger.child({ module: 'Media Isolated Express Config' });

const app = express();
logger.info(`process.env.PORT: ${process.env.PORT}`);
const PORT = process.env.PORT || 7771;

app.use(helmet());
app.use(express.json());

app.get('/health', (req, res) => {
  return res.send('healthy');
});

app.use('/', routes);

// Keep after all routes
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`[Media Server Isolated]Server is listening on port: ${PORT}`);
});
