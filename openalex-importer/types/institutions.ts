export interface Institution {
  id: string;
  ror: string;
  display_name: string;
  country_code: string;
  type: string;
  type_id: string;
  lineage: string[];
  homepage_url: string;
  image_url: string;
  image_thumbnail_url: string;
  display_name_acronyms: string[];
  display_name_alternatives: string[];
  repositories: Repository[];
  works_count: number;
  cited_by_count: number;
  summary_stats: SummaryStats;
  ids: Ids;
  geo: Geo;
  international: International;
  associated_institutions: AssociatedInstitution[];
  counts_by_year: CountsByYear[];
  roles: Role[];
  topics: Topic[];
  topic_share: TopicShare[];
  x_concepts: XConcept[];
  is_super_system: boolean;
  works_api_url: string;
  updated_date: string;
  created_date: string;
}

export interface Repository {
  id: string;
  display_name: string;
  host_organization: string;
  host_organization_name: string;
  host_organization_lineage: string[];
}

export interface SummaryStats {
  "2yr_mean_citedness": number;
  h_index: number;
  i10_index: number;
}

export interface Ids {
  openalex: string;
  ror: string;
  mag: string;
  grid: string;
  wikipedia: string;
  wikidata: string;
}

export interface Geo {
  city: string;
  geonames_city_id: string;
  region: any;
  country_code: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface International {
  display_name: DisplayName;
}

export interface DisplayName {
  ar: string;
  arz: string;
  ast: string;
  az: string;
  azb: string;
  ba: string;
  be: string;
  "be-tarask": string;
  bg: string;
  bn: string;
  br: string;
  ca: string;
  ckb: string;
  crh: string;
  "crh-latn": string;
  cs: string;
  cy: string;
  da: string;
  de: string;
  el: string;
  en: string;
  "en-gb": string;
  eo: string;
  es: string;
  et: string;
  eu: string;
  fa: string;
  fi: string;
  fr: string;
  ga: string;
  gd: string;
  gl: string;
  gv: string;
  he: string;
  hu: string;
  hy: string;
  hyw: string;
  id: string;
  io: string;
  is: string;
  it: string;
  ja: string;
  jv: string;
  ka: string;
  ko: string;
  kw: string;
  ky: string;
  la: string;
  lb: string;
  lt: string;
  lv: string;
  mk: string;
  ml: string;
  mr: string;
  ms: string;
  mt: string;
  nb: string;
  nl: string;
  nn: string;
  pa: string;
  pap: string;
  pl: string;
  pms: string;
  pnb: string;
  pt: string;
  ro: string;
  ru: string;
  rw: string;
  sh: string;
  sl: string;
  sr: string;
  sv: string;
  ta: string;
  tg: string;
  th: string;
  tl: string;
  tr: string;
  tt: string;
  ug: string;
  uk: string;
  ur: string;
  vi: string;
  war: string;
  wuu: string;
  xmf: string;
  yue: string;
  zh: string;
  "zh-cn": string;
  "zh-hans": string;
  "zh-hant": string;
  "zh-hk": string;
  "zh-sg": string;
  "zh-tw": string;
}

export interface AssociatedInstitution {
  id: string;
  ror: string;
  display_name: string;
  country_code: string;
  type: string;
  relationship: string;
}

export interface CountsByYear {
  year: number;
  works_count: number;
  cited_by_count: number;
}

export interface Role {
  role: string;
  id: string;
  works_count: number;
}

export interface Topic {
  id: string;
  display_name: string;
  count: number;
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

export interface TopicShare {
  id: string;
  display_name: string;
  value: number;
  subfield: Subfield;
  field: Field;
  domain: Domain;
}

export interface XConcept {
  id: string;
  wikidata: string;
  display_name: string;
  level: number;
  score: number;
}
