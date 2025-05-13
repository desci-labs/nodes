import { Router } from 'express';

import { clearExternalPubCache, getExternalPublications } from '../../../controllers/admin/nodes.js';
import { automateManuscriptDoi, automateManuscriptDoiSchema } from '../../../controllers/nodes/doi.js';
import { externalPublicationsSchema } from '../../../controllers/nodes/externalPublications.js';
import { ensureNodeExists } from '../../../middleware/authorisation.js';
import { ensureAdmin } from '../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../middleware/permissions.js';
import { validate } from '../../../middleware/validator.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const router = Router();

router.get(
  '/:uuid/external-publications',
  [validate(externalPublicationsSchema), ensureUser, ensureAdmin, ensureNodeExists],
  asyncHandler(getExternalPublications),
);

router.post(
  '/:uuid/clear-external-publications',
  [validate(externalPublicationsSchema), ensureUser, ensureAdmin, ensureNodeExists],
  asyncHandler(clearExternalPubCache),
);

// doi automation
router.post(
  '/:uuid/automate-manuscript',
  [ensureUser, ensureAdmin, ensureNodeExists, validate(automateManuscriptDoiSchema)],
  asyncHandler(automateManuscriptDoi),
);

export default router;
