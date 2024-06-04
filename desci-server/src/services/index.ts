import { prisma } from '../client.js';

import CrossRefClient from './crossRef/client.js';
import { DoiService } from './Doi.js';

export const doiService = new DoiService(prisma);
export const crossRefClient = new CrossRefClient(
  process.env.CROSS_REF_API,
  process.env.CROSS_REF_API_KEY,
  process.env.CROSS_REF_EMAIL,
);
