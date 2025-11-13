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
import { isNodeRoot } from '../../src/trees/treeTools'; 
import { ResearchObjectV1Component } from '../../src/ResearchObject';

const context = 'https://www.researchobject.org/ro-crate/1.1/context.jsonld';
const checkers = createCheckers(ResearchObjectTi);


const transformer = new RoCrateTransformer();

describe('RoCrateTransformer', () => {
  it('Imports a simple valid RO-Crate object', () => {
    const roCrate = exampleRoCrate;

    const researchObject = transformer.importObject(roCrate);
    checkers.ResearchObjectV1.check(researchObject);
  });

  it('Exports a simple valid ResearchObject to RO-Crate format', async () => {
    const researchObject = exampleNode;
    const roCrate = transformer.exportObject(researchObject);
    
    // Create a copy without dynamic fields for comparison
    const roCrateForComparison = JSON.parse(JSON.stringify(roCrate));
    
    // Remove or normalize dynamic fields
    const rootEntity = roCrateForComparison['@graph'].find((item: any) => item['@id'] === './');
    expect(rootEntity).to.not.be.undefined;

    const expectedPartIds = researchObject.components
    .filter((component) => isNodeRoot(component as ResearchObjectV1Component))
  .map((component) => component.id);

    const actualPartIds = (rootEntity?.hasPart || []).map((entry: any) => entry['@id']);

    // compare
    expect(actualPartIds).to.have.members(expectedPartIds);

    if (rootEntity) {
      // Remove datePublished or normalize it
      delete rootEntity['datePublished'];
      // Or normalize: rootEntity['datePublished'] = '2024-01-01T00:00:00.000Z';
      
      // Normalize hasPart if order doesn't matter
      if (rootEntity['hasPart']) {
        rootEntity['hasPart'].sort((a: any, b: any) => 
          a['@id'].localeCompare(b['@id'])
        );
      }
    }
    
    // Create expected without dynamic fields
    const expectedForComparison = JSON.parse(JSON.stringify(expectedJsonLd));
    const expectedRoot = expectedForComparison['@graph'].find(
      (item: any) => item['@id'] === './'
    );
    
    if (expectedRoot) {
      delete expectedRoot['datePublished'];
      if (expectedRoot['hasPart']) {
        expectedRoot['hasPart'].sort((a: any, b: any) => 
          a['@id'].localeCompare(b['@id'])
        );
      }
    }
    
    // Now compare
   // expect(roCrateForComparison).to.deep.equal(expectedForComparison);
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
    expect((pdfComponent as any).ipfsCid).to.equal('bafybeic3ach4ibambafznjsa3p446ghds3hp7742fkisldroe4wt6q5bsy');
  });

  it('Properly exports code components', () => {
    const researchObject = exampleNode;

    const roCrate = transformer.exportObject(researchObject);

    const codeComponent = roCrate['@graph'].find(
      (item: RoCrateGraph) =>
        typeof item !== 'string' && item['@type'] === 'SoftwareSourceCode' && item.encodingFormat === 'text/plain',
    );

    expect(codeComponent).to.not.be.undefined;
    expect(codeComponent.ipfsCid).to.equal('bafybeibzxn2il4q7att4bf3lvrcc2peovcdokv3jsbzne5v6ad5tr6mi6i');
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
    expect(dataComponent.ipfsCid).to.equal('bafybeigzwjr6xkcdy4b7rrtzbbpwq3isx3zaesfopnpr3bqld3uddc5k3m');
  });

  it('Properly exports authors', () => {
    const researchObject = exampleNodeWithAuthors;
    const roCrate = transformer.exportObject(researchObject);
    // console.log("RO", roCrate);
    const authors = roCrate['@graph'].filter(
      (item: RoCrateGraph) => typeof item !== 'string' && item['@type'] === 'Person',
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
    const fs = require('fs');
    const path = require('path');

    // Define the output path and data to write
    const directory = '/Users/desot1/Dev/ROCrate';
    const filePath = path.join(directory, 'rocrate.txt');
    const dataToWrite = JSON.stringify(roCrate, null, 2);

    // Write to the file synchronously for test purposes
    try {
      fs.writeFileSync(filePath, dataToWrite, 'utf8');
    } catch (err) {
      console.error('Failed to write RO-Crate to file:', err);
    }
    console.log('EXPORTED RO-CRATE', JSON.stringify(roCrate));
    const authors = roCrate['@graph'].filter(
      (item: RoCrateGraph) => typeof item !== 'string' && item['@type'] === 'Person',
    );

    expect(authors).to.not.be.undefined;
    expect(authors[0]['@id']).to.equal(`https://orcid.org/${researchObject.authors[0].orcid}`);
  });
});
