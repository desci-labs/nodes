import { Body, Container, Head, Heading, Html, Preview, Text, Button, Section } from '@react-email/components';
import * as React from 'react';

import MainLayout from './MainLayout.js';

export interface RejectSubmissionEmailProps {
  dpid: string;
  dpidPath: string;
  userName: string;
  communityName: string;
  reason?: string;
  communityPage: string;
}

export const RejectSubmissionEmail = ({
  dpid,
  dpidPath,
  userName,
  reason,
  communityName,
  communityPage,
}: RejectSubmissionEmailProps) => (
  <MainLayout footerMsg="">
    <Html>
      <Head />
      <Preview>
        Your submission to {communityName} for DPID://{dpid} was rejected
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1} className="text-center !text-black">
            Hi {userName}, your submission to {communityName} was rejected.
          </Heading>
          <Section className="mx-auto w-fit my-5 bg-[#dadce0] rounded-md px-14 py-3" align="center">
            <Text>Reason for submission: {reason ? reason : 'Not stated'}</Text>
            <Button
              href={dpidPath}
              className="backdrop-blur-2xl rounded-sm"
              style={{
                color: 'white',
                padding: '10px 20px',
                marginRight: '10px',
                background: '#28aac4',
              }}
            >
              View Node
            </Button>
            <Button
              href={communityPage}
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

export default RejectSubmissionEmail;

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
