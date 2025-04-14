// import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { IPFS_NODE, isCidPinned, migrateCid, migrateCidByPinning } from '../services/ipfs.js';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

async function testExec() {
  // debugger;
  logger.info('Testing script run');
  // await migrateCid('', {
  //   fromIpfsNode: IPFS_NODE.PRIVATE,
  //   toIpfsNode: IPFS_NODE.GUEST,
  // });
  // await migrateCidByPinning('', {
  //   destinationIpfsNode: IPFS_NODE.GUEST,
  // });

  logger.error(await isCidPinned('', IPFS_NODE.GUEST));

  process.exit(0);
}

testExec();
