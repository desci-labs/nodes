import { ActionType } from '@prisma/client';
import axios from 'axios';
import { Request, Response } from 'express';

// import { headlessDownloadPdf } from 'services/headlessBrowser';
import { saveInteraction } from '../../services/interactionLog.js';

export interface ResearchObjectMetadata {
  title: string;
  abstract?: string;
  doi?: string;
  url?: string;
  pdf?: string;
  publishedDate?: Date;
  blob?: string;
}

export enum Institution {
  'arxiv',
  'biorxiv',
  'ssrn',
  'zenodo',
}

const findPdfByDoi = (doi: string) => {
  console.log('Find PDF by DOI', doi);
  const isArxiv = doi.toLowerCase().indexOf('arxiv') > -1;
  console.log(`Is arXiv? ${isArxiv}`);
  if (isArxiv) {
    return findPdfByInstitutionAndDoi(Institution.arxiv, doi);
  }
  const isZenodo = doi.toLowerCase().indexOf('zenodo') > -1;
  if (isZenodo) {
    return findPdfByInstitutionAndDoi(Institution.zenodo, doi);
  }
  return 'noInstitution.pdf';
};

const findPdfByInstitutionAndDoi = (institution: Institution, doi: string) => {
  console.log(`Find PDF by Institution ${institution} and DOI ${doi}`);
  switch (institution) {
    case Institution.arxiv:
      return `https://arxiv.org/pdf/${doi.split('arxiv.')[1]}`;
    case Institution.biorxiv:
      return `https://www.biorxiv.org/content/${doi}.full.pdf`;
    case Institution.ssrn:
      return `https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID${doi.split('ssrn.')[1]}_code450933.pdf?abstractid=${
        doi.split('ssrn.')[1]
      }&mirid=1`;
    case Institution.zenodo:
      return `https://zenodo.org/record/${doi.split('zenodo.')[1]}/files/article.pdf?download=1`;
    default:
      return 'none.pdf';
  }
};

const processCrossRef = async (obj: any) => {
  const doi = obj.message.DOI;
  console.log(`Process DOI ${doi}`);
  console.log(obj);
  const publishedDate = new Date(obj.message.published['date-parts'][0].join('-'));
  let pdf;
  const strategies = [
    {
      name: 'CrossRef',
      fn: (obj: any) => {
        return obj.message.link.filter((l) => l['content-type'] == 'application/pdf')[0]?.URL;
      },
    },
    {
      name: 'CrossRef-Resource',
      fn: (obj: any) => {
        return obj.message?.resource?.primary?.URL;
      },
    },
    {
      name: 'biorxiv',
      fn: (obj: any): any => {
        if (obj.message.institution[0]?.name.toLowerCase() == 'biorxiv') {
          return findPdfByInstitutionAndDoi(Institution.biorxiv, doi);
        }
      },
    },
    {
      name: 'ssrn',
      fn: (obj: any): any => {
        if (obj.message['short-container-title'][0] == 'SSRN Journal') {
          return findPdfByInstitutionAndDoi(Institution.ssrn, doi);
        }
      },
    },
  ];
  for (let i = 0; i < strategies.length; i++) {
    const strat = strategies[i];
    console.log(`CrossRef PDF [strategy=${strat.name}] Starting doi ${doi}`);
    try {
      pdf = strat.fn(obj);
      console.log(`\t...${pdf}`);

      if (pdf) {
        const { data } = await axios.get(pdf);

        const buf = Buffer.from(data);
        console.log('buf', buf.slice(0, 5).toString(), buf.slice(0, 5).toString() !== '%PDF-');
        if (buf.slice(0, 5).toString() !== '%PDF-') {
          console.log('not a valid pdf %PDF- HTTP', buf.slice(0, 5));
        } else {
          console.log('PDF HIT', pdf);
          break;
        }
      }
    } catch (err) {
      console.error(`CrossRef PDF [strategy=${strat.name}] Error`, err);
    }
    console.log('PDF MISS', pdf);
  }

  const processed: ResearchObjectMetadata = {
    doi,
    title: obj.message.title.join('; '),
    abstract: obj.message.abstract,
    pdf,
    publishedDate,
    blob: obj,
  };
  console.log(`PROCESSED ${doi}`);
  console.log(processed);
  return processed;
};

const processDataCite = (obj: any) => {
  const doi = obj.data.id;
  console.log(`Process DOI ${doi}`);
  console.log(obj);

  const publishedDate = new Date(obj.data.attributes.created);

  const pdf = findPdfByDoi(doi);
  const processed: ResearchObjectMetadata = {
    doi,
    title: obj.data.attributes.titles[0].title,
    abstract: obj.data.attributes.descriptions[0].description,
    pdf,
    publishedDate,
    blob: obj,
  };
  console.log(`PROCESSED ${doi}`);
  console.log(processed);
  return processed;
};

const processPdfUrl = async (url: string) => {
  const processed: ResearchObjectMetadata = {
    url,
    title: `Retrieved from ${url}`,
    pdf: url,
  };

  const { data } = await axios.get(url);
  const buf = Buffer.from(data);
  console.log('buf', buf.slice(0, 5).toString(), buf.slice(0, 5).toString() !== '%PDF-');
  if (buf.slice(0, 5).toString() !== '%PDF-') {
    throw Error('Not pdf');
  }

  console.log('processed url');
  console.log(processed);
  return processed;
};

export const retrieveDoi = async (req: Request, res: Response) => {
  const { doi } = req.body;
  const user = (req as any).user;

  let processed: ResearchObjectMetadata;

  const processLog = [];

  const log = (...m) => {
    console.log(...m);
    processLog.push([m, new Date()]);
  };
  const logErr = (...m) => {
    console.error(...m);
    processLog.push([m, new Date()]);
  };

  saveInteraction(req, ActionType.RETRIEVE_URL, doi, user.id);
  if (doi.indexOf('https://ssrn.com') === 0 || doi.indexOf('https://papers.ssrn.com') === 0) {
    // we got ourselves an SSRN link without DOI
    try {
      processed = null; //await headlessDownloadPdf(doi, 'ssrn');
    } catch (err) {
      console.error('Scrape Error', err);
    }
  }

  if (!processed) {
    try {
      const url = `https://api.crossref.org/works/${doi}?mailto=info@desci.com`;
      log(`Trying CrossRef ${url}`);
      const { data } = await axios.get(url);
      processed = await processCrossRef(data);
    } catch (err) {
      logErr('CrossRef Error', err);
    }
  }

  if (!processed) {
    try {
      const dataCiteUrl = `https://api.datacite.org/dois/${doi
        .replace('www.doi.org', 'doi.org')
        .replace('https://doi.org/', '')
        .replace('http://doi.org/', '')
        .replace('doi.org/', '')}`;
      log(`Trying DataCite ${dataCiteUrl}`);
      const { data } = await axios.get(dataCiteUrl);
      processed = processDataCite(data);
    } catch (err) {
      logErr('DataCite error', err);
    }
  }

  if (!processed) {
    try {
      log('Trying url as PDF url', doi);

      new URL(doi);
      processed = await processPdfUrl(doi);
    } catch (err) {
      logErr('url error', err.message);
    }
  }

  console.log('LOG OUTPUT \n\n', processLog);

  if (!processed) {
    saveInteraction(req, ActionType.RETRIEVE_URL_FAIL, doi, user.id);
    res.status(400).send();
    return;
  }

  saveInteraction(req, ActionType.RETREIVE_URL_SUCCESS, doi, user.id);

  res.send(processed);
};
