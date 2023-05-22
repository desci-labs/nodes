import prisma from 'client';
import { getIndexedResearchObjects } from 'theGraph';
import { hexToCid } from 'utils';
import { validateAndHealDataRefs, validateDataReferences } from 'utils/dataRefTools';

/* 
Usage Guidelines:
- validate makes no changes, just outputs the validation results.
- heal will add missing refs, remove unused refs, and fix refs with a diff discrepancy.
- PUBLIC_REFS is an optional flag, if true, it will fix public refs.
- START and END are optional flags, if set, it will only process nodes within the range.

Operation Types [validate, heal, validateAll, healAll]

Usage Examples:
validate:     OPERATION=validate NODE_UUID=noDeUuiD. MANIFEST_CID=bafkabc123 PUBLIC_REFS=true npm run script:fix-data-refs
heal:         OPERATION=healAll NODE_UUID=noDeUuiD. MANIFEST_CID=bafkabc123 PUBLIC_REFS=true npm run script:fix-data-refs
validateAll:  OPERATION=validateAll PUBLIC_REFS=true npm run script:fix-data-refs
healAll:      OPERATION=healAll PUBLIC_REFS=true npm run script:fix-data-refs
 */

main();
function main() {
  const { operation, nodeUuid, manifestCid, publicRefs, start, end } = getOperationEnvs();
  const startIterator = isNaN(start as any) ? undefined : parseInt(start);
  const endIterator = isNaN(end as any) ? undefined : parseInt(end);

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
      dataRefDoctor(false, publicRefs, startIterator, endIterator);
      break;
    case 'healAll':
      dataRefDoctor(true, publicRefs, startIterator, endIterator);
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
    publicRefs: process.env.PUBLIC_REFS?.toLowerCase() === 'true' ? true : false,
    start: process.env.START,
    end: process.env.END,
  };
}

//todo: add public handling
async function dataRefDoctor(heal: boolean, publicRefs: boolean, start?: number, end?: number) {
  const nodes = await prisma.node.findMany({
    orderBy: {
      id: 'asc',
    },
  });
  console.log(`[DataRefDoctor]Nodes found: ${nodes.length}`);

  const startIdx = start || 0;
  const endIdx = end || nodes.length;

  for (let i = startIdx; i < endIdx; i++) {
    try {
      console.log(`[DataRefDoctor]Processing node: ${nodes[i].id}`);
      const node = nodes[i];

      if (publicRefs) {
        const { researchObjects } = await getIndexedResearchObjects([node.uuid]);
        if (!researchObjects.length) continue;
        const indexedNode = researchObjects[0];
        const totalVersionsIndexed = indexedNode.versions.length || 0;
        if (!totalVersionsIndexed) continue;
        console.log(
          `[DataRefDoctor]Processing node: ${nodes[i].id}, found versions indexed: ${totalVersionsIndexed}, for nodeUuid: ${node.uuid}`,
        );
        for (let nodeVersIdx = 0; nodeVersIdx < totalVersionsIndexed; nodeVersIdx++) {
          console.log(
            `[DataRefDoctor]Processing indexed version: ${nodeVersIdx}, with txHash: ${indexedNode.versions[nodeVersIdx]?.id}`,
          );
          const hexCid = indexedNode.versions[nodeVersIdx]?.cid || indexedNode.recentCid;
          const txHash = indexedNode.versions[nodeVersIdx]?.id;
          const manifestCid = hexToCid(hexCid);
          if (heal) {
            await validateAndHealDataRefs(node.uuid, manifestCid, true, txHash);
          } else {
            validateDataReferences(node.uuid, manifestCid, true, txHash);
          }
        }
      }
      if (!publicRefs) {
        if (heal) {
          await validateAndHealDataRefs(node.uuid, node.manifestUrl, false);
        } else {
          await validateDataReferences(node.uuid, node.manifestUrl, false);
        }
      }
    } catch (e) {
      console.log(`[DataRefDoctor]Error processing node: ${nodes[i].id}, error: ${e}`);
    }
  }
}
