import { Node, User } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';
import { NotificationService } from '../../../services/Notifications/NotificationService.js';
import { ContributorInviteEmailHtml } from '../../../templates/emails/utils/emailRenderer.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export type AddContributorReqBody = {
  contributorId: string;
  email?: string;
  orcid?: string;
  userId?: number;
  silent?: boolean; // Don't fire an email
};

export type AddContributorRequest = Request<never, never, AddContributorReqBody> & {
  user: User; // added by auth middleware
  node: Node; // added by ensureWriteAccess middleware
};

export type AddContributorResBody =
  | {
      ok: boolean;
      message: string;
    }
  | {
      error: string;
    };

export const addContributor = async (req: AddContributorRequest, res: Response<AddContributorResBody>) => {
  const node = req.node;
  const user = req.user;

  if (!node || !user)
    throw Error('Middleware not properly setup for addContributor controller, requires req.node and req.user');

  const { contributorId, orcid, userId, silent } = req.body;
  let { email } = req.body;
  if (email) email = email.toLowerCase();
  const logger = parentLogger.child({
    module: 'Contributors::createController',
    body: req.body,
    uuid: node.uuid,
    user: req.user,
    nodeId: node.id,
    silent,
  });

  if (!contributorId) {
    return res.status(400).json({ error: 'contributorId required' });
  }
  if (!userId && !email && !orcid) {
    return res.status(400).json({ error: 'userId, Email or Orcid required' });
  }

  // Add contributor to the db
  try {
    const contributorAdded = await contributorService.addNodeContribution({
      node,
      nodeOwner: user,
      contributorId,
      email,
      orcid,
      userId,
    });
    if (!contributorAdded) throw Error('Failed to add contributor');

    if (!email && !!contributorAdded.userId) {
      // If the contributor being added has an existing account, their email is available on their profile.
      const invitedContributor = await prisma.user.findUnique({ where: { id: contributorAdded.userId } });
      if (invitedContributor?.email) email = invitedContributor.email;
    }

    if (user.id !== contributorAdded.userId && email && !silent) {
      logger.info(
        { contributorId, recipient: email },
        'Firing off contributor invite email for newly invited contributor',
      );
      // debugger;
      // Generate a share code for the contributor if it's the node owner themselves
      const shareCode = await contributorService.generatePrivShareCodeForContribution(contributorAdded, node);
      // Future: make it count as a friend referral
      const emailHtml = ContributorInviteEmailHtml({
        inviter: user.name,
        nodeUuid: node.uuid,
        privShareCode: shareCode,
        contributorId: contributorAdded.contributorId,
        nodeTitle: node.title,
        newUser: !!!contributorAdded.userId,
      });
      const inviterName = user.name || 'A user';
      const emailMsg = {
        to: email,
        from: 'no-reply@desci.com',
        subject: `[nodes.desci.com] ${inviterName} has added you as a contributor to their research object.`,
        text: `${inviterName} has added as a contributor to ${node.title}. Confirm your contribution to ensure you're credited for your work. 
        Your private share code: ${shareCode}`,
        html: emailHtml,
      };

      if (!!contributorAdded.userId) {
        // Emit push notif to contributor if they already have a nodes account
        await NotificationService.emitOnContributorInvite({
          node: node,
          nodeOwner: user,
          targetUserId: contributorAdded.userId,
          privShareCode: shareCode,
          contributorId: contributorAdded.contributorId,
        });
      }

      if (process.env.NODE_ENV === 'production') {
        sgMail.send(emailMsg);
        await prisma.nodeContribution.update({
          where: { id: contributorAdded.id },
          data: { inviteSent: true },
        });
      } else {
        logger.info(
          { nodeEnv: process.env.NODE_ENV },
          'Skipping add contributor email send in non-production environment',
        );
      }
    }
    logger.info({ contributorAdded }, 'Contributor added successfully');
    return res.status(200).json({ ok: true, message: 'Contributor added successfully' });
  } catch (e) {
    logger.error({ e }, 'Failed to add contributor');
    return res.status(500).json({ error: 'Failed to add contributor' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
