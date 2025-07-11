import { OpenAlexAuthor } from '../../services/openAlex/types.js';

export interface AuthorExperience {
  title: string;
  startDate: string;
  endDate?: string;
  organisation: {
    name: string;
    department: string;
    location: string;
  };
}

export type Author = OpenAlexAuthor & {
  education?: AuthorExperience[];
  employment?: AuthorExperience[];
  bibliometrics?: {
    m_index: number;
    contemporary_h_index: number;
    firstPubYear: number;
    citation_count: number;
  };
};
