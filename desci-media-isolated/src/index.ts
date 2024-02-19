import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

const app = express();
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
  console.log(`[Media Server Isolated]Server is listening on port: ${PORT}`);
});
