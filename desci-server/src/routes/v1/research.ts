import { Router } from 'express';
import { getBulkWorksByOrcids } from '../../controllers/research/bulkWorks.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Get bulk works by ORCID list for feed generation
router.post('/works/bulk', asyncHandler(getBulkWorksByOrcids));

export default router;