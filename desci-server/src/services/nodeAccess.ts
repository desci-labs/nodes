/**
 * Functions to assist with dataReference counting and storage for users
 */

import { ResearchCredits, ResearchRoles, User } from '@prisma/client';

import prisma from 'client';

export const setNodeAdmin = async (userId: number, uuid: string, credit: ResearchCredits) => {
  const creditRole = await prisma.nodeCreditRoles.findFirst({ where: { role: ResearchRoles.ADMIN, credit } });

  if (!creditRole) {
    throw Error('setNodeAdmin:: credit role not found');
  }

  const result = await prisma.nodeAccess.create({ data: { uuid, userId, roleId: creditRole.id } });
  return result;
};

export const grantNodeAccess = async (userId: number, uuid: string, credit: ResearchCredits, role: ResearchRoles) => {
  const creditRole = await prisma.nodeCreditRoles.findFirst({ where: { role, credit } });

  if (!creditRole) {
    throw Error('setNodeAdmin:: credit role not found');
  }

  const result = await prisma.nodeAccess.create({ data: { uuid, userId, roleId: creditRole.id } });
  return result;
};

export const grantNodeAccessByRoleId = async (userId: number, uuid: string, roleId: number) => {
  const creditRole = await prisma.nodeCreditRoles.findFirst({ where: { id: roleId } });

  if (!creditRole) {
    throw Error('setNodeAdmin:: credit role not found');
  }

  const result = await prisma.nodeAccess.create({ data: { uuid, userId, roleId: creditRole.id } });
  return result;
};
