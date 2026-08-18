import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // This is a small internal tool (FullCalendar + Supabase + React Router
    // all bundled together); ~200kb gzipped is normal for that and not
    // worth code-splitting for a two-person app. Raised just to silence the
    // advisory warning, not because there's a real problem to fix.
    chunkSizeWarningLimit: 800,
  },
})
