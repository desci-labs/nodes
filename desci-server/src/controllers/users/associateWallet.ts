import { ActionType, Prisma, User } from '@prisma/client';
import { ethers } from 'ethers';
import { NextFunction, Request, Response } from 'express';
import { ErrorTypes, SiweMessage } from 'siwe';

import prisma from 'client';
import { saveInteraction } from 'services/interactionLog';

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

export const associateWallet = async (req: Request, res: Response, next: NextFunction) => {
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
                id: addWallet.id,
              },
              data: {
                giftTransaction: txObj.hash,
                usedFaucet: true,
              },
            });
            console.log(`gifted user id ${user.id} txHash`, txObj.hash);
            res.send({ ok: true, gift: txObj.hash });
            return;
          } catch (err) {
            console.error('failed to connect to blockchain RPC, sending funds failed');
          }
        }
      }
      res.send({ ok: true });
      // req.session.save(() => res.status(200).send({ ok: true }));
    } catch (err) {
      console.error('Error associating wallet to user', err);
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
    console.error(e);
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
