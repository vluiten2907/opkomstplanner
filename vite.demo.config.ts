import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Draait de app met een nep-Firebase in de browser (geen project nodig): npm run demo
const fake = fileURLToPath(new URL('./test/fake-firebase.ts', import.meta.url));
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: { alias: [{ find: /^firebase\/(app|auth|firestore)$/, replacement: fake }] },
  define: { 'import.meta.env.VITE_FB_API_KEY': '"demo"', 'import.meta.env.VITE_FB_PROJECT_ID': '"demo"' },
});
