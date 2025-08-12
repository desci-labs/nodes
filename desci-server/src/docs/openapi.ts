import { writeFileSync } from 'fs';
import path from 'path';

import { stringify } from 'yaml';
import { createDocument } from 'zod-openapi';

import { metricsPaths } from './admin/metrics.js';
import { adminNodesPaths } from './admin/nodes.js';
import {
  getAnalyticsOperation,
  getAggregatedAnalyticsOperation,
  getAggregatedAnalyticsCsvOperation,
  getActiveOrcidUserAnalyticsOperation,
  getNewUserAnalyticsOperation,
  getNewOrcidUserAnalyticsOperation,
} from './analytics.js';
import { authorPaths } from './authors.js';
import { communityPaths } from './communities.js';
import { doiPaths } from './doi.js';
import { dpidPaths } from './dpid.js';
import { journalPaths } from './journals.js';
import { openAlexPaths } from './openalex.js';
import { searchPaths } from './search.js';
import { servicesPaths } from './services.js';
import {
  cancelUserSubmissionOperation,
  createSubmissionOperation,
  getCommunitySubmissionsOperation,
  getSubmissionOperation,
  getUserSubmissionsOperation,
  updateSubmissionStatusOperation,
} from './submissions.js';
import { userPaths } from './users.js';

export const analyticsPaths = {
  '/v1/admin/analytics': {
    get: getAnalyticsOperation,
  },
  '/v1/admin/analytics/aggregated': {
    get: getAggregatedAnalyticsOperation,
  },
  '/v1/admin/analytics/aggregated/csv': {
    get: getAggregatedAnalyticsCsvOperation,
  },
  '/v1/admin/analytics/active-orcid-users': {
    get: getActiveOrcidUserAnalyticsOperation,
  },
  '/v1/admin/analytics/new-users': {
    get: getNewUserAnalyticsOperation,
  },
  '/v1/admin/analytics/new-orcid-users': {
    get: getNewOrcidUserAnalyticsOperation,
  },
};

export const submissionPaths = {
  '/v1/submissions': {
    post: createSubmissionOperation,
  },
  '/v1/submissions/{submissionId}': {
    get: getSubmissionOperation,
    delete: cancelUserSubmissionOperation,
  },
  '/v1/communities/{communityId}/submissions': {
    get: getCommunitySubmissionsOperation,
  },
  '/v1/users/{userId}/submissions': {
    get: getUserSubmissionsOperation,
  },
  '/v1/submissions/{submissionId}/status': {
    put: updateSubmissionStatusOperation,
  },
};

// Function to get servers list including current host
function getServers() {
  const servers = [
    {
      url: 'http://localhost:5420',
      description: 'Local Endpoint',
    },
    {
      url: 'https://nodes-api-dev.desci.com',
      description: 'Staging(Nodes-dev) Endpoint',
    },
    {
      url: 'https://nodes-api.desci.com',
      description: 'Prod Endpoint',
    },
  ];

  // Add current host if it's a PR preview or different environment
  if (process.env.SERVER_URL) {
    const currentUrl = process.env.SERVER_URL;
    const isCurrentUrlInList = servers.some((server) => server.url === currentUrl);

    if (!isCurrentUrlInList) {
      let description = 'Current Environment';
      if (currentUrl.includes('pr-')) {
        const prMatch = currentUrl.match(/pr-(\d+)/);
        description = prMatch ? `PR #${prMatch[1]} Preview` : 'PR Preview Environment';
      }

      servers.unshift({
        url: currentUrl,
        description,
      });
    }
  }

  return servers;
}

export const openApiDocumentation = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'Nodes-Api documentation',
    version: '1.0.0',
    description: 'Nodes backend api documentation',
    license: {
      name: 'MIT',
    },
  },
  tags: [
    { name: 'Users', description: 'User-related operations' },
    { name: 'Admin', description: 'Admin-only operations' },
    { name: 'Communities', description: 'Community-related operations' },
    { name: 'Attestations', description: 'Attestations-related operations' },
    { name: 'Submission', description: 'Submission-related operations' },
    { name: 'Nodes', description: 'Nodes-related operations' },
    { name: 'Data', description: 'Data-related operations' },
    { name: 'DOI', description: 'DOI related operations' },
    { name: 'DPID', description: 'DPID (Decentralized Persistent Identifier) related operations' },
    { name: 'OpenAlex', description: 'OpenAlex related operations' },
    { name: 'Authors', description: 'Authors-related operations' },
    { name: 'Search', description: 'Elastic search api operations' },
    { name: 'Services', description: 'Service endpoints for various utilities' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'An bearer token issued by after login',
      },
    },
  },
  servers: getServers(),
  security: [
    {
      s2sauth: [],
    },
  ],
  paths: {
    ...analyticsPaths,
    ...submissionPaths,
    ...communityPaths,
    ...authorPaths,
    ...userPaths,
    ...searchPaths,
    ...servicesPaths,
    ...doiPaths,
    ...dpidPaths,
    ...openAlexPaths,
    ...journalPaths,
    ...adminNodesPaths,
    ...metricsPaths,
  },
});

// const yaml = stringify(openApiDocumentation, { aliasDuplicateObjects: false });

// eslint-disable-next-line no-sync
// writeFileSync(path.join(__dirname, 'openapi.yml'), yaml);
