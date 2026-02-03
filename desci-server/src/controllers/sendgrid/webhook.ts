import crypto from 'crypto';

import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { SENDGRID_WEBHOOK_VERIFY_KEY, SENDGRID_ASM_GROUP_IDS } from '../../config.js';
import { logger as parentLogger } from '../../logger.js';
import { AppType } from '../../services/interactionLog.js';
import { MarketingConsentService } from '../../services/user/Marketing.js';

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
  app_type?: 'SCIWEAVE' | 'PUBLISH';
  // ASM group unsubscribe info
  asm_group_id?: number;
  [key: string]: any;
}

function verifySignature(publicKey: string, payloadBuffer: Buffer, signature: string, timestamp: string): boolean {
  try {
    // Build message as Buffer concatenation to preserve exact bytes
    const timestampBuffer = Buffer.from(timestamp, 'utf8');
    const message = Buffer.concat([timestampBuffer, payloadBuffer]);
    const signatureBuffer = Buffer.from(signature, 'base64');

    // Create verifier and update with the raw Buffer
    const verifier = crypto.createVerify('sha256');
    verifier.update(message);

    return verifier.verify(publicKey, signatureBuffer);
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

      // Get raw payload buffer - req.body should be a Buffer from raw() middleware
      const payloadBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body), 'utf8');
      const isValid = verifySignature(SENDGRID_WEBHOOK_VERIFY_KEY, payloadBuffer, signature, timestamp);

      if (!isValid) {
        logger.error('SendGrid webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Parse body if it's a Buffer from raw() middleware
    const parsedBody = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
    const events: SendGridEvent[] = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

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
  const { event: eventType, sg_message_id, internal_tracking_id, timestamp, email, app_type } = event;

  logger.info(
    {
      eventType,
      sg_message_id,
      internal_tracking_id,
      timestamp,
      email,
      app_type,
    },
    'Processing SendGrid event',
  );

  // Handle unsubscribe events
  if (eventType === 'unsubscribe' || eventType === 'group_unsubscribe') {
    await processUnsubscribeEvent(event);
    return;
  }

  // For click events, we need the tracking ID
  if (!internal_tracking_id) {
    // Skip events without our tracking ID
    return;
  }

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
  const currentDetails = (emailRecord.details ?? {}) as Record<string, any>;

  if (currentDetails?.ctaClicked) {
    logger.debug({ internal_tracking_id }, 'CTA click already recorded, skipping');
    return;
  }

  const updatedDetails = { ...(currentDetails || {}), ctaClicked: true };

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

/**
 * Determine which app type based on ASM group ID
 * Returns null if the group ID is not a marketing group we care about
 */
function getAppTypeFromAsmGroupId(asmGroupId: number | undefined): AppType | null {
  if (asmGroupId === SENDGRID_ASM_GROUP_IDS.SCIWEAVE_MARKETING) {
    return AppType.SCIWEAVE;
  }
  if (asmGroupId === SENDGRID_ASM_GROUP_IDS.PUBLISH_MARKETING) {
    return AppType.PUBLISH;
  }
  // Transactional groups or unknown - don't update marketing preferences
  return null;
}

/**
 * Process unsubscribe events from SendGrid webhook
 * Updates the user's marketing consent preference based on the ASM group ID
 */
async function processUnsubscribeEvent(event: SendGridEvent) {
  const { email, asm_group_id, app_type, sg_event_id } = event;

  if (!email) {
    logger.warn({ sg_event_id }, 'Unsubscribe event missing email address');
    return;
  }

  // Determine app type from ASM group ID (preferred) or fall back to app_type custom arg
  let appType: AppType | null = getAppTypeFromAsmGroupId(asm_group_id);

  // If no ASM group ID or it's not a marketing group, fall back to app_type custom arg
  if (!appType && app_type) {
    appType = app_type === 'PUBLISH' ? AppType.PUBLISH : AppType.SCIWEAVE;
  }

  // If still no app type, default to SCIWEAVE for backwards compatibility
  if (!appType) {
    appType = AppType.SCIWEAVE;
  }

  // Skip if unsubscribe was from a transactional group (not marketing)
  if (asm_group_id && !getAppTypeFromAsmGroupId(asm_group_id)) {
    logger.info({ email, asm_group_id, sg_event_id }, 'Ignoring unsubscribe from transactional ASM group');
    return;
  }

  // Find user by email
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    logger.warn({ email, sg_event_id }, 'User not found for unsubscribe event');
    return;
  }

  logger.info(
    {
      email,
      userId: user.id,
      asm_group_id,
      app_type,
      appType,
      sg_event_id,
    },
    'Processing SendGrid unsubscribe event',
  );

  const result = await MarketingConsentService.updateMarketingConsent({
    userId: user.id,
    receiveMarketingEmails: false,
    appType,
    source: 'sendgrid_webhook',
  });

  if (result.isErr()) {
    logger.warn(
      {
        email,
        userId: user.id,
        error: result.error.message,
        sg_event_id,
      },
      'Failed to process unsubscribe event',
    );
    return;
  }

  logger.info(
    {
      email,
      userId: user.id,
      appType,
      asm_group_id,
      sg_event_id,
    },
    'Successfully processed SendGrid unsubscribe event',
  );
}
