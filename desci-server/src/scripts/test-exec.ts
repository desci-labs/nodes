import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ElasticNodesService } from '../services/ElasticNodesService.js';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

const nodeUuid = '';

async function testExec() {
  logger.info('Testing script run');
  ElasticNodesService.indexResearchObject(nodeUuid);
}

testExec();
