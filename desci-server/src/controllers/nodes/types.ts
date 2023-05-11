import { ResearchCredits, ResearchRoles } from '@prisma/client';

export interface GrandAccessRoleParams {
  userId: number;
  uuid: string;
  credit: ResearchCredits;
  role: ResearchRoles;
}

export interface AuthorInviteOptions {
  senderId: number;
  receiverId?: number;
  nodeId: number;
  roleId: number;
  email: string;
}

export interface GrandAccessParams {
  userId: number;
  uuid: string;
  credit: ResearchCredits;
  role: ResearchRoles;
}

export interface TransferAccessParams {
  uuid: string;
  senderId: number;
  receiverId: number;
  receiverRoleId: number;
}
