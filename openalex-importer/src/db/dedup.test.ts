import { describe, it, expect, vi } from 'vitest';
import { deduplicateWorksConcepts, deduplicateWorksTopics, deduplicateWorksMesh } from './dedup.js';

// Mock the logger so tests don't need pino setup
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('deduplicateWorksConcepts', () => {
  it('returns data unchanged when no duplicates exist', () => {
    const data = [
      { work_id: 'W1', concept_id: 'C1', score: 0.8 },
      { work_id: 'W1', concept_id: 'C2', score: 0.6 },
      { work_id: 'W2', concept_id: 'C1', score: 0.9 },
    ];

    const result = deduplicateWorksConcepts(data);
    expect(result).toHaveLength(3);
    expect(result).toEqual(data);
  });

  it('removes duplicate (work_id, concept_id) pairs, keeping higher score', () => {
    const data = [
      { work_id: 'W1', concept_id: 'C1', score: 0.5 },
      { work_id: 'W1', concept_id: 'C1', score: 0.9 },
    ];

    const result = deduplicateWorksConcepts(data);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ work_id: 'W1', concept_id: 'C1', score: 0.9 });
  });

  it('keeps earlier entry if its score is higher', () => {
    const data = [
      { work_id: 'W1', concept_id: 'C1', score: 0.9 },
      { work_id: 'W1', concept_id: 'C1', score: 0.5 },
    ];

    const result = deduplicateWorksConcepts(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.score).toBe(0.9);
  });

  it('handles multiple duplicate groups across different works', () => {
    const data = [
      { work_id: 'W1', concept_id: 'C1', score: 0.3 },
      { work_id: 'W1', concept_id: 'C1', score: 0.8 },
      { work_id: 'W1', concept_id: 'C2', score: 0.6 },
      { work_id: 'W2', concept_id: 'C1', score: 0.4 },
      { work_id: 'W2', concept_id: 'C1', score: 0.7 },
      { work_id: 'W2', concept_id: 'C1', score: 0.2 },
    ];

    const result = deduplicateWorksConcepts(data);
    expect(result).toHaveLength(3);

    const w1c1 = result.find(r => r.work_id === 'W1' && r.concept_id === 'C1');
    const w1c2 = result.find(r => r.work_id === 'W1' && r.concept_id === 'C2');
    const w2c1 = result.find(r => r.work_id === 'W2' && r.concept_id === 'C1');

    expect(w1c1!.score).toBe(0.8);
    expect(w1c2!.score).toBe(0.6);
    expect(w2c1!.score).toBe(0.7);
  });

  it('handles null/undefined scores gracefully', () => {
    const data = [
      { work_id: 'W1', concept_id: 'C1', score: null },
      { work_id: 'W1', concept_id: 'C1', score: 0.5 },
    ] as any;

    const result = deduplicateWorksConcepts(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.score).toBe(0.5);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateWorksConcepts([])).toEqual([]);
  });

  it('returns empty array when all rows have null primary keys', () => {
    const data = [
      { work_id: null, concept_id: 'C1', score: 0.5 },
      { work_id: 'W1', concept_id: null, score: 0.6 },
      { work_id: null, concept_id: null, score: 0.7 },
    ] as any;

    const result = deduplicateWorksConcepts(data);
    expect(result).toEqual([]);
  });

  it('filters out rows with null work_id', () => {
    const data = [
      { work_id: null, concept_id: 'C1', score: 0.5 },
      { work_id: 'W1', concept_id: 'C1', score: 0.8 },
    ] as any;

    const result = deduplicateWorksConcepts(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.work_id).toBe('W1');
  });

  it('filters out rows with null concept_id', () => {
    const data = [
      { work_id: 'W1', concept_id: null, score: 0.5 },
      { work_id: 'W1', concept_id: undefined, score: 0.6 },
      { work_id: 'W1', concept_id: 'C1', score: 0.8 },
    ] as any;

    const result = deduplicateWorksConcepts(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.concept_id).toBe('C1');
  });

  it('handles the real-world scenario: large batch with scattered duplicates', () => {
    const data = [];
    for (let w = 0; w < 100; w++) {
      for (let c = 0; c < 10; c++) {
        data.push({
          work_id: `W${w}`,
          concept_id: `C${c}`,
          score: Math.random(),
        });
      }
    }
    // Inject duplicates like the OpenAlex API sometimes returns
    data.push({ work_id: 'W0', concept_id: 'C0', score: 0.99 });
    data.push({ work_id: 'W50', concept_id: 'C5', score: 0.88 });
    data.push({ work_id: 'W99', concept_id: 'C9', score: 0.77 });

    const result = deduplicateWorksConcepts(data);
    expect(result).toHaveLength(1000); // 100 * 10, duplicates removed

    const w0c0 = result.find(r => r.work_id === 'W0' && r.concept_id === 'C0');
    expect(w0c0!.score).toBe(0.99);
  });
});

describe('deduplicateWorksTopics', () => {
  it('returns data unchanged when no duplicates exist', () => {
    const data = [
      { work_id: 'W1', topic_id: 'T1', score: 0.8 },
      { work_id: 'W1', topic_id: 'T2', score: 0.6 },
    ];

    const result = deduplicateWorksTopics(data);
    expect(result).toHaveLength(2);
  });

  it('removes duplicate (work_id, topic_id) pairs, keeping higher score', () => {
    const data = [
      { work_id: 'W1', topic_id: 'T1', score: 0.3 },
      { work_id: 'W1', topic_id: 'T1', score: 0.9 },
      { work_id: 'W1', topic_id: 'T1', score: 0.6 },
    ];

    const result = deduplicateWorksTopics(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.score).toBe(0.9);
  });

  it('filters out rows with null primary keys', () => {
    const data = [
      { work_id: null, topic_id: 'T1', score: 0.5 },
      { work_id: 'W1', topic_id: null, score: 0.6 },
      { work_id: 'W1', topic_id: 'T1', score: 0.8 },
    ] as any;

    const result = deduplicateWorksTopics(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.work_id).toBe('W1');
    expect(result[0]!.topic_id).toBe('T1');
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateWorksTopics([])).toEqual([]);
  });

  it('returns empty array when all rows have null primary keys', () => {
    const data = [
      { work_id: null, topic_id: 'T1', score: 0.5 },
      { work_id: 'W1', topic_id: null, score: 0.6 },
    ] as any;

    const result = deduplicateWorksTopics(data);
    expect(result).toEqual([]);
  });
});

describe('deduplicateWorksMesh', () => {
  it('returns data unchanged when no duplicates exist', () => {
    const data = [
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1', is_major_topic: true },
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q002', qualifier_name: 'QName2', is_major_topic: false },
    ];

    const result = deduplicateWorksMesh(data);
    expect(result).toHaveLength(2);
  });

  it('removes duplicates on 3-column key (work_id, descriptor_ui, qualifier_ui)', () => {
    const data = [
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1', is_major_topic: false },
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1-updated', qualifier_ui: 'Q001', qualifier_name: 'QName1-updated', is_major_topic: true },
    ];

    const result = deduplicateWorksMesh(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.descriptor_name).toBe('Name1-updated');
    expect(result[0]!.is_major_topic).toBe(true);
  });

  it('distinguishes different qualifier_ui as different rows', () => {
    const data = [
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1', is_major_topic: true },
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q002', qualifier_name: 'QName2', is_major_topic: true },
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1-dup', is_major_topic: false },
    ];

    const result = deduplicateWorksMesh(data);
    expect(result).toHaveLength(2);
  });

  it('filters out rows with null primary keys', () => {
    const data = [
      { work_id: null, descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1', is_major_topic: true },
      { work_id: 'W1', descriptor_ui: null, descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1', is_major_topic: true },
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: null, qualifier_name: 'QName1', is_major_topic: true },
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1', is_major_topic: true },
    ] as any;

    const result = deduplicateWorksMesh(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.work_id).toBe('W1');
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateWorksMesh([])).toEqual([]);
  });

  it('returns empty array when all rows have null primary keys', () => {
    const data = [
      { work_id: null, descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1', is_major_topic: true },
      { work_id: 'W1', descriptor_ui: null, descriptor_name: 'Name1', qualifier_ui: 'Q001', qualifier_name: 'QName1', is_major_topic: true },
      { work_id: 'W1', descriptor_ui: 'D001', descriptor_name: 'Name1', qualifier_ui: null, qualifier_name: 'QName1', is_major_topic: true },
    ] as any;

    const result = deduplicateWorksMesh(data);
    expect(result).toEqual([]);
  });
});
