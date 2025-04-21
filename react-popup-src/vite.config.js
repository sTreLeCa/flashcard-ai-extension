// react-popup-src/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'; // Import the path module

export default defineConfig({
  plugins: [react()],
  build: {
    // Output to the parent directory (your main extension folder)
    outDir: path.resolve(__dirname, '..'),
    // VERY IMPORTANT: Prevent Vite from deleting manifest.json, background.js etc.
    emptyOutDir: false,
    rollupOptions: {
      output: {
        // Ensure the output JS file is named popup.js
        entryFileNames: 'popup.js',
        // Keep asset file names simple if needed (optional)
        assetFileNames: 'assets/[name].[ext]',
        chunkFileNames: "assets/[name].js",
      }
    }
  }
})