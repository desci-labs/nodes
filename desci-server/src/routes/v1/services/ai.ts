import { Router } from 'express';

import { getResults } from '../../../controllers/externalApi/RefereeRecommender/getResults.js';
import { getUsageStatus } from '../../../controllers/externalApi/RefereeRecommender/getUsageStatus.js';
import { generatePresignedUrl } from '../../../controllers/externalApi/RefereeRecommender/issuePresignedUrl.js';
import { triggerRecommendation } from '../../../controllers/externalApi/RefereeRecommender/triggerRecommendation.js';
import { getResearchAssistantUsageStatus } from '../../../controllers/externalApi/ResearchAssistant/getUsageStatus.js';
import { ensureUser } from '../../../middleware/permissions.js';

const router = Router();

// Referee Recommender API Routes
router.post('/referee-recommender/presigned-url', [ensureUser], generatePresignedUrl);
router.post('/referee-recommender/trigger', [ensureUser], triggerRecommendation);
router.get('/referee-recommender/results', [ensureUser], getResults);
router.get('/referee-recommender/usage', [ensureUser], getUsageStatus);
router.get('/research-assistant/usage', [ensureUser], getResearchAssistantUsageStatus);

export default router;
