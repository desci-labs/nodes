export interface WorksResponse {
  'last-modified-date': LastModifiedDate;
  group: Group[];
  path: string;
}

export interface LastModifiedDate {
  value: number;
}

export interface Group {
  'last-modified-date': LastModifiedDate2;
  'external-ids': ExternalIds;
  'work-summary': WorkSummary[];
}

export interface LastModifiedDate2 {
  value: number;
}

export interface ExternalIds {
  'external-id': ExternalId[];
}

export interface ExternalId {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': ExternalIdNormalized;
  'external-id-normalized-error': any;
  'external-id-url'?: ExternalIdUrl;
  'external-id-relationship': string;
}

export interface ExternalIdNormalized {
  value: string;
  transient: boolean;
}

export interface ExternalIdUrl {
  value: string;
}

export interface WorkSummary {
  'put-code': number;
  'created-date': CreatedDate;
  'last-modified-date': LastModifiedDate3;
  source: Source;
  title: Title;
  'external-ids': ExternalIds2;
  url?: Url;
  type: string;
  'publication-date': PublicationDate;
  'journal-title'?: JournalTitle;
  visibility: string;
  path: string;
  'display-index': string;
}

export interface CreatedDate {
  value: number;
}

export interface LastModifiedDate3 {
  value: number;
}

export interface Source {
  'source-orcid'?: SourceOrcid;
  'source-client-id'?: SourceClientId;
  'source-name': SourceName;
  'assertion-origin-orcid'?: AssertionOriginOrcid;
  'assertion-origin-client-id': any;
  'assertion-origin-name'?: AssertionOriginName;
}

export interface SourceOrcid {
  uri: string;
  path: string;
  host: string;
}

export interface SourceClientId {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName {
  value: string;
}

export interface AssertionOriginOrcid {
  uri: string;
  path: string;
  host: string;
}

export interface AssertionOriginName {
  value: string;
}

export interface Title {
  title: Title2;
  subtitle: any;
  'translated-title': any;
}

export interface Title2 {
  value: string;
}

export interface ExternalIds2 {
  'external-id': ExternalId2[];
}

export interface ExternalId2 {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': ExternalIdNormalized2;
  'external-id-normalized-error': any;
  'external-id-url'?: ExternalIdUrl2;
  'external-id-relationship': string;
}

export interface ExternalIdNormalized2 {
  value: string;
  transient: boolean;
}

export interface ExternalIdUrl2 {
  value: string;
}

export interface Url {
  value: string;
}

export interface PublicationDate {
  year: Year;
  month?: Month;
  day?: Day;
}

export interface Year {
  value: string;
}

export interface Month {
  value: string;
}

export interface Day {
  value: string;
}

export interface JournalTitle {
  value: string;
}
