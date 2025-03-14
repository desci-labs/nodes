export interface ProfileSummary {
  'orcid-identifier': OrcidIdentifier;
  preferences: Preferences;
  history: History;
  person: Person;
  'activities-summary': ActivitiesSummary;
  path: string;
}

export interface OrcidIdentifier {
  uri: string;
  path: string;
  host: string;
}

export interface Preferences {
  locale: string;
}

export interface History {
  'creation-method': string;
  'completion-date': any;
  'submission-date': SubmissionDate;
  'last-modified-date': LastModifiedDate;
  claimed: boolean;
  source: any;
  'deactivation-date': any;
  'verified-email': boolean;
  'verified-primary-email': boolean;
}

export interface SubmissionDate {
  value: number;
}

export interface LastModifiedDate {
  value: number;
}

export interface Person {
  'last-modified-date': LastModifiedDate2;
  name: Name;
  'other-names': OtherNames;
  biography: any;
  'researcher-urls': ResearcherUrls;
  emails: Emails;
  addresses: Addresses;
  keywords: Keywords;
  'external-identifiers': ExternalIdentifiers;
  path: string;
}

export interface LastModifiedDate2 {
  value: number;
}

export interface Name {
  'created-date': CreatedDate;
  'last-modified-date': LastModifiedDate3;
  'given-names': GivenNames;
  'family-name': FamilyName;
  'credit-name': any;
  source: any;
  visibility: string;
  path: string;
}

export interface CreatedDate {
  value: number;
}

export interface LastModifiedDate3 {
  value: number;
}

export interface GivenNames {
  value: string;
}

export interface FamilyName {
  value: string;
}

export interface OtherNames {
  'last-modified-date': any;
  'other-name': any[];
  path: string;
}

export interface ResearcherUrls {
  'last-modified-date': LastModifiedDate4;
  'researcher-url': ResearcherUrl[];
  path: string;
}

export interface LastModifiedDate4 {
  value: number;
}

export interface ResearcherUrl {
  'created-date': CreatedDate2;
  'last-modified-date': LastModifiedDate5;
  source: Source;
  'url-name': any;
  url: Url;
  visibility: string;
  path: string;
  'put-code': number;
  'display-index': number;
}

export interface CreatedDate2 {
  value: number;
}

export interface LastModifiedDate5 {
  value: number;
}

export interface Source {
  'source-orcid': SourceOrcid;
  'source-client-id': any;
  'source-name': SourceName;
  'assertion-origin-orcid': any;
  'assertion-origin-client-id': any;
  'assertion-origin-name': any;
}

export interface SourceOrcid {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName {
  value: string;
}

export interface Url {
  value: string;
}

export interface Emails {
  'last-modified-date': any;
  email: any[];
  path: string;
}

export interface Addresses {
  'last-modified-date': LastModifiedDate6;
  address: Address[];
  path: string;
}

export interface LastModifiedDate6 {
  value: number;
}

export interface Address {
  'created-date': CreatedDate3;
  'last-modified-date': LastModifiedDate7;
  source: Source2;
  country: Country;
  visibility: string;
  path: string;
  'put-code': number;
  'display-index': number;
}

export interface CreatedDate3 {
  value: number;
}

export interface LastModifiedDate7 {
  value: number;
}

export interface Source2 {
  'source-orcid': SourceOrcid2;
  'source-client-id': any;
  'source-name': SourceName2;
  'assertion-origin-orcid': any;
  'assertion-origin-client-id': any;
  'assertion-origin-name': any;
}

export interface SourceOrcid2 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName2 {
  value: string;
}

export interface Country {
  value: string;
}

export interface Keywords {
  'last-modified-date': LastModifiedDate8;
  keyword: Keyword[];
  path: string;
}

export interface LastModifiedDate8 {
  value: number;
}

export interface Keyword {
  'created-date': CreatedDate4;
  'last-modified-date': LastModifiedDate9;
  source: Source3;
  content: string;
  visibility: string;
  path: string;
  'put-code': number;
  'display-index': number;
}

export interface CreatedDate4 {
  value: number;
}

export interface LastModifiedDate9 {
  value: number;
}

export interface Source3 {
  'source-orcid': SourceOrcid3;
  'source-client-id': any;
  'source-name': SourceName3;
  'assertion-origin-orcid': any;
  'assertion-origin-client-id': any;
  'assertion-origin-name': any;
}

export interface SourceOrcid3 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName3 {
  value: string;
}

export interface ExternalIdentifiers {
  'last-modified-date': LastModifiedDate10;
  'external-identifier': ExternalIdentifier[];
  path: string;
}

export interface LastModifiedDate10 {
  value: number;
}

export interface ExternalIdentifier {
  'created-date': CreatedDate5;
  'last-modified-date': LastModifiedDate11;
  source: Source4;
  'external-id-type': string;
  'external-id-value': string;
  'external-id-url': ExternalIdUrl;
  'external-id-relationship': string;
  visibility: string;
  path: string;
  'put-code': number;
  'display-index': number;
}

export interface CreatedDate5 {
  value: number;
}

export interface LastModifiedDate11 {
  value: number;
}

export interface Source4 {
  'source-orcid': any;
  'source-client-id': SourceClientId;
  'source-name': SourceName4;
  'assertion-origin-orcid': any;
  'assertion-origin-client-id': any;
  'assertion-origin-name': any;
}

export interface SourceClientId {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName4 {
  value: string;
}

export interface ExternalIdUrl {
  value: string;
}

export interface ActivitiesSummary {
  'last-modified-date': LastModifiedDate12;
  distinctions: Distinctions;
  educations: Educations;
  employments: Employments;
  fundings: Fundings;
  'invited-positions': InvitedPositions;
  memberships: Memberships;
  'peer-reviews': PeerReviews;
  qualifications: Qualifications;
  'research-resources': ResearchResources;
  services: Services;
  works: Works;
  path: string;
}

export interface LastModifiedDate12 {
  value: number;
}

export interface Distinctions {
  'last-modified-date': any;
  'affiliation-group': any[];
  path: string;
}

export interface Educations {
  'last-modified-date': LastModifiedDate13;
  'affiliation-group': AffiliationGroup[];
  path: string;
}

export interface LastModifiedDate13 {
  value: number;
}

export interface AffiliationGroup {
  'last-modified-date': LastModifiedDate14;
  'external-ids': ExternalIds;
  summaries: Summary[];
}

export interface LastModifiedDate14 {
  value: number;
}

export interface ExternalIds {
  'external-id': any[];
}

export interface Summary {
  'education-summary': EducationSummary;
}

export interface EducationSummary {
  'created-date': CreatedDate6;
  'last-modified-date': LastModifiedDate15;
  source: Source5;
  'put-code': number;
  'department-name': string;
  'role-title': string;
  'start-date': StartDate;
  'end-date': EndDate;
  organization: Organization;
  url: Url2;
  'external-ids': any;
  'display-index': string;
  visibility: string;
  path: string;
}

export interface CreatedDate6 {
  value: number;
}

export interface LastModifiedDate15 {
  value: number;
}

export interface Source5 {
  'source-orcid': SourceOrcid4;
  'source-client-id': any;
  'source-name': SourceName5;
  'assertion-origin-orcid': any;
  'assertion-origin-client-id': any;
  'assertion-origin-name': any;
}

export interface SourceOrcid4 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName5 {
  value: string;
}

export interface StartDate {
  year: Year;
  month: Month;
  day: any;
}

export interface Year {
  value: string;
}

export interface Month {
  value: string;
}

export interface EndDate {
  year: Year2;
  month: Month2;
  day: any;
}

export interface Year2 {
  value: string;
}

export interface Month2 {
  value: string;
}

export interface Organization {
  name: string;
  address: Address2;
  'disambiguated-organization': DisambiguatedOrganization;
}

export interface Address2 {
  city: string;
  region: string;
  country: string;
}

export interface DisambiguatedOrganization {
  'disambiguated-organization-identifier': string;
  'disambiguation-source': string;
}

export interface Url2 {
  value: string;
}

export interface Employments {
  'last-modified-date': LastModifiedDate16;
  'affiliation-group': AffiliationGroup2[];
  path: string;
}

export interface LastModifiedDate16 {
  value: number;
}

export interface AffiliationGroup2 {
  'last-modified-date': LastModifiedDate17;
  'external-ids': ExternalIds2;
  summaries: Summary2[];
}

export interface LastModifiedDate17 {
  value: number;
}

export interface ExternalIds2 {
  'external-id': any[];
}

export interface Summary2 {
  'employment-summary': EmploymentSummary;
}

export interface EmploymentSummary {
  'created-date': CreatedDate7;
  'last-modified-date': LastModifiedDate18;
  source: Source6;
  'put-code': number;
  'department-name'?: string;
  'role-title': string;
  'start-date': StartDate2;
  'end-date'?: EndDate2;
  organization: Organization2;
  url?: Url3;
  'external-ids': any;
  'display-index': string;
  visibility: string;
  path: string;
}

export interface CreatedDate7 {
  value: number;
}

export interface LastModifiedDate18 {
  value: number;
}

export interface Source6 {
  'source-orcid': SourceOrcid5;
  'source-client-id': any;
  'source-name': SourceName6;
  'assertion-origin-orcid': any;
  'assertion-origin-client-id': any;
  'assertion-origin-name': any;
}

export interface SourceOrcid5 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName6 {
  value: string;
}

export interface StartDate2 {
  year: Year3;
  month: Month3;
  day: Day;
}

export interface Year3 {
  value: string;
}

export interface Month3 {
  value: string;
}

export interface Day {
  value: string;
}

export interface EndDate2 {
  year: Year4;
  month: Month4;
  day: Day2;
}

export interface Year4 {
  value: string;
}

export interface Month4 {
  value: string;
}

export interface Day2 {
  value: string;
}

export interface Organization2 {
  name: string;
  address: Address3;
  'disambiguated-organization'?: DisambiguatedOrganization2;
}

export interface Address3 {
  city: string;
  region?: string;
  country: string;
}

export interface DisambiguatedOrganization2 {
  'disambiguated-organization-identifier': string;
  'disambiguation-source': string;
}

export interface Url3 {
  value: string;
}

export interface Fundings {
  'last-modified-date': LastModifiedDate19;
  group: Group[];
  path: string;
}

export interface LastModifiedDate19 {
  value: number;
}

export interface Group {
  'last-modified-date': LastModifiedDate20;
  'external-ids': ExternalIds3;
  'funding-summary': FundingSummary[];
}

export interface LastModifiedDate20 {
  value: number;
}

export interface ExternalIds3 {
  'external-id': ExternalId[];
}

export interface ExternalId {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': any;
  'external-id-normalized-error': any;
  'external-id-url'?: ExternalIdUrl2;
  'external-id-relationship': string;
}

export interface ExternalIdUrl2 {
  value: string;
}

export interface FundingSummary {
  'created-date': CreatedDate8;
  'last-modified-date': LastModifiedDate21;
  source: Source7;
  title: Title;
  'external-ids'?: ExternalIds4;
  url?: Url4;
  type: string;
  'start-date': StartDate3;
  'end-date': EndDate3;
  organization: Organization3;
  visibility: string;
  'put-code': number;
  path: string;
  'display-index': string;
}

export interface CreatedDate8 {
  value: number;
}

export interface LastModifiedDate21 {
  value: number;
}

export interface Source7 {
  'source-orcid'?: SourceOrcid6;
  'source-client-id'?: SourceClientId2;
  'source-name': SourceName7;
  'assertion-origin-orcid'?: AssertionOriginOrcid;
  'assertion-origin-client-id': any;
  'assertion-origin-name'?: AssertionOriginName;
}

export interface SourceOrcid6 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceClientId2 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName7 {
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
  'translated-title'?: TranslatedTitle;
}

export interface Title2 {
  value: string;
}

export interface TranslatedTitle {
  value: string;
  'language-code': string;
}

export interface ExternalIds4 {
  'external-id': ExternalId2[];
}

export interface ExternalId2 {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': any;
  'external-id-normalized-error': any;
  'external-id-url'?: ExternalIdUrl3;
  'external-id-relationship': string;
}

export interface ExternalIdUrl3 {
  value: string;
}

export interface Url4 {
  value: string;
}

export interface StartDate3 {
  year: Year5;
  month?: Month5;
  day?: Day3;
}

export interface Year5 {
  value: string;
}

export interface Month5 {
  value: string;
}

export interface Day3 {
  value: string;
}

export interface EndDate3 {
  year: Year6;
  month?: Month6;
  day?: Day4;
}

export interface Year6 {
  value: string;
}

export interface Month6 {
  value: string;
}

export interface Day4 {
  value: string;
}

export interface Organization3 {
  name: string;
  address: Address4;
  'disambiguated-organization'?: DisambiguatedOrganization3;
}

export interface Address4 {
  city: string;
  region?: string;
  country: string;
}

export interface DisambiguatedOrganization3 {
  'disambiguated-organization-identifier': string;
  'disambiguation-source': string;
}

export interface InvitedPositions {
  'last-modified-date': LastModifiedDate22;
  'affiliation-group': AffiliationGroup3[];
  path: string;
}

export interface LastModifiedDate22 {
  value: number;
}

export interface AffiliationGroup3 {
  'last-modified-date': LastModifiedDate23;
  'external-ids': ExternalIds5;
  summaries: Summary3[];
}

export interface LastModifiedDate23 {
  value: number;
}

export interface ExternalIds5 {
  'external-id': any[];
}

export interface Summary3 {
  'invited-position-summary': InvitedPositionSummary;
}

export interface InvitedPositionSummary {
  'created-date': CreatedDate9;
  'last-modified-date': LastModifiedDate24;
  source: Source8;
  'put-code': number;
  'department-name': any;
  'role-title': string;
  'start-date': StartDate4;
  'end-date': any;
  organization: Organization4;
  url: Url5;
  'external-ids': any;
  'display-index': string;
  visibility: string;
  path: string;
}

export interface CreatedDate9 {
  value: number;
}

export interface LastModifiedDate24 {
  value: number;
}

export interface Source8 {
  'source-orcid': SourceOrcid7;
  'source-client-id': any;
  'source-name': SourceName8;
  'assertion-origin-orcid': any;
  'assertion-origin-client-id': any;
  'assertion-origin-name': any;
}

export interface SourceOrcid7 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName8 {
  value: string;
}

export interface StartDate4 {
  year: Year7;
  month: Month7;
  day: Day5;
}

export interface Year7 {
  value: string;
}

export interface Month7 {
  value: string;
}

export interface Day5 {
  value: string;
}

export interface Organization4 {
  name: string;
  address: Address5;
  'disambiguated-organization': any;
}

export interface Address5 {
  city: string;
  region: any;
  country: string;
}

export interface Url5 {
  value: string;
}

export interface Memberships {
  'last-modified-date': any;
  'affiliation-group': any[];
  path: string;
}

export interface PeerReviews {
  'last-modified-date': LastModifiedDate25;
  group: Group2[];
  path: string;
}

export interface LastModifiedDate25 {
  value: number;
}

export interface Group2 {
  'last-modified-date': LastModifiedDate26;
  'external-ids': ExternalIds6;
  'peer-review-group': PeerReviewGroup[];
}

export interface LastModifiedDate26 {
  value: number;
}

export interface ExternalIds6 {
  'external-id': ExternalId3[];
}

export interface ExternalId3 {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': any;
  'external-id-normalized-error': any;
  'external-id-url': any;
  'external-id-relationship': any;
}

export interface PeerReviewGroup {
  'last-modified-date': LastModifiedDate27;
  'external-ids': ExternalIds7;
  'peer-review-summary': PeerReviewSummary[];
}

export interface LastModifiedDate27 {
  value: number;
}

export interface ExternalIds7 {
  'external-id': ExternalId4[];
}

export interface ExternalId4 {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': ExternalIdNormalized;
  'external-id-normalized-error': any;
  'external-id-url': ExternalIdUrl4;
  'external-id-relationship': string;
}

export interface ExternalIdNormalized {
  value: string;
  transient: boolean;
}

export interface ExternalIdUrl4 {
  value: string;
}

export interface PeerReviewSummary {
  'created-date': CreatedDate10;
  'last-modified-date': LastModifiedDate28;
  source: Source9;
  'reviewer-role': string;
  'external-ids': ExternalIds8;
  'review-url': any;
  'review-type': string;
  'completion-date': CompletionDate;
  'review-group-id': string;
  'convening-organization': ConveningOrganization;
  visibility: string;
  'put-code': number;
  path: string;
  'display-index': string;
}

export interface CreatedDate10 {
  value: number;
}

export interface LastModifiedDate28 {
  value: number;
}

export interface Source9 {
  'source-orcid': any;
  'source-client-id': SourceClientId3;
  'source-name': SourceName9;
  'assertion-origin-orcid': any;
  'assertion-origin-client-id': any;
  'assertion-origin-name': any;
}

export interface SourceClientId3 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName9 {
  value: string;
}

export interface ExternalIds8 {
  'external-id': ExternalId5[];
}

export interface ExternalId5 {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': ExternalIdNormalized2;
  'external-id-normalized-error': any;
  'external-id-url': ExternalIdUrl5;
  'external-id-relationship': string;
}

export interface ExternalIdNormalized2 {
  value: string;
  transient: boolean;
}

export interface ExternalIdUrl5 {
  value: string;
}

export interface CompletionDate {
  year: Year8;
  month?: Month8;
  day?: Day6;
}

export interface Year8 {
  value: string;
}

export interface Month8 {
  value: string;
}

export interface Day6 {
  value: string;
}

export interface ConveningOrganization {
  name: string;
  address: Address6;
  'disambiguated-organization': DisambiguatedOrganization4;
}

export interface Address6 {
  city: string;
  region?: string;
  country: string;
}

export interface DisambiguatedOrganization4 {
  'disambiguated-organization-identifier': string;
  'disambiguation-source': string;
}

export interface Qualifications {
  'last-modified-date': any;
  'affiliation-group': any[];
  path: string;
}

export interface ResearchResources {
  'last-modified-date': any;
  group: any[];
  path: string;
}

export interface Services {
  'last-modified-date': any;
  'affiliation-group': any[];
  path: string;
}

export interface Works {
  'last-modified-date': LastModifiedDate29;
  group: Group3[];
  path: string;
}

export interface LastModifiedDate29 {
  value: number;
}

export interface Group3 {
  'last-modified-date': LastModifiedDate30;
  'external-ids': ExternalIds9;
  'work-summary': WorkSummary[];
}

export interface LastModifiedDate30 {
  value: number;
}

export interface ExternalIds9 {
  'external-id': ExternalId6[];
}

export interface ExternalId6 {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': ExternalIdNormalized3;
  'external-id-normalized-error': any;
  'external-id-url'?: ExternalIdUrl6;
  'external-id-relationship': string;
}

export interface ExternalIdNormalized3 {
  value: string;
  transient: boolean;
}

export interface ExternalIdUrl6 {
  value: string;
}

export interface WorkSummary {
  'put-code': number;
  'created-date': CreatedDate11;
  'last-modified-date': LastModifiedDate31;
  source: Source10;
  title: Title3;
  'external-ids': ExternalIds10;
  url?: Url6;
  type: string;
  'publication-date': PublicationDate;
  'journal-title'?: JournalTitle;
  visibility: string;
  path: string;
  'display-index': string;
}

export interface CreatedDate11 {
  value: number;
}

export interface LastModifiedDate31 {
  value: number;
}

export interface Source10 {
  'source-orcid'?: SourceOrcid8;
  'source-client-id'?: SourceClientId4;
  'source-name': SourceName10;
  'assertion-origin-orcid'?: AssertionOriginOrcid2;
  'assertion-origin-client-id': any;
  'assertion-origin-name'?: AssertionOriginName2;
}

export interface SourceOrcid8 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceClientId4 {
  uri: string;
  path: string;
  host: string;
}

export interface SourceName10 {
  value: string;
}

export interface AssertionOriginOrcid2 {
  uri: string;
  path: string;
  host: string;
}

export interface AssertionOriginName2 {
  value: string;
}

export interface Title3 {
  title: Title4;
  subtitle: any;
  'translated-title': any;
}

export interface Title4 {
  value: string;
}

export interface ExternalIds10 {
  'external-id': ExternalId7[];
}

export interface ExternalId7 {
  'external-id-type': string;
  'external-id-value': string;
  'external-id-normalized': ExternalIdNormalized4;
  'external-id-normalized-error': any;
  'external-id-url'?: ExternalIdUrl7;
  'external-id-relationship': string;
}

export interface ExternalIdNormalized4 {
  value: string;
  transient: boolean;
}

export interface ExternalIdUrl7 {
  value: string;
}

export interface Url6 {
  value: string;
}

export interface PublicationDate {
  year: Year9;
  month?: Month9;
  day?: Day7;
}

export interface Year9 {
  value: string;
}

export interface Month9 {
  value: string;
}

export interface Day7 {
  value: string;
}

export interface JournalTitle {
  value: string;
}
