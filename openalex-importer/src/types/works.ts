import type { Institution } from './institutions.js';

export interface Work {
  id: string;
  doi: string;
  title: string;
  display_name: string;
  publication_year: number;
  publication_date: string;
  ids: Ids;
  language: string;
  primary_location: PrimaryLocation;
  type: string;
  type_crossref: string;
  indexed_in: string[];
  open_access: OpenAccess;
  authorships: Authorship[];
  countries_distinct_count: number;
  institutions_distinct_count: number;
  corresponding_author_ids: any[];
  corresponding_institution_ids: any[];
  apc_list: any;
  apc_paid: any;
  fwci: number;
  has_fulltext: boolean;
  fulltext_origin: string;
  cited_by_count: number;
  cited_by_percentile_year: CitedByPercentileYear;
  biblio: Biblio;
  is_retracted: boolean;
  is_paratext: boolean;
  primary_topic: any;
  topics: any[];
  keywords: any[];
  concepts: Concept[];
  mesh: Mesh[];
  locations_count: number;
  locations: Location[];
  best_oa_location: BestOaLocation;
  sustainable_development_goals: any[];
  grants: any[];
  datasets: any[];
  versions: any[];
  referenced_works_count: number;
  referenced_works: any[];
  related_works: string[];
  ngrams_url: string;
  abstract_inverted_index: any;
  cited_by_api_url: string;
  counts_by_year: CountsByYear[];
  updated_date: string;
  created_date: string;
}

interface Ids {
  openalex: string;
  doi: string | null;
  mag: number | null;
  pmid: string | null;
  pmcid: string | null;
}

interface PrimaryLocation {
  is_oa: boolean;
  landing_page_url: string;
  pdf_url: string;
  source: Source;
  license: string;
  license_id: string;
  version: string;
  is_accepted: boolean;
  is_published: boolean;
}

interface Source {
  id: string;
  display_name: string;
  issn_l: any;
  issn: any;
  is_oa: boolean;
  is_in_doaj: boolean;
  is_core: boolean;
  host_organization: any;
  host_organization_name: any;
  host_organization_lineage: any[];
  host_organization_lineage_names: any[];
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
  countries: any[];
  is_corresponding: boolean;
  raw_author_name: string;
  raw_affiliation_strings: any[];
  affiliations: any[];
}

export interface Author {
  id: string;
  display_name: string;
  orcid: string | null;
  twitter: string | null;
  scopus: string | null;
  wikipedia: string | null;
  mag: number | null;
}

interface CitedByPercentileYear {
  min: number;
  max: number;
}

interface Biblio {
  volume: any;
  issue: any;
  first_page: string;
  last_page: string;
}

interface Concept {
  id: string;
  wikidata: string | null;
  display_name: string | null;
  level: number | null;
  score: number | null;
  description: string | null;
  works_count: number | null;
  cited_by_count: number | null;
  image_url: string | null;
  image_thumbnail_url: string | null;
  works_api_url: string | null;
  updated_date: string | null;
}

interface Location {
  is_oa: boolean;
  landing_page_url: string;
  pdf_url: string;
  source: Source;
  license: string;
  license_id: string;
  version: string;
  is_accepted: boolean;
  is_published: boolean;
}

interface BestOaLocation {
  is_oa: boolean | null;
  landing_page_url: string | null;
  pdf_url: string | null;
  source: Source | null;
  license: string | null;
  license_id: string | null;
  version: string | null;
  is_accepted: boolean | null;
  is_published: boolean | null;
}

interface CountsByYear {
  year: number;
  cited_by_count: number;
}

export interface Mesh {
  descriptor_ui: string;
  descriptor_name: string;
  qualifier_ui: string;
  qualifier_name: string;
  is_major_topic: boolean;
}
