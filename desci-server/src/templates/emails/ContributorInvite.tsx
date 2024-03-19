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
} from '@react-email/components';
import * as React from 'react';

import MainLayout from './MainLayout.js';

interface ContributorInviteEmailProps {
  inviter: string;
  nodeUuid: string;
  contributorId: string;
  privShareCode: string;
  newUser?: boolean;
}

const NEW_USER_TEXT = `Sign up on Desci Nodes to confirm your contribution to ensure you're credited for your work.`;
const EXISTING_USER_TEXT = `Confirm your contribution to ensure
you're credited for your work.`;

export const ContributorInviteNew = ({
  inviter,
  nodeUuid,
  privShareCode,
  contributorId,
  newUser,
}: ContributorInviteEmailProps) => {
  if (nodeUuid.endsWith('.') || nodeUuid.endsWith('=')) nodeUuid = nodeUuid.slice(0, -1);
  const privShareUrl = `https://nodes.desci.com/node/${nodeUuid}?shareId=${privShareCode}`;
  const contributorUrl = `https://nodes.desci.com/node/${nodeUuid}/contributors/${contributorId}?shareId=${privShareCode}`;
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
              <strong>{inviter}</strong> has added you as a contributor to their node.{' '}
              {newUser ? NEW_USER_TEXT : EXISTING_USER_TEXT}
            </Text>

            <Section className="mx-auto w-fit my-5" align="center">
              <Button
                href={privShareUrl}
                className="backdrop-blur-2xl rounded-sm"
                style={{
                  color: 'white',
                  padding: '10px 20px',
                  marginRight: '10px',
                  // backdropFilter: 'blur(20px)',
                  background: '#28aac485',
                  // backgroundOpacity: '0.5',
                }}
              >
                View Node
              </Button>
              <Button
                href={contributorUrl}
                className="backdrop-blur-2xl rounded-sm"
                style={{ color: 'white', padding: '10px 20px', background: '#28aac485' }}
              >
                Verify Contribution
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    </MainLayout>
  );
};

export default ContributorInviteNew;

const main = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
};

const container = {
  margin: '0 auto',
  padding: '0px 20px',
};

const h1 = {
  color: '#ffffff',
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
