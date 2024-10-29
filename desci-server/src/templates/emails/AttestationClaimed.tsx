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

export interface AttestationClaimedEmailProps {
  dpid: string;
  dpidPath: string;
  userName: string;
  attestationName: string;
  communityName: string;
}

export const AttestationClaimedEmail = ({
  dpid,
  dpidPath,
  userName,
  attestationName,
  communityName,
}: AttestationClaimedEmailProps) => (
  <MainLayout footerMsg="">
    <Html>
      <Head />
      <Preview>
        {communityName}: {attestationName} attestation claimed on DPID://{dpid}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1} className="text-center !text-black">
            {userName} claimed {attestationName} on their node.
          </Heading>
          <Section className="mx-auto w-fit my-5 bg-[#dadce0] rounded-md px-14 py-3" align="center">
            <Button
              href={dpidPath}
              className="backdrop-blur-2xl rounded-sm"
              style={{
                color: 'white',
                padding: '10px 20px',
                marginRight: '10px',
                // backdropFilter: 'blur(20px)',
                background: '#28aac4',
                // backgroundOpacity: '0.5',
              }}
            >
              View Node
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  </MainLayout>
);

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
  // color: '#000000',
  fontSize: '30px',
  fontWeight: '700',
  margin: '30px 0',
  padding: '0',
  lineHeight: '42px',
};
