import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/ui/globals.css';
import { OnboardingApp } from '../../src/ui/onboarding/onboarding-app';
import { AppStoreProvider } from '../../src/ui/state/app-store';

const root = document.getElementById('root');
if (!root) throw new Error('Thoughtline root is missing.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppStoreProvider>
      <OnboardingApp />
    </AppStoreProvider>
  </React.StrictMode>,
);
