import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import sgMail from '@sendgrid/mail';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ExternalPublicationsEmailHtml } from '../templates/emails/utils/emailRenderer.js';
import { asyncMap, ensureUuidEndsWithDot } from '../utils.js';

import { getExternalPublications } from './crossRef/externalPublication.js';
import { NodeUuid } from './manifestRepo.js';
import {
  getExternalPublicationsFromArticleRecommender,
  getExternalPublicationsFromOpenAlex,
} from './openAlex/externalPublication.js';
import repoService from './repoService.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function searchExternalPublications(manifest: ResearchObjectV1) {
  const logger = parentLogger.child({ module: '[ExternalPublicationsService]' });
  const [crossrefPublications, openAlexPublications] = await Promise.all([
    getExternalPublications(manifest),
    getExternalPublicationsFromOpenAlex(manifest),
  ]);

  logger.trace({ crossrefPublications, openAlexPublications });
  const publications =
    crossrefPublications.publications.length > 0
      ? crossrefPublications.publications
      : openAlexPublications.publications;

  // try getting recommendations from ArticleRecommender API
  let matchFromArticleRecommender: Awaited<ReturnType<typeof getExternalPublicationsFromArticleRecommender>>;
  if (publications.length === 0 && manifest.description) {
    matchFromArticleRecommender = await getExternalPublicationsFromArticleRecommender(manifest.description);
  }

  let commonPublicationsAcrossSources: (typeof crossrefPublications)['matches'];
  if (publications.length === 0 && !matchFromArticleRecommender) {
    // find unique DOI match and set as recommended result
    commonPublicationsAcrossSources = crossrefPublications.matches.filter(
      (match) => openAlexPublications.matches.find((openAlexMatch) => openAlexMatch.doi === match.doi) !== undefined,
    );
    logger.trace({ publications }, '[Unique Matches across Sources]');
  }

  return {
    publications,
    commonPublicationsAcrossSources,
    matchFromArticleRecommender,
    crossrefPublications,
    openAlexPublications,
  };
}

export const dispatchExternalPublicationsCheck = async (node: Node) => {
  const logger = parentLogger.child({ module: '[dispatchExternalPublicationsCheck]' });

  const manifest = await repoService.getDraftManifest({
    uuid: node.uuid as NodeUuid,
    documentId: node.manifestDocumentId,
  });

  const { publications, matchFromArticleRecommender, commonPublicationsAcrossSources } =
    await searchExternalPublications(manifest);

  const dataSource =
    publications.length > 0
      ? publications
      : commonPublicationsAcrossSources.length > 0
        ? commonPublicationsAcrossSources
        : undefined;

  if (dataSource) {
    await asyncMap(dataSource, async (pub) => {
      const exists = await prisma.externalPublications.findFirst({
        where: { AND: { uuid: node.uuid, doi: pub.doi } },
      });
      //   logger.trace({ pub: { publisher: pub.publisher, doi: pub.doi }, exists }, '[pub exists]');
      if (exists) return exists;
      return prisma.externalPublications.create({
        data: {
          doi: pub.doi,
          score: pub.score,
          sourceUrl: pub.sourceUrl,
          publisher: pub.publisher,
          publishYear: pub.publishYear,
          uuid: ensureUuidEndsWithDot(node.uuid),
          isVerified: false,
        },
      });
    });
  } else if (matchFromArticleRecommender) {
    // const pub = matchFromArticleRecommender;
    const exists = await prisma.externalPublications.findFirst({
      where: { AND: { uuid: node.uuid, doi: matchFromArticleRecommender.doi } },
    });
    logger.trace(
      { pub: { publisher: matchFromArticleRecommender.publisher, doi: matchFromArticleRecommender.doi }, exists },
      '[pub exists]',
    );
    if (exists) return;

    await prisma.externalPublications.create({
      data: {
        doi: matchFromArticleRecommender.doi,
        score: matchFromArticleRecommender.score,
        sourceUrl: matchFromArticleRecommender.sourceUrl,
        publisher: matchFromArticleRecommender.publisher,
        publishYear: matchFromArticleRecommender.publishYear.toString(),
        uuid: ensureUuidEndsWithDot(node.uuid),
        isVerified: false,
      },
    });
  }

  sendExternalPublicationsNotification(node);
};

export const sendExternalPublicationsNotification = async (node: Node) => {
  const logger = parentLogger.child({ module: '[sendExternalPublicationsNotification]' });

  // const publications = await getExternalPublications(node);
  const publications = await prisma.externalPublications.findMany({
    where: { uuid: node.uuid },
  });

  if (!publications.length) return;
  // send email to node owner about potential publications
  const user = await prisma.user.findFirst({ where: { id: node.ownerId } });
  const message = {
    to: user.email,
    from: 'no-reply@desci.com',
    subject: `[nodes.desci.com] Verify your external publications`,
    text: `${
      publications.length > 1
        ? `We found a similar publications to ${node.title}, View your publication to verify external publications`
        : `We linked ${publications.length} external publications from publishers like ${publications?.[0]?.publisher} to your node, open your node to verify the external publication.`
    }`,
    html: ExternalPublicationsEmailHtml({
      dpid: node?.dpidAlias?.toString(),
      dpidPath: `${process.env.DAPP_URL}/dpid/${node.dpidAlias}`,
      publisherName: publications?.[0]?.publisher,
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

export const EXTERNAL_PUB_REDIS_KEY = 'external-pub-checked';
