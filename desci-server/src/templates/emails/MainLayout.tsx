import { Body, Container, Column, Head, Html, Img, Link, Row, Section, Text, Font } from '@react-email/components';
import React from 'react';

import { BaseProvider } from './BaseProvider.js';

const emailAssetsBaseUrl = 'https://assets.desci.com';
// const cubertBkg = 'bafkreih6yx7ywj7trvpp45vergrnytad7ezsku75tefyro4qrrcfrrmrt4';
const labsLogo = 'logos/desci-labs-full-white.png';
const sciweaveLogo = 'logos/sciweave-logo-color.png';
const sciweaveText = 'logos/sciweave-text.png';
const defaultFooterMsg = "If you didn't request this email, there's nothing to worry about, you can safely ignore it.";

const MainLayout = ({
  children,
  footerMsg = defaultFooterMsg,
  isSciweave = false,
}: {
  children: JSX.Element;
  footerMsg?: string;
  isSciweave?: boolean;
}) => {
  // Debug log to track isSciweave value
  console.log('MainLayout render - isSciweave:', isSciweave);

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
                {isSciweave ? (
                  <Row style={{ margin: '0 auto', textAlign: 'center' }}>
                    <Column>
                      <div style={{ textAlign: 'center' }}>
                        <Img
                          src={`${emailAssetsBaseUrl}/${sciweaveLogo}`}
                          height="60"
                          alt="SciWeave Logo"
                          className="inline-block align-middle mr-2"
                        />
                        <Img
                          src={`${emailAssetsBaseUrl}/${sciweaveText}`}
                          height="25"
                          alt="SciWeave"
                          className="inline-block align-middle invert mix-blend-difference"
                        />
                      </div>
                    </Column>
                  </Row>
                ) : (
                  <Img
                    src={`${emailAssetsBaseUrl}/${labsLogo}`}
                    width="193"
                    height="60"
                    alt="Desci Labs"
                    className="m-auto invert mix-blend-difference"
                  />
                )}
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

export const baseStyles = {
  main: {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  container: {
    margin: '0 auto',
    padding: '0px 20px',
  },
  h1: {
    // color: '#000000',
    fontSize: '30px',
    fontWeight: '700',
    margin: '30px 0',
    padding: '0',
    lineHeight: '42px',
  },
};
