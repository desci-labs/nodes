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
  issueApiKey,
  revokeApiKey,
  listApiKey,
  check,
} from '../../controllers/auth/index.js';
import { walletLogin, walletNonce } from '../../controllers/users/associateWallet.js';
// import { asyncHandler } from '../../internal.js';
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
