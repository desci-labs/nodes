import {
  ResearchObjectV1Component,
  ResearchObjectV1Validation,
  ResearchObjectV1,
  ResearchObjectV1Attributes,
  ResearchObjectV1History,
  ResearchObjectV1Tags,
  ResearchObjectV1Organization,
  ResearchObjectV1Author,
} from '@desci-labs/desci-models';

const components = [] as ResearchObjectV1Component[];

const validations = [] as ResearchObjectV1Validation[];

const attributes: ResearchObjectV1Attributes[] = [];
const history: ResearchObjectV1History[] = [];

const tags: ResearchObjectV1Tags[] = [];

const organizations: ResearchObjectV1Organization[] = [];

const authors: ResearchObjectV1Author[] = [];

const researchObject: ResearchObjectV1 = {
  version: 'desci-nodes-0.1.0',
  validations,
  authors,
  attributes,
  components,
  history,
  tags,
  organizations,
};

export const createResearchObjectManifest = () => {
  return researchObject;
};
