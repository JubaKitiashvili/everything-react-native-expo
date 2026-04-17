import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './tokens.css';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[@erne/monitor] Dashboard root element #root missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
