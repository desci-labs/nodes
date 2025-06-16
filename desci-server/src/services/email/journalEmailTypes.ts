import { JournalSubmission } from '@prisma/client';

export type SubmissionPartial = Pick<JournalSubmission, 'id' | 'dpid' | 'version' | 'doi' | 'submittedAt'>;
export type SubmissionExtended = SubmissionPartial & {
  title: string;
  authors: string[];
  abstract: string;
  submitterName: string;
  submitterUserId: number;
};
