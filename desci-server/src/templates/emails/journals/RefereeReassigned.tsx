import { EditorRole, Journal } from '@prisma/client';
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Button } from '@react-email/components';
import * as React from 'react';

import MainLayout, { baseStyles } from '../MainLayout.js';

export interface RefereeReassignedEmailProps {
  journal: Journal;
  inviterName: string;
  refereeName: string;
  submissionTitle: string;
  submissionId: string;
  submissionLink: string;
  submissionAuthors: string[]; // Possibly not needed here if blind review
  submissionAbstract: string;
  reviewDeadline: string;
}

export const RefereeReassignedEmail = ({
  journal,
  inviterName,
  refereeName,
  submissionTitle,
  submissionId,
  submissionLink,
  submissionAuthors,
  submissionAbstract,
  reviewDeadline,
}: RefereeReassignedEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>[{journal.name}] You have been reassigned to review a submission.</Preview>
      <Body style={baseStyles.main}>
        <Container style={baseStyles.container}>
          <Heading style={baseStyles.h1} className="text-center !text-black">
            [{journal.name}] You have been reassigned to review a submission by {inviterName} for the {journal.name}
          </Heading>
          <Text className="text-lg text-center font-bold">Deadline: {reviewDeadline}</Text>
          <Text className="text-lg text-center font-bold">Submission Info:</Text>
          <Text className="text-md text-center">Title: {submissionTitle}</Text>
          <Text className="text-md text-center">Authors: {submissionAuthors.join(', ')}</Text>
          <Text className="text-md text-center">Abstract: {submissionAbstract}</Text>
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
              Review Submission
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

export default RefereeReassignedEmail;
