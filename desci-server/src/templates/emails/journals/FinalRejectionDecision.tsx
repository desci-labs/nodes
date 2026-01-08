import { Journal } from '@prisma/client';
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Button } from '@react-email/components';
import * as React from 'react';

import { SubmissionExtended } from '../../../services/email/journalEmailTypes.js';
import MainLayout, { baseStyles } from '../MainLayout.js';

export interface FinalRejectionDecisionEmailProps {
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid' | 'imageUrl'>;
  editor: {
    name: string;
    userId: number;
  };
  submission: SubmissionExtended;
  comments: string;
}

export const FinalRejectionDecisionEmail = ({
  journal,
  editor,
  submission,
  comments,
}: FinalRejectionDecisionEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>
        {journal.name} has rejected {submission.title}
      </Preview>
      <Body style={baseStyles.main}>
        <Container style={baseStyles.container}>
          <Heading style={baseStyles.h1} className="text-center !text-black">
            {editor.name} has rejected {submission.title}
          </Heading>
          <Text className="text-lg text-center font-bold">Comments: {comments}</Text>
          <Section className="mx-auto w-fit my-5 bg-[#dadce0] rounded-md px-14 py-3" align="center">
            <Button
              href={''}
              className="backdrop-blur-2xl rounded-sm"
              style={{
                color: 'white',
                padding: '10px 20px',
                marginRight: '10px',
                background: '#28aac4',
              }}
            >
              View Submission Criteria
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

export default FinalRejectionDecisionEmail;
