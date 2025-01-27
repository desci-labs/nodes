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

export interface ExternalPublicationsEmailProps {
  dpid: string;
  dpidPath: string;
  publisherName: string;
  multiple: boolean;
}

export const ExternalPublicationsEmail = ({
  dpid,
  dpidPath,
  publisherName,
  multiple,
}: ExternalPublicationsEmailProps) => (
  <MainLayout footerMsg="">
    <Html>
      <Head />
      <Preview>
        External publication{multiple ? `s` : ``} found DPID://{dpid}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1} className="text-center !text-black">
            {multiple
              ? `View your publication to verify external publications`
              : `We linked an external publication from ${publisherName} to your node`}
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

export default ExternalPublicationsEmail;

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
