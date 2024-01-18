import { Router } from 'express';

import {
  login,
  logout,
  register,
  profile,
  orcidAuth,
  orcidAuthClose,
  orcidConnect,
  orcidConnectClose,
  validateOrcid,
  magic,
} from '../../controllers/auth/index.js';
import { ensureUser } from '../../middleware/permissions.js';

const router = Router();

router.post('/login', login);
router.delete('/logout', logout);
router.get('/profile', [ensureUser], profile);
router.post('/register', register);
router.get('/orcid/auth', orcidAuth);
router.get('/orcid/auth/close', orcidAuthClose);
router.get('/orcid/connect', orcidConnect);
router.get('/orcid/connect/close', orcidConnectClose);
router.get('/orcid/validate', validateOrcid);
router.post('/magic', magic);

export default router;
