import { Router } from 'express';

import { addComment } from '../../controllers/attestations/addComment.js';
import { addReaction } from '../../controllers/attestations/addReaction.js';
import { addVerification } from '../../controllers/attestations/addVerification.js';
import { removeComment } from '../../controllers/attestations/removeComment.js';
import { removeReaction } from '../../controllers/attestations/removeReaction.js';
import { removeVerification } from '../../controllers/attestations/removeVerification.js';
import { showNodeAttestations } from '../../controllers/attestations/show.js';
import { listCommunities } from '../../controllers/community/list.js';
import { listCurated } from '../../controllers/community/listCurated.js';
import { showCommunity } from '../../controllers/community/show.js';
import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

router.get('/:dpid', [], showNodeAttestations);

router.post('/comment', [ensureUser], addComment);
router.post('/reaction', [ensureUser], addReaction);
router.post('/verification', [ensureUser], addVerification);

router.delete('/comment', [ensureUser], removeComment);
router.delete('/reaction', [ensureUser], removeReaction);
router.delete('/verification', [ensureUser], removeVerification);

export default router;
