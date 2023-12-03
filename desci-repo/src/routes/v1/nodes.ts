import { Router } from 'express';
import { createNodeDocument, getNodeDocument } from '../../controllers/nodes/documents.js';
import { ensureApiKey } from '../../middleware/ensureApiKey.js';

const router = Router();

// todo: Add auth jwt verification to get api
router.get(
  '/documents/:uuid',
  [
    /* TODO */
  ],
  getNodeDocument,
);
router.post('/documents/', [ensureApiKey], createNodeDocument);

export default router;
