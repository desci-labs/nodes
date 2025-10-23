import { type ProjectFrontmatter } from '@awesome-myst/myst-zod';
import { ImportTaskQueueStatus, PrismaClient } from '@prisma/client';

import { logger as parentLogger } from '../logger.js';
import { DEFAULT_TTL, delFromCache, setToCache } from '../redisClient.js';
import { ensureUuidEndsWithDot } from '../utils.js';

const logger = parentLogger.child({ module: '[ImportTaskService]' });

export class ImportTaskService {
  dbClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.dbClient = prismaClient;
  }

  /**
   * Create a new import task
   */
  async createImportTask(data: {
    jobId: string;
    uuid: string;
    url: string;
    status?: ImportTaskQueueStatus;
    attempts?: number;
    userId: number;
    parsedDocument: ProjectFrontmatter;
  }) {
    await setToCache(`myst-import-job-${data.jobId}`, data.parsedDocument, DEFAULT_TTL);
    return await this.dbClient.importTaskQueue.create({
      data: {
        jobId: data.jobId,
        nodeUuid: ensureUuidEndsWithDot(data.uuid),
        url: data.url,
        userId: data.userId,
        status: data.status || ImportTaskQueueStatus.PENDING,
        attempts: data.attempts || 0,
      },
    });
  }

  /**
   * Get pending import tasks
   */
  async getPendingTasks() {
    return await this.dbClient.importTaskQueue.findMany({
      where: { status: ImportTaskQueueStatus.PENDING },
    });
  }

  /**
   * Get in-progress import tasks
   */
  async getInProgressTasks() {
    return await this.dbClient.importTaskQueue.findMany({
      where: { status: ImportTaskQueueStatus.IN_PROGRESS },
    });
  }

  /**
   * Get task by job ID
   */
  async getTaskByJobId(jobId: string) {
    return await this.dbClient.importTaskQueue.findFirst({
      where: { jobId },
    });
  }

  /**
   * Get task by UUID
   */
  async getTaskByUuid(nodeUuid: string) {
    return await this.dbClient.importTaskQueue.findFirst({
      where: { nodeUuid },
    });
  }

  /**
   * Update task status
   */
  async updateTaskStatus(jobId: string, status: ImportTaskQueueStatus, attempts?: number) {
    return await this.dbClient.importTaskQueue.update({
      where: { jobId },
      data: {
        status,
        ...(attempts !== undefined && { attempts }),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Update task with error
   */
  async updateTaskWithError(jobId: string, error: string) {
    return await this.dbClient.importTaskQueue.update({
      where: { jobId },
      data: {
        status: ImportTaskQueueStatus.FAILED,
        attempts: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Mark task as completed
   */
  async markTaskCompleted(jobId: string) {
    await delFromCache(`myst-import-job-${jobId}`);
    return await this.dbClient.importTaskQueue.update({
      where: { jobId },
      data: {
        status: ImportTaskQueueStatus.COMPLETED,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Delete task
   */
  async deleteTask(jobId: string) {
    return await this.dbClient.importTaskQueue.delete({
      where: { jobId },
    });
  }

  /**
   * Get all tasks for a node
   */
  async getTasksForNode(nodeUuid: string) {
    return await this.dbClient.importTaskQueue.findMany({
      where: { nodeUuid: ensureUuidEndsWithDot(nodeUuid) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get active tasks (pending, in-progress, or failed) for a node
   */
  async getActiveTasksForNode(nodeUuid: string) {
    return await this.dbClient.importTaskQueue.findFirst({
      where: {
        nodeUuid: ensureUuidEndsWithDot(nodeUuid),
        status: {
          in: [ImportTaskQueueStatus.PENDING, ImportTaskQueueStatus.IN_PROGRESS, ImportTaskQueueStatus.FAILED],
        },
      },
    });
  }

  /**
   * Cancel and delete all active tasks for a node
   */
  async cancelActiveTasksForNode(nodeUuid: string) {
    const activeTask = await this.getActiveTasksForNode(nodeUuid);

    if (!activeTask) {
      return { cancelled: 0 };
    }

    // Delete all active tasks
    const deleteResult = await this.dbClient.importTaskQueue.deleteMany({
      where: {
        nodeUuid: ensureUuidEndsWithDot(nodeUuid),
        status: {
          in: [ImportTaskQueueStatus.PENDING, ImportTaskQueueStatus.IN_PROGRESS, ImportTaskQueueStatus.FAILED],
        },
      },
    });

    return { cancelled: deleteResult.count };
  }

  /**
   * Get completed tasks older than specified hours
   */
  async getOldCompletedTasks(hoursOld: number = 24) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursOld);

    return await this.dbClient.importTaskQueue.findMany({
      where: {
        status: ImportTaskQueueStatus.COMPLETED,
        updatedAt: {
          lt: cutoffDate,
        },
      },
    });
  }

  /**
   * Delete completed tasks older than specified hours
   */
  async deleteOldCompletedTasks(hoursOld: number = 24) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursOld);

    const deleteResult = await this.dbClient.importTaskQueue.deleteMany({
      where: {
        status: ImportTaskQueueStatus.COMPLETED,
        updatedAt: {
          lt: cutoffDate,
        },
      },
    });

    return { deleted: deleteResult.count };
  }

  /**
   * Retry a failed task by resetting its status to PENDING
   */
  async retryTask(jobId: string) {
    const task = await this.getTaskByJobId(jobId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== ImportTaskQueueStatus.FAILED) {
      throw new Error('Task is not in failed status');
    }

    if (task.attempts >= 3) {
      throw new Error('Task has reached maximum retry attempts (3)');
    }

    return await this.dbClient.importTaskQueue.update({
      where: { jobId },
      data: {
        status: ImportTaskQueueStatus.PENDING,
        updatedAt: new Date(),
      },
    });
  }
}
