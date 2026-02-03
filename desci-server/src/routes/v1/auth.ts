import { Router } from 'express';

import { appleLogin } from '../../controllers/auth/apple.js';
import { convertGuestToUser } from '../../controllers/auth/convertGuest.js';
import { convertGuestToUserGoogle } from '../../controllers/auth/convertGuestGoogle.js';
import { convertGuestToUserOrcid } from '../../controllers/auth/convertGuestOrcid.js';
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
import { updateMarketingConsentController } from '../../controllers/auth/marketingConsent.js';
import { updateSignupDetails } from '../../controllers/auth/updateSignupDetails.js';
import { walletLogin, walletNonce } from '../../controllers/users/associateWallet.js';
import { ensureGuest, ensureGuestOrUser, ensureUser } from '../../middleware/permissions.js';
import { validate, validateInputs } from '../../middleware/validator.js';
import { appleLoginSchema, googleAuthSchema } from '../../schemas/auth.schema.js';
import { updateMarketingConsentSchema } from '../../schemas/users.schema.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
const router = Router();

router.get('/check', [ensureGuestOrUser], check);
router.post('/login', login);
router.post('/login/did', asyncHandler(walletLogin));
router.get('/login/did/:walletAddress', asyncHandler(walletNonce));
router.delete('/logout', logout);
router.get('/profile', [ensureGuestOrUser], profile);
router.patch(
  '/marketing-consent',
  [ensureUser, validate(updateMarketingConsentSchema)],
  asyncHandler(updateMarketingConsentController),
);
router.patch('/signup-details', [ensureUser], asyncHandler(updateSignupDetails));
router.get('/orcid/auth', orcidAuth);
router.get('/orcid/auth/close', orcidAuthClose);
router.get('/orcid/connect', orcidConnect);
router.get('/orcid/connect/close', orcidConnectClose);
router.get('/orcid/validate', validateOrcid);
router.get('/orcid/validate', validateOrcid);
router.post('/google/login', [validateInputs(googleAuthSchema)], asyncHandler(googleAuth));
router.post('/apple/login', [validateInputs(appleLoginSchema)], asyncHandler(appleLogin));
router.post('/magic', magic);
router.post('/apiKey/issue', [ensureUser], issueApiKey);
router.delete('/apiKey/revoke', [ensureUser], revokeApiKey);
router.get('/apiKey', [ensureUser], listApiKey);
//
// Guest mode routes
router.post('/guest', createGuestUser);
router.post('/guest/convert/email', [ensureGuest], convertGuestToUser);
router.post('/guest/convert/google', [ensureGuest], convertGuestToUserGoogle);
router.post('/guest/convert/orcid', [ensureGuest], convertGuestToUserOrcid);

export default router;
