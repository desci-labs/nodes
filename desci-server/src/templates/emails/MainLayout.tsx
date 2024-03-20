import { url } from 'inspector';

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
  Font,
} from '@react-email/components';
import React from 'react';

import BaseProvider from './BaseProvider.js';

export const emailAssetsBaseUrl = 'https://ipfs.desci.com/ipfs';
const cubertBkg = 'bafkreih6yx7ywj7trvpp45vergrnytad7ezsku75tefyro4qrrcfrrmrt4';
const labsLogo = 'bafkreifvb7tleo5jaidjjf6lfjxb5bpjbs2nswp47bi7zh3hxbpc6fjyf4';

const MainLayout = ({ children }: { children: JSX.Element }) => {
  return (
    <BaseProvider>
      <Html>
        <Head>
          <Font
            fontFamily="Roboto"
            fallbackFontFamily="Verdana"
            webFont={{
              url: 'https://fonts.gstatic.com/s/roboto/v27/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2',
              format: 'woff2',
            }}
            fontWeight={400}
            fontStyle="normal"
          />
        </Head>
        <Body className="text-white">
          <Container
            style={{
              backgroundImage: `url('${emailAssetsBaseUrl}/${cubertBkg}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
            className="relative w-full h-fit bg-opacity-50"
          >
            <Container className="backdrop-blur-2xl bg-opacity-50">
              <Section className="h-full backdrop-blur-lg w-full" align="center">
                <Img
                  src={`${emailAssetsBaseUrl}/${labsLogo}`}
                  width="193"
                  height="60"
                  alt="Desci Labs"
                  className="m-auto"
                />
              </Section>
              <Section>{children}</Section>
              <Text className="pl-3" style={{ color: 'gray' }}>
                If you didn't request this email, there's nothing to worry about, you can safely ignore it.
              </Text>
              <Row>
                <Column className="">
                  <Link href="https://desci.com" target="_blank" rel="noopener noreferrer">
                    <Img src={`${emailAssetsBaseUrl}/${labsLogo}`} width="135" height="42" alt="Desci Labs" />
                  </Link>
                </Column>
                <Column className="ml-auto border border-orange w-full pr-3 text-right">
                  <Link href="https://docs.desci.com" target="_blank" rel="noopener noreferrer">
                    Docs
                  </Link>
                  &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
                  <Link href="https://x.com/descilabs" target="_blank" rel="noopener noreferrer">
                    Twitter
                  </Link>
                  &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
                  <Link href="https://www.youtube.com/@descilabs" target="_blank" rel="noopener noreferrer">
                    Youtube
                  </Link>
                </Column>
              </Row>
              <Text className="text-center">©2024 Desci Nodes</Text>
            </Container>
          </Container>
        </Body>
      </Html>
    </BaseProvider>
  );
};

export default MainLayout;
