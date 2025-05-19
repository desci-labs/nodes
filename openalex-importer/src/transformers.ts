import _ from 'lodash';

import type {
  authors_idsInOpenalex,
  authorsInOpenalex,
  Works,
  works_authorshipsInOpenalex,
  works_best_oa_locationsInOpenalex,
  works_biblioInOpenalex,
  works_conceptsInOpenalex,
  works_idsInOpenalex,
  works_locationsInOpenalex,
  works_meshInOpenalex,
  works_open_accessInOpenalex,
  works_primary_locationsInOpenalex,
  works_referenced_worksInOpenalex,
  works_related_worksInOpenalex,
  works_topicsInOpenalex,
} from './db/index.js';
import type { Institution } from './types/institutions.js';
import type { Work } from './types/works.js';

interface ModelMap {
  works: ReturnType<typeof transformToWork>[];
  // concepts: ReturnType<typeof transformToWork>[];
  // institutions: ReturnType<typeof transformToWork>[];
  // sources: ReturnType<typeof transformToWork>[];
  // authors: ReturnType<typeof transformToWork>[];
}

const OA_ID_URL_PREFIX = 'https://openalex.org/';
const DOI_ID_URL_PREFIX = 'https://doi.org/';
const ORCID_ID_URL_PREFIX = 'https://orcid.org/';

const oaUrlToId = (urlId: string) => urlId?.replace(OA_ID_URL_PREFIX, '');
const doiUrlToId = (urlId?: string | null) => urlId?.replace(DOI_ID_URL_PREFIX, '');
const orcidUrlToId = (urlId?: string | null) => urlId?.replace(ORCID_ID_URL_PREFIX, '');

export const transformApiResponseToDbModel = (works: Work[]): ModelMap => {
  return {
    works: works.map(transformToWork),
    // concepts: works.map(transformToWork),
    // institutions: works.map(transformToWork),
    // authors: works.map(transformToWork),
    // sources: works.map(transformToWork),
  };
};

export const transformToWork = (data: Work): Works => {
  return {
    id: oaUrlToId(data.id),
    doi: doiUrlToId(data.doi),
    title: data.title,
    display_name: data.display_name,
    publication_date: data.publication_date,
    publication_year: data.publication_year,
    type: data.type,
    cited_by_count: data.cited_by_count,
    is_retracted: data.is_retracted,
    is_paratext: data.is_paratext,
    cited_by_api_url: data.cited_by_api_url,
    abstract_inverted_index: data.abstract_inverted_index,
    language: data.language,
    // publication_date_date: data.publication_date,
  };
};

export const transformDataModel = (data: Work[]) => {
  const works = data.map(transformToWork);

  const authorship_data = data.map((work) => {
    const authors: (typeof authorsInOpenalex.$inferInsert)[] = work.authorships.map((data) => ({
      ...data.author,
      id: oaUrlToId(data.author.id),
    }));

    const authors_ids: (typeof authors_idsInOpenalex.$inferInsert)[] = work.authorships.map((authorship) => ({
      author_id: oaUrlToId(authorship.author.id),
      openalex: oaUrlToId(authorship.author.id),
      orcid: orcidUrlToId(authorship.author.orcid),
      twitter: authorship.author.twitter,
      scopus: authorship.author.scopus,
      wikipedia: authorship.author.wikipedia,
      mag: authorship.author.mag,
    }));

    const works_authorships: (typeof works_authorshipsInOpenalex.$inferInsert)[] = [];

    const institutions: Institution[] = [];

    for (const authorship of work.authorships) {
      const authorshipData = {
        work_id: oaUrlToId(work.id),
        author_position: authorship.author_position,
        author_id: oaUrlToId(authorship.author.id),
        institution_ids: [] as string[],
      };

      for (const institution of authorship.institutions) {
        authorshipData.institution_ids.push(oaUrlToId(institution.id));
        institutions.push(institution);
      }

      works_authorships.push(authorshipData);
    }

    return { authors, authors_ids, works_authorships, institutions };
  });

  const works_biblio: (typeof works_biblioInOpenalex.$inferInsert)[] = data.map((work) => ({
    ...work.biblio,
    work_id: oaUrlToId(work.id),
  }));

  const works_id: (typeof works_idsInOpenalex.$inferInsert)[] = data.map((work) => ({
    ...work.ids,
    openalex: oaUrlToId(work.ids.openalex),
    doi: doiUrlToId(work.ids.doi),
    mag: work.ids?.mag,
    work_id: oaUrlToId(work.id),
  }));

  const works_concepts: (typeof works_conceptsInOpenalex.$inferInsert)[] = _.flatten(
    data.map((work) =>
      work.concepts.map((concept) => ({
        work_id: oaUrlToId(work.id),
        concept_id: oaUrlToId(concept.id),
        score: concept.score,
      })),
    ),
  );

  const works_topics: (typeof works_topicsInOpenalex.$inferInsert)[] = _.flatten(
    data.map((work) =>
      work.topics.map(
        (topic) =>
          ({
            work_id: oaUrlToId(work.id),
            topic_id: oaUrlToId(topic.id),
            score: topic.score,
          }),
      ),
    ),
  );

  const works_locations: (typeof works_locationsInOpenalex.$inferInsert)[] = _.flatten(
    data.map((work) =>
      work.locations.map(
        (location) =>
          ({
            work_id: oaUrlToId(work.id),
            source_id: oaUrlToId(location.source?.id),
            landing_page_url: location.landing_page_url,
            pdf_url: location.pdf_url,
            is_oa: location.is_oa,
            version: location.version,
            license: location.license,
          }),
      ),
    ),
  );

  const works_mesh: (typeof works_meshInOpenalex.$inferInsert)[] = _.flatten(
    data.map((work) =>
      work.mesh.map(
        (mesh) =>
          ({
            work_id: oaUrlToId(work.id),
            descriptor_name: mesh.descriptor_name,
            descriptor_ui: mesh.descriptor_ui,
            qualifier_name: mesh.qualifier_name,
            qualifier_ui: mesh.qualifier_ui,
            is_major_topic: mesh.is_major_topic,
          }),
      ),
    ),
  );

  const works_primary_locations: (typeof works_primary_locationsInOpenalex.$inferInsert)[] = data
    .map((work) =>
      work.primary_location
        ? {
            source_id: oaUrlToId(work.primary_location.source?.id),
            landing_page_url: work.primary_location?.landing_page_url,
            pdf_url: work.primary_location.pdf_url,
            is_oa: work.primary_location.is_oa,
            version: work.primary_location.version,
            license: work.primary_location.license,
            work_id: oaUrlToId(work.id),
          }
        : null,
    )
    .filter(l => l !== null);

  const works_best_oa_locations: (typeof works_best_oa_locationsInOpenalex.$inferInsert)[] = data
    .map((work) =>
      work?.best_oa_location
        ? {
            source_id: work.best_oa_location.source?.id ? oaUrlToId(work.best_oa_location.source?.id) : undefined,
            landing_page_url: work.best_oa_location.landing_page_url,
            pdf_url: work.best_oa_location.pdf_url,
            is_oa: work.best_oa_location.is_oa,
            version: work.best_oa_location.version,
            license: work.best_oa_location.license,
            work_id: oaUrlToId(work.id),
          }
        : null,
    )
    .filter(l => l !== null);

  const works_open_access: (typeof works_open_accessInOpenalex.$inferInsert)[] = data.map((work) => ({
    ...work.open_access,
    work_id: oaUrlToId(work.id),
  }));

  const works_related_works: (typeof works_related_worksInOpenalex.$inferInsert)[] = _.flatten(
    data.map((work) =>
      work.related_works.map((related_work_id) => ({
        work_id: oaUrlToId(work.id),
        related_work_id: oaUrlToId(related_work_id),
      })),
    ),
  );

  const works_referenced_works: (typeof works_referenced_worksInOpenalex.$inferInsert)[] = _.flatten(
    data.map((work) =>
      work.referenced_works.map((referenced_work_id) => ({
        work_id: oaUrlToId(work.id),
        referenced_work_id: oaUrlToId(referenced_work_id),
      })),
    ),
  );

  // group unique authors
  const all_authors: (typeof authorsInOpenalex.$inferInsert)[] = _.flatten(authorship_data.map((data) => data.authors));
  const authors: (typeof authorsInOpenalex.$inferInsert)[] = _(all_authors)
    .groupBy((x) => x.id)
    .map(
      (values, id) =>
        ({
          id: oaUrlToId(id),
          orcid: orcidUrlToId(values[0].orcid),
          display_name: values[0].display_name,
          display_name_alternatives: values[0].display_name_alternatives,
          works_count: values[0].works_count,
          cited_by_count: values[0].cited_by_count,
          last_known_institution: values[0].last_known_institution,
          works_api_url: values[0].works_api_url,
          updated_date: values[0].updated_date,
        }),
    )
    .value();

  // group unique authors
  const all_author_ids: (typeof authors_idsInOpenalex.$inferInsert)[] = _.flatten(authorship_data.map((data) => data.authors_ids));

  const authors_ids: (typeof authors_idsInOpenalex.$inferInsert)[] = _(all_author_ids)
    .groupBy((x) => x.author_id)
    .map(
      (values, id) =>
        ({
          author_id: oaUrlToId(id),
          openalex: oaUrlToId(id),
          orcid: orcidUrlToId(values[0].orcid),
          twitter: values[0].twitter,
          scopus: values[0].scopus,
          wikipedia: values[0].wikipedia,
          mag: values[0].mag,
        }),
    )
    .value();

  // group unique institutions
  // let all_institutions = _.flatten(
  //   authorship_data.map((data) => data.institutions)
  // );
  // let institutions: Prisma.institutionsCreateManyInput[] = _(all_institutions)
  //   .groupBy((x) => x.id)
  //   .map(
  //     (values, key) =>
  //       ({
  //         ...values[0],
  //         id: key,
  //       } as Prisma.institutionsCreateManyInput)
  //   )
  //   .value();

  // let all_institutions_ids = all_institutions
  //   .map((institution) =>
  //     institution.ids
  //       ? {
  //           ...institution.ids,
  //           institution_id: institution.id,
  //         }
  //       : null
  //   )
  //   .filter(Boolean) as (Institution["ids"] & {
  //   institution_id: string;
  // })[];

  // let institutions_ids: Prisma.institutions_idsCreateManyInput[] = _(
  //   all_institutions_ids
  // )
  //   // .groupBy((x) => x.institution_id)
  //   .map(
  //     (values, key) =>
  //       ({
  //         ...values[0],
  //         institution_id: key,
  //       } as Prisma.institutions_idsCreateManyInput)
  //   )
  //   .value();

  return {
    authors,
    works_authorships: _.flatten(authorship_data.map((data) => data.works_authorships)),
    authors_ids,
    works,
    works_id,
    works_biblio,
    works_concepts,
    works_topics,
    works_locations,
    works_mesh,
    works_open_access,
    works_primary_locations,
    works_referenced_works,
    works_related_works,
    works_best_oa_locations,
  };
};

export type DataModels = ReturnType<typeof transformDataModel>;
