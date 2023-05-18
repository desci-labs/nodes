import prisma from 'client';
import { validateAndHealDataRefs, validateDataReferences } from 'utils/dataRefTools';

/* 
Usage Guidelines:
- validate makes no changes, just outputs the validation results.
- heal will add missing refs, remove unused refs, and fix refs with a diff discrepancy.
- PUBLIC_REFS is an optional flag, if true, it will fix public refs.

Operation Types [validate, heal, validateAll, healAll]

Usage Examples:
validate:     OPERATION=validate NODE_UUID=noDeUuiD. MANIFEST_CID=bafkabc123 PUBLIC_REFS=true npm run scripts:fix-data-refs
heal:         OPERATION=healAll NODE_UUID=noDeUuiD. MANIFEST_CID=bafkabc123 PUBLIC_REFS=true npm run scripts:fix-data-refs
validateAll:  OPERATION=validateAll PUBLIC_REFS=true npm run scripts:fix-data-refs
healAll:      OPERATION=healAll PUBLIC_REFS=true npm run scripts:fix-data-refs
 */

main();
function main() {
  const { operation, nodeUuid, manifestCid, publicRefs } = getOperationEnvs();

  switch (operation) {
    case 'validate':
      if (!nodeUuid && !manifestCid) return console.log('Missing NODE_UUID or MANIFEST_CID');
      validateDataReferences(nodeUuid, manifestCid, publicRefs);
      break;
    case 'heal':
      if (!nodeUuid && !manifestCid) return console.log('Missing NODE_UUID or MANIFEST_CID');
      validateAndHealDataRefs(nodeUuid, manifestCid, publicRefs);
      break;
    case 'validateAll':
      dataRefDoctor(false, publicRefs);
      break;
    case 'healAll':
      dataRefDoctor(true, publicRefs);
      break;
    default:
      console.log('Invalid operation, valid operations include: validate, heal, validateAll, healAll');
      return;
  }
}

function getOperationEnvs() {
  return {
    operation: process.env.OPERATION || null,
    nodeUuid: process.env.NODE_UUID || null,
    manifestCid: process.env.MANIFEST_CID || null,
    publicRefs: process.env.PUBLIC_REFS.toLowerCase() === 'true' ? true : false,
  };
}

//todo: add public handling
async function dataRefDoctor(heal: boolean, publicRefs: boolean) {
  const nodes = await prisma.node.findMany({
    orderBy: {
      id: 'asc',
    },
  });
  console.log(`[DataRefDoctor]Nodes found: ${nodes.length}`);

  for (let i = 0; i < nodes.length; i++) {
    try {
      console.log(`[DataRefDoctor]Processing node: ${nodes[i].id}`);
      const node = nodes[i];
      if (heal) {
        await validateAndHealDataRefs(node.uuid, node.manifestUrl, publicRefs);
      } else {
        await validateDataReferences(node.uuid, node.manifestUrl, publicRefs);
      }
    } catch (e) {
      console.log(`[DataRefDoctor]Error processing node: ${nodes[i].id}, error: ${e}`);
    }
  }
}
