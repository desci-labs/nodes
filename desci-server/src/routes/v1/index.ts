import { Router } from 'express';
import { generateNonce, ErrorTypes, SiweMessage } from 'siwe';

import prisma from 'client';
import { queryResearchFields } from 'controllers/data';
import { nft } from 'controllers/raw';
import { ensureUser } from 'middleware/ensureUser';

import admin from './admin';
import auth from './auth';
import data from './data';
import log from './log';
import nodes from './nodes';
import pub from './pub';
import referral from './referral';
import users from './users';
import waitlist from './waitlist';

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

router.get('/nft/:id', nft);
router.use('/referral', referral);
router.get('/researchFields', [ensureUser], queryResearchFields);

export default router;
