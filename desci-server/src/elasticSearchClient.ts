import { Client } from '@elastic/elasticsearch';

const esNodeUrl = process.env.ELASTIC_SEARCH_NODE_URL;
const esUser = process.env.ELASTIC_SEARCH_USER;
const esPw = process.env.ELASTIC_SEARCH_PW;

if (!esNodeUrl || !esUser || !esPw) {
  console.error('Missing environment variables for ElasticSearch');
}

const esAuthConfig = !esNodeUrl?.includes('host.docker.internal')
  ? {
      // Auth unnecessary if running local ES node
      auth: {
        username: esUser,
        password: esPw,
      },
    }
  : {};

export const elasticClient = new Client({
  node: esNodeUrl,

  ...esAuthConfig,
  tls: {
    rejectUnauthorized: false, // Temporary
  },
});
