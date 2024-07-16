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
  mesh: any[];
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
  doi: string;
  mag: string;
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

interface OpenAccess {
  is_oa: boolean;
  oa_status: string;
  oa_url: string;
  any_repository_has_fulltext: boolean;
}

interface Authorship {
  author_position: string;
  author: Author;
  institutions: any[];
  countries: any[];
  is_corresponding: boolean;
  raw_author_name: string;
  raw_affiliation_strings: any[];
  affiliations: any[];
}

interface Author {
  id: string;
  display_name: string;
  orcid?: string;
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
  wikidata: string;
  display_name: string;
  level: number;
  score: number;
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

interface CountsByYear {
  year: number;
  cited_by_count: number;
}
