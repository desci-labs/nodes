import { ActionType, Prisma, User } from '@prisma/client';
import { ethers } from 'ethers';
import { NextFunction, Request, Response } from 'express';
import { ErrorTypes, SiweMessage } from 'siwe';

import prisma from 'client';
import parentLogger from 'logger';
import { saveInteraction } from 'services/interactionLog';
import { writeExternalIdToOrcidProfile } from 'services/user';

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

    const message = new SiweMessage(req.body.message);
    const fields = await message.validate(req.body.signature);
    if (fields.nonce !== (req as any).user.siweNonce) {
      // console.log(req.session);
      res.status(422).json({
        message: `Invalid nonce.`,
      });
      return;
    }

    const user = (req as any).user;
    const { walletAddress } = req.body;
    if (!walletAddress) {
      res.status(400).send({ err: 'missing wallet address' });
      return;
    }
    const doesExist =
      (await prisma.wallet.count({
        where: {
          user,
          address: walletAddress,
        },
      })) > 0;
    if (doesExist) {
      res.status(400).send({ err: 'duplicate wallet' });
      return;
    }

    try {
      const addWallet = await prisma.wallet.create({
        data: { address: walletAddress, userId: user.id, nickname: await createWalletNickname(user) },
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
      } catch (err) {
        logger.error({ err }, 'Error sending gift txn');
      }
      res.send({ ok: true });
      // req.session.save(() => res.status(200).send({ ok: true }));
    } catch (err) {
      logger.error({ err }, 'Error associating wallet to user');
      res.status(500).send({ err });
    }
  } catch (e) {
    await prisma.user.update({
      where: {
        id: (req as any).user.id,
      },
      data: {
        siweNonce: '',
      },
    });
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
