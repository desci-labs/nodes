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
} from '@react-email/components';
import React from 'react';

import BaseProvider from './BaseProvider.js';

export const emailAssetsBaseUrl = 'https://ipfs.desci.com/ipfs';
const cubertBkg = 'bafkreih6yx7ywj7trvpp45vergrnytad7ezsku75tefyro4qrrcfrrmrt4';
const labsLogo = 'bafkreifvb7tleo5jaidjjf6lfjxb5bpjbs2nswp47bi7zh3hxbpc6fjyf4';

const MainLayout = ({ children }: { children: JSX.Element }) => {
  return (
    <BaseProvider>
      <Body className="text-white">
        <Container
          style={{
            backgroundImage: `url('${emailAssetsBaseUrl}/${cubertBkg}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
          className="relative w-[700px] h-[800px] bg-opacity-50"
        >
          <Container className="backdrop-blur-2xl bg-opacity-50">
            {/* <Img
            className="fixed top-0 left-0 w-[800px] h-full object-cover z--1"
            src={`${baseUrl}${cubertBkg}`}
            alt="desci-background"
        /> */}
            <Section className="backdrop-blur-xl">
              <Img src={`${emailAssetsBaseUrl}/${labsLogo}`} width="193" height="60" alt="Desci Labs" />
            </Section>
            {children}
          </Container>
        </Container>
      </Body>
    </BaseProvider>
  );
};

export default MainLayout;
