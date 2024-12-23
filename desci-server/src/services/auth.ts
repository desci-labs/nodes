import { env } from 'process';

import { User } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import AWS from 'aws-sdk';

import { prisma as client } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { MagicCodeEmailHtml } from '../templates/emails/utils/emailRenderer.js';
import createRandomCode from '../utils/createRandomCode.js';
import { hideEmail } from '../utils.js';

AWS.config.update({ region: 'us-east-2' });
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const logger = parentLogger.child({ module: 'Services::Auth' });

const registerUser = async (email: string) => {
  email = email.toLowerCase();

  const user = await client.user.create({
    data: {
      email,
    },
  });

  return true;
};

const magicLinkRedeem = async (email: string, token: string): Promise<User> => {
  email = email.toLowerCase();
  if (!email) throw Error('Email is required');
  logger.trace({ fn: 'magicLinkRedeem', email: hideEmail(email) }, 'auth::magicLinkRedeem');

  const link = await client.magicLink.findFirst({
    where: {
      email,
    },
    orderBy: {
      id: 'desc',
    },
  });

  if (!link) {
    throw Error('No magic link found for the provided email.');
  }
  logger.trace(
    {
      fn: 'magicLinkRedeem',
      email: hideEmail(email),
      tokenProvided: 'XXXX' + token.slice(-2),
      tokenProvidedLength: token.length,
      latestLinkFound: 'XXXX' + link.token.slice(-2),
      linkEqualsToken: link.token === token,
      latestLinkExpiry: link.expiresAt,
      latestLinkId: link.id,
    },
    '[MAGIC]auth::magicLinkRedeem comparison debug',
  );

  if (link.failedAttempts >= 5) {
    // Invalidate the token immediately
    await client.magicLink.update({
      where: {
        id: link.id,
      },
      data: {
        expiresAt: new Date('1980-01-01'),
      },
    });
    throw Error('Too many failed attempts. Token invalidated.');
  }

  if (link.token !== token || new Date() > link.expiresAt) {
    // Increment failedAttempts
    await client.magicLink.update({
      where: {
        id: link.id,
      },
      data: {
        failedAttempts: {
          increment: 1,
        },
      },
    });
    throw Error('Invalid token.');
  }

  let user = await client.user.findFirst({
    where: {
      email,
    },
  });

  if (!user) {
    user = await client.user.create({
      data: {
        email,
      },
    });
  }

  // Invalidate the token by setting its expiresAt to a past date
  await client.magicLink.update({
    where: {
      id: link.id,
    },
    data: {
      expiresAt: new Date('1980-01-01'),
    },
  });

  return user;
};

const sendMagicLinkEmail = async (email: string, ip?: string) => {
  email = email.toLowerCase();
  const token = createRandomCode();

  const expiresAt = new Date('1980-01-01');
  await client.magicLink.updateMany({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
    data: {
      expiresAt,
    },
  });

  await client.magicLink.create({
    data: {
      token,
      email,
    },
  });

  if (env.SHOULD_SEND_EMAIL) {
    logger.info({ fn: 'sendMagicLinkEmail', email }, `Sending actual email`);

    const url = `${env.DAPP_URL}/web/login?e=${email}&c=${token}`;
    const goodIp = ip?.length > 0 && ip !== '::1' && ip !== '127.0.0.1' && ip !== 'localhost';
    const emailHtml = MagicCodeEmailHtml({ magicCode: token, ip: goodIp ? ip : '' });
    const msg = {
      to: email, // Change to your recipient
      from: 'no-reply@desci.com', // Change to your verified sender
      subject: `[nodes.desci.com] Verification: ${token}`,
      text: `Login with: ${token} ${url}${
        goodIp
          ? `\n\n (sent from ip: ${ip} -- if you weren't logging in, please forward this email to info@desci.com)`
          : ''
      }`,
      html: emailHtml,
    };

    const params = {
      Destination: {
        /* required */
        ToAddresses: [msg.to],
      },
      Message: {
        /* required */
        Body: {
          /* required */
          Html: {
            Charset: 'UTF-8',
            Data: msg.html,
          },
          Text: {
            Charset: 'UTF-8',
            Data: `Hi  $\{name\}!Your Login OTP is $\{otp\}`,
          },
        },
        Subject: {
          Charset: 'UTF-8',
          Data: msg.subject,
        },
      },
      Source: msg.from,
      /* required */
      ReplyToAddresses: [msg.from],
    };
    try {
      await sgMail.send(msg);
      // let sendPromise = new AWS.SES({
      //   apiVersion: '2010–12–01',
      // })
      //   .sendEmail(params)
      //   .promise();
      // const data = await sendPromise;
      logger.info({ fn: 'sendMagicLinkEmail', email, tokenSent: 'XXXX' + token.slice(-2) }, '[MAGIC]Email sent');
    } catch (err) {
      logger.error({ fn: 'sendMagicLinkEmail', err, email }, 'Mail error');
    }
    if (process.env.NODE_ENV === 'dev') {
      // Print this anyway whilst developing, even if emails are being sent
      const Reset = '\x1b[0m';
      const BgGreen = '\x1b[42m';
      const BgYellow = '\x1b[43m';
      const BIG_SIGNAL = `\n\n${BgYellow}$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$${Reset}\n\n`;
      logger.info(`${BIG_SIGNAL}Email sent to ${email}\n\nToken: ${BgGreen}${token}${Reset}${BIG_SIGNAL}`);
    }
    return true;
  } else {
    const Reset = '\x1b[0m';
    const BgGreen = '\x1b[42m';
    const BgYellow = '\x1b[43m';
    const BIG_SIGNAL = `\n\n${BgYellow}$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$${Reset}\n\n`;
    logger.info(`${BIG_SIGNAL}Simulating email to ${email}\n\nToken: ${BgGreen}${token}${Reset}${BIG_SIGNAL}`);
    return true;
  }
};
const MAGIC_LINK_COOLDOWN = 5 * 1000; // 5 second
/**
 * @param ignoreTestEnv For testing purposes, ignore the test environment check, this is to be able to test the rate limiting functionality.
 */
const sendMagicLink = async (email: string, ip?: string, ignoreTestEnv?: boolean) => {
  email = email.toLowerCase();

  // Check for recent magic link generation
  const recentMagicLink = await client.magicLink.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
      createdAt: {
        gte: new Date(Date.now() - MAGIC_LINK_COOLDOWN),
      },
    },
  });

  const testEnv = process.env.NODE_ENV === 'test' && ignoreTestEnv !== true;
  if (recentMagicLink && !testEnv) {
    throw Error('A verification code was recently generated. Please wait 30 seconds before requesting another.');
  }

  const user = await client.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
  });

  if (user) {
    // check to make sure user doesn't have Login Method associated
    const identities = await client.userIdentity.findMany({
      where: {
        userId: user.id,
      },
    });
    if (identities.length) {
      throw Error('Login Method associated, skipping magic link');
    }
    return sendMagicLinkEmail(user.email, ip);
  }

  throw Error('Not found');
};

export { registerUser, sendMagicLink, magicLinkRedeem };
