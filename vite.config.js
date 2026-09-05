import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',                 // Capacitor грузит с file://-подобной схемы — пути должны быть относительными
  build: {outDir: 'dist'},
  test: {environment: 'jsdom', globals: true}
});
