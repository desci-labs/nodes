import { CronJob } from 'cron';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { lockService } from '../redisClient.js';
import { EmailTypes, sendEmail } from '../services/email/email.js';
import { doiService } from '../services/index.js';
import { DiscordChannel, discordNotify, DiscordNotifyType } from '../utils/discordUtils.js';
import { asyncMap } from '../utils.js';

const logger = parentLogger.child({ module: 'DoiSubmissionJob' });

const pingDoi = async (doi: string) => {
  const response = await fetch(`https://doi.org/${doi}`, { method: 'HEAD' });
  logger.trace({ ping: response.ok, doi, headers: response.headers }, 'PING DOI');
  if (response.ok) return true;
  return false;
};

/**
 * Submission queue cron callback
 * Concurrently process submission queue by pinging their respective
 * DOIs, if they resolve mark doi registration as successful and send a discord notification
 * to this effect
 * @returns void
 */
export const onTick = async () => {
  const pendingSubmissions = await doiService.getPendingSubmissions();
  if (pendingSubmissions.length === 0) return;
  logger.info({ pendingSubmissions }, 'pending submission');
  const processed = await asyncMap(pendingSubmissions, async (job) => {
    const taskLock = await lockService.aquireLock(job.batchId);
    logger.info({ job: job.batchId, taskLock }, 'ACQUIRE Lock');
    if (!taskLock) return undefined;
    try {
      const isResolved = await pingDoi(job.uniqueDoi);
      if (isResolved) {
        await doiService.onRegistrationSuccessful(job);
        discordNotify({
          channel: DiscordChannel.DoiMinting,
          title: 'DOI Registration ✅',
          type: DiscordNotifyType.SUCCESS,
          message: `DOI: https://doi.org/${job.uniqueDoi}
          DPID: ${job.dpid}`,
        });

        const node = await prisma.node.findFirst({
          where: { uuid: job.uuid },
          include: { owner: { select: { email: true, name: true } } },
        });

        if (node.owner.email) {
          await sendEmail({
            type: EmailTypes.DoiMinted,
            payload: {
              name: node.owner.name,
              doi: job.uniqueDoi,
              dpid: job.dpid,
              to: node.owner.email,
              title: node.title,
            },
          });
        }
      } else {
        // mark doi task as failed after 10 attempts
        await doiService.updateSubmission(
          { id: job.id },
          {
            attempts: job.attempts + 1,
            status: job.attempts > 9 ? 'FAILED' : job.status,
          },
        );
      }
      return { doi: job.uniqueDoi, jobId: job.id, isResolved };
    } catch (err) {
      logger.warn({ err }, 'pendingSubmissions cron error');
      return { doi: job.uniqueDoi, jobId: job.id, isResolved: false };
    } finally {
      await lockService.freeLock(job.batchId);
    }
  });
  logger.trace({ processed }, 'Exiting Job with results');
};

export const SubmissionQueueJob = new CronJob(
  // schedule cron to run every hour
  // '* * * * *', // 10 seconds (for local test)
  '0 * * * *', // 1 hour
  onTick, // onTick
  null, // onComplete
  false, // start
);
