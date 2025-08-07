import { EditorRole, Journal } from '@prisma/client';
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Button } from '@react-email/components';
import * as React from 'react';

import { SubmissionExtended } from '../../../services/email/journalEmailTypes.js';
import MainLayout, { baseStyles } from '../MainLayout.js';

export interface SubmissionReassignedEmailProps {
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid'>;
  editor: {
    name: string;
    userId: number;
  };
  assigner: {
    name: string;
    userId: number;
  };
  submission: SubmissionExtended;
}
export const SubmissionReassignedEmail = ({
  journal,
  assigner,
  editor,
  submission,
}: SubmissionReassignedEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>[{journal.name}] You have been reassigned a submission to review.</Preview>
      <Body style={baseStyles.main}>
        <Container style={baseStyles.container}>
          <Heading style={baseStyles.h1} className="text-center !text-black">
            [{journal.name}] You have been reassigned a submission to review by {assigner.name} for the {journal.name}
          </Heading>
          <Text className="text-lg text-center font-bold">Submission Info:</Text>
          <Text className="text-md text-center">Title: {submission.title}</Text>
          <Text className="text-md text-center">Authors: {submission.authors}</Text>
          <Text className="text-md text-center">Abstract: {submission.abstract}</Text>
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
              View Submission
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

export default SubmissionReassignedEmail;
