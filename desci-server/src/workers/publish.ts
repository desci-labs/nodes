import { PublishTaskQueue, PublishTaskQueueStatus } from '@prisma/client';
import { ethers } from 'ethers';

import { prisma } from '../client.js';
import { publishHandler } from '../controllers/nodes/publish.js';
import { logger as parentLogger } from '../logger.js';
import { lockService } from '../redisClient.js';
import { randomUUID64 } from '../utils.js';

enum ProcessOutcome {
  EmptyQueue,
  TaskCompleted,
  Error,
}

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'http://host.docker.internal:8545';

if (!ETHEREUM_RPC_URL) throw new Error('Env var` ETHEREUM_RPC_URL` not set');

const logger = parentLogger.child({ module: 'PUBLISH WORKER ' });

const checkTransaction = async (transactionId: string, uuid: string) => {
  const provider = ethers.getDefaultProvider(ETHEREUM_RPC_URL);
  if (!process.env.MUTE_PUBLISH_WORKER)
    logger.info(
      {
        uuid,
        transactionId,
        ETHEREUM_RPC_URL,
      },
      'TX::check transaction',
    );

  console.log('NETWORK', await provider.getNetwork());
  const tx = await provider.getTransactionReceipt(transactionId);
  console.log('TX::Receipt', { tx });
  return tx?.status;
};

async function processPublishQueue(workerId = '') {
  const task = await dequeueTask(workerId);
  if (!task) return ProcessOutcome.EmptyQueue;

  try {
    const txStatus = await checkTransaction(task.transactionId, task.uuid);
    if (txStatus === 1) {
      publishHandler(task)
        .then(async (published) => {
          if (!process.env.MUTE_PUBLISH_WORKER) logger.info({ task, published }, 'PUBLISH HANDLER SUCCESS');
          lockService.freeLock(task.transactionId);
        })
        .catch((err) => {
          logger.info({ task, err }, 'PUBLISH HANDLER ERROR');
          lockService.freeLock(task.transactionId);
        });
      await prisma.publishTaskQueue.delete({ where: { id: task.id } });
    } else if (txStatus === 0) {
      await prisma.publishTaskQueue.update({ where: { id: task.id }, data: { status: PublishTaskQueueStatus.FAILED } });
      lockService.freeLock(task.transactionId);
      if (!process.env.MUTE_PUBLISH_WORKER) logger.info({ txStatus }, 'PUBLISH TX FAILED');
    } else {
      await prisma.publishTaskQueue.update({
        where: { id: task.id },
        data: { status: PublishTaskQueueStatus.PENDING },
      });
      lockService.freeLock(task.transactionId);
      logger.info({ txStatus }, 'PUBLISH TX Might be stuck');
    }
    return ProcessOutcome.TaskCompleted;
  } catch (err) {
    logger.error({ err }, 'ProcessPublishQueue::ERROR');
    return ProcessOutcome.Error;
  } finally {
    lockService.freeLock(task.transactionId);
  }
}

const dequeueTask = async (workerId = '') => {
  let nextTask: PublishTaskQueue;
  let tasks = await prisma.publishTaskQueue.findMany({ where: { status: PublishTaskQueueStatus.WAITING }, take: 5 });
  if (!tasks.length) {
    tasks = await prisma.publishTaskQueue.findMany({ where: { status: PublishTaskQueueStatus.PENDING }, take: 5 });
  }
  if (!process.env.MUTE_PUBLISH_WORKER) logger.info({ tasks, workerId }, 'TASKS');
  for (const task of tasks) {
    const taskLock = await lockService.aquireLock(task.transactionId);
    logger.info({ taskLock, task, workerId }, 'ATTEMPT TO ACQUIRE LOCK');
    if (taskLock) {
      nextTask = task;
      break;
    }
  }
  if (!process.env.MUTE_PUBLISH_WORKER) logger.info({ nextTask, workerId }, 'DEQUEUE TASK');
  return nextTask;
};

const delay = async (timeMs: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
};

export async function runWorkerUntilStopped() {
  // TODO: use server instance k8s pod id
  const workerId = randomUUID64();
  while (true) {
    const outcome = await processPublishQueue(workerId);
    if (!process.env.MUTE_PUBLISH_WORKER) logger.info({ outcome, workerId }, 'Processed Queue');
    switch (outcome) {
      case ProcessOutcome.EmptyQueue:
        await delay(10000);
        break;
      case ProcessOutcome.Error:
        await delay(1000);
        break;
      case ProcessOutcome.TaskCompleted:
        break;
      default:
        logger.error({ outcome }, 'UNREACHABLE CODE REACHED, CHECK IMMEDIATELY');
    }
  }
}
