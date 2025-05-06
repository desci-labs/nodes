import { logger as parentLogger } from '../logger.js';
import { MergeUserService } from '../services/user/merge.js';

const logger = parentLogger.child({ module: 'SCRIPTS::Testing' });

async function testExec() {
  // debugger;
  logger.info('Testing script run');
  debugger;
  // const res = await MergeUserService.mergeGuestIntoExistingUser(110, 2);

  // console.log(res);
  // await ElasticNodesService.updateNoveltyScoreDataForEsEntry(node);

  process.exit(0);
}

testExec();
