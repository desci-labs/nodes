import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ElasticNodesService } from '../services/ElasticNodesService.js';
import { ensureUuidEndsWithDot } from '../utils.js';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

async function testExec() {
  // debugger;
  logger.info('Testing script run');

  const uuid = '';
  const node = await prisma.node.findUnique({ where: { uuid: ensureUuidEndsWithDot(uuid) } });

  await ElasticNodesService.updateNoveltyScoreDataForEsEntry(node);

  process.exit(0);
}

testExec();
