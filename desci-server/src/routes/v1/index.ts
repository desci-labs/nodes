import { Router } from 'express';
import { generateNonce } from 'siwe';

import { prisma } from '../../client.js';
import { queryResearchFields } from '../../controllers/data/index.js';
import { queryRor } from '../../controllers/proxy/index.js';
import { nft } from '../../controllers/raw/nft.js';
import { ensureUser } from '../../middleware/ensureUser.js';

import admin from './admin.js';
import auth from './auth.js';
import data from './data.js';
import log from './log.js';
import nodes from './nodes.js';
import pub from './pub.js';
import referral from './referral.js';
import services from './services.js';
import users from './users.js';
import waitlist from './waitlist.js';

const router = Router();

router.get('/nonce', [ensureUser], async function (req, res) {
  const user = req.user;
  const nonce = generateNonce();
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
});

router.use('/admin', admin);
router.use('/auth', auth);
router.use('/users', users);
router.use('/nodes', nodes);
router.use('/waitlist', waitlist);
router.use('/pub', pub);
router.use('/data', data);
router.use('/log', log);
router.use('/services', services);

router.get('/nft/:id', nft);
router.use('/referral', referral);
router.get('/researchFields', [ensureUser], queryResearchFields);
router.get('/ror', [ensureUser], queryRor);

export default router;
