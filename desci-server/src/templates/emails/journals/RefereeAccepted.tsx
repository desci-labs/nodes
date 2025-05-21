import { EditorRole, Journal } from '@prisma/client';
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Button } from '@react-email/components';
import * as React from 'react';

import MainLayout, { baseStyles } from '../MainLayout.js';

export interface RefereeAcceptedEmailProps {
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid'>;
  refereeName: string;
  refereeEmail: string;
  submissionTitle: string;
  submissionId: string;
  submissionLink: string;
  submissionAuthors: string[];
  submissionAbstract: string;
  inviteToken: string;
  reviewDeadline: string;
}

export const RefereeAcceptedEmail = ({
  journal,
  refereeName,
  refereeEmail,
  submissionTitle,
  submissionId,
  submissionLink,
  submissionAuthors,
  submissionAbstract,
  reviewDeadline,
}: RefereeAcceptedEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>
        [{journal.name}] {refereeName} has accepted your invitation to review {submissionTitle}
      </Preview>
      <Body style={baseStyles.main}>
        <Container style={baseStyles.container}>
          <Heading style={baseStyles.h1} className="text-center !text-black">
            [{journal.name}] {refereeName} has accepted your invitation to review {submissionTitle}
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
              View Submission
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

export default RefereeAcceptedEmail;
