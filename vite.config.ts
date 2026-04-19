import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev / nginx proxy: allow your public hostname(s). Leading `.` = apex + all subdomains (e.g. www).
    allowedHosts: ['.agnos.it.com', 'agnos.it.com', 'www.agnos.it.com'],
    watch: {
      ignored: ['**/offline_ai_detector/.venv/**', '**/offline_ai_detector/artifacts/**']
    }
  },
  // `server.*` does NOT apply to `vite preview`. If prod uses preview behind nginx, this is required.
  preview: {
    allowedHosts: ['.agnos.it.com', 'agnos.it.com', 'www.agnos.it.com']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('@supabase/supabase-js')) {
              return 'vendor-supabase';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-framer-motion';
            }
            if (id.includes('@monaco-editor')) {
              return 'vendor-monaco';
            }
          }
        }
      }
    }
  }
})
