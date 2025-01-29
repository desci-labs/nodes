console.log('TOP LEVEL INIT');
// import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ElasticNodesService } from '../services/ElasticNodesService.js';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

const nodeUuid = 'aQo8oXmyYGMEmWI9Hhf5WdPX4x5U6GMaWDjqAOt1S1c.';
// const nodeUuid = 'oINT7cG9In3c7fdra-1qYspHey1MypQ68rfc0P-maMc.';

async function testExec() {
  // debugger;
  logger.info('Testing script run');
  await ElasticNodesService.indexResearchObject(nodeUuid);

  process.exit(0);
}

testExec();
