import { EditorRole, Journal } from '@prisma/client';
import { Body, Container, Head, Heading, Html, Preview, Text, Section, Button } from '@react-email/components';
import * as React from 'react';

import MainLayout, { baseStyles } from '../MainLayout.js';

export interface InviteEditorEmailProps {
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid'>;
  inviterName: string;
  role: string;
  inviteToken: string;
}

export const roleCopy = {
  [EditorRole.ASSOCIATE_EDITOR]: 'an Associate Editor',
  [EditorRole.CHIEF_EDITOR]: 'a Chief Editor',
};

export const InviteEditorEmail = ({ journal, inviterName, role, inviteToken }: InviteEditorEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>
        You've been invited to join {journal.name} as {roleCopy[role]}
      </Preview>
      <Body style={baseStyles.main}>
        <Container style={baseStyles.container}>
          <Heading style={baseStyles.h1} className="text-center !text-black">
            {inviterName} has invited you to join {journal.name} as {roleCopy[role]}
          </Heading>
          <Text className="text-lg text-center font-bold">{journal.description}</Text>
          <Section className="mx-auto w-fit my-5 bg-[#dadce0] rounded-md px-14 py-3" align="center">
            <Button
              href={`${process.env.NEXT_PUBLIC_APP_URL}/journals/${journal.id}/invite/${inviteToken}`}
              className="backdrop-blur-2xl rounded-sm"
              style={{
                color: 'white',
                padding: '10px 20px',
                marginRight: '10px',
                background: '#28aac4',
              }}
            >
              View Journal
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

export default InviteEditorEmail;
