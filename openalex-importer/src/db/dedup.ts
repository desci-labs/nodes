import type { DataModels } from '../transformers.js';
import { logger } from '../logger.js';

/**
 * Deduplicates works_concepts by (work_id, concept_id), keeping the highest score.
 * This prevents PostgreSQL's "ON CONFLICT DO UPDATE command cannot affect row a second time"
 * error when the OpenAlex API returns duplicate concept entries for the same work.
 */
export const deduplicateWorksConcepts = (data: DataModels['works_concepts']): DataModels['works_concepts'] => {
  const seen = new Map<string, DataModels['works_concepts'][number]>();

  for (const row of data) {
    const key = `${row.work_id}\0${row.concept_id}`;
    const existing = seen.get(key);
    if (!existing || (row.score ?? 0) > (existing.score ?? 0)) {
      seen.set(key, row);
    }
  }

  if (seen.size < data.length) {
    logger.warn(
      { duplicates: data.length - seen.size, totalRows: data.length },
      'Removed duplicate works_concepts rows with same primary key',
    );
  }

  return [...seen.values()];
};

/**
 * Deduplicates works_topics by (work_id, topic_id), keeping the highest score.
 */
export const deduplicateWorksTopics = (data: DataModels['works_topics']): DataModels['works_topics'] => {
  const seen = new Map<string, DataModels['works_topics'][number]>();

  for (const row of data) {
    const key = `${row.work_id}\0${row.topic_id}`;
    const existing = seen.get(key);
    if (!existing || (row.score ?? 0) > (existing.score ?? 0)) {
      seen.set(key, row);
    }
  }

  if (seen.size < data.length) {
    logger.warn(
      { duplicates: data.length - seen.size, totalRows: data.length },
      'Removed duplicate works_topics rows with same primary key',
    );
  }

  return [...seen.values()];
};

/**
 * Deduplicates works_mesh by (work_id, descriptor_ui, qualifier_ui).
 * Keeps the last occurrence (no meaningful merge strategy for mesh terms).
 */
export const deduplicateWorksMesh = (data: DataModels['works_mesh']): DataModels['works_mesh'] => {
  const seen = new Map<string, DataModels['works_mesh'][number]>();

  for (const row of data) {
    const key = `${row.work_id}\0${row.descriptor_ui}\0${row.qualifier_ui}`;
    seen.set(key, row);
  }

  if (seen.size < data.length) {
    logger.warn(
      { duplicates: data.length - seen.size, totalRows: data.length },
      'Removed duplicate works_mesh rows with same primary key',
    );
  }

  return [...seen.values()];
};
