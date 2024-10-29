import { Router } from 'express';

import { issueApiKey } from '../../controllers/auth/issueApiKey.js';
import { listApiKey } from '../../controllers/auth/listApiKey.js';
import { check, login } from '../../controllers/auth/login.js';
import { logout } from '../../controllers/auth/logout.js';
import { magic } from '../../controllers/auth/magic.js';
import {
  orcidAuth,
  orcidAuthClose,
  orcidConnect,
  orcidConnectClose,
  validateOrcid,
} from '../../controllers/auth/orcid.js';
import { profile } from '../../controllers/auth/profile.js';
import { register } from '../../controllers/auth/register.js';
import { revokeApiKey } from '../../controllers/auth/revokeApiKey.js';
import { walletLogin, walletNonce } from '../../controllers/users/associateWallet.js';
import { ensureUser } from '../../middleware/permissions.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/check', [ensureUser], check);
router.post('/login', login);
router.post('/login/did', asyncHandler(walletLogin));
router.get('/login/did/:walletAddress', asyncHandler(walletNonce));
router.delete('/logout', logout);
router.get('/profile', [ensureUser], profile);
router.post('/register', register);
router.get('/orcid/auth', orcidAuth);
router.get('/orcid/auth/close', orcidAuthClose);
router.get('/orcid/connect', orcidConnect);
router.get('/orcid/connect/close', orcidConnectClose);
router.get('/orcid/validate', validateOrcid);
router.post('/magic', magic);
router.post('/apiKey/issue', [ensureUser], issueApiKey);
router.delete('/apiKey/revoke', [ensureUser], revokeApiKey);
router.get('/apiKey', [ensureUser], listApiKey);

export default router;
