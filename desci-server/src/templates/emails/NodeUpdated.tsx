import { Body, Container, Head, Heading, Html, Preview, Text, Button, Section } from '@react-email/components';
import * as React from 'react';

import MainLayout from './MainLayout.js';

export interface NodeUpdatedEmailProps {
  nodeOwner: string;
  nodeTitle: string;
  nodeUuid: string;
  nodeDpid: string;
  versionUpdate: string;
  manuscriptCid: string;
}

const DAPP_URL = process.env.DAPP_URL || 'http://localhost:3000';

export const NodeUpdated = ({
  nodeOwner,
  nodeTitle,
  nodeUuid,
  nodeDpid,
  versionUpdate,
  manuscriptCid,
}: NodeUpdatedEmailProps) => {
  if (nodeUuid?.endsWith('.') || nodeUuid?.endsWith('=')) nodeUuid = nodeUuid.slice(0, -1);
  nodeOwner = nodeOwner || 'The node owner';
  const nodeUrl = `${DAPP_URL}/dpid/${nodeDpid}/${versionUpdate}`;
  const manuscriptUrl = `${process.env.IPFS_RESOLVER_OVERRIDE}/${manuscriptCid}`;
  return (
    <MainLayout>
      <Html>
        <Head />
        <Preview>DPID {nodeDpid} has been updated</Preview>
        <Body style={main}>
          <Container style={container}>
            <Heading style={h1} className="text-center">
              DPID {nodeDpid} has been updated to version {versionUpdate}
            </Heading>
            <Text style={heroText}>
              <strong>{nodeOwner}</strong> has published an updated version of their research object titled{' '}
              <strong>"{nodeTitle}</strong>" that you have contributed to.
            </Text>

            <Section className="mx-auto w-fit my-5" align="center">
              <Button
                href={nodeUrl}
                className="backdrop-blur-2xl rounded-sm"
                style={{
                  color: 'white',
                  padding: '10px 20px',
                  marginRight: '10px',
                  background: '#28aac4',
                }}
              >
                View Version {versionUpdate}
              </Button>
              <Button
                href={manuscriptUrl}
                className="backdrop-blur-2xl rounded-sm"
                style={{
                  color: 'white',
                  padding: '10px 20px',
                  marginRight: '10px',
                  background: '#28aac4',
                }}
              >
                View Manuscript
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    </MainLayout>
  );
};

export default NodeUpdated;

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
