import { Tailwind } from '@react-email/components';
import React from 'react';

const BaseProvider = ({ children }: { children: JSX.Element }) => {
  return (
    <Tailwind
      config={{
        theme: {
          extend: {
            colors: {
              primary: '#77dde4',
            },
          },
        },
      }}
    >
      {children}
    </Tailwind>
  );
};

export default BaseProvider;
