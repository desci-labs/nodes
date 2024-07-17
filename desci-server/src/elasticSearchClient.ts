import { Client } from '@elastic/elasticsearch';

const esNodeUrl = process.env.ELASTIC_SEARCH_NODE_URL;
const esUser = process.env.ELASTIC_SEARCH_USER;
const esPw = process.env.ELASTIC_SEARCH_PW;

if (!esNodeUrl || !esUser || !esPw) {
  console.error('Missing environment variables for ElasticSearch');
}

export const elasticClient = new Client({
  node: esNodeUrl,

  auth: {
    username: esUser,
    password: esPw,
  },
  tls: {
    rejectUnauthorized: false, // Temporary
  },
});
