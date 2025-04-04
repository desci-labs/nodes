import { prisma } from '../client.js';

import { AutomatedMetadataClient } from './AutomatedMetadata.js';
import CrossRefClient from './crossRef/client.js';
import { DoiService } from './Doi.js';
import { OpenAlexClient } from './openAlex/client.js';
import { OpenAlexService } from './OpenAlexService.js';

export const doiService = new DoiService(prisma);
export const crossRefClient = new CrossRefClient('', process.env.CROSSREF_EMAIL);
export const openAlexService = new OpenAlexClient();
export const metadataClient = new AutomatedMetadataClient(
  process.env.AUTOMATED_METADATA_API || 'http://host.docker.internal:5005', // remove this after env have been added to CI
  process.env.AUTOMATED_METADATA_API_KEY || '',
);
