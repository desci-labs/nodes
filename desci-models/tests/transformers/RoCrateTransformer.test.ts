import { describe } from 'mocha';
import { expect } from 'chai';
import { RoCrateTransformer } from '../../src/transformers/RoCrateTransformer';
import ResearchObjectTi from '../../src/ResearchObject-ti';
import { RoCrate, RoCrateGraph } from '../../src/RoCrate';
import { createCheckers } from 'ts-interface-checker';
import exampleNode from '../example-data/exampleNode.json';
import exampleRoCrate from '../example-data/exampleRoCrate.json';
import exampleNodeWithAuthors from '../example-data/exampleNodeWithAuthors.json';
import expectedJsonLd from '../example-data/exampleNodeToRoCrate.json';
import exampleRoCrateWithWorkflow from '../example-data/roCrateWithWorkflow.json';
import { CodeComponent, DataComponent, PdfComponent, ResearchObjectV1 } from '../../src/ResearchObject';

import { CreativeWork } from 'schema-dts';
const context = 'https://www.researchobject.org/ro-crate/1.1/context.jsonld';
const checkers = createCheckers(ResearchObjectTi);

const transformer = new RoCrateTransformer();

describe('RoCrateTransformer', () => {
  it('Imports a simple valid RO-Crate object', () => {
    const roCrate = exampleRoCrate;

    const researchObject = transformer.importObject(roCrate);
    checkers.ResearchObjectV1.check(researchObject);
  });

  // Test that export produces valid RO-Crate with required fields
  it('Exports a simple valid ResearchObject to RO-Crate format', async () => {
    const researchObject = exampleNode;

    const roCrate = transformer.exportObject(researchObject);
    
    // Check basic structure
    expect(roCrate['@context']).to.not.be.undefined;
    expect(roCrate['@graph']).to.be.an('array');
    
    // Check metadata entity
    const metadataEntity = roCrate['@graph'].find((item: any) => item['@id'] === 'ro-crate-metadata.json');
    expect(metadataEntity).to.not.be.undefined;
    expect(metadataEntity['@type']).to.equal('CreativeWork');
    
    // Check root entity (Dataset)
    const rootEntity = roCrate['@graph'].find((item: any) => item['@id'] === './');
    expect(rootEntity).to.not.be.undefined;
    expect(rootEntity['@type']).to.include('Dataset');
    expect(rootEntity['name']).to.equal('Test dataset');
    expect(rootEntity['license']).to.equal('https://creativecommons.org/licenses/by/4.0/');
    
    // Check FAIR metadata fields are present
    expect(rootEntity['publisher']).to.not.be.undefined;
    expect(rootEntity['description']).to.not.be.undefined;
    expect(rootEntity['isAccessibleForFree']).to.equal(true);
  });

  it('Properly imports PDF components', () => {
    const roCrate = exampleRoCrate;

    const researchObject = transformer.importObject(roCrate) as ResearchObjectV1;
    const pdfComponent = researchObject.components.find((component) => component.type === 'pdf') as PdfComponent;

    expect(pdfComponent).to.not.be.undefined;
    expect(pdfComponent.payload.url).to.equal('https://example.com/example.pdf');
  });

  it('Properly imports code components', () => {
    const roCrate = exampleRoCrateWithWorkflow;

    const researchObject = transformer.importObject(roCrate) as ResearchObjectV1;

    const codeComponent = researchObject.components.find((component) => component.type === 'code') as CodeComponent;

    expect(codeComponent).to.not.be.undefined;
    expect(codeComponent.payload.url).to.equal('http://example.com/workflows/alignment');
  });

  it('Properly imports data components', () => {
    const roCrate = exampleRoCrate;

    const researchObject = transformer.importObject(roCrate) as ResearchObjectV1;
    const dataComponent = researchObject.components.find((component) => component.type === 'data') as DataComponent;

    expect(dataComponent).to.not.be.undefined;
    expect(dataComponent.payload.cid).to.equal('https://doi.org/10.5281/zenodo.1234567');
  });

  it('Properly exports PDF components', () => {
    const researchObject = exampleNode;

    const roCrate = transformer.exportObject(researchObject) as RoCrate;
    const pdfComponent = roCrate['@graph'].find(
      (item: RoCrateGraph) =>
        typeof item !== 'string' &&
        item['@type'] &&
        item['@type'] === 'CreativeWork' &&
        (item as CreativeWork).encodingFormat === 'application/pdf',
    ) as CreativeWork;

    expect(pdfComponent).to.not.be.undefined;
    expect(pdfComponent.url).to.equal(
      'https://ipfs.desci.com/ipfs/bafybeic3ach4ibambafznjsa3p446ghds3hp7742fkisldroe4wt6q5bsy',
    );
    expect((pdfComponent as any)['/']).to.equal('bafybeic3ach4ibambafznjsa3p446ghds3hp7742fkisldroe4wt6q5bsy');
  });

  it('Properly exports code components', () => {
    const researchObject = exampleNode;

    const roCrate = transformer.exportObject(researchObject);

    const codeComponent = roCrate['@graph'].find(
      (item: RoCrateGraph) =>
        typeof item !== 'string' && item['@type'] === 'SoftwareSourceCode' && item.encodingFormat === 'text/plain',
    );

    expect(codeComponent).to.not.be.undefined;
    expect(codeComponent['/']).to.equal('bafybeibzxn2il4q7att4bf3lvrcc2peovcdokv3jsbzne5v6ad5tr6mi6i');
    expect(codeComponent.url).to.equal(
      'https://ipfs.desci.com/ipfs/bafybeibzxn2il4q7att4bf3lvrcc2peovcdokv3jsbzne5v6ad5tr6mi6i',
    );
  });

  it('Properly exports data components', () => {
    const researchObject = exampleNode;
    const roCrate = transformer.exportObject(researchObject);
    const dataComponent = roCrate['@graph'].find(
      (item: RoCrateGraph) =>
        typeof item !== 'string' && item['@type'] === 'Dataset' && item.encodingFormat === 'application/octet-stream',
    );

    expect(dataComponent).to.not.be.undefined;
    expect(dataComponent.url).to.equal(
      'https://ipfs.desci.com/ipfs/bafybeigzwjr6xkcdy4b7rrtzbbpwq3isx3zaesfopnpr3bqld3uddc5k3m',
    );
    expect(dataComponent['/']).to.equal('bafybeigzwjr6xkcdy4b7rrtzbbpwq3isx3zaesfopnpr3bqld3uddc5k3m');
  });

  it('Properly exports authors', () => {
    const researchObject = exampleNodeWithAuthors;
    const roCrate = transformer.exportObject(researchObject);
    // console.log("RO", roCrate);
    // @type is now an array like ['Person', 'schema:Person', 'foaf:Person']
    const authors = roCrate['@graph'].filter(
      (item: RoCrateGraph) => {
        if (typeof item === 'string') return false;
        const type = item['@type'];
        if (Array.isArray(type)) {
          return type.includes('Person');
        }
        return type === 'Person';
      },
    );

    expect(authors).to.not.be.undefined;
    expect(authors.length).to.equal(17);
  });
  it('Properly handles CEDAR link', () => {
    const researchObject = exampleNodeWithAuthors;
    const roCrate = transformer.exportObject(researchObject);
    // console.log("RO", roCrate);
    const cedar = roCrate['@graph'].find(
      (item: RoCrateGraph) =>
        typeof item !== 'string' &&
        item['@type'] === 'Dataset' &&
        item['@id'] == 'dd562a70-0bb9-4a07-8b00-c414bc8b9ad9' &&
        item['schemaVersion'] &&
        item['schemaVersion'].toString().length > 0,
    );

    expect(cedar).to.not.be.undefined;
  });
  it('Adds orcid.org prefix to author ids', () => {
    const researchObject = exampleNodeWithAuthors;
    const roCrate = transformer.exportObject(researchObject);
    // console.log("RO", roCrate);
    console.log('EXPORTED RO-CRATE', JSON.stringify(roCrate));
    // @type is now an array like ['Person', 'schema:Person', 'foaf:Person']
    const authors = roCrate['@graph'].filter(
      (item: RoCrateGraph) => {
        if (typeof item === 'string') return false;
        const type = item['@type'];
        if (Array.isArray(type)) {
          return type.includes('Person');
        }
        return type === 'Person';
      },
    );

    expect(authors).to.not.be.undefined;
    expect(authors.length).to.be.greaterThan(0);
    // Find an author with an ORCID
    const authorWithOrcid = authors.find((a: any) => a['@id'] && a['@id'].startsWith('https://orcid.org/'));
    expect(authorWithOrcid).to.not.be.undefined;
    expect(authorWithOrcid['@id']).to.include('https://orcid.org/');
  });
});
