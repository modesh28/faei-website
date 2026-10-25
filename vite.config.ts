import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Older phones (iOS 13+, Android Chrome 80+) still get working JavaScript.
  build: {
    target: ['es2019', 'safari13', 'chrome80', 'firefox78'],
    // The admin page (/admin) is a separate page, so the public site never loads its code.
    rollupOptions: { input: { main: 'index.html', admin: 'admin/index.html' } },
  },
});
