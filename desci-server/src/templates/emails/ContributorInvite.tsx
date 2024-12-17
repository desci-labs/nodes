import {
  Body,
  Container,
  Column,
  Head,
  Heading,
  Html,
  Preview,
  Row,
  Text,
  Button,
  Section,
  render,
} from '@react-email/components';
import * as React from 'react';

import MainLayout from './MainLayout.js';

export interface ContributorInviteEmailProps {
  inviter: string;
  nodeUuid: string;
  contributorId: string;
  privShareCode: string;
  nodeTitle: string;
  newUser?: boolean;
}

const NEW_USER_TEXT = `Sign up on Desci Nodes to confirm your contribution to ensure you're credited for your work.`;
const EXISTING_USER_TEXT = `Confirm your contribution to ensure
you're credited for your work.`;

const DAPP_URL = process.env.DAPP_URL || 'http://localhost:3000';

export const ContributorInvite = ({
  inviter,
  nodeUuid,
  privShareCode,
  contributorId,
  newUser,
  nodeTitle,
}: ContributorInviteEmailProps) => {
  if (nodeUuid?.endsWith('.') || nodeUuid?.endsWith('=')) nodeUuid = nodeUuid.slice(0, -1);
  inviter = inviter || 'A user';
  const fallbackTitle = 'a research object';
  const privShareUrl = `${DAPP_URL}/node/${nodeUuid}?shareId=${privShareCode}`;
  const contributorUrl = `${DAPP_URL}/node/${nodeUuid}/contributors/${contributorId}?shareId=${privShareCode}&src=inv`;
  return (
    <MainLayout>
      <Html>
        <Head />
        <Preview>Confirm your contribution</Preview>
        <Body style={main}>
          <Container style={container}>
            <Heading style={h1} className="text-center">
              You've been invited as a contributor!
            </Heading>
            <Text style={heroText}>
              <strong>{inviter}</strong> has added you as a co-author to {!!nodeTitle && <cite>{nodeTitle}</cite>}
              {!!!nodeTitle ? fallbackTitle : ''}. {newUser ? NEW_USER_TEXT : EXISTING_USER_TEXT}
            </Text>

            <Section className="flex flex-col max-w-[284px] mx-auto w-full my-5" align="center">
              <Button
                href={contributorUrl}
                className="backdrop-blur-2xl rounded-sm w-full text-center mb-4"
                style={{
                  color: 'white',
                  padding: '10px 20px',
                  background: 'black',
                  marginRight: '10px',
                  border: '1px solid black',
                  borderRadius: '2px',
                }}
              >
                Verify Contribution
              </Button>
              <Button
                href={privShareUrl}
                className="backdrop-blur-2xl rounded-sm w-full text-center"
                style={{
                  color: 'black',
                  padding: '10px 20px',
                  // backdropFilter: 'blur(20px)',
                  background: 'white',
                  // backgroundOpacity: '0.5',
                  border: '1px solid black',
                  borderRadius: '2px',
                }}
              >
                View Research
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    </MainLayout>
  );
};

export default ContributorInvite;

const main = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '0px 20px',
};

const h1 = {
  color: '#000000',
  fontSize: '30px',
  fontWeight: '700',
  margin: '30px 0',
  padding: '0',
  lineHeight: '42px',
};

const heroText = {
  fontSize: '20px',
  lineHeight: '28px',
  marginBottom: '30px',
};
