import {
  License,
  ManifestActions,
  ResearchObjectComponentCodeSubtype,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentLinkSubtype,
  ResearchObjectComponentType,
  ResearchObjectReference,
  ResearchObjectV1Author,
  ResearchObjectV1AuthorRole,
} from '@desci-labs/desci-models';
import type { AuthorElement, CitationList, IJMetadata, Revision, SubmittedByAuthor } from './ijTypes.js';
import {
  addExternalCid,
  addLinkComponent,
  AddLinkComponentParams,
  changeManifest,
  claimAttestation,
  createDraftNode,
  publishNode,
  uploadFiles
} from '@desci-labs/nodes-lib';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { ATTESTATION_IDS, ENV, SIGNER, USER_ID } from "./index.js";
import { getCodexHistory } from "@desci-labs/nodes-lib/dist/codex.js";
import { AxiosError } from 'axios';

/** Whacky little DB approximation that saves pub:uuid mappings to enable re-runs to continue */
let existingNodes: Record<number, string>;
const getExistingNode = (pubId: number): string | undefined => {
  if (existingNodes) {
    return existingNodes[pubId];
  } else if (existsSync(`existingNodes_${ENV}.json`)) {
    existingNodes = JSON.parse(readFileSync(`existingNodes_${ENV}.json`, 'utf8'));
    return existingNodes[pubId];
  } else {
    existingNodes = {};
    return undefined;
  }
};

process.on('exit', () => {
  console.log(`Process exits; writing uuid mappings to ${`existingNodes_${ENV}.json`}...`);
  if (existingNodes) {
    writeFileSync(`existingNodes_${ENV}.json`, JSON.stringify(existingNodes, undefined, 2));
  }
});

export const makeNode = async (ijMetadata: IJMetadata) => {
  const ijPub = ijMetadata.publication;

  let uuid = getExistingNode(ijPub.publication_id);
  if (uuid) {
    console.log(`📗 Pub ${ijPub.publication_id}: Re-using node ${uuid}`);
  } else {
    const draftResult = await createDraftNode({
      title: ijPub.title,
      defaultLicense: parseLicense(ijPub.license) satisfies License,
      // Unclear how to map categories and/or tags to this, not much overlap
      researchFields: [],
    });
    console.log(`📗 Pub: ${ijPub.publication_id}: Created new node ${draftResult.node.uuid}`);
    uuid = draftResult.node.uuid;
    existingNodes[ijPub.publication_id] = uuid
  }

  if (ijPub.source_code_git_repo) {
    const params: AddLinkComponentParams = {
      name: 'External git repo',
      url: ijPub.source_code_git_repo,
      subtype: ResearchObjectComponentLinkSubtype.OTHER,
      starred: false,
    };

    await addLinkComponent(uuid, params);
  }

  const manifestActions = renderStaticManifestActions(ijMetadata);
  await changeManifest(uuid, manifestActions);

  const filePathsToUpload = [
    maybeWriteTmpFile('comments.md', renderCommentsMarkdown(ijPub)),
    maybeWriteTmpFile('reviews.md', renderReviewsMarkdown(ijPub)),
    maybeWriteTmpFile('insight-journal-metadata.json', JSON.stringify(ijPub, undefined, 2)),
  ].filter(p => p !== undefined)
  await uploadMissingFiles(uuid, filePathsToUpload);

  await publishRevisions(uuid, ijPub.revisions);
}

const renderStaticManifestActions = (ijMetadata: IJMetadata): ManifestActions[] => {
  const ijPub = ijMetadata.publication;
  const manifestActions: ManifestActions[] = [];
  if (ijPub.abstract) {
    manifestActions.push({ type: 'Update Description', description: ijPub.abstract });
  }

  if (ijMetadata.coverImage) {
    manifestActions.push({ type: 'Update CoverImage', cid: ijMetadata.coverImage });
  }

  const contributors = parseAuthors(ijPub.submitted_by_author, ijPub.authors);
  manifestActions.push({ type: 'Set Contributors', contributors: contributors });

  return manifestActions;
}

const renderCommentsMarkdown = (ijPub: IJMetadata['publication']): string | undefined => {
  if (ijPub.comments.length === 0) {
    return undefined;
  }

  const mdShards = ['# Correspondence'];
  for (const { content, date, persona_firstname, persona_lastname, persona_email } of ijPub.comments) {
    const author = `${persona_firstname} ${persona_lastname} <${persona_email}>`;
    const fancyDate = formatDatetime(date);

    mdShards.push(
      `## ${author}`,
      `*${fancyDate}*`,
      '',
      content,
      '',
    );
  }
  return mdShards.join('\n');
}

const renderReviewsMarkdown = (ijPub: IJMetadata['publication']): string | undefined => {
  if (ijPub.reviews.length === 0) {
    return undefined;
  }

  const mdShards = ['# Reviews'];
  for (const { author: authorObj, content, date } of ijPub.reviews) {
    const { author_firstname, author_lastname, author_email } = authorObj;
    const author = `${author_firstname} ${author_lastname} <${author_email}>`;
    const fancyDate = formatDateStr(date);

    mdShards.push(
      `## ${author}`,
      `*${fancyDate}*`,
      '',
      content,
      '',
    );
  }
  return mdShards.join('\n');
}

/**
 * Iterates over revisions to perform draft updates and publishes
 */
const publishRevisions = async (uuid: string, revisions: Revision[]): Promise<void> => {
  for (const rev of revisions) {
    const currentRev = revisions.indexOf(rev);
    console.log('- Handling rev', currentRev, '...');
    if (rev.article) {
      try {
        await addExternalCid({
          uuid,
          externalCids: [{ name: 'article.pdf', cid: rev.article }],
          contextPath: '/',
          componentType: ResearchObjectComponentType.PDF,
          componentSubtype: ResearchObjectComponentDocumentSubtype.RESEARCH_ARTICLE,
          autoStar: true,
        })
        console.log('  - Added article CID:', rev.article);
      } catch (e) {
        const err = e as Error;
        if (err.message.includes('409')) {
          console.log('  - Skipping duplicate CID for article:', rev.article);
        } else {
          console.log({ err: err.name, msg: err.message })
          throw err;
        }
      }
    }

    if (rev.source_code) {
      try {
        await addExternalCid({
          uuid,
          externalCids: [{ name: 'code', cid: rev.source_code }],
          contextPath: '/',
          componentType: ResearchObjectComponentType.CODE,
          componentSubtype: ResearchObjectComponentCodeSubtype.CODE_SCRIPTS,
          autoStar: true,
        })
        console.log('  - Added code CID:', rev.source_code);
      } catch (e) {
        const err = e as Error;
        if (err.message.includes('409')) {
          console.log('  - Skipping duplicate CID for code:', rev.source_code);
        } else {
          console.log({ err: err.name, msg: err.message })
          throw err;
        }
      }
    }

    const references = parseReferences(rev?.citation_list);
    if (references) {
      console.log('  - Settings references...');
      await changeManifest(uuid, [{ type: 'Set References', references: references }]);
    }

    console.log('  - Calling publish...');
    const { dpid } = await publishNode(uuid, SIGNER);
    console.log('  - Claiming attestations...');
    await claimAttestations(uuid, dpid, !!rev.source_code);
  }

}

// Seems to be only cc-by-3.0, so we do a safety check and write a constant instead of parsing
const parseLicense = (licenseText: string): License => {
  if (licenseText.includes('licenses/by/3.0')) {
    return 'CC-BY-3.0'
  } else {
    console.error('Unknown license:', licenseText);
    throw new Error('Unknown license');
  }
}

const BAD_INSTITUTIONS = ["", " ", "none"];

/**
 * Metadata files not sorted, so re-order using `author_place`
 * We can't set organization without a ROR, which is unavailable in the data.
 */
const parseAuthors = (submitter: SubmittedByAuthor, authors: AuthorElement[]): ResearchObjectV1Author[] => {
  // const realSubInstitution = !BAD_INSTITUTIONS.includes(submitter.author_institution);
  // const submitterOrg = realSubInstitution
  //   ? { id: "??", name: submitter.author_institution }
  //   : undefined;

  return authors
    .sort((a1, a2) => a1.author_place - a2.author_place)
    .map(a => ({
      name: a.author_fullname,
      email: a.persona_email,
      role: ResearchObjectV1AuthorRole.AUTHOR,
      // ...(submitterOrg ? { organizations: [submitterOrg] } : {}),
    }));
}

/** Takes citations that were successfully matched to a DOI */
const parseReferences = (citations: CitationList[] | undefined): ResearchObjectReference[] | undefined => {
  if (!citations) {
    return undefined;
  }
  const references = citations
    .filter(c => c.doi)
    .map(c => ({
      type: 'doi' as const,
      id: c.doi!
    }));

  if (references.length === 0) {
    return undefined;
  } else {
    return references;
  }
}

const formatDateStr = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const formatDatetime = (date: Date): string =>
  date.toLocaleString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

const maybeWriteTmpFile = (filename: string, content?: string): string | undefined => {
  if (!content) {
    return undefined;
  }
  const path = `/tmp/${filename}`;
  writeFileSync(path, content);
  return path;
}


const uploadMissingFiles = async (uuid: string, filePathsToUpload: string[]): Promise<void> => {
  for (const file of filePathsToUpload) {
    try {
      await uploadFiles({
        uuid,
        contextPath: '/',
        files: [file],
      });
      console.log('- Uploaded file', file);
    } catch (e) {
      const err = e as Error;
      if (err.message.includes('409')) {
        console.log('- Skipping duplicate file', file);
      } else {
        console.log({ err: err.name, msg: err.message })
        throw err;
      }
    }
  }
}

const claimAttestations = async (
  nodeUuid: string,
  nodeDpid: number,
  openCode: boolean,
) => {
  if (openCode) {
    console.log('    - Claiming OpenCode...')
    await tryClaimIgnoreDupeErr(() => claimAttestation({
      attestationId: ATTESTATION_IDS.openCode,
      claimerId: USER_ID,
      nodeDpid: String(nodeDpid),
      nodeUuid,
      nodeVersion: 0
    }));
  }
  console.log('    - Claiming Published in Insight Journal...')
  await tryClaimIgnoreDupeErr(() => claimAttestation({
    attestationId: ATTESTATION_IDS.ij,
    claimerId: USER_ID,
    nodeDpid: String(nodeDpid),
    nodeUuid,
    nodeVersion: 0
  }));
}

const tryClaimIgnoreDupeErr = async (apiCall: () => Promise<any>) => {
  try {
    return await apiCall()
  } catch (e) {
    const err = e as Error;
    if (err.message.includes('403')) {
      // If it was actually an auth issue, we wouldn't get this far, so assume it's already-exists
      console.log('    - Skipping duplicate claim...')
    } else {
      throw e;
    }
  }
}
