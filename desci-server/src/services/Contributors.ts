import { Node, User } from '@prisma/client';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { getIndexedResearchObjects } from '../theGraph.js';

type ContributorId = string;
export type NodeContributorMap = Record<ContributorId, { name: string; verified: boolean }>;

export type Contribution = {
  nodeUuid: string;
  contributorId: string;
  verified: boolean;
};

class ContributorService {
  private logger = parentLogger.child({ module: 'Services::ContributorsService' });

  async addNodeContribution(node: Node, nodeOwner: User, contributorId: string, email: string) {
    // Check if contributor is already registered
    const registeredContributor = await prisma.user.findUnique({ where: { email } });

    const autoVerified = nodeOwner.email === email;
    return prisma.nodeContribution.create({
      data: {
        contributorId,
        email,
        verified: autoVerified,
        nodeId: node.id,
        ...(registeredContributor && { userId: registeredContributor.id }),
      },
    });
  }

  // async retrieveContributionsForNode(node: Node, contributorIds: string[]): Promise<NodeContributorMap> {
  async retrieveContributionsForNode(node: Node): Promise<NodeContributorMap> {
    const contributions = await prisma.nodeContribution.findMany({
      where: { nodeId: node.id, contributorId: { in: contributorIds }, userId: { not: null } },
      // where: { nodeId: node.id, contributorId: { in: contributorIds }, userId: { not: null } },
      include: { user: true },
    });
    // TODO: Add flag for published/non published, filter out depending on auth

    return contributions.reduce((acc, contributor) => {
      acc[contributor.contributorId] = {
        name: contributor.user.name,
        verified: contributor.verified,
        userId: contributor.user.id,
      };
      return acc;
    }, {});
  }

  async retrieveContributionsForUser(user: User): Promise<Contribution[]> {
    const contributions = await prisma.nodeContribution.findMany({
      where: { userId: user.id },
      include: { node: true },
    });
    const nodeUuids = contributions.map((contribution) => contribution.node.uuid);
    const { researchObjects } = await getIndexedResearchObjects(nodeUuids); // <-- Array of research objects, convert .id to b64 to retrieve uuid
    debugger;
    return [];
  }
}

export const contributorService = new ContributorService();
