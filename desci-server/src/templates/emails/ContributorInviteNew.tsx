import {
  Body,
  Container,
  Column,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

import MainLayout from './MainLayout.js';

interface ContributorInviteEmailProps {
  inviter: string;
  nodeUuid: string;
  contributorId: string;
  privShareCode: string;
}

export const ContributorInviteNew = ({
  inviter,
  nodeUuid,
  privShareCode,
  contributorId,
}: ContributorInviteEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>Confirm your contribution</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You've been invited as a contributor!</Heading>
          <Text style={heroText}>
            <strong>{inviter}</strong> has added you as a contributor to their node. Confirm your contribution to ensure
            you're credited for your work.
          </Text>

          <Text style={text}>
            If you didn't request this email, there's nothing to worry about, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

export default ContributorInviteNew;

const footerText = {
  fontSize: '12px',
  color: '#b7b7b7',
  lineHeight: '15px',
  textAlign: 'left' as const,
  marginBottom: '50px',
};

const footerLink = {
  color: '#b7b7b7',
  textDecoration: 'underline',
};

const footerLogos = {
  marginBottom: '32px',
  paddingLeft: '8px',
  paddingRight: '8px',
  width: '100%',
};

const socialMediaIcon = {
  display: 'inline',
  marginLeft: '32px',
};

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

const logoContainer = {
  marginTop: '32px',
};

const h1 = {
  color: '#1d1c1d',
  fontSize: '36px',
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

const codeBox = {
  background: 'rgb(245, 244, 245)',
  borderRadius: '4px',
  marginBottom: '30px',
  padding: '40px 10px',
};

const confirmationCodeText = {
  fontSize: '30px',
  textAlign: 'center' as const,
  verticalAlign: 'middle',
};

const text = {
  color: '#000',
  fontSize: '14px',
  lineHeight: '24px',
};
