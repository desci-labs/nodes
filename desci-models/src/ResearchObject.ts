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
  /** Version of the research object schema*/
  version: 'desci-nodes-0.1.0' | 'desci-nodes-0.2.0' | 1;
  /** Human-readable title of the publication */
  title?: string;
  /** Human-readable desciption */
  description?: string;
  /** The license that applies unless overriden with a component */
  defaultLicense?: string;
  /** CID of a cover image to the publication */
  coverImage?: string | IpldUrl;
  /** Metadata additions to DAG entires, or stand-alone entries like external links */
  components: ResearchObjectV1Component[];
  /** @deprecated */
  validations?: ResearchObjectV1Validation[];
  /* @deprecated **/
  attributes?: ResearchObjectV1Attributes[];
  /** History for the object. Not part of the manifest, but can be populated
   * by an pplication */
  history?: ResearchObjectV1History[];
  /** @deprecated */
  tags?: ResearchObjectV1Tags[];
  /** Organizations affiliated with the publication */
  organizations?: ResearchObjectV1Organization[];
  /** Assigned dPID of the object, allowing finding the PID from the manifest */
  dpid?: ResearchObjectV1Dpid;
  /** Research fields relevant for the publication */
  researchFields?: string[];
  /** Keywords associated with the research object */
  keywords?: string[];
  /** Contributors to this publication */
  authors?: ResearchObjectV1Author[];

  /** Publication or creation date in YYYY-MM-DD format */
  date?: string;

  /** References to other research objects or published researches */
  references?: ResearchObjectReference[];
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

/**
 * Path-invariant metadata about a part of the research object.
 * Can be used to tag a directory as code or data, mark a pdf file as
 * as the main manuscript, add an external URL to the drive, et cetera.
 *
 * Mainly used through extension. See PdfComponent and DataComponent for
 * example.
 */
export interface ResearchObjectV1Component {
  /** Random UUID to identify the component, because paths and CIDs are
   * neither unique nor stable.
   */
  id: string;
  /** Human-readable description of the component. */
  name: string;
  /** Type of payload, which indicates to an app what to do with it. */
  type: ResearchObjectComponentType | ResearchObjectComponentTypeMap;
  /** @deprecated visual representation for the component */
  icon?: any;
  /** Description of the component content, see interface extenders. */
  payload: any;
  /** @deprecated Preferred component to initially load in an app. */
  primary?: boolean;
  /** Mark component as particularly interesting. */
  starred?: boolean;
}

/**
 * Contributor listing for a research object.
 */
export interface ResearchObjectV1Author {
  /** Random UUID to identify the contributor - optional for compatibility with old models
   * Going forwards assignment is best practice.
   */
  id?: string;
  /** Name of the contributor */
  name: string;
  /** Email address of the contributor */
  email?: string;
  /** Orcid handle of the contributor */
  orcid?: string;
  /** Google Scholar profile of the contributor */
  googleScholar?: string;
  /** Type of role in the publication */
  role: ResearchObjectV1AuthorRole | ResearchObjectV1AuthorRole[] | string | string[];
  /** Organizations the contributor is affiliated with */
  organizations?: ResearchObjectV1Organization[];
  /** GitHub profile of the contributor */
  github?: string;
  /** Desci Nodes user id */
  nodesUserId?: number;
}

export interface ResearchObjectV1History {
  title: string;
  /** does not refer to ResearchObject author for credit purpose, refers to
   * the on-chain identity of the account who made the publication, this
   * should not be stored in manifest and used in client only
   */
  author?: any;
  content: string;
  date?: number; // utc seconds
  transaction?: ResearchObjectTransaction;
}

/** Record of publication in the dPID registry contracts */
export interface ResearchObjectTransaction {
  /** Transaction hash in hex format */
  id: string;
  /** Hex-encoded manifest CID as stored in the contract */
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
  /** @deprecated remove at will */
  TERMINAL = 'terminal',
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
  /** Generic title of component */
  title?: string;
  /** @deprecated Keyword metadata for component */
  keywords?: string[];
  /** Description of component */
  description?: string;
  /** License of component, if other than research object default */
  licenseType?: string;
  /** Path of component in the drive, starting with `root` */
  path: string;
}

export interface PdfComponentPayload {
  /** @deprecated CID of document, as stored in the drive */
  url?: string;
  /** CID of document, as stored in the drive */
  cid: string;
  /** Annotations on the document */
  annotations?: PdfAnnotation[];
  /** DOI of the pdf or manuscript */
  /** Store an optional list of associated DOIs */
  doi?: string[];
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

export interface CodeComponentPayload {
  /** The main programming language of the code in the component */
  language?: string;
  /** @deprecated */
  code?: string;
  /** @deprecated CID of the component target */
  url?: string;
  /** CID of the component target */
  cid: string;
  /** Source URL, if externally imported code bundle */
  externalUrl?: string;
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
  payload: CodeComponentPayload & CommonComponentPayload;
}

/**
 * @deprecated remove at will
 */
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

export interface PdfHighlightBlock extends PdfAnnotation {
  image?: string;
  path: string;
  rects: COORDP[];
  kind: 'pdf';
}

export interface CodeAnnotation extends ResearchObjectComponentAnnotation {
  path: string;
  text?: string;
  cid: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface CodeHighlightBlock extends CodeAnnotation {
  kind: 'code';
}
export type HighlightBlock = CodeHighlightBlock | PdfHighlightBlock;

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

/** A semi-complete selection of license choices */
export type License =
  | 'AGPL-3.0'
  | 'Apache 2.0'
  | 'Apache License 2.0'
  | 'Apache-2.0'
  | 'BSD-2-Clause'
  | 'BSD-3-Clause'
  | 'CC BY'
  | 'CC BY-NC'
  | 'CC BY-NC-ND'
  | 'CC BY-NC-SA'
  | 'CC BY-ND'
  | 'CC BY-SA'
  | 'CC-BY'
  | 'CC-BY-3.0'
  | 'CC-BY-4.0'
  | 'CC-BY-NC'
  | 'CC-BY-NC-4.0'
  | 'CC-BY-NC-ND'
  | 'CC-BY-NC-ND-4.0'
  | 'CC-BY-NC-SA'
  | 'CC-BY-NC-SA-4.0'
  | 'CC-BY-ND'
  | 'CC-BY-ND-4.0'
  | 'CC-BY-SA'
  | 'CC-BY-SA-4.0'
  | 'CC0'
  | 'CC0-1.0'
  | 'CDDL-1.0'
  | 'EPL-2.0'
  | 'GPL-3.0'
  | 'LGPL-2.1'
  | 'LGPL-3.0'
  | 'MIT License'
  | 'MIT'
  | 'MPL 2.0'
  | 'MPL-2.0'
  | 'Mozilla Public License 2.0'
  | 'Unlicense';

/**
 * Reference Interface to other dPIDs or DOIs
 */
export interface ResearchObjectReference {
  /** Type of reference identifier  */
  type: 'dpid' | 'doi';
  /** Identifier (https://doi.org/<doi>) | <doi> | https://dpid.org/<dpid> */
  id: string;
  /** Title of the publication */
  title: string;
  /** URL, a link to the reference */
  url?: string;
  /** Author names for the references */
  authors?: { name: string }[];
  journal?: string;
  page?: string;
  volume?: string;
  issue?: string;
  year?: string;
}
