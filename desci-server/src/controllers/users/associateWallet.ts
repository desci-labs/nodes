import { ActionType, Prisma, User } from '@prisma/client';
import { ethers } from 'ethers';
import { getAddress, isAddress } from 'ethers/lib/utils.js';
import { NextFunction, Request, Response } from 'express';
import { ErrorTypes, SiweMessage, generateNonce } from 'siwe';

import { prisma } from '../../client.js';
import {
  AuthFailureError,
  BadRequestError,
  ForbiddenError,
  SuccessMessageResponse,
  SuccessResponse,
  extractTokenFromCookie,
} from '../../internal.js';
import { logger as parentLogger } from '../../logger.js';
import { getUserConsent, saveInteraction } from '../../services/interactionLog.js';
import { writeExternalIdToOrcidProfile } from '../../services/user.js';
import { removeCookie, sendCookie } from '../../utils/sendCookie.js';
import { generateAccessToken } from '../auth/magic.js';

const createWalletNickname = async (user: Prisma.UserWhereInput) => {
  const count = await prisma.wallet.count({
    where: {
      user,
    },
  });
  if (count == 0) {
    return 'Primary';
  }
  return `Account #${count + 1}`;
};

export const associateOrcidWallet = async (req: Request, res: Response, next: NextFunction) => {
  const logger = parentLogger.child({
    module: 'USERS::softAssociateWalletController',
    user: (req as any).user,
    body: req.body,
  });

  // associate without siwe check (only necessary for direct DID login, which is unsupported for ORCID DIDs right now)
  try {
    const user = (req as any).user;
    const { did } = req.body;
    if (!did) {
      res.status(400).send({ err: 'missing wallet address' });
      return;
    }

    // TODO: check for wallet uniqueness across all accounts
    const doesExist =
      (await prisma.wallet.count({
        where: {
          address: did,
        },
      })) > 0;
    if (doesExist) {
      res.status(400).send({ err: 'duplicate DID (global)' });
      return;
    }
    const ORCID_NICKNAME = 'ORCID';
    const hasOrcidWallet = await prisma.wallet.count({
      where: {
        user,
        nickname: ORCID_NICKNAME,
      },
    });
    if (hasOrcidWallet > 0) {
      res.status(400).send({ err: 'orcid DID already registered' });
      return;
    }

    try {
      const addWallet = await prisma.wallet.create({
        data: { address: did, userId: user.id, nickname: ORCID_NICKNAME },
      });
      saveInteraction(
        req,
        ActionType.USER_WALLET_ASSOCIATE,
        {
          addr: did,
          orcid: req.body.orcid,
          orcidUser: user.orcid,
        },
        user.id,
      );
      // check if orcid associated
      // add to orcid profile in the did:pkh format
      // did:pkh:eip155:1:0xb9c5714089478a327f09197987f16f9e5d936e8a
      // POST to orcid API as an External Identifier
      if (user.orcid) {
        console.log('adding to orcid profile');
        await writeExternalIdToOrcidProfile(user.id, did);
        console.log('done writing');
      }

      try {
        const hash = await sendGiftTxn(user, did, addWallet.id);
        res.send({ ok: true, gift: hash });
        return;
      } catch (err) {
        logger.error({ err }, 'Error sending orcid DID txn');
      }
      res.send({ ok: true });
      return;
      // req.session.save(() => res.status(200).send({ ok: true }));
    } catch (err) {
      logger.error({ err }, 'Error associating orcid DID to user #1');
      res.status(500).send({ err });
      return;
    }
  } catch (e) {
    logger.error({ err: e }, 'Error associating orcid DID to user #2');

    res.status(500).json({ message: e.message });
  }
};

export const associateWallet = async (req: Request, res: Response, next: NextFunction) => {
  const logger = parentLogger.child({
    module: 'USERS::associateWalletController',
    user: (req as any).user,
    body: req.body,
  });
  try {
    if (!req.body.message) {
      res.status(422).json({ message: 'Expected prepareMessage object as body.' });
      return;
    }

    const user = (req as any).user;
    const message = new SiweMessage(req.body.message);
    const fields = await message.validate(req.body.signature);
    // const siweNonce = (req.user).nonce;
    const walletAddress = getAddress(fields.address);

    logger.info({ user, fields }, 'SIWE NONCE');
    if (fields.nonce !== user.siweNonce) {
      // console.log(req.session);
      res.status(422).json({
        message: `Invalid nonce.`,
      });
      return;
    }

    logger.info({ walletAddress, address: fields.address }, 'SIWE ADDRESS');

    const doesExist = await prisma.wallet.findMany({
      where: {
        address: walletAddress,
      },
    });

    if (doesExist.length > 0) {
      res.status(400).send({ err: 'duplicate wallet or already associated by another user' });
      return;
    }

    try {
      const addWallet = await prisma.wallet.create({
        data: { address: walletAddress, userId: user.id, nickname: await createWalletNickname(user) },
      });

      await prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          siweNonce: '',
        },
      });

      saveInteraction(
        req,
        ActionType.USER_WALLET_ASSOCIATE,
        {
          addr: walletAddress,
          fields,
        },
        user.id,
      );

      try {
        const hash = await sendGiftTxn(user, walletAddress, addWallet.id);
        res.send({ ok: true, gift: hash });
        return;
      } catch (err) {
        logger.error({ err }, 'Error sending gift txn');
      }
      res.send({ ok: true });
    } catch (err) {
      logger.error({ err }, 'Error associating wallet to user');
      res.status(500).send({ err });
    }
  } catch (e) {
    logger.error({ err: e }, 'Error associating wallet to user');
    switch (e) {
      case ErrorTypes.EXPIRED_MESSAGE: {
        res.status(440).json({ message: e.message });
        break;
      }
      case ErrorTypes.INVALID_SIGNATURE: {
        res.status(422).json({ message: e.message });
        break;
      }
      default: {
        res.status(500).json({ message: e.message });
        break;
      }
    }
  }
};

export const walletNonce = async (req: Request, res: Response, next: NextFunction) => {
  const logger = parentLogger.child({
    module: 'USERS::WalletLoginController',
    user: (req as any).user,
    params: req.params,
  });
  const { walletAddress } = req.params;

  logger.info('GENERATE NONCE');

  const wallet = await prisma.wallet.findFirst({
    where: { address: { equals: walletAddress, mode: 'insensitive' } },
  });
  if (!wallet) throw new ForbiddenError('Wallet address not found');
  const nonce = generateNonce();
  await prisma.user.update({ where: { id: wallet.userId }, data: { siweNonce: nonce } });
  new SuccessResponse({ nonce }).send(res);
};

export const walletLogin = async (req: Request, res: Response, next: NextFunction) => {
  const logger = parentLogger.child({
    module: 'USERS::WalletLoginController',
    user: (req as any).user,
    body: req.body,
  });
  // try {
  const { message: siweMessage, signature, dev } = req.body;

  logger.info('WALLET LOGIN');

  if (!siweMessage) {
    throw new BadRequestError('Missing siwe message ', { message: 'Expected prepareMessage object as body.' });
  }

  const message = new SiweMessage(siweMessage);
  const fields = await message.validate(signature);
  // const siweNonce = // await extractTokenFromCookie(req, 'siwe');
  const account = getAddress(fields.address);

  const wallet = await prisma.wallet.findFirst({
    where: {
      // This is necessary because associate wallet stored lowercase public
      // key sent from request payload rather
      // than the checksum address extracted from siwe signature
      address: { equals: account, mode: 'insensitive' },
    },
  });

  if (!wallet) throw new AuthFailureError('Unrecognised DID credential');

  const user = await prisma.user.findUnique({ where: { id: wallet.userId } });
  if (!user) throw new AuthFailureError('Wallet not associated to a user');

  // logger.info({ siweNonce }, 'SIWE NONCE');
  if (fields.nonce !== user.siweNonce) {
    throw new ForbiddenError('Invalid Nonce');
  }

  logger.info({ fieldAddress: fields.address, account, address: getAddress(account) }, 'WALLET ADDRESS');

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      siweNonce: '',
    },
  });

  saveInteraction(
    req,
    ActionType.USER_WALLET_CONNECT,
    {
      addr: account,
    },
    user.id,
  );

  const token = generateAccessToken({ email: user.email });

  sendCookie(res, token, dev === 'true');
  // we want to check if the user exists to show a "create account" prompt with checkbox to accept terms if this is the first login
  const termsAccepted = !!(await getUserConsent(user.id));
  // TODO: Bearer token still returned for backwards compatability, should look to remove in the future.
  new SuccessResponse({ user: { email: user.email, token, termsAccepted } }).send(res);

  saveInteraction(req, ActionType.USER_LOGIN, { userId: user.id }, user.id);
};

const sendGiftTxn = async (user: User, walletAddress: string, addedWalletId: number) => {
  const logger = parentLogger.child({
    module: 'USERS::associateWallet::sendGiftTxn',
    user,
    walletAddress,
  });
  if (process.env.HOT_WALLET_KEY) {
    /**
     * Auto send user ETH
     */
    const giftedWallets = await prisma.wallet.count({
      where: {
        user,
        giftTransaction: { not: null },
      },
    });
    if (giftedWallets === 0) {
      let provider;
      try {
        provider = new ethers.providers.JsonRpcProvider(
          process.env.NODE_ENV === 'production'
            ? 'https://eth-goerli.g.alchemy.com/v2/ZeIzCAJyPpRnTtPNSmddHGF-q2yp-2Uy'
            : 'http://host.docker.internal:8545',
        );
        const bn = await provider.getBlockNumber();

        const privateKey = process.env.HOT_WALLET_KEY;
        const wallet = new ethers.Wallet(privateKey, provider);
        const receiverAddress = walletAddress;
        // Ether amount to send
        const amountInEther = '0.005';
        // Create a transaction object
        const tx = {
          to: receiverAddress,
          // Convert currency unit from ether to wei
          value: ethers.utils.parseEther(amountInEther),
        };

        // Send a transaction
        const txObj = await wallet.sendTransaction(tx);

        await prisma.wallet.update({
          where: {
            id: addedWalletId,
          },
          data: {
            giftTransaction: txObj.hash,
            usedFaucet: true,
          },
        });
        logger.info(`gifted user id ${user.id} txHash ${txObj.hash}`);

        return txObj.hash;
      } catch (err) {
        logger.error({ err }, 'failed to connect to blockchain RPC, sending funds failed');
      }
    }
  }
  return null;
};
