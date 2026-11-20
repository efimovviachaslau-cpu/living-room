import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// На GitHub Pages сайт живёт в /<имя репозитория>/, локально — в корне.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/living-room/' : '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
}));
