import { Node } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import { Searcher } from 'fast-fuzzy';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { ExternalPublicationsEmailHtml } from '../../templates/emails/utils/emailRenderer.js';
import { transformInvertedAbstractToText } from '../AutomatedMetadata.js';
import { getOrcidFromURL } from '../crossRef/utils.js';
import { NodeUuid } from '../manifestRepo.js';
import repoService from '../repoService.js';

import { OpenAlexWork } from './types.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const getPublisherTitle = (data: OpenAlexWork): string =>
  data?.primary_location?.source?.display_name ||
  data?.locations?.find((location) => location.source.type === 'journal').source.display_name;

interface WorkMetadata {
  title: string;
  doi: string;
  authors: {
    orcid: string;
    name: string;
  }[];
  abstract: string;
  publisher: string;
  sourceUrl: string;
  publishYear: string | number;
}
const transformOpenAlexWorkToMetadata = (work: OpenAlexWork): WorkMetadata => {
  const authors = work.authorships.map((author) => ({
    orcid: author.author?.orcid ? getOrcidFromURL(author.author.orcid) : null,
    name: author.author.display_name,
  }));

  const abstract = work?.abstract_inverted_index ? transformInvertedAbstractToText(work.abstract_inverted_index) : '';
  const publisher =
    work?.primary_location?.source?.display_name ||
    work?.locations?.find((location) => location.source.type === 'journal').source.display_name;
  const sourceUrl = work?.primary_location?.landing_page_url || work.doi;
  return {
    title: work.title,
    doi: work.doi,
    publishYear: work?.publication_year || work?.publication_date?.split('-')?.[0] || '',
    authors,
    abstract,
    publisher,
    sourceUrl,
  };
};

export const getExternalPublicationsFromOpenAlex = async (node: Node) => {
  const manifest = await repoService.getDraftManifest({
    uuid: node.uuid as NodeUuid,
    documentId: node.manifestDocumentId,
  });

  const queryTitle = (manifest.title as string).replaceAll(/[,'":]/g, ' ').trim();
  const response = await fetch(`https://api.openalex.org/works?per-page=3&filter=title.search:${queryTitle}`, {
    headers: {
      Accept: '*/*',
    },
  });

  if (response.status !== 200) return [];
  const results = (await response.json()) as { results: OpenAlexWork[] };
  const works = results?.['results'];

  const data = works
    ?.filter((works) => works.type_crossref === 'journal-article')
    ?.map(transformOpenAlexWorkToMetadata);

  if (!data || data.length === 0) return [];

  const titleSearcher = new Searcher(data, { keySelector: (entry) => entry.title });
  const titleResult = titleSearcher.search(manifest.title, { returnMatchData: true });

  const descSearcher = new Searcher(data, { keySelector: (entry) => entry?.abstract ?? '' });
  const descResult = descSearcher.search(manifest.description ?? '', { returnMatchData: true });

  const authorsSearchScores = data.map((work) => {
    const authorSearcher = new Searcher(work.authors ?? [], { keySelector: (entry) => entry.name });

    const nodeAuthorsMatch = manifest.authors.map((author) =>
      authorSearcher.search(author.name, { returnMatchData: true }),
    );
    return {
      publisher: work.publisher,
      score: nodeAuthorsMatch.flat().reduce((total, match) => (total += match.score), 0) / manifest.authors.length,
      match: nodeAuthorsMatch.flat().map((data) => ({
        key: data.key,
        match: data.match,
        score: data.score,
        author: data.item,
        publisher: work.publisher,
        doi: work.doi,
      })),
    };
  });

  const publications = data
    .map((data) => ({
      publisher: data.publisher,
      sourceUrl: data.sourceUrl ?? '',
      doi: data.doi,
      isVerified: false,
      publishYear: data.publishYear.toString(),
      title: titleResult
        .filter((res) => res.item.publisher === data.publisher)
        .map((data) => ({
          title: data.item.title,
          key: data.key,
          match: data.match,
          score: data.score,
        }))?.[0],
      abstract: descResult
        .filter((res) => res.item.publisher === data.publisher)
        .map((data) => ({
          key: data.key,
          match: data.match,
          score: data.score,
          abstract: data.item?.abstract ?? '',
        }))?.[0],
      authors: authorsSearchScores
        .filter((res) => res.publisher === data.publisher)
        .map((data) => ({
          score: data.score,
          authors: data.match,
        }))?.[0],
    }))
    .map((publication) => ({
      ...publication,
      score:
        ((publication.title?.score ?? 0) + (publication.abstract?.score ?? 0) + (publication.authors?.score ?? 0)) / 3,
    }))
    .filter((entry) => entry.score >= 0.8);

  logger.trace({ publications }, 'openAlexPublications');

  return publications;
};

export const sendExternalPublicationsNotification = async (node: Node) => {
  // const publications = await getExternalPublications(node);
  const publications = await prisma.externalPublications.findMany({
    where: { uuid: node.uuid },
  });

  // send email to node owner about potential publications
  const user = await prisma.user.findFirst({ where: { id: node.ownerId } });
  const message = {
    to: user.email,
    from: 'no-reply@desci.com',
    subject: `[nodes.desci.com] Verify your external publications`,
    text: `${
      publications.length > 1
        ? `We found a similar publications to ${node.title}, View your publication to verify external publications`
        : `We linked ${publications.length} external publications from publishers like ${publications[0].publisher} to your node, open your node to verify the external publication.`
    }`,
    html: ExternalPublicationsEmailHtml({
      dpid: node.dpidAlias.toString(),
      dpidPath: `${process.env.DAPP_URL}/dpid/${node.dpidAlias}`,
      publisherName: publications[0].publisher,
      multiple: publications.length > 1,
    }),
  };

  try {
    logger.info({ message, NODE_ENV: process.env.NODE_ENV }, '[EMAIL]:: ExternalPublications EMAIL');
    if (process.env.SHOULD_SEND_EMAIL) {
      const response = await sgMail.send(message);
      logger.info(response, '[EMAIL]:: Response');
    } else {
      logger.info({ nodeEnv: process.env.NODE_ENV }, message.subject);
    }
  } catch (err) {
    logger.info({ err }, '[ExternalPublications EMAIL]::ERROR');
  }
};

export const checkOpenAlexExternalPublications = async (node: Node) => {
  return await getExternalPublicationsFromOpenAlex(node);
};
