import { Router } from 'express';

const router = Router();

router.get('/', (req, res, next) => {
  res.status(200).header('Content-Type', 'text/html').send(`DeSci Nodes Server <a href="https://docs.desci.com" target="_blank" rel="noopener noreferrer">[docs]</a>`);
});

export default router;
