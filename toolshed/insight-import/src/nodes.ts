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
import { addExternalCid, addLinkComponent, changeManifest, createDraftNode, prePublishDraftNode, publishNode, uploadFiles } from '@desci-labs/nodes-lib';
import { existsSync, readFileSync, writeFileSync } from 'fs';

/** Whacky little DB approximation that saves pub:uuid mappings to enable re-runs to continue */
let NODE_FILE = 'existingNodes.json';
let existingNodes: Record<number, string>;
const getExistingNode = (pubId: number): string | undefined => {
  if (existingNodes) {
    return existingNodes[pubId];
  } else if (existsSync(NODE_FILE)) {
    existingNodes = JSON.parse(readFileSync(NODE_FILE, 'utf8'));
    return existingNodes[pubId];
  } else {
    existingNodes = {};
    return undefined;
  }
};

process.on('exit', () => {
  console.log(`Process exits; writing uuid mappings to ${NODE_FILE}...`);
  if (existingNodes) {
    writeFileSync(NODE_FILE, JSON.stringify(existingNodes, undefined, 2));
  }
});

export const makeNode = async (ijMetadata: IJMetadata) => {
  const ijPub = ijMetadata.publication;

  let uuid = getExistingNode(ijPub.publication_id);
  if (uuid) {
    console.log(`Pub ${ijPub.publication_id}: Re-using node ${uuid}`);
  } else {
    const draftResult = await createDraftNode({
      title: ijPub.title,
      defaultLicense: parseLicense(ijPub.license) satisfies License,
      // Unclear how to map categories and/or tags to this, not much overlap
      researchFields: [],
    });
    console.log(`Pub: ${ijPub.publication_id}: Created new node ${draftResult.node.uuid}`);
    uuid = draftResult.node.uuid;
    existingNodes[ijPub.publication_id] = uuid
  }

  if (ijPub.source_code_git_repo) {
    await addLinkComponent(uuid, {
      name: 'External git repo',
      url: ijPub.source_code_git_repo,
      subtype: ResearchObjectComponentLinkSubtype.OTHER,
      starred: false,
    })
  }

  const manifestActions = renderStaticManifestActions(ijMetadata);
  await changeManifest(uuid, manifestActions);

  const filePathsToUpload = [
    maybeWriteTmpFile('comments.md', renderCommentsMarkdown(ijPub)),
    maybeWriteTmpFile('reviews.md', renderReviewsMarkdown(ijPub)),
    maybeWriteTmpFile('insight-journal-metadata.json', JSON.stringify(ijPub, undefined, 2)),
  ].filter(p => p !== undefined)
  await uploadMissingFiles(uuid, filePathsToUpload);

  await handleRevisions(uuid, ijPub.revisions);
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

  const mdShards = [ '# Reviews'];
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
const handleRevisions = async (uuid: string, revisions: Revision[]) => {
  for (const rev of revisions) {
    if (rev.article) {
      console.log('Adding article', rev.article, '...');
      await addExternalCid({
        uuid,
        externalCids: [{ name: 'article.pdf', cid: rev.article }],
        contextPath: '/',
        componentType: ResearchObjectComponentType.PDF,
        componentSubtype: ResearchObjectComponentDocumentSubtype.RESEARCH_ARTICLE,
        // TODO autostar
      })
    }

    if (rev.source_code) {
      console.log('Adding source_code', rev.source_code, '...');
      await addExternalCid({
        uuid,
        externalCids: [{ name: 'code', cid: rev.source_code }],
        contextPath: '/',
        componentType: ResearchObjectComponentType.CODE,
        componentSubtype: ResearchObjectComponentCodeSubtype.CODE_SCRIPTS,
        // TODO autostar
      })
    }

    const references = parseReferences(rev?.citation_list);
    if (references) {
      await changeManifest(uuid, [{ type: 'Set References', references: references }]);
    }

    // await publishNode(uuid, SIGNER);
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

const maybeWriteTmpFile = (filename: string, content?: string): string | undefined  => {
  if (!content) {
    return undefined;
  }
  const path = `/tmp/${filename}`;
  writeFileSync(path, content);
  return path;
}


async function uploadMissingFiles(uuid: string, filePathsToUpload: string[]): Promise<void> {
  for (const file of filePathsToUpload) {
    try {
      await uploadFiles({
        uuid,
        contextPath: '/',
        files: [file],
      });
      console.log('Uploaded file', file);
    } catch (e) {
      const err = e as Error;
      if (err.message.includes('409')) {
        console.log('Skipping duplicate file', file);
      } else {
        console.log({err: err.name, msg: err.message})
        throw err;
      }
    }
  }
}