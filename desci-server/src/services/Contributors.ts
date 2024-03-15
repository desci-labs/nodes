import { error } from 'console';

import { Node, NodeContribution, User } from '@prisma/client';

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

export type AddNodeContributionParams = {
  node: Node;
  nodeOwner: User;
  contributorId: string;
  email?: string;
  orcid?: string;
  userId?: number;
};

class ContributorService {
  private logger = parentLogger.child({ module: 'Services::ContributorsService' });

  async addNodeContribution({
    node,
    nodeOwner,
    contributorId,
    email,
    orcid,
    userId,
  }: AddNodeContributionParams): Promise<NodeContribution> {
    // Check if contributor is already registered
    let registeredContributor;
    if (email) registeredContributor = await prisma.user.findUnique({ where: { email } });
    if (orcid) registeredContributor = await prisma.user.findUnique({ where: { orcid } });
    if (userId !== undefined || userId !== null)
      registeredContributor = await prisma.user.findUnique({ where: { id: userId } });

    const userHasOrcidValidated = nodeOwner.orcid !== undefined && nodeOwner.orcid !== null;
    const contributionOrcidMatchesUser = userHasOrcidValidated && orcid === nodeOwner.orcid;
    const userIsOwner = userId === nodeOwner.id;
    const autoVerified = nodeOwner.email === email || contributionOrcidMatchesUser || userIsOwner;
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
      where: { nodeId: node.id, userId: { not: null } },
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

  async verifyContribution(user: User, contributorId: string): Promise<boolean> {
    if (!contributorId) throw Error('contributorId required');
    const contribution = await prisma.nodeContribution.findUnique({ where: { contributorId } });
    if (!contribution) throw Error('Invalid contributorId');

    const contributionPointsToUser = contribution.email === user.email || contribution.orcid === user.orcid;
    if (!contributionPointsToUser) throw Error('Unauthorized to verify contribution');

    const userHasOrcidValidated = user.orcid !== undefined && user.orcid !== null;

    const contributionOrcidMatchesUser = userHasOrcidValidated && contribution.orcid === user.orcid;
    const contributorEmailMatchesUser = user.email === contribution.email;
    const verified = contributorEmailMatchesUser || contributionOrcidMatchesUser;
    if (verified) {
      const updated = await prisma.nodeContribution.update({
        where: { id: contribution.id },
        data: { verified: true },
      });
      if (updated) return true;
    }

    return false;
  }
}

export const contributorService = new ContributorService();
