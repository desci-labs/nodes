import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';

// import { CommunityRadarNode } from '../../internal.js';

export type NodeRadarItem = {
  NodeAttestation: CommunityRadarNode[];
  nodeDpid10: string;
  nodeuuid: string;
};

export interface Engagement {
  reactions: number;
  annotations: number;
  verifications: number;
}

export type NodeRadarWithEngagement = NodeRadarItem & {
  // node: NodeRadarItem;
  engagements: Engagement;
  verifiedEngagements: Engagement;
};

export type CuratedNodeItem = {
  NodeAttestation: CommunityRadarNode[];
  nodeDpid10: string;
  nodeuuid: string;
};

export type CuratedNodeWithEngagement = {
  node: CuratedNodeItem;
  engagements: Engagement;
};

export type NodeRadar = NodeRadarItem & {
  node: Partial<Node & { versions: number; publishedDate: string }>;
  manifest: ResearchObjectV1;
  engagements: {
    reactions: number;
    annotations: number;
    verifications: number;
  };
  verifiedEngagements: {
    reactions: number;
    annotations: number;
    verifications: number;
  };
};
