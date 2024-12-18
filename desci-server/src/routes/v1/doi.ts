import { Router } from 'express';

import { checkMintability, retrieveDoi } from '../../controllers/doi/check.js';
import { retrieveDoiSchema } from '../../controllers/doi/schema.js';
import { ensureNodeAccess } from '../../middleware/authorisation.js';
import { ensureUser } from '../../middleware/permissions.js';
import { validate } from '../../middleware/validator.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/check/:uuid', [ensureUser, ensureNodeAccess], asyncHandler(checkMintability));
router.get('/', [validate(retrieveDoiSchema)], asyncHandler(retrieveDoi));

export default router;
