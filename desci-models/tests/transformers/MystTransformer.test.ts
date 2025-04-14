import { describe } from 'mocha';
import { expect } from 'chai';
import { MystTransformer } from '../../src/transformers/MystTransformer';
import ResearchObjectTi from '../../src/ResearchObject-ti';
import { createCheckers } from 'ts-interface-checker';
import exampleNode from '../example-data/exampleNode.json';
import exampleNodeWithAuthors from '../example-data/exampleNodeWithAuthors.json';
import { ResearchObjectV1 } from '../../src/ResearchObject';
import { ResearchObjectComponentType } from '../../src/ResearchObject';

const checkers = createCheckers(ResearchObjectTi);
const transformer = new MystTransformer();

describe('MystTransformer', () => {
  it('should import a MyST Markdown string into a ResearchObject', () => {
    const mystMarkdown = `---
title: Test Research Paper
description: A test research paper for testing the MystTransformer
authors:
  - name: John Doe
    orcid: https://orcid.org/0000-0001-2345-6789
    role: Author
  - name: Jane Smith
    role: Author
    organizations:
      - name: University of Example
keywords: [research, test, myst]
tags: [science, technology]
license: https://creativecommons.org/licenses/by/4.0/
---

# Test Research Paper

This is a test research paper written in MyST Markdown format.
`;

    const researchObject = transformer.importObject(mystMarkdown) as ResearchObjectV1;

    // Validate the output as a ResearchObject
    checkers.ResearchObjectV1.check(researchObject);

    // Check specific fields
    expect(researchObject.title).to.equal('Test Research Paper');
    expect(researchObject.description).to.equal('A test research paper for testing the MystTransformer');
    expect(researchObject.defaultLicense).to.equal('https://creativecommons.org/licenses/by/4.0/');
    expect(researchObject.keywords).to.deep.equal(['research', 'test', 'myst']);
    expect(researchObject.researchFields).to.deep.equal(['science', 'technology']);

    // Check authors
    expect(researchObject.authors).to.have.lengthOf(2);
    expect(researchObject.authors![0].name).to.equal('John Doe');
    expect(researchObject.authors![0].orcid).to.equal('https://orcid.org/0000-0001-2345-6789');
    expect(researchObject.authors![0].role).to.equal('Author');
    expect(researchObject.authors![1].name).to.equal('Jane Smith');
    expect(researchObject.authors![1].role).to.equal('Author');
    expect(researchObject.authors![1].organizations).to.have.lengthOf(1);
    expect(researchObject.authors![1].organizations![0].name).to.equal('University of Example');

    // Check content component
    expect(researchObject.components).to.have.lengthOf(1);
    expect(researchObject.components[0].id).to.equal('content');
    expect(researchObject.components[0].name).to.equal('Main Content');
    expect(researchObject.components[0].type).to.equal('code');
    expect(researchObject.components[0].payload.path).to.equal('content.md');
    expect(researchObject.components[0].payload.title).to.equal('Test Research Paper');
    expect(researchObject.components[0].payload.description).to.equal(
      'A test research paper for testing the MystTransformer',
    );
  });

  it('should export a ResearchObject to MyST Markdown', () => {
    const researchObject = exampleNode as ResearchObjectV1;

    const mystMarkdown = transformer.exportObject(researchObject);

    // Check that the output is a string
    expect(mystMarkdown).to.be.a('string');

    // Check that it contains the expected frontmatter
    expect(mystMarkdown).to.include('---');
    expect(mystMarkdown).to.include(`title: ${researchObject.title}`);
    expect(mystMarkdown).to.include(`license: ${researchObject.defaultLicense}`);

    // Check authors
    if (researchObject.authors && researchObject.authors.length > 0) {
      expect(mystMarkdown).to.include('authors:');
      expect(mystMarkdown).to.include(`  - name: ${researchObject.authors[0].name}`);
      expect(mystMarkdown).to.include(`    orcid: ${researchObject.authors[0].orcid}`);
      expect(mystMarkdown).to.include(`    role: ${researchObject.authors[0].role}`);
    }

    // Check keywords and tags
    if (researchObject.keywords && researchObject.keywords.length > 0) {
      expect(mystMarkdown).to.include(`keywords: [${researchObject.keywords.join(', ')}]`);
    }

    if (researchObject.researchFields && researchObject.researchFields.length > 0) {
      expect(mystMarkdown).to.include(`tags: [${researchObject.researchFields.join(', ')}]`);
    }
  });

  it('should handle a ResearchObject with multiple authors', () => {
    const researchObject = exampleNodeWithAuthors as ResearchObjectV1;

    const mystMarkdown = transformer.exportObject(researchObject);

    // Check that the output is a string
    expect(mystMarkdown).to.be.a('string');

    // Check that it contains the expected frontmatter
    expect(mystMarkdown).to.include('---');
    expect(mystMarkdown).to.include(`title: ${researchObject.title}`);

    // Check authors
    if (researchObject.authors && researchObject.authors.length > 0) {
      expect(mystMarkdown).to.include('authors:');

      // Check that all authors are included
      for (const author of researchObject.authors) {
        expect(mystMarkdown).to.include(`- name: ${author.name}`);
        expect(mystMarkdown).to.include(`role: ${author.role}`);

        if (author.orcid) {
          expect(mystMarkdown).to.include(`orcid: ${author.orcid}`);
        }

        if (author.organizations && author.organizations.length > 0) {
          expect(mystMarkdown).to.include('affiliations:');
          for (const org of author.organizations) {
            expect(mystMarkdown).to.include(`- ${org.name}`);
          }
        }
      }
    }
  });

  it('should handle MyST Markdown without frontmatter', () => {
    const mystMarkdown = `# Test Research Paper

This is a test research paper written in MyST Markdown format without frontmatter.
`;

    const researchObject = transformer.importObject(mystMarkdown) as ResearchObjectV1;

    // Validate the output as a ResearchObject
    checkers.ResearchObjectV1.check(researchObject);

    // Check that default values are set
    expect(researchObject.title).to.equal('');
    expect(researchObject.description).to.equal('');
    expect(researchObject.authors).to.be.an('array').that.is.empty;
    expect(researchObject.keywords).to.be.an('array').that.is.empty;
    expect(researchObject.researchFields).to.be.an('array').that.is.empty;

    // Check content component
    expect(researchObject.components).to.have.lengthOf(1);
    expect(researchObject.components[0].id).to.equal('content');
    expect(researchObject.components[0].name).to.equal('Main Content');
    expect(researchObject.components[0].type).to.equal('code');
    expect(researchObject.components[0].payload.path).to.equal('content.md');
  });

  it('should handle complex MyST frontmatter with nested fields', () => {
    const mystMarkdown = `---
title: Using MyST Frontmatter
subtitle: In JupyterLab
license: CC-BY-4.0
github: https://github.com/executablebooks/mystmd
subject: Tutorial
venue: MyST Markdown
biblio:
  volume: '1'
  issue: '42'
authors:
  - name: Rowan Cockett
    email: rowan@curvenote.com
    corresponding: true
    orcid: 0000-0002-7859-8394
    affiliations:
      - Curvenote
      - ExecutableBooks
date: 2023/07/05
math:
  '\\dobs': '\\mathbf{d}_\\text{obs}'
  '\\dpred': '\\mathbf{d}_\\text{pred}\\left( #1 \\right)'
  '\\mref': '\\mathbf{m}_\\text{ref}'
abbreviations:
    MyST: Markedly Structured Text
    TLA: Three Letter Acronym
---

:::{important} Objective

The goal of this quickstart is to get you up and running with MyST Markdown **Frontmatter**.

For a full guide on frontmatter see the [MyST Markdown Guide](https://mystmd.org/guide/frontmatter).
:::`;

    const researchObject = transformer.importObject(mystMarkdown) as ResearchObjectV1;

    // Validate the output as a ResearchObject
    checkers.ResearchObjectV1.check(researchObject);

    // Check specific fields
    expect(researchObject.title).to.equal('Using MyST Frontmatter');
    expect(researchObject.defaultLicense).to.equal('CC-BY-4.0');

    // Check authors
    expect(researchObject.authors).to.have.lengthOf(1);
    expect(researchObject.authors![0].name).to.equal('Rowan Cockett');
    expect(researchObject.authors![0].orcid).to.equal('https://orcid.org/0000-0002-7859-8394');

    // Check organizations
    expect(researchObject.authors![0].organizations).to.have.lengthOf(2);
    expect(researchObject.authors![0].organizations![0].name).to.equal('Curvenote');
    expect(researchObject.authors![0].organizations![1].name).to.equal('ExecutableBooks');

    // Check content component
    expect(researchObject.components).to.have.lengthOf(1);
    expect(researchObject.components[0].id).to.equal('content');
    expect(researchObject.components[0].name).to.equal('Main Content');
    expect(researchObject.components[0].type).to.equal('code');
    expect(researchObject.components[0].payload.path).to.equal('content.md');
    expect(researchObject.components[0].payload.title).to.equal('Using MyST Frontmatter');
  });

  it('should preserve data in MyST -> RO -> MyST roundtrip', () => {
    const originalMyst = `---
title: Test Roundtrip
description: Testing roundtrip conversion from MyST to ResearchObject and back
authors:
  - name: John Doe
    orcid: https://orcid.org/0000-0001-2345-6789
    role: Author
    affiliations:
      - Test University
      - Research Institute
  - name: Jane Smith
    role: Author
    affiliations:
      - Example Labs
keywords: [test, roundtrip, conversion]
tags: [research, methodology]
license: CC-BY-4.0
---

# Introduction

This is a test of roundtrip conversion.`;

    // Convert MyST -> RO -> MyST
    const researchObject = transformer.importObject(originalMyst) as ResearchObjectV1;
    const convertedMyst = transformer.exportObject(researchObject);

    // The converted MyST should contain all the same information
    expect(convertedMyst).to.include('title: Test Roundtrip');
    expect(convertedMyst).to.include('description: Testing roundtrip conversion from MyST to ResearchObject and back');
    expect(convertedMyst).to.include('license: CC-BY-4.0');
    expect(convertedMyst).to.include('name: John Doe');
    expect(convertedMyst).to.include('orcid: https://orcid.org/0000-0001-2345-6789');
    expect(convertedMyst).to.include('role: Author');
    expect(convertedMyst).to.include('      - Test University');
    expect(convertedMyst).to.include('      - Research Institute');
    expect(convertedMyst).to.include('name: Jane Smith');
    expect(convertedMyst).to.include('      - Example Labs');
    expect(convertedMyst).to.include('keywords: [test, roundtrip, conversion]');
    expect(convertedMyst).to.include('tags: [research, methodology]');
  });

  it('should preserve data in RO -> MyST -> RO roundtrip', () => {
    const originalRO: ResearchObjectV1 = {
      version: 1,
      title: 'Test Roundtrip',
      description: 'Testing roundtrip conversion from ResearchObject to MyST and back',
      defaultLicense: 'CC-BY-4.0',
      authors: [
        {
          name: 'John Doe',
          orcid: 'https://orcid.org/0000-0001-2345-6789',
          role: 'Author',
          organizations: [
            { id: 'org-1', name: 'Test University' },
            { id: 'org-2', name: 'Research Institute' },
          ],
        },
        {
          name: 'Jane Smith',
          role: 'Author',
          organizations: [{ id: 'org-3', name: 'Example Labs' }],
        },
      ],
      keywords: ['test', 'roundtrip', 'conversion'],
      researchFields: ['research', 'methodology'],
      components: [
        {
          id: 'content',
          name: 'Main Content',
          type: ResearchObjectComponentType.CODE,
          payload: {
            path: 'content.md',
            title: 'Test Roundtrip',
            description: 'Testing roundtrip conversion from ResearchObject to MyST and back',
            content: '# Introduction\n\nThis is a test of roundtrip conversion.',
          },
        },
      ],
    };

    // Convert RO -> MyST -> RO
    const mystMarkdown = transformer.exportObject(originalRO);
    const convertedRO = transformer.importObject(mystMarkdown) as ResearchObjectV1;

    // Compare essential fields
    expect(convertedRO.title).to.equal(originalRO.title);
    expect(convertedRO.description).to.equal(originalRO.description);
    expect(convertedRO.defaultLicense).to.equal(originalRO.defaultLicense);
    expect(convertedRO.keywords).to.deep.equal(originalRO.keywords);
    expect(convertedRO.researchFields).to.deep.equal(originalRO.researchFields);

    // Compare authors
    expect(convertedRO.authors).to.have.lengthOf(originalRO.authors!.length);
    originalRO.authors!.forEach((author, i) => {
      const convertedAuthor = convertedRO.authors![i];
      expect(convertedAuthor.name).to.equal(author.name);
      expect(convertedAuthor.role).to.equal(author.role);
      expect(convertedAuthor.orcid).to.equal(author.orcid);

      if (author.organizations) {
        expect(convertedAuthor.organizations).to.have.lengthOf(author.organizations.length);
        author.organizations.forEach((org, j) => {
          expect(convertedAuthor.organizations![j].name).to.equal(org.name);
          // Note: IDs will be different as they are generated during import
        });
      }
    });

    // Verify the component was preserved
    expect(convertedRO.components).to.have.lengthOf(1);
    expect(convertedRO.components[0].name).to.equal(originalRO.components[0].name);
    expect(convertedRO.components[0].type).to.equal(originalRO.components[0].type);
    expect(convertedRO.components[0].payload.path).to.equal(originalRO.components[0].payload.path);
    expect(convertedRO.components[0].payload.title).to.equal(originalRO.components[0].payload.title);
    expect(convertedRO.components[0].payload.description).to.equal(originalRO.components[0].payload.description);
    expect(convertedRO.components[0].payload.content).to.equal(originalRO.components[0].payload.content);
  });
});
