import { CommunityRadarNode } from '../../internal.js';

export type NodeRadarItem = {
  NodeAttestation: CommunityRadarNode[];
  nodeDpid10: string;
  nodeuuid: string;
};

export type NodeRadarWithEngagement = {
  node: NodeRadarItem;
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

export type CuratedNodeItem = {
  NodeAttestation: CommunityRadarNode[];
  nodeDpid10: string;
  nodeuuid: string;
};

export type CuratedNodeWithEngagement = {
  node: CuratedNodeItem;
  engagements: {
    reactions: number;
    annotations: number;
    verifications: number;
  };
};
