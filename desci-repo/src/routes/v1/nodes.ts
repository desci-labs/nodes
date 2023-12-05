import { Router } from 'express';
import { createNodeDocument, getNodeDocument } from '../../controllers/nodes/documents.js';
import { ensureApiKey } from '../../middleware/ensureApiKey.js';
import { ensureUser } from '../../middleware/permissions.js';
import { ensureNodeAccess } from '../../middleware/nodeGuard.js';

const router = Router();

// todo: Add auth jwt verification to get api
router.get('/documents/:uuid', [ensureNodeAccess], getNodeDocument);
router.post('/documents/', [ensureApiKey], createNodeDocument);

export default router;
