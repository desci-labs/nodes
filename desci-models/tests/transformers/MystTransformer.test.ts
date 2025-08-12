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
    expect(convertedMyst).to.include('affiliations:');
    expect(convertedMyst).to.include('      - Test University');
    expect(convertedMyst).to.include('      - Research Institute');
    expect(convertedMyst).to.include('name: Jane Smith');
    expect(convertedMyst).to.include('      - Example Labs');
    expect(convertedMyst).to.include('keywords:');
    expect(convertedMyst).to.include('  - test');
    expect(convertedMyst).to.include('  - roundtrip');
    expect(convertedMyst).to.include('  - conversion');
    expect(convertedMyst).to.include('tags:');
    expect(convertedMyst).to.include('  - research');
    expect(convertedMyst).to.include('  - methodology');
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

  it('should handle insight journal Research Objects with full metadata', () => {
    const insightJournalRO: ResearchObjectV1 = {
      version: 1,
      title: 'ITK-based Registration of Large Images from Light Microscopy: A Biomedical Application',
      description:
        'Inactivation of the retinoblastoma gene in mouse embryos results in morphological changes in the placenta, which has been shown to affect fetal survivability. The construction of a 3D virtual placenta aids in accurately quantifying structural changes using image analysis.',
      defaultLicense: 'CC-BY-3.0',
      researchFields: [],
      components: [
        {
          id: 'root',
          name: 'root',
          type: ResearchObjectComponentType.DATA,
          payload: {
            cid: 'bafybeibkud74z43uy6e3s6ay23rso2cfhl2axboxmpg6ltgrund5tfxavq',
            path: 'root',
          },
        },
        {
          id: 'a336daf7-1bf0-4d6c-99dc-2ade44627c1b',
          name: 'article.pdf',
          type: ResearchObjectComponentType.PDF,
          payload: {
            cid: 'bafybeihsysy66y3r6rzwd4izlnsv6whxdhrybiwz66qircpwsgzmsc3f3y',
            path: 'root/article.pdf',
          },
          starred: true,
        },
      ],
      authors: [
        {
          name: 'Mosaliganti, Kishore',
          email: 'kishoreraom@gmail.com',
          role: 'Author',
        },
        {
          name: 'Pan, Tony',
          role: 'Author',
        },
        {
          name: 'Machiraju, Raghu',
          email: 'raghu.machiraju@gmail.com',
          role: 'Author',
        },
      ],
      references: [
        {
          type: 'doi',
          id: '10.1038/nature01262',
          title: '',
        },
        {
          type: 'doi',
          id: '10.1038/nature01417',
          title: '',
        },
        {
          type: 'doi',
          id: '10.1109/34.368173',
          title: '',
        },
      ],
    };

    const mystMarkdown = transformer.exportObject(insightJournalRO);

    // Check that the output contains insight journal specific elements
    expect(mystMarkdown).to.be.a('string');
    expect(mystMarkdown).to.include('ITK-based Registration of Large Images from Light Microscopy');
    expect(mystMarkdown).to.include('license: CC-BY-3.0');

    // Check author emails are included (may be quoted)
    expect(mystMarkdown).to.include('kishoreraom@gmail.com');
    expect(mystMarkdown).to.include('raghu.machiraju@gmail.com');

    // Check authors without email are still included
    expect(mystMarkdown).to.include('name: Pan, Tony');

    // Check bibliography is generated from references
    expect(mystMarkdown).to.include('bibliography:');
    expect(mystMarkdown).to.include('https://doi.org/10.1038/nature01262');
    expect(mystMarkdown).to.include('https://doi.org/10.1038/nature01417');

    // Check venue information for insight journal
    expect(mystMarkdown).to.include('venue_title: Insight Journal');
    expect(mystMarkdown).to.include('venue_url: https://insight-journal.org');
  });

  it('should roundtrip insight journal ROs with emails and references', () => {
    const originalRO: ResearchObjectV1 = {
      version: 1,
      title: 'Test Insight Article',
      description: 'A test article for insight journal',
      defaultLicense: 'CC-BY-4.0',
      authors: [
        {
          name: 'John Doe',
          email: 'john@example.com',
          role: 'Author',
        },
        {
          name: 'Jane Smith',
          email: 'jane@example.com',
          role: 'Author',
        },
      ],
      references: [
        {
          type: 'doi',
          id: '10.1000/test123',
          title: '',
        },
      ],
      components: [],
    };

    // Convert RO -> MyST -> RO
    const mystMarkdown = transformer.exportObject(originalRO);
    const convertedRO = transformer.importObject(mystMarkdown) as ResearchObjectV1;

    // Compare essential fields
    expect(convertedRO.title).to.equal(originalRO.title);
    expect(convertedRO.description).to.equal(originalRO.description);
    expect(convertedRO.defaultLicense).to.equal(originalRO.defaultLicense);

    // Compare authors including emails
    expect(convertedRO.authors).to.have.lengthOf(originalRO.authors!.length);
    originalRO.authors!.forEach((author, i) => {
      const convertedAuthor = convertedRO.authors![i];
      expect(convertedAuthor.name).to.equal(author.name);
      expect(convertedAuthor.email).to.equal(author.email);
      expect(convertedAuthor.role).to.equal(author.role);
    });

    // Compare references
    expect(convertedRO.references).to.have.lengthOf(originalRO.references!.length);
    expect(convertedRO.references![0].type).to.equal('doi');
    expect(convertedRO.references![0].id).to.equal('10.1000/test123');
  });

  it('should handle complex YAML edge cases with js-yaml parsing', () => {
    const complexMystMarkdown = `---
title: Complex YAML Test
description: |
  This is a multi-line description
  that spans multiple lines
  and includes special characters: @#$%
authors:
  - name: "John O'Reilly"
    email: john@example.com
    affiliations:
      - University of Testing
      - "Institute of Special Characters & More"
  - name: Jane Smith
    email: jane@example.com
    role: "Lead Author"
keywords:
  - "machine learning"
  - "data science"
  - "complex: values"
tags: [tag1, tag2, "tag with spaces"]
bibliography:
  - "https://doi.org/10.1000/test1"
  - "https://doi.org/10.1000/test2"
special_chars: "String with quotes \\\"inside\\\" and more"
numbers:
  - 42
  - 3.14159
  - "123"
boolean_values:
  - true
  - false
  - "false"
---

# Complex Test Document

This document tests complex YAML parsing.
`;

    const result = transformer.importObject(complexMystMarkdown) as ResearchObjectV1;

    expect(result).to.be.an('object');
    expect(result.title).to.equal('Complex YAML Test');
    expect(result.description).to.include('multi-line description');
    expect(result.description).to.include('special characters');

    // Test authors with complex names and affiliations
    expect(result.authors).to.have.lengthOf(2);
    expect(result.authors![0].name).to.equal("John O'Reilly");
    expect(result.authors![0].email).to.equal('john@example.com');
    expect(result.authors![0].organizations).to.have.lengthOf(2);
    expect(result.authors![0].organizations![1].name).to.equal('Institute of Special Characters & More');

    // Test arrays in different formats
    expect(result.keywords).to.include('complex: values');
    expect(result.researchFields).to.include('tag with spaces');

    // Test references from bibliography
    expect(result.references).to.have.lengthOf(2);
    expect(result.references![0].id).to.equal('10.1000/test1');
  });

  it('should extract dynamic GitHub URLs from research objects', () => {
    const roWithGithubComponent: ResearchObjectV1 = {
      version: 1,
      title: 'Test with GitHub Component',
      description: 'A research object with GitHub URL in component',
      components: [
        {
          id: 'code-component',
          name: 'Source Code',
          type: ResearchObjectComponentType.CODE,
          payload: {
            externalUrl: 'https://github.com/custom-org/custom-repo',
            cid: 'test-cid',
          },
        },
      ],
    };

    const mystMarkdown = transformer.exportObject(roWithGithubComponent);

    expect(mystMarkdown).to.include('github: https://github.com/custom-org/custom-repo');
  });

  it('should extract GitHub URL from author profiles', () => {
    const roWithGithubAuthor: ResearchObjectV1 = {
      version: 1,
      title: 'Test with GitHub Author',
      description: 'A research object with GitHub URL in author',
      components: [],
      authors: [
        {
          name: 'Test Author',
          github: 'testuser',
          role: 'Author',
        },
      ],
    };

    const mystMarkdown = transformer.exportObject(roWithGithubAuthor);

    expect(mystMarkdown).to.include('github: https://github.com/testuser');
  });

  it('should use default GitHub URL when no dynamic URL is found', () => {
    const roWithoutGithub: ResearchObjectV1 = {
      version: 1,
      title: 'Test without GitHub',
      description: 'A research object without GitHub URLs',
      components: [],
      dpid: {
        prefix: 'test',
        id: '123',
      },
    };

    const mystMarkdown = transformer.exportObject(roWithoutGithub);

    expect(mystMarkdown).to.include('github: https://github.com/desci-labs/nodes');
  });

  it('should prioritize component GitHub URLs over author GitHub URLs', () => {
    const roWithBothGithub: ResearchObjectV1 = {
      version: 1,
      title: 'Test with Both GitHub Sources',
      description: 'A research object with GitHub URLs in both component and author',
      components: [
        {
          id: 'code-component',
          name: 'Source Code',
          type: ResearchObjectComponentType.CODE,
          payload: {
            externalUrl: 'https://github.com/component-org/component-repo',
            cid: 'test-cid',
          },
        },
      ],
      authors: [
        {
          name: 'Test Author',
          github: 'authoruser',
          role: 'Author',
        },
      ],
    };

    const mystMarkdown = transformer.exportObject(roWithBothGithub);

    // Should use component URL (prioritized over author URL)
    expect(mystMarkdown).to.include('github: https://github.com/component-org/component-repo');
    expect(mystMarkdown).to.not.include('github: https://github.com/authoruser');
  });

  it('should preserve dates during roundtrip conversions', () => {
    const mystMarkdownWithDate = `---
title: Test Article with Date
description: A test article with a specific publication date
date: 2023-05-15
authors:
  - name: Test Author
    role: Author
license: CC-BY-4.0
---

# Test Article

This article has a specific publication date.
`;

    // Import MyST with date
    const importedRO = transformer.importObject(mystMarkdownWithDate) as ResearchObjectV1;

    // Verify date was imported
    expect(importedRO.date).to.equal('2023-05-15');

    // Export back to MyST
    const exportedMyst = transformer.exportObject(importedRO);

    // Verify date was preserved
    expect(exportedMyst).to.include('date: "2023-05-15"');
    expect(exportedMyst).to.not.include('date: "' + new Date().toISOString().split('T')[0] + '"');
  });

  it('should use current date when no date is provided', () => {
    const roWithoutDate: ResearchObjectV1 = {
      version: 1,
      title: 'Test without Date',
      description: 'A research object without a date field',
      components: [],
    };

    const mystMarkdown = transformer.exportObject(roWithoutDate);
    const currentDate = new Date().toISOString().split('T')[0];

    expect(mystMarkdown).to.include(`date: "${currentDate}"`);
  });

  it('should preserve custom dates when exporting existing research objects', () => {
    const roWithCustomDate: ResearchObjectV1 = {
      version: 1,
      title: 'Test with Custom Date',
      description: 'A research object with a custom date',
      components: [],
      date: '2022-12-01',
    };

    const mystMarkdown = transformer.exportObject(roWithCustomDate);

    expect(mystMarkdown).to.include('date: "2022-12-01"');
    expect(mystMarkdown).to.not.include('date: "' + new Date().toISOString().split('T')[0] + '"');
  });
});
