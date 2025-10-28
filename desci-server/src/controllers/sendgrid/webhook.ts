import crypto from 'crypto';

import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { SENDGRID_WEBHOOK_VERIFY_KEY } from '../../config.js';
import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({
  module: 'SENDGRID_WEBHOOK',
});

interface SendGridEvent {
  email: string;
  timestamp: number;
  'smtp-id': string;
  event: string;
  category?: string[];
  sg_event_id: string;
  sg_message_id: string;
  useragent?: string;
  ip?: string;
  url?: string;
  url_offset?: {
    index: number;
    type: string;
  };
  // Custom args we added
  internal_tracking_id?: string;
  [key: string]: any;
}

function verifySignature(publicKey: string, payload: string, signature: string, timestamp: string): boolean {
  try {
    const timestampPayload = timestamp + payload;
    const decodedSignature = Buffer.from(signature, 'base64');

    // Create verifier
    const verifier = crypto.createVerify('sha256');
    verifier.update(timestampPayload, 'utf8');

    return verifier.verify(publicKey, decodedSignature);
  } catch (error) {
    logger.error({ error }, 'Error verifying SendGrid signature');
    return false;
  }
}

export const handleSendGridWebhook = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Verify webhook signature if configured
    if (SENDGRID_WEBHOOK_VERIFY_KEY) {
      const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
      const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;

      if (!signature || !timestamp) {
        logger.error('Missing SendGrid signature or timestamp headers');
        return res.status(400).json({ error: 'Missing required headers' });
      }

      const payload = JSON.stringify(req.body);
      const isValid = verifySignature(SENDGRID_WEBHOOK_VERIFY_KEY, payload, signature, timestamp);

      if (!isValid) {
        logger.error('SendGrid webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [req.body];

    logger.info(`Processing ${events.length} SendGrid webhook events`);

    // Process events in parallel but with idempotent updates
    await Promise.allSettled(
      events.map(async (event) => {
        try {
          await processEvent(event);
        } catch (error) {
          logger.error({ error, eventId: event.sg_event_id }, 'Failed to process SendGrid event');
        }
      }),
    );

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'SendGrid webhook processing failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function processEvent(event: SendGridEvent) {
  const { event: eventType, sg_message_id, internal_tracking_id, timestamp } = event;

  if (!internal_tracking_id) {
    // Skip events without our tracking ID
    return;
  }

  logger.info(
    {
      eventType,
      sg_message_id,
      internal_tracking_id,
      timestamp,
    },
    'Processing SendGrid event',
  );

  // Only process click events for the email types we care about
  if (eventType !== 'click') {
    return;
  }

  // Find the email record by internal tracking ID (using indexed column)
  // Only look for the email types we care about
  const emailRecord = await prisma.sentEmail.findFirst({
    where: {
      internalTrackingId: internal_tracking_id,
      emailType: {
        in: ['SCIWEAVE_OUT_OF_CHATS_INITIAL', 'SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED'],
      },
    },
  });

  if (!emailRecord) {
    logger.debug({ internal_tracking_id }, 'No relevant email record found for tracking ID');
    return;
  }

  // Check if we've already recorded a click (idempotent)
  const currentDetails = emailRecord.details as any;

  if (currentDetails?.ctaClicked) {
    logger.debug({ internal_tracking_id }, 'CTA click already recorded, skipping');
    return;
  }

  const updatedDetails = {
    ...currentDetails,
    ctaClicked: true,
  };

  // Update to track that CTA was clicked
  await prisma.sentEmail.update({
    where: {
      id: emailRecord.id,
    },
    data: {
      details: updatedDetails,
    },
  });

  logger.info(
    {
      internal_tracking_id,
      emailType: emailRecord.emailType,
      emailRecordId: emailRecord.id,
    },
    'Successfully processed SendGrid click event',
  );
}
