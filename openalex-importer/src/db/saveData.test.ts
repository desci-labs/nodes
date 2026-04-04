import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformDataModel, type DataModels } from '../transformers.js';
import {
  minimalWork,
  workWithNullMeshQualifiers,
  workWithNoPrimaryLocation,
  workWithEmptyArrays,
  workWithNullConceptAndTopicIds,
  workWithNullAuthorIds,
} from '../__fixtures__/works.js';

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * These tests verify that saveData doesn't throw on edge-case DataModels.
 *
 * We use the real pgp.helpers.insert() for SQL generation, but swap the DB
 * transaction with a mock so no actual database is needed. saveData receives
 * mockTx directly, so the generated SQL is passed to mockTx.none() and discarded.
 */

const mockTxNone = vi.fn().mockResolvedValue(undefined);
const mockTxOne = vi.fn().mockResolvedValue({ id: 1 });
const mockTxOneOrNone = vi.fn().mockResolvedValue(null);

const mockTx = {
  none: mockTxNone,
  one: mockTxOne,
  oneOrNone: mockTxOneOrNone,
} as any;

vi.mock('pg-promise', () => vi.importActual('pg-promise'));

let saveData: typeof import('./index.js')['saveData'];

beforeEach(async () => {
  vi.clearAllMocks();
  mockTxNone.mockResolvedValue(undefined);

  const mod = await import('./index.js');
  saveData = mod.saveData;
});

describe('saveData guards', () => {
  it('handles a normal work batch without throwing', async () => {
    const models = transformDataModel([minimalWork]);
    await expect(saveData(mockTx, 1, models)).resolves.toBeUndefined();
    expect(mockTxNone).toHaveBeenCalled();
  });

  it('handles a batch where all mesh rows have null PKs (the production crash scenario)', async () => {
    const models = transformDataModel([workWithNullMeshQualifiers]);
    await expect(saveData(mockTx, 1, models)).resolves.toBeUndefined();
  });

  it('handles a work with no primary_location or best_oa_location', async () => {
    const models = transformDataModel([workWithNoPrimaryLocation]);
    await expect(saveData(mockTx, 1, models)).resolves.toBeUndefined();
  });

  it('handles a work with all empty child arrays', async () => {
    const models = transformDataModel([workWithEmptyArrays]);
    await expect(saveData(mockTx, 1, models)).resolves.toBeUndefined();
  });

  it('handles works with null concept and topic IDs', async () => {
    const models = transformDataModel([workWithNullConceptAndTopicIds]);
    await expect(saveData(mockTx, 1, models)).resolves.toBeUndefined();
  });

  it('handles works with null author IDs', async () => {
    const models = transformDataModel([workWithNullAuthorIds]);
    await expect(saveData(mockTx, 1, models)).resolves.toBeUndefined();
  });

  it('handles completely empty DataModels', async () => {
    const models = transformDataModel([]);
    await expect(saveData(mockTx, 1, models)).resolves.toBeUndefined();
  });

  it('handles a mixed batch of clean and problematic works', async () => {
    const models = transformDataModel([
      minimalWork,
      workWithNullMeshQualifiers,
      workWithNoPrimaryLocation,
      workWithEmptyArrays,
      workWithNullConceptAndTopicIds,
    ]);
    await expect(saveData(mockTx, 1, models)).resolves.toBeUndefined();
  });
});
