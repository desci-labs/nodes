import { Router } from 'express';

import {
  createNodeDocument,
  dispatchDocumentActions,
  dispatchDocumentChange,
  getLatestNodeManifest,
} from '../../controllers/nodes/documents.js';
import { ensureApiKey } from '../../middleware/ensureApiKey.js';

const router = Router();

router.get('/documents/draft/:uuid', [ensureApiKey], getLatestNodeManifest);
router.post('/documents/dispatch', [ensureApiKey], dispatchDocumentChange);
router.post('/documents/actions', [ensureApiKey], dispatchDocumentActions);
router.post('/documents', [ensureApiKey], createNodeDocument);

export default router;
