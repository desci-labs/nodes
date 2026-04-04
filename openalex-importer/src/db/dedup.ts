import type { DataModels } from '../transformers.js';
import { logger } from '../logger.js';

/**
 * Filters out rows with null/undefined primary key columns and logs a warning.
 */
const filterNullPKs = <T extends Record<string, unknown>>(
  data: T[],
  pkColumns: (keyof T & string)[],
  tableName: string,
): T[] => {
  const filtered = data.filter(row => pkColumns.every(col => row[col] != null));
  if (filtered.length < data.length) {
    logger.warn(
      { filteredCount: data.length - filtered.length, totalRows: data.length, primaryKeyColumns: pkColumns, tableName },
      'Filtered out rows with null primary key values',
    );
  }
  return filtered;
};

/**
 * Deduplicates works_concepts by (work_id, concept_id), keeping the highest score.
 * Also filters out rows with null primary key values.
 */
export const deduplicateWorksConcepts = (data: DataModels['works_concepts']): DataModels['works_concepts'] => {
  const clean = filterNullPKs(data, ['work_id', 'concept_id'], 'works_concepts');
  const seen = new Map<string, DataModels['works_concepts'][number]>();

  for (const row of clean) {
    const key = `${row.work_id}\0${row.concept_id}`;
    const existing = seen.get(key);
    if (!existing || (row.score ?? 0) > (existing.score ?? 0)) {
      seen.set(key, row);
    }
  }

  if (seen.size < clean.length) {
    logger.warn(
      { duplicates: clean.length - seen.size, totalRows: clean.length },
      'Removed duplicate works_concepts rows with same primary key',
    );
  }

  return [...seen.values()];
};

/**
 * Deduplicates works_topics by (work_id, topic_id), keeping the highest score.
 * Also filters out rows with null primary key values.
 */
export const deduplicateWorksTopics = (data: DataModels['works_topics']): DataModels['works_topics'] => {
  const clean = filterNullPKs(data, ['work_id', 'topic_id'], 'works_topics');
  const seen = new Map<string, DataModels['works_topics'][number]>();

  for (const row of clean) {
    const key = `${row.work_id}\0${row.topic_id}`;
    const existing = seen.get(key);
    if (!existing || (row.score ?? 0) > (existing.score ?? 0)) {
      seen.set(key, row);
    }
  }

  if (seen.size < clean.length) {
    logger.warn(
      { duplicates: clean.length - seen.size, totalRows: clean.length },
      'Removed duplicate works_topics rows with same primary key',
    );
  }

  return [...seen.values()];
};

/**
 * Deduplicates works_mesh by (work_id, descriptor_ui, qualifier_ui).
 * Keeps the last occurrence. Also filters out rows with null primary key values.
 */
export const deduplicateWorksMesh = (data: DataModels['works_mesh']): DataModels['works_mesh'] => {
  const clean = filterNullPKs(data, ['work_id', 'descriptor_ui', 'qualifier_ui'], 'works_mesh');
  const seen = new Map<string, DataModels['works_mesh'][number]>();

  for (const row of clean) {
    const key = `${row.work_id}\0${row.descriptor_ui}\0${row.qualifier_ui}`;
    seen.set(key, row);
  }

  if (seen.size < clean.length) {
    logger.warn(
      { duplicates: clean.length - seen.size, totalRows: clean.length },
      'Removed duplicate works_mesh rows with same primary key',
    );
  }

  return [...seen.values()];
};
