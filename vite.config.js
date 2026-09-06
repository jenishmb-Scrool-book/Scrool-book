import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Версия приезжает в код из package.json, чтобы не держать её в двух местах.
// Третье место — android/app/build.gradle: versionName правится вместе с этим,
// а versionCode ещё и обязан расти на каждую заливку в Play.
const {version} = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: {__APP_VERSION__: JSON.stringify(version)},
  plugins: [react()],
  base: './',                 // Capacitor грузит с file://-подобной схемы — пути должны быть относительными
  build: {outDir: 'dist'},
  test: {environment: 'jsdom', globals: true}
});

