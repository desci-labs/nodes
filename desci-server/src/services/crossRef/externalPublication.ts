import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { ExternalPublications, Node } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import { Searcher } from 'fast-fuzzy';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { ExternalPublicationsEmailHtml } from '../../templates/emails/utils/emailRenderer.js';
import { ensureUuidEndsWithDot } from '../../utils.js';
import { crossRefClient } from '../index.js';
import { NodeUuid } from '../manifestRepo.js';
import repoService from '../repoService.js';

import { Work } from './definitions.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const getPublisherTitle = (data: Work): string =>
  data?.['container-title']?.[0] ||
  data?.['short-container-title']?.[0] ||
  data?.institution?.[0]?.name ||
  data?.publisher;

export const getExternalPublications = async (node: Node) => {
  const manifest = await repoService.getDraftManifest({
    uuid: node.uuid as NodeUuid,
    documentId: node.manifestDocumentId,
  });
  let data = await crossRefClient.searchWorks({ queryTitle: manifest?.title });

  data = data?.filter((works) => works.type === 'journal-article');

  if (!data || data.length === 0) return [];

  const titleSearcher = new Searcher(data, { keySelector: (entry) => entry.title });
  const titleResult = titleSearcher.search(manifest.title, { returnMatchData: true });

  const descSearcher = new Searcher(data, { keySelector: (entry) => entry?.abstract ?? '' });
  const descResult = descSearcher.search(manifest.description ?? '', { returnMatchData: true });

  const authorsSearchScores = data.map((work) => {
    const authorSearcher = new Searcher(work.author, { keySelector: (entry) => `${entry.given} ${entry.family}` });

    const nodeAuthorsMatch = manifest.authors.map((author) =>
      authorSearcher.search(author.name, { returnMatchData: true }),
    );
    return {
      publisher: getPublisherTitle(work),
      score: nodeAuthorsMatch.flat().reduce((total, match) => (total += match.score), 0) / manifest.authors.length,
      match: nodeAuthorsMatch.flat().map((data) => ({
        key: data.key,
        match: data.match,
        score: data.score,
        author: data.item,
        publisher: getPublisherTitle(work),
        doi: work.DOI,
      })),
    };
  });

  const publications = data
    .map((data) => ({
      publisher: getPublisherTitle(data),
      sourceUrl: data?.resource?.primary?.URL || data.URL || '',
      doi: data.DOI,
      isVerified: false,
      'is-referenced-by-count': data['is-referenced-by-count'] ?? 0,
      publishYear:
        data.published['date-parts']?.[0]?.[0].toString() ??
        data.license
          .map((licence) => licence.start['date-parts']?.[0]?.[0])
          .filter(Boolean)?.[0]
          .toString(),
      title: titleResult
        .filter((res) => getPublisherTitle(res.item) === getPublisherTitle(data))
        .map((data) => ({
          title: data.item.title,
          key: data.key,
          match: data.match,
          score: data.score,
        }))?.[0],
      abstract: descResult
        .filter((res) => getPublisherTitle(res.item) === getPublisherTitle(data))
        .map((data) => ({
          key: data.key,
          match: data.match,
          score: data.score,
          abstract: data.item?.abstract ?? '',
        }))?.[0],
      authors: authorsSearchScores
        .filter((res) => res.publisher === getPublisherTitle(data))
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

  logger.trace({ publications }, 'externalPublications');

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

export const checkExternalPublications = async (node: Node) => {
  return await getExternalPublications(node);
};
