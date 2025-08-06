import swaggerAutogen from 'swagger-autogen';

const outputFile = './swagger_output.json';
const endpointsFiles = ['./routes/index.ts'];

const doc = {
  info: {
    title: 'DeSci API',
    description: 'DeSci Labs API Documentation',
    version: '1.0.0',
  },
  host: 'localhost:5420',
  schemes: ['http', 'https'],
  tags: [
    {
      name: 'Services',
      description: 'Service endpoints for various utilities',
    },
  ],
  definitions: {
    ShareImageQuery: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The search question text to display on the image',
          example: 'What are the latest advances in quantum computing?',
        },
        id: {
          type: 'string',
          description: 'ID of a stored search result to generate image from',
          example: '550e8400-e29b-41d4-a716-446655440000',
        },
        answer: {
          type: 'string',
          description: 'The answer text to preview on the image',
          example: 'Recent advances in quantum computing include...',
        },
        refs: {
          type: 'string',
          description: 'Number of references/citations',
          example: '5',
        },
        citations: {
          type: 'string',
          description: 'JSON string containing citation data',
          example:
            '[{"id":"1","title":"Quantum Computing Advances","authors":"Smith, J.","year":2023,"doi":"10.1000/xyz123","url":"https://example.com","journal":"Nature"}]',
        },
      },
    },
  },
  '@schema': {
    '/v1/services/generate-share-image': {
      get: {
        tags: ['Services'],
        summary: 'Generate a social media share image for search results',
        description:
          'Generates a PNG image suitable for social media sharing that displays a search question, answer preview, and citations. The image can be generated from either direct parameters or by referencing a stored search result by ID.',
        parameters: [
          {
            name: 'text',
            in: 'query',
            description: 'The search question text to display on the image',
            required: false,
            type: 'string',
            example: 'What are the latest advances in quantum computing?',
          },
          {
            name: 'id',
            in: 'query',
            description: 'ID of a stored search result to generate image from (alternative to other parameters)',
            required: false,
            type: 'string',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
          {
            name: 'answer',
            in: 'query',
            description: 'The answer text to preview on the image',
            required: false,
            type: 'string',
            example: 'Recent advances in quantum computing include...',
          },
          {
            name: 'refs',
            in: 'query',
            description: 'Number of references/citations',
            required: false,
            type: 'string',
            example: '5',
          },
          {
            name: 'citations',
            in: 'query',
            description: 'JSON string containing citation data',
            required: false,
            type: 'string',
            example:
              '[{"id":"1","title":"Quantum Computing Advances","authors":"Smith, J.","year":2023,"doi":"10.1000/xyz123","url":"https://example.com","journal":"Nature"}]',
          },
        ],
        responses: {
          200: {
            description: 'Successfully generated share image',
            content: {
              'image/png': {
                schema: {
                  type: 'string',
                  format: 'binary',
                },
              },
            },
          },
          400: {
            description: 'Bad request - missing required parameters',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      example: 'Text parameter is required',
                    },
                  },
                },
              },
            },
          },
          404: {
            description: 'Search result not found (when using id parameter)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      example: 'Search result not found',
                    },
                  },
                },
              },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: {
                      type: 'string',
                      example: 'Failed to generate image',
                    },
                    details: {
                      type: 'string',
                      example: 'Error details',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

swaggerAutogen()(outputFile, endpointsFiles, doc);
