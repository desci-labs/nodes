import { prisma } from '../client.js';

import { DoiService } from './Doi.js';

export const doiService = new DoiService(prisma);
