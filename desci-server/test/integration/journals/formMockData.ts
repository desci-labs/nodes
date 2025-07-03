import { FormStructure } from '../../../src/schemas/journalsForm.schema.js';

export const VALID_FORM_STRUCTURE: FormStructure = {
  sections: [
    {
      id: 'section_1',
      title: 'General Assessment',
      description: 'Please provide your general assessment of the manuscript.',
      fields: [
        {
          id: 'field_1',
          fieldType: 'TEXTAREA',
          name: 'summary',
          label: 'Summary of the manuscript',
          required: true,
          description: 'A brief summary of the work.',
        },
        {
          id: 'field_2',
          fieldType: 'RATING',
          name: 'novelty',
          label: 'Novelty',
          required: true,
          description: 'Rate the novelty of the research (1-5).',
          validation: {
            min: 1,
            max: 5,
          },
        },
      ],
    },
    {
      id: 'section_2',
      title: 'Detailed Feedback',
      fields: [
        {
          id: 'field_3',
          fieldType: 'RADIO',
          name: 'recommendation',
          label: 'Recommendation',
          required: true,
          options: [
            { value: 'accept', label: 'Accept' },
            { value: 'minor_revision', label: 'Minor Revision' },
            { value: 'major_revision', label: 'Major Revision' },
            { value: 'reject', label: 'Reject' },
          ],
        },
      ],
    },
  ],
};
