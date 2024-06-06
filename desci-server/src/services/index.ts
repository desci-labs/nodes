import { prisma } from '../client.js';

import CrossRefClient from './crossRef/client.js';
import { DoiService } from './Doi.js';

export const doiService = new DoiService(prisma);
export const crossRefClient = new CrossRefClient(
  process.env.CROSSREF_API,
  '', // process.env.CROSSREF_API_KEY,
  process.env.CROSSREF_EMAIL,
);
