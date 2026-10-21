import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// De app draait live op https://conqueston.nl/opkomst/ → base '/opkomst/'.
// Lokaal (npm run dev) op '/'. Overschrijven kan met VITE_BASE in .env of als omgevingsvariabele.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const base = env.VITE_BASE || (mode === 'production' ? '/opkomst/' : '/')
  return {
    base, plugins: [react()],
    // Firebase en React in eigen bestanden: veranderen zelden, dus blijven ze in de browsercache na een update.
    build: { rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
      { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
    ] } } } },
  }
})
