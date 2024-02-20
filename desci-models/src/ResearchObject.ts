export interface ResearchObject {
  version: number | string;
}

export interface ResearchObjectPreviewResult {
  title: string;
  abstract: string;
  doi: string;
  pdf: string;
  publishedDate: Date;
  blob: string;
}

export interface IpldUrl {
  ['/']: string;
}

export interface ResearchObjectV1 extends ResearchObject {
  version: 'desci-nodes-0.1.0' | 'desci-nodes-0.2.0' | 1;
  title?: string;
  description?: string;
  defaultLicense?: string;
  coverImage?: string | IpldUrl;
  components: ResearchObjectV1Component[];
  validations?: ResearchObjectV1Validation[];
  attributes?: ResearchObjectV1Attributes[];
  history?: ResearchObjectV1History[];
  tags?: ResearchObjectV1Tags[];
  organizations?: ResearchObjectV1Organization[];
  dpid?: ResearchObjectV1Dpid;
  researchFields?: string[];
  authors?: ResearchObjectV1Author[];
}

export interface ResearchObjectV1Dpid {
  prefix: string;
  id: string;
}

export interface ResearchObjectV1Organization {
  id: string;
  name: string;
  subtext?: string;
}
export interface ResearchObjectV1Tags {
  name: string;
}

export interface ResearchObjectV1Component {
  id: string;
  name: string;
  type: ResearchObjectComponentType | ResearchObjectComponentTypeMap;
  icon?: any;
  payload: any;
  primary?: boolean;
  starred?: boolean;
}

export interface ResearchObjectV1Author {
  name: string;
  orcid?: string;
  googleScholar?: string;
  role: ResearchObjectV1AuthorRole;
  organizations?: ResearchObjectV1Organization[];
  github?: string;
}

export interface ResearchObjectV1History {
  title: string;
  author?: any; // does not refer to ResearchObject author for credit purpose, refers to the on-chain identity of the account who made the publication, this should not be stored in manifest and used in client only
  content: string;
  date?: number; // utc seconds
  transaction?: ResearchObjectTransaction;
}

export interface ResearchObjectTransaction {
  id: string;
  cid: string;
  chainId?: string;
}

export enum ResearchObjectValidationType {
  GRANT = 'grant',
  REVIEW = 'review',
  CONFERENCE = 'conference',
  AUDIT = 'audit',
  CERTIFICATION = 'certification',
  CERTIFICATION_ARC = 'certification-arc',
}
export interface ResearchObjectValidationDeposit {
  token: string;
  address: string;
  amount: string;
}

export interface ResearchObjectV1Validation {
  type: ResearchObjectValidationType;
  title: string;
  subtitle: string;
  transactionId?: string;
  contractAddress?: string;
  tokenId?: string;
  url?: string;
  deposits?: ResearchObjectValidationDeposit[];
}

export enum ResearchObjectAttributeKey {
  ACM_AVAILABLE = 'available',
  ACM_FUNCTIONAL = 'functional',
  ACM_REUSABLE = 'reusable',
  ACM_REPRODUCED = 'reproduced',
  ACM_REPLICATED = 'replicated',
  AUTHORSHIP_VERIFIED = 'authorship-verified',
  COMPUTATIONAL_REPRODUCIBILITY = 'computational-reproducibility',
}

export interface ResearchObjectV1Attributes {
  key: ResearchObjectAttributeKey;
  value: boolean;
}

export enum ResearchObjectComponentType {
  DATA_BUCKET = 'data-bucket',
  UNKNOWN = 'unknown',
  PDF = 'pdf',
  CODE = 'code',
  VIDEO = 'video',
  TERMINAL = 'terminal', // not used, TODO: remove
  DATA = 'data',
  LINK = 'link', // external link
}

export enum ResearchObjectComponentDocumentSubtype {
  RESEARCH_ARTICLE = 'research-article',
  PREREGISTERED_REPORT = 'preregistered-report',
  PREREGISTERED_ANALYSIS_PLAN = 'preregistered-analysis-plan',
  SUPPLEMENTARY_INFORMATION = 'supplementary-information',
  PRESENTATION_DECK = 'presentation-deck',
  AUTHOR_ACCEPTED = 'author-accepted',
  PREPRINT = 'preprint',
  REVIEW_REPORT = 'review-report',
  MANUSCRIPT = 'manuscript',
  OTHER = 'other',
}

export enum ResearchObjectComponentDataSubtype {
  PROCESSED_DATA = 'processed-data',
  RAW_DATA = 'raw-data',
  IMAGE = 'image',
  OTHER = 'other',
}

export enum ResearchObjectComponentCodeSubtype {
  CODE_SCRIPTS = 'code-scripts',
  SOFTWARE_PACKAGE = 'software-package',
  OTHER = 'other',
}

export enum ResearchObjectComponentLinkSubtype {
  COMMUNITY_DISCUSSION = 'community-discussion',
  VIDEO_RESOURCE = 'video-resource',
  EXTERNAL_API = 'external-api',
  RESTRICTED_DATA = 'restricted',
  PRESENTATION_DECK = 'presentation-deck',
  OTHER = 'other',
}

export type ResearchObjectComponentSubtypes =
  | ResearchObjectComponentDocumentSubtype
  | ResearchObjectComponentDataSubtype
  | ResearchObjectComponentCodeSubtype
  | ResearchObjectComponentLinkSubtype;

export interface CommonComponentPayload {
  title?: string;
  keywords?: string[];
  description?: string;
  licenseType?: string;
  path?: string;
}

export interface PdfComponentPayload {
  url: string;
  annotations?: PdfAnnotation[];
}

export interface ExternalLinkComponentPayload {
  url: string;
  archives?: ExternalLinkArchive[];
}

export interface ExternalLinkArchive {
  url: string | IpldUrl;
  accessDate: number; // utc seconds
}

export type Path = string;

export interface DataComponentMetadata extends CommonComponentPayload {
  ontologyPurl?: string;
  cedarLink?: string;
  controlledVocabTerms?: string[];
}
export interface DataComponentPayload {
  cid: string;
  subMetadata: Record<Path, DataComponentMetadata>;
}

export interface DataBucketComponent extends ResearchObjectV1Component {
  type: ResearchObjectComponentType.DATA_BUCKET;
  id: 'root';
  name: 'root';
  payload: DataBucketComponentPayload;
}
export interface DataBucketComponentPayload {
  cid: string;
}

export interface PdfComponent extends ResearchObjectV1Component {
  type: ResearchObjectComponentType.PDF;
  subtype?: ResearchObjectComponentDocumentSubtype;
  payload: PdfComponentPayload & CommonComponentPayload;
}

export interface ExternalLinkComponent extends ResearchObjectV1Component {
  type: ResearchObjectComponentType.LINK;
  subtype?: ResearchObjectComponentLinkSubtype;
  payload: ExternalLinkComponentPayload & CommonComponentPayload;
}

export interface DataComponent extends ResearchObjectV1Component {
  type: ResearchObjectComponentType.DATA;
  subtype?: ResearchObjectComponentDataSubtype;
  payload: DataComponentPayload & DataComponentMetadata;
}

export interface CodeComponent extends ResearchObjectV1Component {
  type: ResearchObjectComponentType.CODE;
  subtype?: ResearchObjectComponentCodeSubtype;
  payload: {
    language?: string;
    code?: string;
    url?: string;
    externalUrl?: string;
  } & CommonComponentPayload;
}
export interface TerminalComponent extends ResearchObjectV1Component {
  type: ResearchObjectComponentType.TERMINAL;
  payload: {
    logs: string;
  } & CommonComponentPayload;
}

export interface COORDS {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
export interface COORDP extends COORDS {
  pageIndex?: number;
}
export interface Scaled {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  pageIndex?: number;
}

export interface PdfAnnotation extends ResearchObjectComponentAnnotation, Scaled {
  move?: boolean;
  text?: string;
  title?: string;
  rects?: COORDP[];
  __client?: any;
}

export interface ComponentAnnotation extends ResearchObjectComponentAnnotation, Scaled {
  move?: boolean;
  text?: string;
  title?: string;
  rects?: COORDP[];
  __client?: any;
  path?: string;
}

export interface ResearchObjectComponentAnnotation {
  id: string;
  authorId?: string;
  author?: ResearchObjectV1Author;
}

export enum ResearchObjectV1AuthorRole {
  AUTHOR = 'Author',
  NODE_STEWARD = 'Node Steward',
}

/**
 * Maps FileExtensions => ResearchObjectComponentTypes
 * @example {
 *   '.py': ResearchObjectComponentType.CODE,
 *    '.ipynb': ResearchObjectComponentType.CODE,
 *    '.csv': ResearchObjectComponentType.DATA,
 *    '.pdf': ResearchObjectComponentType.PDF
 * }
 */
export type ResearchObjectComponentTypeMap = Record<FileExtension, ResearchObjectComponentType>;
export type FileExtension = string;
