import { ActionType, FriendReferral, User } from '@prisma/client';
import { SES } from 'aws-sdk';
import { Request, Response } from 'express';

import parentLogger from 'logger';
import { saveFriendReferral } from 'services/friendReferral';
import { saveInteraction } from 'services/interactionLog';

interface ExpectedBody {
  emails: string[];
}
export const newReferral = async (req: Request, res: Response) => {
  /**
   * TODO: Validate email addresses with a simple regex?
   * Slightly torn on this, it's a complex issue
   * https://stackoverflow.com/questions/46155/how-can-i-validate-an-email-address-in-javascript
   * I think most importantly SES will throw if the email is invalid, so perhaps we should leave it there?
   */
  const user = (req as any).user as User;
  const body = req.body as ExpectedBody;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'REFERRAL::newReferralController',
    body: req.body,
    user: (req as any).user,
  });
  logger.trace(`Referral coming from user ${user.id}`);
  try {
    logger.info('Creating new referral for authd user');

    const emails = body.emails;

    if (!emails || emails.length === 0) {
      res.status(400).send({ message: 'No emails passed in' });
      return;
    }

    if (emails.includes(user.email)) {
      res.status(400).send({ message: 'Cannot send referral to yourself' });
      return;
    }

    const savedReferrals = await saveReferralsInDbHelper(user, emails);
    const sentEmails = await sendReferralEmailsHelper(user, savedReferrals);

    await saveInteraction(req, ActionType.NEW_REFERRAL, { emails });

    res.send({
      user,
      referrals: savedReferrals,
      sentEmails,
    });

    return;
  } catch (err) {
    logger.error({ err }, 'err');
    res.status(500).send({ err });
    return;
  }
};

async function saveReferralsInDbHelper(user, emails: string[]) {
  try {
    /**
     * TODO: This isn't ideal
     * How to handle invites that already exist in bulk?
     * This really isn't too big of an issue
     * I highly doubt users will be sending several hundred emails at once, this will still be fast
     */
    const savedReferrals = await Promise.all(emails.map(async (email) => saveFriendReferral(user.id, email)));
    return savedReferrals;
  } catch (err) {
    parentLogger.error(
      {
        module: 'REFERRAL',
        fn: 'saveReferralsInDbHelper',
        err,
      },
      'Failed to save referrals in DB',
    );
    throw err;
  }
}

async function sendReferralEmailsHelper(user: User, referrals: FriendReferral[]) {
  const fromUserName = user.name || user.email;
  const logger = parentLogger.child({
    module: 'REFERRAL',
    fn: 'sendReferralEmailsHelper',
    user,
    referrals,
    fromUserName,
  });

  const sentReferralEmails = await Promise.all(
    referrals.map(async (referral) => {
      const url = `${process.env.DAPP_URL}?referralUuid=${referral.uuid}`;
      const toEmail = referral.receiverEmail;
      const msg = {
        to: toEmail,
        from: 'no-reply@desci.com', // Change to your verified sender
        subject: `[nodes.desci.com] ${fromUserName} would love for you to join DeSci with them!`,
        text: `You were invited to join DeSci by ${fromUserName}! Join us here: ${url}`,
        html: `<a href="${url}" target="_blank">Sign up</a>`,
      };

      if (!process.env.SHOULD_SEND_EMAIL) {
        logger.warn({ msg }, 'Fake referral email');
        return msg;
      }

      try {
        logger.info(`Sending invite email to ${toEmail}`);

        const params = {
          Destination: {
            ToAddresses: [msg.to],
          },
          Message: {
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: msg.html,
              },
              Text: {
                Charset: 'UTF-8',
                Data: msg.text,
              },
            },
            Subject: {
              Charset: 'UTF-8',
              Data: msg.subject,
            },
          },
          Source: msg.from,
          ReplyToAddresses: [msg.from],
        };
        const sendPromise = new SES({
          apiVersion: '2010-12-01',
        })
          .sendEmail(params)
          .promise();
        const data = await sendPromise;
        logger.info({ data }, 'Email sent');
        return data;
      } catch (err) {
        logger.error({ err }, 'Failed to send email');
        throw err;
      }
    }),
  );

  return sentReferralEmails;
}
