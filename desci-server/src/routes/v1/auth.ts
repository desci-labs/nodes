import { Router } from 'express';

import { googleAuth } from '../../controllers/auth/google.js';
import { createGuestUser } from '../../controllers/auth/guest.js';
import {
  login,
  logout,
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
import { ensureGuestOrUser, ensureUser } from '../../middleware/permissions.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

router.get('/check', [ensureGuestOrUser], check);
router.post('/login', login);
router.post('/login/did', asyncHandler(walletLogin));
router.get('/login/did/:walletAddress', asyncHandler(walletNonce));
router.delete('/logout', logout);
router.post('/guest', createGuestUser);
router.get('/profile', [ensureGuestOrUser], profile);
router.get('/orcid/auth', orcidAuth);
router.get('/orcid/auth/close', orcidAuthClose);
router.get('/orcid/connect', orcidConnect);
router.get('/orcid/connect/close', orcidConnectClose);
router.get('/orcid/validate', validateOrcid);
router.get('/orcid/validate', validateOrcid);
router.post('/google/login', googleAuth);
router.post('/magic', magic);
router.post('/apiKey/issue', [ensureUser], issueApiKey);
router.delete('/apiKey/revoke', [ensureUser], revokeApiKey);
router.get('/apiKey', [ensureUser], listApiKey);

export default router;
