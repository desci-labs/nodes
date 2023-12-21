import { ResearchObject } from '../ResearchObject';

import { BaseTransformer } from './BaseTransformer';

import { RoCrateTransformer } from './RoCrateTransformer';

import { toRDF } from 'jsonld';

export class RdfTransformer implements BaseTransformer {
  importObject(input: any): ResearchObject {
    throw new Error('importObject method not implemented.');
  }

  async exportObject(input: ResearchObject): Promise<any> {
    const jsonLdData = new RoCrateTransformer().exportObject(input);

    console.log('jsonLdData', jsonLdData);

    const nquads = await toRDF(jsonLdData, {
      format: 'application/n-quads',
    });

    return nquads;
  }
}
