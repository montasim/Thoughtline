import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/ui/globals.css';
import { TermsApp } from '../../src/ui/terms/terms-app';

const root = document.getElementById('root');
if (!root) throw new Error('Thoughtline terms root is missing.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <TermsApp />
  </React.StrictMode>,
);
