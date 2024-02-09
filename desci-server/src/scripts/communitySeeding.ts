import { backendPublish } from '../../test/publishUtil.js';
import { logger } from '../logger.js';

(async () => {
  backendPublish({ uuid: 't' });
})();
