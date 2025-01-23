import { Body, Container, Head, Heading, Html, Preview, Text, Button, Section } from '@react-email/components';
import * as React from 'react';

import { PUBLIC_IPFS_PATH } from '../../config/index.js';

import MainLayout from './MainLayout.js';

export interface SubmissionPackageEmailProps {
  nodeOwner: string;
  nodeTitle: string;
  nodeUuid: string;
  nodeDpid: string;
  versionUpdate: string;
  manuscriptCid: string;
  contributorId: string;
  privShareCode?: string;
  isNodeOwner: boolean;
  isAlreadyVerified: boolean;
}

const DAPP_URL = process.env.DAPP_URL || 'http://localhost:3000';

export const SubmissionPackage = ({
  nodeOwner,
  nodeTitle,
  nodeUuid,
  nodeDpid,
  versionUpdate,
  manuscriptCid,
  contributorId,
  privShareCode,
  isNodeOwner,
  isAlreadyVerified,
}: SubmissionPackageEmailProps) => {
  if (nodeUuid?.endsWith('.') || nodeUuid?.endsWith('=')) nodeUuid = nodeUuid.slice(0, -1);
  isAlreadyVerified = true; // Hide this button for now
  nodeOwner = nodeOwner || 'The node owner';
  nodeDpid = nodeDpid || '(DEMO)';
  versionUpdate = versionUpdate || '1'; // For demo case
  const nodeUrl = `${DAPP_URL}/dpid/${nodeDpid}/${versionUpdate}`;
  const manuscriptUrl = `${PUBLIC_IPFS_PATH}/${manuscriptCid}`;
  const contributorUrl = `${DAPP_URL}/node/${nodeUuid}/contributors/${contributorId}?shareId=${privShareCode}&src=inv`;

  // const nodeUrl = 'stub';
  // const manuscriptUrl = 'stub';
  return (
    <MainLayout>
      <Html>
        <Head />
        <Preview>Your submission package is ready</Preview>
        <Body style={main}>
          <Container style={container}>
            <Heading style={h1} className="text-center">
              A submission package has been created for the research object {nodeTitle ? 'titled ' : ''}
              {nodeTitle ? <cite>"{nodeTitle}"</cite> : ''} with DPID {nodeDpid}
            </Heading>
            <Text style={heroText}>
              <strong>{nodeOwner}</strong> has published their research object and listed you as a contributor to their
              research. {!isAlreadyVerified ? "Verify your contribution to ensure you're credited for your work." : ''}
            </Text>
            <Section style={{ width: 'fit-content' }} align="center">
              {!isAlreadyVerified && (
                <Button
                  href={contributorUrl}
                  style={{
                    background: 'black',
                    color: 'white',
                    width: '100%',
                    padding: '10px 0px',
                    textAlign: 'center',
                    fontSize: '13px',
                    marginBottom: '15px',
                    fontWeight: '600',
                    borderRadius: '2px',
                  }}
                >
                  Verify Contribution
                </Button>
              )}
              <div className="mx-auto w-fit">
                <Button
                  href={nodeUrl}
                  className="backdrop-blur-2xl rounded-sm"
                  style={{
                    font: 'inter',
                    color: 'black',
                    padding: '10px 20px',
                    marginRight: '15px',
                    background: 'white',
                    fontSize: '12px',
                    fontWeight: '500',
                    border: '1px solid black',
                    borderRadius: '2px',
                  }}
                >
                  View Research
                </Button>
                <Button
                  href={manuscriptUrl}
                  className="backdrop-blur-2xl rounded-sm"
                  style={{
                    color: 'black',
                    padding: '10px 20px',
                    background: 'white',
                    fontSize: '12px',
                    fontWeight: '500',
                    border: '1px solid black',
                    borderRadius: '2px',
                  }}
                >
                  Download Manuscript PDF
                </Button>
              </div>
            </Section>
          </Container>
        </Body>
      </Html>
    </MainLayout>
  );
};

export default SubmissionPackage;

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
