import { Client } from '@elastic/elasticsearch';

const esNodeUrl = process.env.ELASTIC_SEARCH_NODE_URL;
const esUser = process.env.ELASTIC_SEARCH_USER;
const esPw = process.env.ELASTIC_SEARCH_PW;
const esWriteApiKey = process.env.ELASTIC_SEARCH_WRITE_API_KEY;

if (!esNodeUrl || !esUser || !esPw) {
  console.error('Missing environment variables for ElasticSearch');
}

if (!esWriteApiKey) {
  console.error('Missing ELASTIC_SEARCH_WRITE_API_KEY environment variable for ElasticSearch Write ops');
}

const esAuthConfig =
  !esNodeUrl?.includes('host.docker.internal') && esUser && esPw
    ? {
        // Auth unnecessary if running local ES node
        auth: {
          username: esUser,
          password: esPw,
        },
      }
    : {};

export const elasticClient =
  esNodeUrl && esUser && esPw
    ? new Client({
        node: esNodeUrl,
        ...esAuthConfig,
        tls: {
          rejectUnauthorized: false, // Temporary
        },
      })
    : ({} as any);

export const elasticWriteClient =
  esNodeUrl && esWriteApiKey
    ? new Client({
        node: esNodeUrl,
        auth: {
          apiKey: esWriteApiKey,
        },
        tls: {
          rejectUnauthorized: false,
        },
      })
    : ({} as any);
