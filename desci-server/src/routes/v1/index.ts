import { Router } from 'express';
import { generateNonce } from 'siwe';

import { prisma } from '../../client.js';
import { queryResearchFields } from '../../controllers/data/index.js';
import { handleCrossrefNotificationCallback } from '../../controllers/doi/mint.js';
import { queryRor } from '../../controllers/proxy/index.js';
import { ipfsReadGatewayProxy } from '../../controllers/proxy/ipfsReadGateway.js';
import { nft } from '../../controllers/raw/nft.js';
import { ensureGuestOrUser, ensureUser } from '../../middleware/permissions.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

import admin from './admin/index.js';
import attestations from './attestations/index.js';
import auth from './auth.js';
import authors from './authors.js';
import communities from './communities/index.js';
import submissions from './communities/submissions.js';
import { ensureCrossrefNotifier, identifyEndpoint } from './crossref.js';
import data from './data.js';
import doi from './doi.js';
import dpid from './dpid.js';
import feed from './feed.js';
import internal from './internal/index.js';
import journals from './journals/index.js';
import log from './log.js';
import nodes from './nodes.js';
import notifications from './notifications.js';
import openalex from './openalex.js';
import pub from './pub.js';
import referral from './referral.js';
import research from './research.js';
import search from './search.js';
import services from './services/index.js';
import stripe from './stripe.js';
import users from './users.js';
import waitlist from './waitlist.js';

const router = Router();

router.get(
  '/nonce',
  [ensureUser],
  asyncHandler(async function (req, res) {
    const nonce = generateNonce();
    const user = (req as any).user;
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        siweNonce: nonce,
      },
    });
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(nonce);
  }),
);

router.use('/admin', admin);
router.use('/auth', auth);
router.use('/users', users);
router.use('/nodes', nodes);
router.use('/waitlist', waitlist);
router.use('/stripe', stripe);
router.use('/pub', pub);
router.use('/data', data);
router.use('/log', log);
router.use('/services', services);
router.use('/internal', internal);
router.use('/communities', communities);
router.use('/attestations', attestations);
router.use('/dpid', dpid);
router.use('/doi', doi);
router.use('/openalex', openalex);
router.use('/search', search);
router.use('/notifications', notifications);
router.use('/submissions', submissions);
router.use('/authors', authors);
router.use('/journals', journals);
router.use('/feed', feed);
router.use('/research', research);

router.get('/nft/:id', nft);
router.use('/referral', referral);
router.get('/researchFields', [ensureGuestOrUser], queryResearchFields);
router.get('/ror', [ensureGuestOrUser], queryRor);
router.get('/cidmd/:cid', ipfsReadGatewayProxy);

// potential notification fallback catch
router.post(
  '/crossref/callback',
  [identifyEndpoint('/v1/crossref/callback'), ensureCrossrefNotifier],
  asyncHandler(handleCrossrefNotificationCallback),
);

export default router;
