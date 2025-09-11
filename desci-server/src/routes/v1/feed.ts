import { Router } from 'express';
import { getOrcidRecommendations } from '../../controllers/feed/recommendations.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Get ORCID recommendations for feed generation
router.get('/recommendations/:orcid', asyncHandler(getOrcidRecommendations));

export default router;