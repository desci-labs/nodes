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

interface MagicCodeEmailProps {
  magicCode: string;
}

export const MagicCodeEmail = ({ magicCode }: MagicCodeEmailProps) => (
  <MainLayout>
    <Html>
      <Head />
      <Preview>Confirm your contribution</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1} className="text-center">
            Your magic code is ready!
          </Heading>
          <Section className="mx-auto w-fit my-5 bg-opacity-90 backdrop-blur-xl rounded-md px-14 py-3" align="center">
            <Text className="text-lg text-center tracking-[0.3em]">{magicCode}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

export default MagicCodeEmail;

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
