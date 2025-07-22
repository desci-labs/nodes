import { Router } from 'express';

import { retrieveDpidMetadata } from '../../controllers/dpid/index.js';
import { retrieveDpidSchema } from '../../controllers/dpid/schema.js';
import { validateInputs } from '../../middleware/validator.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/:dpid', [validateInputs(retrieveDpidSchema)], asyncHandler(retrieveDpidMetadata));

export default router;
