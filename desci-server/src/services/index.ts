import { prisma } from '../client.js';

import { AutomatedMetadataClient } from './AutomatedMetadata.js';
import CrossRefClient from './crossRef/client.js';
import { DoiService } from './Doi.js';

export const doiService = new DoiService(prisma);
export const crossRefClient = new CrossRefClient(
  process.env.CROSSREF_API,
  '', // process.env.CROSSREF_API_KEY,
  process.env.CROSSREF_EMAIL,
);
export const metadataClient = new AutomatedMetadataClient(
  process.env.AUTOMATED_METADATA_API || 'http://host.docker.internal:5005', // remove this after env have been added to CI
  process.env.AUTOMATED_METADATA_API_KEY,
);
