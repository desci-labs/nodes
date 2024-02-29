import { PublishTaskQueueStatus } from '@prisma/client';
import { ethers } from 'ethers';

import { prisma } from '../client.js';
import { publishHandler } from '../controllers/nodes/publish.js';
import { logger as parentLogger } from '../logger.js';

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

async function processPublishQueue() {
  const task = await dequeueTask();

  if (!task) return ProcessOutcome.EmptyQueue;

  try {
    const txStatus = await checkTransaction(task.transactionId, task.uuid);
    if (txStatus === 1) {
      // todo: dispatch publish task
      publishHandler(task)
        .then((published) => {
          logger.info({ task, published }, 'PUBLISH SUCCESS');
        })
        .catch((err) => {
          logger.info({ task, err }, 'PUBLISH FAILED');
        });
      // todo: dequeue task
      await prisma.publishTaskQueue.delete({ where: { id: task.id } });
    } else if (txStatus === 0) {
      await prisma.publishTaskQueue.update({ where: { id: task.id }, data: { status: PublishTaskQueueStatus.FAILED } });
      logger.info({ txStatus }, 'PUBLISH TX Receipt');
    } else {
      await prisma.publishTaskQueue.update({
        where: { id: task.id },
        data: { status: PublishTaskQueueStatus.PENDING },
      });
      logger.info({ txStatus }, 'PUBLISH TX Might be stuck');
    }
    return ProcessOutcome.TaskCompleted;
  } catch (err) {
    logger.error({ err }, 'ProcessPublishQueue::ERROR');
    return ProcessOutcome.Error;
  }
}

const dequeueTask = async () => {
  let task = await prisma.publishTaskQueue.findFirst({ where: { status: PublishTaskQueueStatus.WAITING } });
  if (!task) {
    task = await prisma.publishTaskQueue.findFirst({ where: { status: PublishTaskQueueStatus.PENDING } });
  }
  return task;
};

const delay = async (timeMs: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
};

export async function runWorkerUntilStopped() {
  while (true) {
    const outcome = await processPublishQueue();
    console.log('Processed Queue', outcome);
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
