import { ImportTaskQueue, ImportTaskQueueStatus } from '@prisma/client';
import axios from 'axios';
import { CronJob } from 'cron';

import { logger as parentLogger } from '../logger.js';
import { getFromCache, lockService } from '../redisClient.js';
import { importTaskService } from '../services/index.js';
import { asyncMap } from '../utils.js';

const logger = parentLogger.child({ module: 'ImportTaskJob' });

const NODES_MEDIA_SERVER_URL = process.env.NODES_MEDIA_SERVER_URL || 'http://host.docker.internal:5430';
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;

if (!INTERNAL_SERVICE_SECRET) {
  throw new Error('INTERNAL_SERVICE_SECRET is not set');
}

/**
 * Process a single import task by calling the nodes-media service
 */
const processImportTask = async (task: ImportTaskQueue) => {
  try {
    logger.info({ taskId: task.jobId, uuid: task.nodeUuid, url: task.url }, 'Processing import task');

    // Update task status to IN_PROGRESS
    await importTaskService.updateTaskStatus(task.jobId, ImportTaskQueueStatus.IN_PROGRESS);

    const parsedDocument = await getFromCache(`myst-import-job-${task.jobId}`);
    if (!parsedDocument) {
      logger.error({ taskId: task.jobId }, 'Parsed document not found in cache');
      await importTaskService.updateTaskWithError(task.jobId, 'Parsed document not found in cache');
      return { success: false, taskId: task.jobId, error: 'Parsed document not found in cache' };
    }

    // Call nodes-media service to process the task
    const response = await axios.post(
      `${NODES_MEDIA_SERVER_URL}/v1/services/process-journal-submission`,
      {
        url: task.url,
        uuid: task.nodeUuid,
        jobId: task.jobId,
        parsedDocument: parsedDocument,
      },
      {
        headers: {
          'X-Internal-Secret': INTERNAL_SERVICE_SECRET,
        },
        timeout: 1000,
      },
    );

    if (response.status === 200) {
      logger.info({ taskId: task.jobId }, 'Import task scheduled successfully');
      // Mark as in-progress since external service will handle the actual processing
      await importTaskService.updateTaskStatus(task.jobId, 'IN_PROGRESS');
      return { success: true, taskId: task.jobId };
    } else {
      logger.error({ taskId: task.jobId, status: response.status }, 'Import task failed to schedule');
      await importTaskService.updateTaskWithError(task.jobId, `HTTP ${response.status}`);
      return { success: false, taskId: task.jobId, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    logger.error({ taskId: task.jobId, error: error.message }, 'Import task processing failed');
    await importTaskService.updateTaskWithError(task.jobId, error.message);
    return { success: false, taskId: task.jobId, error: error.message };
  }
};

/**
 * Import task queue cron callback
 * Processes pending import tasks by calling the nodes-media service
 * Only processes if there are less than 2 tasks currently in progress
 * @returns void
 */
export const onTick = async () => {
  logger.info('Import Task Queue Job Tick');

  // Cleanup old completed tasks (24+ hours old)
  const oldCompletedTasks = await importTaskService.getOldCompletedTasks();
  if (oldCompletedTasks.length > 0) {
    logger.info({ oldCompletedTasks }, 'Cleaning up old completed import tasks');
    const cleanupLock = await lockService.aquireLock('import-task-cleanup');
    if (cleanupLock) {
      try {
        const deleteResult = await importTaskService.deleteOldCompletedTasks(24);
        if (deleteResult.deleted > 0) {
          logger.info({ deleted: deleteResult.deleted }, 'Cleaned up old completed import tasks');
        }
      } catch (error) {
        logger.error({ error }, 'Error during cleanup of old completed tasks');
      } finally {
        await lockService.freeLock('import-task-cleanup');
      }
    }
  }

  // Check how many tasks are currently in progress
  const inProgressTasks = await importTaskService.getInProgressTasks();
  if (inProgressTasks.length >= 2) {
    logger.info(
      { inProgressCount: inProgressTasks.length },
      'Skipping import task processing - too many tasks in progress',
    );
    return;
  }

  const pendingTasks = await importTaskService.getPendingTasks();
  if (pendingTasks.length === 0) return;

  // Filter out tasks that have exceeded max attempts (3)
  const retryableTasks = pendingTasks.filter((task) => (task.attempts || 0) < 3);

  if (retryableTasks.length === 0) {
    logger.info('No retryable tasks found (all have exceeded max attempts)');
    return;
  }

  logger.info(
    {
      pendingTasks: pendingTasks.length,
      retryableTasks: retryableTasks.length,
      inProgressCount: inProgressTasks.length,
    },
    'Processing retryable import tasks',
  );

  const processed = await asyncMap(retryableTasks, async (task) => {
    const taskLock = await lockService.aquireLock(task.jobId);
    logger.info({ taskId: task.jobId, taskLock }, 'ACQUIRE Lock');

    if (!taskLock) return undefined;

    logger.info({ taskId: task.jobId, taskLock }, 'Lock acquired');
    try {
      const result = await processImportTask(task);
      return result;
    } catch (err) {
      logger.warn({ err, taskId: task.jobId }, 'Import task processing error');
      await importTaskService.updateTaskWithError(task.jobId, err.message);
      return { success: false, taskId: task.jobId, error: err.message };
    } finally {
      await lockService.freeLock(task.jobId);
    }
  });

  logger.trace({ processed }, 'Exiting Import Task Job with results');
};

export const ImportTaskQueueJob = new CronJob(
  // Run every 5 seconds to process import tasks
  '*/5 * * * * *', // Every 5 seconds
  onTick, // onTick
  null, // onComplete
  false, // start
);
