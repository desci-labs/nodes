import { NodeAccess, NodeCreditRoles, ResearchCredits, ResearchRoles } from '@prisma/client';

import prisma from 'client';

async function main() {
  const creditRoles: Omit<NodeCreditRoles, 'id'>[] = [
    { credit: ResearchCredits.AUTHOR, role: ResearchRoles.ADMIN },
    { credit: ResearchCredits.AUTHOR, role: ResearchRoles.VIEWER },
    { credit: ResearchCredits.NODE_STEWARD, role: ResearchRoles.ADMIN },
    { credit: ResearchCredits.NODE_STEWARD, role: ResearchRoles.VIEWER },
    // { credit: ResearchCredits.NODE_STEWARD, role: ResearchRoles.VIEWER },
    // { credit: ResearchCredits.None, role: ResearchRoles.VIEWER },
  ];

  const roles = await prisma.nodeCreditRoles.createMany({ skipDuplicates: true, data: creditRoles });
  console.log(roles.count, ' CreditRoles created');

  // Migrate Node userId to NodeAccess Author-Admin role
  const authorAdminRole = await prisma.nodeCreditRoles.findFirst({
    where: { role: ResearchRoles.ADMIN, credit: ResearchCredits.AUTHOR },
  });

  const researchNodes = await prisma.node.findMany({
    where: { uuid: { not: undefined }, ownerId: { not: undefined } },
  });
  const nodeAdminAccess: Omit<NodeAccess, 'id'>[] = researchNodes.map((node) => ({
    nodeId: node.id,
    userId: node.ownerId,
    roleId: authorAdminRole.id,
  }));
  const nodeAccesses = await prisma.nodeAccess.createMany({ data: nodeAdminAccess, skipDuplicates: true });
  console.log(nodeAccesses.count, ' nodeAccesses created');

  return true;
}

main()
  .then((result) => console.log('Multiplayer V0 script status:', result))
  .catch((err) => console.log('Error running fillNodeCreditRoles.ts ', err));
