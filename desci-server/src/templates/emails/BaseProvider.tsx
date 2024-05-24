import { Tailwind } from '@react-email/components';
import React from 'react';

export const BaseProvider = ({ children }: { children: JSX.Element }) => {
  return (
    <Tailwind
      config={{
        theme: {
          extend: {
            colors: {
              primary: '#28aac4;',
              'primary-hover': '#77dde4',
            },
          },
        },
      }}
    >
      {children}
    </Tailwind>
  );
};
