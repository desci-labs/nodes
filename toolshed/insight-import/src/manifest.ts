import {
  ResearchObjectReference,
  ResearchObjectV1,
  ResearchObjectV1Author
} from '@desci-labs/desci-models';
import axios from 'axios';

const BASE_URL = 'https://raw.githubusercontent.com/InsightSoftwareConsortium/InsightJournal/master/data/publications/';

async function fetchPublicationData(id: number): Promise<any> {
  const url = `${BASE_URL}${id}/metadata.json`;
  const response = await axios.get(url);
  return response.data;
}

function parsePublicationData(jsonData: any): ResearchObjectV1 {
  const publication = jsonData.publication;

  return {
    version: 'desci-nodes-0.1.0',
    title: publication.title,
    description: publication.abstract,
    defaultLicense: publication.license,
    authors: parseAuthors(publication.authors),
    researchFields: publication.categories,
    references: parseReferences(publication.revisions[0]?.citation_list),
    // Add other fields as needed
  };
}

function parseAuthors(authors: any[]): ResearchObjectV1Author[] {
  return authors.map(author => ({
    name: author.author_fullname,
    email: author.persona_email,
  }));
}

function parseReferences(citations: any[]): ResearchObjectReference[] {
  return citations?.map(citation => ({
    doi: citation.doi,
    // Add other relevant fields
  })) ?? [];
}

async function processPublications(startId: number, endId: number): Promise<ResearchObjectV1[]> {
  const results: ResearchObjectV1[] = [];

  for (let id = startId; id <= endId; id++) {
    try {
      const jsonData = await fetchPublicationData(id);
      const researchObject = parsePublicationData(jsonData);
      results.push(researchObject);
    } catch (error) {
      console.error(`Error processing publication ${id}:`, error);
    }
  }

  return results;
}

processPublications(1, 20).then(results => {
  console.log(`Processed ${results.length} publications`);
  // Further processing or storage of results
});
