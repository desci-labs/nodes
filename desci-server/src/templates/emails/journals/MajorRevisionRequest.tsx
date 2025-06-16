import { Journal } from '@prisma/client';
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Button } from '@react-email/components';
import * as React from 'react';

import { SubmissionExtended } from '../../../services/email/journalEmailTypes.js';
import MainLayout, { baseStyles } from '../MainLayout.js';

export interface MajorRevisionRequestEmailProps {
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid'>;
  editorName: string;
  submission: SubmissionExtended;
  comments: string;
}

export const MajorRevisionRequestEmail = ({
  journal,
  editorName,
  submission,
  comments,
}: MajorRevisionRequestEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>
        {journal.name} has requested major revisions for {submission.title}
      </Preview>
      <Body style={baseStyles.main}>
        <Container style={baseStyles.container}>
          <Heading style={baseStyles.h1} className="text-center !text-black">
            {editorName} has requested major revisions for {submission.title}
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
              Submit Revision
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

export default MajorRevisionRequestEmail;
