// import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { IPFS_NODE, migrateCid, migrateCidByPinning } from '../services/ipfs.js';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

async function testExec() {
  // debugger;
  logger.info('Testing script run');

  await migrateCidByPinning('', {
    destinationIpfsNode: IPFS_NODE.GUEST,
  });

  process.exit(0);
}

testExec();
