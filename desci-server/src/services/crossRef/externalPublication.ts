// import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import sgMail from '@sendgrid/mail';
import { Searcher } from 'fast-fuzzy';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';
import { ExternalPublicationsEmailHtml } from '../../templates/emails/utils/emailRenderer.js';
// import { ensureUuidEndsWithDot } from '../../utils.js';
import { crossRefClient } from '../index.js';
import { NodeUuid } from '../manifestRepo.js';
import repoService from '../repoService.js';

import { Work } from './definitions.js';
import { ResearchObjectV1 } from '@desci-labs/desci-models';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const getPublisherTitle = (data: Work): string =>
  data?.['container-title']?.[0] ||
  data?.['short-container-title']?.[0] ||
  data?.institution?.[0]?.name ||
  data?.publisher;

export const getExternalPublications = async (manifest: ResearchObjectV1) => {
  // const manifest = await repoService.getDraftManifest({
  //   uuid: node.uuid as NodeUuid,
  //   documentId: node.manifestDocumentId,
  // });
  let data = await crossRefClient.searchWorks({ queryTitle: manifest?.title });

  data = data?.filter((works) => works.type === 'journal-article');

  if (!data || data.length === 0) return { publications: [], matches: [] };

  const titleSearcher = new Searcher(data, { keySelector: (entry) => entry.title });
  const titleResult = titleSearcher.search(manifest.title, { returnMatchData: true });

  const descSearcher = new Searcher(data, { keySelector: (entry) => entry?.abstract ?? '' });
  const descResult = descSearcher.search(manifest.description ?? '', { returnMatchData: true });

  const authorsSearchScores = data.map((work) => {
    const authorSearcher = new Searcher(
      work?.author?.map((author) => ({ name: `${author.given} ${author.family}`, orcid: author.ORCID })) ?? [],
      { keySelector: (entry) => entry.name },
    );

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

  const relevantSourceFields = [];

  if (manifest.title) relevantSourceFields.push('title');
  if (manifest.description) relevantSourceFields.push('abstract');
  if (manifest.authors && manifest.authors.length > 0) relevantSourceFields.push('authors');

  const totalMatchingFields = relevantSourceFields.length;
  const minimunMatchScore = (0.9 * totalMatchingFields) / 3;

  logger.trace({ relevantSourceFields, totalMatchingFields, minimunMatchScore }, '[CrossrefPubParameters]');
  const matches = data
    .map((data) => ({
      publisher: getPublisherTitle(data),
      sourceUrl: data?.resource?.primary?.URL || data.URL || '',
      // doi: 10.1016\/j.joep.2006.11.002
      doi: data.DOI?.replace(/\\/g, '').toLowerCase(),
      isVerified: false,
      publishYear:
        data.published['date-parts']?.[0]?.[0].toString() ??
        data.license
          .map((licence) => licence.start['date-parts']?.[0]?.[0])
          .filter(Boolean)?.[0]
          .toString(),
      title: titleResult
        .filter((res) => getPublisherTitle(res.item) === getPublisherTitle(data))
        .map((data) => ({
          title: data.item.title[0],
          key: data.key,
          match: data.match,
          score: data.score,
        }))?.[0],
      abstract: descResult
        ?.filter((res) => getPublisherTitle(res.item) === getPublisherTitle(data))
        ?.map((data) => ({
          key: data.key,
          match: data.match,
          score: data.score,
          abstract: data.item?.abstract ?? '',
        }))?.[0],
      authors: authorsSearchScores
        .filter((res) => res?.publisher === getPublisherTitle(data))
        ?.map((data) => ({
          score: data.score,
          authors: data.match,
        }))?.[0],
    }))
    .map((publication) => ({
      ...publication,
      score:
        ((publication.title?.score ?? 0) + (publication.abstract?.score ?? 0) + (publication.authors?.score ?? 0)) /
        totalMatchingFields,
    }));

  // logger.trace({ publications }, 'CrossrefPublications');
  const publications = matches.filter((entry) => entry.score >= minimunMatchScore);

  return { publications, matches };
};

export const EXTERNAL_PUB_REDIS_KEY = 'external-pub-checked';
