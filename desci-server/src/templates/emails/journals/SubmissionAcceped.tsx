import { Journal } from '@prisma/client';
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Button } from '@react-email/components';
import * as React from 'react';

import MainLayout, { baseStyles } from '../MainLayout.js';

export interface SubmissionAcceptedEmailProps {
  journal: Journal;
  editorName: string;
  submissionTitle: string;
  submissionId: string;
  submissionLink: string;
  submissionAuthors: string[];
  submissionAbstract: string;
}

export const SubmissionAcceptedEmail = ({
  journal,
  editorName,
  submissionTitle,
  submissionId,
  submissionLink,
  submissionAuthors,
  submissionAbstract,
}: SubmissionAcceptedEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>
        Congratulations! {journal.name} has accepted {submissionTitle}
      </Preview>
      <Body style={baseStyles.main}>
        <Container style={baseStyles.container}>
          <Heading style={baseStyles.h1} className="text-center !text-black">
            Congratulations! {journal.name} has accepted {submissionTitle}
          </Heading>
          <Section className="mx-auto w-fit my-5 bg-[#dadce0] rounded-md px-14 py-3" align="center">
            <Button
              href={submissionLink}
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

export default SubmissionAcceptedEmail;
