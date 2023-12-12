import { env } from 'process';

import { User } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import AWS from 'aws-sdk';

import { logger as parentLogger } from '../logger.js';
import createRandomCode from '../utils/createRandomCode.js';
import { prisma as client } from '../client.js';
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
  logger.trace({ fn: 'magicLinkRedeem', email: hideEmail(email) }, 'auth::magicLinkRedeem');

  const link = await client.magicLink.findFirst({
    where: {
      email,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!link) {
    throw Error('No magic link found for the provided email.');
  }

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
    where: { email },
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
    logger.info({ fn: 'sendMagicLinkEmail', email, token }, `Sending actual email to ${email} token: ${token}`);

    const url = `${env.DAPP_URL}/web/login?e=${email}&c=${token}`;
    const goodIp = ip?.length > 0 && ip !== '::1' && ip !== '127.0.0.1' && ip !== 'localhost';
    const msg = {
      to: email, // Change to your recipient
      from: 'no-reply@desci.com', // Change to your verified sender
      subject: `[nodes.desci.com] Verification: ${token}`,
      text: `Login with: ${token} ${url}${
        goodIp
          ? `\n\n (sent from ip: ${ip} -- if you weren't logging in, please forward this email to info@desci.com)`
          : ''
      }`,
      html: `Welcome to DeSci Nodes, to access your account use the following code<br/><br/><a href="${url}" target="_blank">Login Now</a><br/><br/>Verification Code: ${token}${
        goodIp
          ? `<br/><br/><span style="font-size:10px">sent from ip address: ${ip} if you weren't logging in, please forward this email to info@desci.com</span>`
          : ''
      }`,
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
      logger.info({ fn: 'sendMagicLinkEmail', email, msg }, 'Email sent');
    } catch (err) {
      logger.error({ fn: 'sendMagicLinkEmail', err, email }, 'Mail error');
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
const sendMagicLink = async (email: string, ip?: string) => {
  email = email.toLowerCase();

  // Check for recent magic link generation
  const recentMagicLink = await client.magicLink.findFirst({
    where: {
      email,
      createdAt: {
        gte: new Date(Date.now() - MAGIC_LINK_COOLDOWN),
      },
    },
  });

  if (recentMagicLink) {
    throw Error('A verification code was recently generated. Please wait 30 seconds before requesting another.');
  }

  const user = await client.user.findFirst({
    where: {
      email,
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
