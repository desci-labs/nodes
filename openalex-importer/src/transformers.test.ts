import { describe, it, expect } from 'vitest';
import { transformDataModel } from './transformers.js';
import {
  minimalWork,
  workWithNullMeshQualifiers,
  workWithNoPrimaryLocation,
  workWithEmptyArrays,
  workWithDuplicateAuthorships,
  workWithNullConceptAndTopicIds,
  workWithNullAuthorIds,
} from './__fixtures__/works.js';

const ALL_DATA_MODEL_KEYS = [
  'authors',
  'works_authorships',
  'authors_ids',
  'works',
  'works_id',
  'works_biblio',
  'works_concepts',
  'works_topics',
  'works_locations',
  'works_mesh',
  'works_open_access',
  'works_primary_locations',
  'works_referenced_works',
  'works_related_works',
  'works_best_oa_locations',
] as const;

describe('transformDataModel', () => {
  it('produces all expected keys from a valid Work', () => {
    const result = transformDataModel([minimalWork]);
    for (const key of ALL_DATA_MODEL_KEYS) {
      expect(result).toHaveProperty(key);
      expect(Array.isArray(result[key])).toBe(true);
    }
  });

  it('strips OpenAlex URL prefixes from IDs', () => {
    const result = transformDataModel([minimalWork]);
    expect(result.works[0].id).toBe('W1234567890');
    expect(result.works[0].doi).toBe('10.1234/test.2024.001');
    expect(result.works_id[0].openalex).toBe('W1234567890');
    expect(result.authors[0].id).toBe('A001');
    expect(result.works_concepts[0].concept_id).toBe('C100');
  });

  it('produces correct counts for a single work with all entities', () => {
    const result = transformDataModel([minimalWork]);
    expect(result.works).toHaveLength(1);
    expect(result.works_id).toHaveLength(1);
    expect(result.works_biblio).toHaveLength(1);
    expect(result.works_concepts).toHaveLength(1);
    expect(result.works_topics).toHaveLength(1);
    expect(result.works_mesh).toHaveLength(1);
    expect(result.works_locations).toHaveLength(1);
    expect(result.works_primary_locations).toHaveLength(1);
    expect(result.works_best_oa_locations).toHaveLength(1);
    expect(result.works_open_access).toHaveLength(1);
    expect(result.works_referenced_works).toHaveLength(1);
    expect(result.works_related_works).toHaveLength(1);
    expect(result.authors).toHaveLength(1);
    expect(result.authors_ids).toHaveLength(1);
    expect(result.works_authorships).toHaveLength(1);
  });

  describe('edge case: null mesh qualifier/descriptor UIDs', () => {
    it('passes null qualifier_ui through to the DB model (dedup layer handles filtering)', () => {
      const result = transformDataModel([workWithNullMeshQualifiers]);
      expect(result.works_mesh).toHaveLength(3);

      const nullQualifiers = result.works_mesh.filter(m => m.qualifier_ui == null);
      expect(nullQualifiers).toHaveLength(2);

      const nullDescriptors = result.works_mesh.filter(m => m.descriptor_ui == null);
      expect(nullDescriptors).toHaveLength(1);
    });
  });

  describe('edge case: no primary_location / best_oa_location', () => {
    it('filters out null primary_locations and best_oa_locations', () => {
      const result = transformDataModel([workWithNoPrimaryLocation]);
      expect(result.works_primary_locations).toHaveLength(0);
      expect(result.works_best_oa_locations).toHaveLength(0);
      expect(result.works_locations).toHaveLength(0);
    });
  });

  describe('edge case: empty child arrays', () => {
    it('produces empty arrays for all child tables without throwing', () => {
      const result = transformDataModel([workWithEmptyArrays]);
      expect(result.works).toHaveLength(1);
      expect(result.works_authorships).toHaveLength(0);
      expect(result.authors).toHaveLength(0);
      expect(result.authors_ids).toHaveLength(0);
      expect(result.works_concepts).toHaveLength(0);
      expect(result.works_topics).toHaveLength(0);
      expect(result.works_mesh).toHaveLength(0);
      expect(result.works_locations).toHaveLength(0);
      expect(result.works_referenced_works).toHaveLength(0);
      expect(result.works_related_works).toHaveLength(0);
    });
  });

  describe('edge case: empty input', () => {
    it('returns all keys with empty arrays', () => {
      const result = transformDataModel([]);
      for (const key of ALL_DATA_MODEL_KEYS) {
        expect(result[key]).toEqual([]);
      }
    });
  });

  describe('edge case: duplicate authorships (multi-affiliation)', () => {
    it('deduplicates authors by ID', () => {
      const result = transformDataModel([workWithDuplicateAuthorships]);
      expect(result.authors).toHaveLength(1);
      expect(result.authors_ids).toHaveLength(1);
      expect(result.works_authorships).toHaveLength(2);
    });
  });

  describe('edge case: null concept and topic IDs', () => {
    it('transforms null IDs without throwing (dedup layer filters)', () => {
      const result = transformDataModel([workWithNullConceptAndTopicIds]);
      expect(result.works_concepts).toHaveLength(2);
      expect(result.works_topics).toHaveLength(2);

      const nullConcepts = result.works_concepts.filter(c => c.concept_id == null);
      expect(nullConcepts).toHaveLength(1);

      const nullTopics = result.works_topics.filter(t => t.topic_id == null);
      expect(nullTopics).toHaveLength(1);
    });
  });

  describe('edge case: null author IDs', () => {
    it('transforms null author IDs without throwing', () => {
      const result = transformDataModel([workWithNullAuthorIds]);
      expect(result.works_authorships).toHaveLength(2);
      const nullAuthorships = result.works_authorships.filter(a => a.author_id == null);
      expect(nullAuthorships).toHaveLength(1);
    });
  });

  describe('batch of mixed works', () => {
    it('handles a batch with both clean and problematic works', () => {
      const batch = [
        minimalWork,
        workWithNullMeshQualifiers,
        workWithNoPrimaryLocation,
        workWithEmptyArrays,
        workWithNullConceptAndTopicIds,
      ];

      const result = transformDataModel(batch);
      expect(result.works).toHaveLength(5);
      expect(result.works_mesh.length).toBeGreaterThan(0);
      expect(result.works_concepts.length).toBeGreaterThan(0);
    });
  });
});
