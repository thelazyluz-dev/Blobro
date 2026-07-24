import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build runs from any host or subpath (GitHub Pages
  // project sites, a subdirectory, or a bare domain) without reconfiguring.
  base: './',
  plugins: [react()],
});
