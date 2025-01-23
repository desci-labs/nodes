import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ElasticNodesService } from '../services/ElasticNodesService.js';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

const nodeUuid = 'AHV7nEuoSQZBk_8X137m7HvStraR30_df42EOtnIMfY.';

async function testExec() {
  logger.info('Testing script run');
  ElasticNodesService.indexResearchObject(nodeUuid);

  process.exit(0);
}

testExec();
