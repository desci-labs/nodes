import { Node, User } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import { Request, Response } from 'express';

import { prisma } from '../../../client.js';
import { logger as parentLogger } from '../../../logger.js';
import { contributorService } from '../../../services/Contributors.js';
import { NotificationService } from '../../../services/Notifications/NotificationService.js';
import { ContributorInviteEmailHtml } from '../../../templates/emails/utils/emailRenderer.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export type UpdateContributorReqBody = {
  contributorId: string;
  email?: string;
  orcid?: string;
  userId?: number;
  silent?: boolean; // Don't fire an email
};

export type UpdateContributorRequest = Request<never, never, UpdateContributorReqBody> & {
  user: User; // added by auth middleware
  node: Node; // added by ensureWriteAccess middleware
};

export type UpdateContributorResBody =
  | {
      ok: boolean;
      message: string;
    }
  | {
      error: string;
    };

export const updateContributor = async (req: UpdateContributorRequest, res: Response<UpdateContributorResBody>) => {
  const node = req.node;
  const user = req.user;
  if (!node || !user)
    throw Error('Middleware not properly setup for addContributor controller, requires req.node and req.user');

  const { contributorId, orcid, userId, silent } = req.body;
  let { email } = req.body;
  if (email) email = email.toLowerCase();

  const logger = parentLogger.child({
    module: 'Contributors::updateContributorController',
    body: req.body,
    uuid: node.uuid,
    user: (req as any).user,
    nodeId: node.id,
    silent,
  });

  if (!contributorId) {
    return res.status(400).json({ error: 'contributorId required' });
  }
  if (!userId && !email && !orcid) {
    return res.status(400).json({ error: 'userId, Email or Orcid required' });
  }

  const contribution = await contributorService.getContributionById(contributorId);
  const currentEmail = contribution?.email;

  // Update contributor in the db
  try {
    const contributorUpdated = await contributorService.updateNodeContribution({
      node,
      nodeOwner: user,
      contributorId,
      email,
      orcid,
      userId,
    });
    if (contributorUpdated) {
      logger.info({ contributorUpdated }, 'Contributor updated successfully');

      if (!email && !!contributorUpdated.userId) {
        // If the contributor being added has an existing account, their email is available on their profile.
        const invitedContributor = await prisma.user.findUnique({ where: { id: contributorUpdated.userId } });
        if (invitedContributor?.email) email = invitedContributor.email;
      }

      // Future:
      if (currentEmail !== email && email !== user.email && !silent) {
        // If email was changed, send a new email.
        logger.info({ contributorId, recipient: email }, 'Firing off contributor invite email for updated contributor');

        const shareCode = await contributorService.generatePrivShareCodeForContribution(contributorUpdated, node);
        // Fire off an email -> make it count as a friend referral
        const emailHtml = ContributorInviteEmailHtml({
          inviter: user.name,
          nodeUuid: node.uuid,
          privShareCode: shareCode,
          contributorId: contributorUpdated.contributorId,
          nodeTitle: node.title,
          newUser: !!!contributorUpdated.userId,
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

        if (!!!contribution.userId && !!contributorUpdated.userId) {
          // Emit push notif to contributor if the previous contribution entry didn't have a nodes account associated,
          // but the updated entry now has a nodes account associated.
          await NotificationService.emitOnContributorInvite({
            node: node,
            nodeOwner: user,
            targetUserId: contributorUpdated.userId,
            privShareCode: shareCode,
            contributorId: contributorUpdated.contributorId,
          });
        }

        if (process.env.NODE_ENV === 'production') {
          sgMail.send(emailMsg);
          await prisma.nodeContribution.update({
            where: { id: contributorUpdated.id },
            data: { inviteSent: true },
          });
        } else {
          logger.info(
            { nodeEnv: process.env.NODE_ENV },
            'Skipping update contributor email send in non-production environment',
          );
        }
      }
      return res.status(200).json({ ok: true, message: 'Contributor updated successfully' });
    }
  } catch (e) {
    logger.error({ e }, 'Failed to update contributor');
    return res.status(500).json({ error: 'Failed to update contributor' });
  }

  return res.status(500).json({ error: 'Something went wrong' });
};
