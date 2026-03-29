import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'

console.log('Mounting App...');
const container = document.getElementById('root');
if (!container) {
  console.error("Failed to find the root element");
} else {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log('App initialization complete.');
}
