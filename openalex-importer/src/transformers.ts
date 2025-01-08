import _ from 'lodash';

import type {
  authors_idsInOpenalex,
  authorsInOpenalex,
  Works,
  works_biblioInOpenalex,
  works_meshInOpenalex,
  works_topicsInOpenalex,
  WorksBestOaLocation,
  WorksId,
  WorksLocation,
  WorksPrimaryLocation,
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
    id: data.id,
    doi: data.doi,
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
    publication_date_date: data.publication_date,
  };
};

export const transformDataModel = (data: Work[]) => {
  const works = data.map(transformToWork);

  const authorship_data = data.map((work) => {
    const authors: (typeof authorsInOpenalex.$inferInsert)[] = work.authorships.map((data) => data.author);

    const authors_ids: (typeof authors_idsInOpenalex.$inferInsert)[] = work.authorships.map((authorship) => ({
      author_id: authorship.author.id,
      openalex: authorship.author.id,
      orcid: authorship.author.orcid ?? null,
      twitter: authorship.author.twitter ?? null,
      scopus: authorship.author.scopus ?? null,
      wikipedia: authorship.author.wikipedia ?? null,
      mag: authorship.author.mag ?? null,
    }));

    const works_authorships: {
      work_id?: string;
      author_position?: string;
      author_id?: string;
      institution_id?: string;
      raw_affiliation_string?: string;
    }[] = [];

    const institutions: Institution[] = [];

    for (const authorship of work.authorships) {
      for (const institution of authorship.institutions) {
        works_authorships.push({
          work_id: work.id,
          author_position: authorship.author_position,
          author_id: authorship.author.id,
          institution_id: institution.id,
        });
        institutions.push(institution);
      }
    }

    return { authors, authors_ids, works_authorships, institutions };
  });

  const works_biblio: (typeof works_biblioInOpenalex.$inferInsert)[] = data.map((work) => ({
    ...work.biblio,
    work_id: work.id,
  }));

  const works_id: WorksId[] = data.map((work) => ({
    ...work.ids,
    mag: work.ids?.mag,
    work_id: work.id,
  }));

  const works_concepts = _.flatten(
    data.map((work) =>
      work.concepts.map((concept) => ({
        work_id: work.id,
        concept_id: concept.id,
        score: concept.score,
      })),
    ),
  );

  const works_topics = _.flatten(
    data.map((work) =>
      work.topics.map(
        (topic) =>
          ({
            work_id: work.id,
            topic_id: topic.id,
            score: topic.score,
          }) as typeof works_topicsInOpenalex.$inferInsert,
      ),
    ),
  );

  const works_locations = _.flatten(
    data.map((work) =>
      work.locations.map(
        (location) =>
          ({
            work_id: work.id,
            source_id: location.source?.id,
            landing_page_url: location.landing_page_url,
            pdf_url: location.pdf_url,
            is_oa: location.is_oa,
            version: location.version,
            license: location.license,
          }) as WorksLocation,
      ),
    ),
  ) as WorksLocation[];

  const works_mesh = _.flatten(
    data.map((work) =>
      work.mesh.map(
        (mesh) =>
          ({
            work_id: work.id,
            descriptor_name: mesh.descriptor_name,
            descriptor_ui: mesh.descriptor_ui,
            qualifier_name: mesh.qualifier_name,
            qualifier_ui: mesh.qualifier_ui,
            is_major_topic: mesh.is_major_topic,
          }) as typeof works_meshInOpenalex.$inferInsert,
      ),
    ),
  );

  const works_primary_locations = data
    .map((work) =>
      work.primary_location
        ? {
            source_id: work.primary_location.source?.id,
            landing_page_url: work.primary_location?.landing_page_url,
            pdf_url: work.primary_location.pdf_url,
            is_oa: work.primary_location.is_oa,
            version: work.primary_location.version,
            license: work.primary_location.license,
            work_id: work.id,
          }
        : null,
    )
    .filter(Boolean) as WorksPrimaryLocation[];

  const works_best_oa_locations = data
    .map((work) =>
      work?.best_oa_location
        ? ({
            source_id: work.best_oa_location.source?.id,
            landing_page_url: work.best_oa_location.landing_page_url,
            pdf_url: work.best_oa_location.pdf_url,
            is_oa: work.best_oa_location.is_oa,
            version: work.best_oa_location.version,
            license: work.best_oa_location.license,
            work_id: work.id,
          } as WorksBestOaLocation)
        : null,
    )
    .filter(Boolean) as WorksBestOaLocation[];

  const works_open_access = data.map((work) => ({
    ...work.open_access,
    work_id: work.id,
  }));

  const works_related_works = _.flatten(
    data.map((work) =>
      work.related_works.map((related_work_id) => ({
        work_id: work.id,
        related_work_id,
      })),
    ),
  );

  const works_referenced_works = _.flatten(
    data.map((work) =>
      work.referenced_works.map((referenced_work_id) => ({
        work_id: work.id,
        referenced_work_id,
      })),
    ),
  );

  // group unique authors
  const all_authors = _.flatten(authorship_data.map((data) => data.authors));
  const authors: (typeof authorsInOpenalex.$inferInsert)[] = _(all_authors)
    .groupBy((x) => x.id)
    .map(
      (values, key) =>
        ({
          id: key,
          orcid: values[0].orcid,
          display_name: values[0].display_name,
          display_name_alternatives: values[0].display_name_alternatives,
          works_count: values[0].works_count,
          cited_by_count: values[0].cited_by_count,
          last_known_institution: values[0].last_known_institution,
          works_api_url: values[0].works_api_url,
          updated_date: values[0].updated_date,
        }) as typeof authorsInOpenalex.$inferInsert,
    )
    .value();

  // group unique authors
  const all_author_ids = _.flatten(authorship_data.map((data) => data.authors_ids));

  const authors_ids: (typeof authors_idsInOpenalex.$inferInsert)[] = _(all_author_ids)
    .groupBy((x) => x.author_id)
    .map(
      (values, key) =>
        ({
          author_id: key,
          openalex: key,
          orcid: values[0].orcid,
          twitter: values[0].twitter,
          scopus: values[0].scopus,
          wikipedia: values[0].wikipedia,
          mag: values[0].mag,
        }) as typeof authors_idsInOpenalex.$inferInsert,
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
