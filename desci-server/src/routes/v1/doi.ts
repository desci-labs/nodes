import { Router } from 'express';

import { checkMintability, retrieveDoi } from '../../controllers/doi/check.js';
import { mintDoi } from '../../controllers/doi/mint.js';
import { retrieveDoiSchema } from '../../controllers/doi/schema.js';
import { ensureNodeAccess } from '../../middleware/authorisation.js';
import { ensureUser } from '../../middleware/permissions.js';
import { validate } from '../../middleware/validator.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.post('/check/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(checkMintability));
router.post('/mint/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(mintDoi));
router.get('/', [validate(retrieveDoiSchema)], asyncHandler(retrieveDoi));

export default router;
