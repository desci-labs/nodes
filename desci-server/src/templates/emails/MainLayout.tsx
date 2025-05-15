import { Body, Container, Column, Head, Html, Img, Link, Row, Section, Text, Font } from '@react-email/components';
import React from 'react';

import { BaseProvider } from './BaseProvider.js';

export const emailAssetsBaseUrl = 'https://pub.desci.com/ipfs';
// const cubertBkg = 'bafkreih6yx7ywj7trvpp45vergrnytad7ezsku75tefyro4qrrcfrrmrt4';
const labsLogo = 'bafkreie2jto3flk2r43yt545xrasftbsc2atp5eb7qcbsmhacm26k4wiz4';
const defaultFooterMsg = "If you didn't request this email, there's nothing to worry about, you can safely ignore it.";

const MainLayout = ({ children, footerMsg = defaultFooterMsg }: { children: JSX.Element; footerMsg?: string }) => {
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
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
        </Head>
        <Body className="text-black">
          <Container
            style={
              {
                // backgroundImage: `url('${emailAssetsBaseUrl}/${cubertBkg}')`,
                // backgroundSize: 'cover',
                // backgroundPosition: 'center',
                // backgroundRepeat: 'no-repeat',
              }
            }
            className="relative w-full h-fit bg-opacity-50"
          >
            <Container className="backdrop-blur-2xl bg-opacity-50">
              <Section className="h-full backdrop-blur-lg w-full" align="center">
                <Img
                  src={`${emailAssetsBaseUrl}/${labsLogo}`}
                  width="193"
                  height="60"
                  alt="Desci Labs"
                  className="m-auto invert mix-blend-difference"
                />
              </Section>
              <Section>{children}</Section>
              <Text className="pl-3" style={{ color: 'gray' }}>
                {footerMsg}
              </Text>
              <Row>
                <Column className="">
                  <Link href="https://desci.com" target="_blank" rel="noopener noreferrer">
                    <Img
                      src={`${emailAssetsBaseUrl}/${labsLogo}`}
                      width="135"
                      height="42"
                      alt="Desci Labs"
                      className="invert mix-blend-difference"
                    />
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
              <Text className="text-center">©{new Date().getFullYear()} DeSci Labs AG</Text>
            </Container>
          </Container>
        </Body>
      </Html>
    </BaseProvider>
  );
};

export default MainLayout;
