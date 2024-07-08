import { format } from 'path';

import { IpldUrl, ResearchObjectV1Dpid } from '@desci-labs/desci-models';
import { Node, NodeContribution, User } from '@prisma/client';
import ShortUniqueId from 'short-unique-id';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { formatOrcidString, hexToCid } from '../utils.js';

import { getManifestByCid } from './data/processing.js';

type ContributorId = string;

export type NodeContributorMap = Record<ContributorId, NodeContributor>;
export type NodeContributorMapAuthed = Record<ContributorId, NodeContributorAuthed>;
export interface NodeContributor {
  name: string | undefined;
  verified: boolean;
  userId: number;
  deleted: boolean;
  deletedAt: string;
}
export interface NodeContributorAuthed extends NodeContributor {
  email?: string;
  orcid?: string;
}

export type UserContribution = {
  uuid: string;
  manifestCid: string;
  title?: string;
  versions: number;
  coverImageCid?: string | IpldUrl;
  dpid?: ResearchObjectV1Dpid;
  publishDate: string;
};

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

export const PRIV_SHARE_CONTRIBUTION_PREFIX = 'C-';

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
    if (orcid) orcid = formatOrcidString(orcid); // Ensure hyphenated
    // Check if contributor is already registered
    let registeredContributor;
    if (email) registeredContributor = await prisma.user.findUnique({ where: { email } });
    if (orcid) registeredContributor = await prisma.user.findUnique({ where: { orcid } });
    // debugger;
    if (userId) registeredContributor = await prisma.user.findUnique({ where: { id: userId } });

    const userHasOrcidValidated = nodeOwner.orcid !== undefined && nodeOwner.orcid !== null;
    const contributionOrcidMatchesUser = userHasOrcidValidated && orcid === nodeOwner.orcid;
    const userIsOwner = userId === nodeOwner.id;
    const autoVerified = nodeOwner.email === email || contributionOrcidMatchesUser || userIsOwner;
    return prisma.nodeContribution.create({
      data: {
        contributorId,
        email,
        orcid,
        verified: autoVerified,
        nodeId: node.id,
        ...(registeredContributor && { userId: registeredContributor.id }),
      },
    });
  }

  /**
   *  For changing the contributions email/orcid/userId, can only be done if the contribution is not yet verified.
   */
  async updateNodeContribution({
    node,
    nodeOwner,
    contributorId,
    email,
    orcid,
    userId,
  }: AddNodeContributionParams): Promise<NodeContribution> {
    if (orcid) orcid = formatOrcidString(orcid); // Ensure hyphenated
    // Check if contribution is already verified
    let registeredContributor;
    if (email) registeredContributor = await prisma.user.findUnique({ where: { email } });
    if (orcid) registeredContributor = await prisma.user.findUnique({ where: { orcid } });
    if (userId) registeredContributor = await prisma.user.findUnique({ where: { id: userId } });

    const existingContribution = await prisma.nodeContribution.findFirst({
      where: { contributorId, nodeId: node.id },
    });
    if (!existingContribution) {
      return this.addNodeContribution({ node, nodeOwner, contributorId, email, orcid, userId });
    }
    const currentContributorEmail = existingContribution.email;
    if (currentContributorEmail !== email) {
      // Revoke priv share link for old email
      this.removePrivShareCodeForContribution(existingContribution, node);
    }

    // Don't allow updating if already verified
    if (existingContribution.verified) throw Error('Contributor already verified');

    const userHasOrcidValidated = nodeOwner.orcid !== undefined && nodeOwner.orcid !== null;
    const contributionOrcidMatchesUser = userHasOrcidValidated && orcid === nodeOwner.orcid;
    const userIsOwner = userId === nodeOwner.id;
    const autoVerified = nodeOwner.email === email || contributionOrcidMatchesUser || userIsOwner;

    // Revoke priv share link for old email

    return prisma.nodeContribution.update({
      where: {
        id: existingContribution.id,
      },
      data: {
        email,
        orcid,
        nodeId: node.id,
        verified: autoVerified,
        ...(registeredContributor && { userId: registeredContributor.id }),
      },
    });
  }

  async removeContributor(contributorId: string, nodeId: number): Promise<boolean> {
    const contribution = await prisma.nodeContribution.findFirst({
      where: { contributorId, nodeId },
      include: { node: true },
    });
    if (!contribution) throw Error('Contribution not found');

    // Revoke priv share link

    const removed = await prisma.nodeContribution.update({
      where: { id: contribution.id },
      data: { deleted: true, deletedAt: new Date() },
    });

    this.removePrivShareCodeForContribution(removed, contribution.node);

    if (removed) return true;

    return false;
  }

  async retrieveSelectedContributionsForNode(
    node: Node,
    contributorIds: string[],
    authedMode = false,
  ): Promise<NodeContributorMap | NodeContributorMapAuthed> {
    const contributions = await prisma.nodeContribution.findMany({
      where: { nodeId: node.id, contributorId: { in: contributorIds } },
      include: { user: true },
    });

    return contributions.reduce((acc, contributor) => {
      acc[contributor.contributorId] = {
        name: contributor.user?.name,
        verified: !!contributor.verified,
        userId: contributor.user?.id,
        deleted: contributor.deleted,
        deletedAt: contributor.deletedAt,
        ...(authedMode && { inviteSent: contributor.inviteSent }),
        ...(authedMode && { email: contributor.email, orcid: contributor.orcid }),
      };
      return acc;
    }, {});
  }

  /**
   * To be used within the backend, if the data from this is returned to the frontend, it can potentially leak data,
   * opt for retrieveSelectedContributionsForNode instead if the data is to be returned to the frontend
   */
  async retrieveAllContributionsForNode(
    node: Node,
    verifiedOnly?: boolean,
  ): Promise<(NodeContribution & { user: User })[]> {
    return prisma.nodeContribution.findMany({
      where: { nodeId: node.id, ...(verifiedOnly && { verified: true }) },
      include: { user: true },
    });
  }

  async retrieveContributionsForUser(user: User): Promise<UserContribution[]> {
    const contributions = await prisma.nodeContribution.findMany({
      where: { userId: user.id },
      include: { node: true },
    });
    const nodeUuids = contributions.map((contribution) => contribution.node.uuid);
    // Filter out for published works
    const { researchObjects } = await getIndexedResearchObjects(nodeUuids);
    const filledContributions = await Promise.all(
      researchObjects.map(async (ro) => {
        // convert hex string to integer
        const nodeUuidInt = Buffer.from(ro.id.substring(2), 'hex');
        // convert integer to hex
        const nodeUuid = nodeUuidInt.toString('base64url');
        const manifestCid = hexToCid(ro.recentCid);
        const latestManifest = await getManifestByCid(manifestCid);

        return {
          uuid: nodeUuid,
          manifestCid,
          title: latestManifest.title,
          versions: ro.versions.length,
          coverImageCid: latestManifest.coverImage,
          dpid: latestManifest.dpid,
          publishDate: ro.versions[0].time,
        };
      }),
    );
    // debugger;
    return filledContributions || [];
  }

  /**
   * Retrieve a map of all nodes an authed user has contributed to, to enable checks such as canVerify on the frontend
   */
  async retrieveUserContributionMap(user: User): Promise<NodeContributorMap> {
    const contributions = await prisma.nodeContribution.findMany({
      where: {
        OR: [{ userId: user.id }, { email: user.email }, { orcid: user.orcid }],
      },
      include: { node: true, user: true },
    });
    return contributions.reduce((acc, contributor) => {
      acc[contributor.contributorId] = {
        name: contributor.user?.name,
        verified: !!contributor.verified,
        userId: contributor.user?.id,
        deleted: contributor.deleted,
        deletedAt: contributor.deletedAt,
      };
      return acc;
    }, {});
  }

  async verifyContribution(user: User, contributorId: string): Promise<boolean> {
    if (!contributorId) throw Error('contributorId required');
    const contribution = await prisma.nodeContribution.findUnique({ where: { contributorId } });
    if (!contribution) throw Error('Invalid contributorId');

    const contributionPointsToUser =
      contribution.email === user.email || contribution.orcid === user.orcid || contribution.userId === user.id;
    if (!contributionPointsToUser) throw Error('Unauthorized to verify contribution');

    const userHasOrcidValidated = user.orcid !== undefined && user.orcid !== null;

    const contributionOrcidMatchesUser = userHasOrcidValidated && contribution.orcid === user.orcid;
    const contributorEmailMatchesUser = user.email === contribution.email;
    const contributionUserIdMatchesUser = user.id === contribution.userId;
    const verified = contributorEmailMatchesUser || contributionOrcidMatchesUser || contributionUserIdMatchesUser;
    if (verified) {
      const updated = await prisma.nodeContribution.update({
        where: { id: contribution.id },
        data: { verified: true },
      });
      if (updated) return true;
    }

    return false;
  }

  async generatePrivShareCodeForContribution(contribution: NodeContribution, node: Node): Promise<null | string> {
    if (!contribution.email && !contribution.userId) return null;
    let email = contribution.email;
    if (!email) {
      // Extract the email from the userId
      const user = await prisma.user.findUnique({ where: { id: contribution.userId } });
      if (!user) return null;
      email = user.email;
    }
    const privShare = await prisma.privateShare.findFirst({
      where: { nodeUUID: node.uuid, memo: PRIV_SHARE_CONTRIBUTION_PREFIX + email },
    });

    if (privShare) return privShare.shareId;

    const shareCode = new ShortUniqueId.default({ length: 10 });
    const newPrivShare = await prisma.privateShare.create({
      data: {
        nodeUUID: node.uuid,
        shareId: shareCode() as string,
        memo: PRIV_SHARE_CONTRIBUTION_PREFIX + email,
      },
    });

    return newPrivShare.shareId;
  }

  async removePrivShareCodeForContribution(contribution: NodeContribution, node: Node): Promise<void> {
    if (!contribution.email && !contribution.userId) return;
    let email = contribution.email;
    if (!email) {
      // Extract the email from the userId
      const user = await prisma.user.findUnique({ where: { id: contribution.userId } });
      if (!user) return;
      email = user.email;
    }
    const privShare = await prisma.privateShare.findFirst({
      where: { nodeUUID: node.uuid, memo: PRIV_SHARE_CONTRIBUTION_PREFIX + email },
    });

    if (privShare) await prisma.privateShare.delete({ where: { id: privShare.id } });
  }

  async getShareCodeForContribution(contribution: NodeContribution, node: Node): Promise<null | string> {
    if (!contribution.email && !contribution.userId) return null;
    let email = contribution.email;
    if (!email) {
      // Extract the email from the userId
      const user = await prisma.user.findUnique({ where: { id: contribution.userId } });
      if (!user) return null;
      email = user.email;
    }
    const privShare = await prisma.privateShare.findFirst({
      where: { nodeUUID: node.uuid, memo: PRIV_SHARE_CONTRIBUTION_PREFIX + email },
    });

    if (privShare) return privShare.shareId;
    return null;
  }

  async getContributionById(contributorId: string): Promise<NodeContribution> {
    return prisma.nodeContribution.findUnique({ where: { contributorId } });
  }
}

export const contributorService = new ContributorService();
