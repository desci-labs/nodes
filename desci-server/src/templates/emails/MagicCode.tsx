import { Body, Container, Head, Heading, Html, Preview, Text, Section } from '@react-email/components';
import * as React from 'react';

import MainLayout from './MainLayout.js';

export interface MagicCodeEmailProps {
  magicCode: string;
  ip?: string;
}

export const MagicCodeEmail = ({ magicCode, ip }: MagicCodeEmailProps) => (
  <MainLayout
    footerMsg={`${
      ip ? `Sent from ip: ${ip} --` : ''
    } If you weren't logging in please forward this email to info@desci.com`}
  >
    <Html>
      <Head />
      <Preview>Confirm your identity</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1} className="text-center !text-black">
            Your magic code is ready!
          </Heading>
          <Section className="mx-auto w-fit my-5 bg-[#dadce0] rounded-md px-14 py-3" align="center">
            <Text className="text-lg text-center font-bold tracking-[0.3em]">{magicCode}</Text>
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
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '0px 20px',
};

const h1 = {
  // color: '#000000',
  fontSize: '30px',
  fontWeight: '700',
  margin: '30px 0',
  padding: '0',
  lineHeight: '42px',
};
