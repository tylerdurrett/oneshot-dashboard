import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { Providers } from '@/components/providers';
import { getRouter } from './router';
import './app/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={getRouter()} />
    </Providers>
  </StrictMode>,
);
