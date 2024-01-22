import { Router } from 'express';
import { createNodeDocument, getLatestNodeManifest, getNodeDocument } from '../../controllers/nodes/documents.js';
import { ensureApiKey } from '../../middleware/ensureApiKey.js';
import { ensureNodeAccess } from '../../middleware/guard.js';

const router = Router();

router.get('/documents/:uuid', [ensureNodeAccess], getNodeDocument);
router.get('/documents/getLatestManifest/:uuid', [ensureApiKey], getLatestNodeManifest);
router.post('/documents/', [ensureApiKey], createNodeDocument);

export default router;
