import { Router } from 'express';
import { createNodeDocument, getNodeDocument } from '../../controllers/nodes/documents.js';
import { ensureApiKey } from '../../middleware/ensureApiKey.js';
import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

// todo: Add auth jwt verification to get api
router.get('/documents/:uuid', [ensureUser], getNodeDocument);
router.post('/documents/', [ensureApiKey], createNodeDocument);

export default router;
