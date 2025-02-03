export interface OpenAlexWork {
  id: string;
  doi: string;
  title: string;
  display_name: string;
  relevance_score: number;
  publication_year: number;
  publication_date: string;
  ids: Ids;
  language: string;
  primary_location: PrimaryLocation;
  type: string;
  type_crossref: 'journal-article' | 'posted_content';
  indexed_in: string[];
  open_access: OpenAccess;
  authorships: Authorship[];
  // institution_assertions: any[]
  countries_distinct_count: number;
  institutions_distinct_count: number;
  // corresponding_author_ids: any[]
  // corresponding_institution_ids: any[]
  apc_list: ApcList;
  // apc_paid: any
  fwci: number;
  has_fulltext: boolean;
  fulltext_origin: string;
  cited_by_count: number;
  citation_normalized_percentile: CitationNormalizedPercentile;
  cited_by_percentile_year: CitedByPercentileYear;
  biblio: Biblio;
  is_retracted: boolean;
  is_paratext: boolean;
  primary_topic: PrimaryTopic;
  topics: Topic[];
  keywords: Keyword[];
  concepts: Concept[];
  // mesh: any[]
  locations_count: number;
  locations: Location[];
  best_oa_location: BestOaLocation;
  sustainable_development_goals: SustainableDevelopmentGoal[];
  // grants: any[]
  // datasets: any[]
  // versions: any[]
  referenced_works_count: number;
  referenced_works: string[];
  related_works: string[];
  abstract_inverted_index: AbstractInvertedIndex;
  cited_by_api_url: string;
  counts_by_year: CountsByYear[];
  updated_date: string;
  created_date: string;
}

export interface Ids {
  openalex: string;
  doi: string;
  mag: string;
}

export interface PrimaryLocation {
  is_oa: boolean;
  landing_page_url: string;
  pdf_url: string | undefined;
  source: Source;
  // license: any
  // license_id: any
  // version: any
  is_accepted: boolean;
  is_published: boolean;
}

export interface Source {
  id: string;
  display_name: string;
  issn_l: string;
  issn: string[];
  is_oa: boolean;
  is_in_doaj: boolean;
  is_core: boolean;
  host_organization: string;
  host_organization_name: string;
  host_organization_lineage: string[];
  host_organization_lineage_names: string[];
  type: string;
}

export interface OpenAccess {
  is_oa: boolean;
  oa_status: string;
  oa_url: string;
  any_repository_has_fulltext: boolean;
}

export interface Authorship {
  author_position: string;
  author: Author;
  institutions: Institution[];
  countries: string[];
  is_corresponding: boolean;
  raw_author_name: string;
  raw_affiliation_strings: string[];
  affiliations: Affiliation[];
}

export interface Author {
  id: string;
  display_name: string;
  orcid: string;
}

export interface Institution {
  id: string;
  display_name: string;
  ror: string;
  country_code: string;
  type: string;
  lineage: string[];
}

export interface Affiliation {
  raw_affiliation_string: string;
  institution_ids: string[];
}

export interface ApcList {
  value: number;
  currency: string;
  value_usd: number;
  provenance: string;
}

export interface CitationNormalizedPercentile {
  value: number;
  is_in_top_1_percent: boolean;
  is_in_top_10_percent: boolean;
}

export interface CitedByPercentileYear {
  min: number;
  max: number;
}

export interface Biblio {
  volume: string;
  issue: string;
  first_page: string;
  last_page: string;
}

export interface PrimaryTopic {
  id: string;
  display_name: string;
  score: number;
  subfield: Subfield;
  field: Field;
  domain: Domain;
}

export interface Subfield {
  id: string;
  display_name: string;
}

export interface Field {
  id: string;
  display_name: string;
}

export interface Domain {
  id: string;
  display_name: string;
}

export interface Topic {
  id: string;
  display_name: string;
  score: number;
  subfield: Subfield2;
  field: Field2;
  domain: Domain2;
}

export interface Subfield2 {
  id: string;
  display_name: string;
}

export interface Field2 {
  id: string;
  display_name: string;
}

export interface Domain2 {
  id: string;
  display_name: string;
}

export interface Keyword {
  id: string;
  display_name: string;
  score: number;
}

export interface Concept {
  id: string;
  wikidata: string;
  display_name: string;
  level: number;
  score: number;
}

export interface Location {
  is_oa: boolean;
  landing_page_url: string;
  pdf_url?: string;
  source: Source2;
  // license: any
  // license_id: any
  version?: string;
  is_accepted: boolean;
  is_published: boolean;
}

export interface Source2 {
  id: string;
  display_name: string;
  issn_l?: string;
  issn?: string[];
  is_oa: boolean;
  is_in_doaj: boolean;
  is_core: boolean;
  host_organization: string;
  host_organization_name: string;
  host_organization_lineage: string[];
  host_organization_lineage_names: string[];
  type: string;
}

export interface BestOaLocation {
  is_oa: boolean;
  landing_page_url: string;
  pdf_url: string;
  source: Source3;
  // license: any
  // license_id: any
  version: string;
  is_accepted: boolean;
  is_published: boolean;
}

export interface Source3 {
  id: string;
  display_name: string;
  // issn_l: any
  // issn: any
  is_oa: boolean;
  is_in_doaj: boolean;
  is_core: boolean;
  host_organization: string;
  host_organization_name: string;
  host_organization_lineage: string[];
  host_organization_lineage_names: string[];
  type: string;
}

export interface SustainableDevelopmentGoal {
  id: string;
  display_name: string;
  score: number;
}

export interface AbstractInvertedIndex {
  [key: string]: number[];
}

export interface CountsByYear {
  year: number;
  cited_by_count: number;
}
