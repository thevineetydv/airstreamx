import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
	  cssCodeSplit: false,
    // Enable code splitting for better caching and parallel loading
    rollupOptions: {
     output: {
  assetFileNames: (assetInfo) => {
    if (assetInfo.name?.endsWith('.css')) {
      return 'assets/style-[hash].css';
    }
    return 'assets/[name]-[hash][extname]';
  },

  manualChunks: (id) => {
          // Vendor chunks
if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
  return 'vendor-react';
}
if (id.includes('node_modules/react-router-dom')) {
  return 'router';
}
          if (id.includes('node_modules/chart.js') || id.includes('node_modules/react-chartjs-2')) {
            return 'charts';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'animation';
          }
          if (id.includes('node_modules/firebase')) {
            return 'firebase';
          }
          if (id.includes('node_modules/openai')) {
            return 'openai';
          }
          // Page components in separate chunks
          if (id.includes('pages/')) {
            const pageName = id.split('pages/')[1]?.split('.')[0];
            if (pageName && pageName !== 'HomeFeed' && pageName !== 'Watch') {
              return `page-${pageName}`;
            }
          }
        },
      },
    },
	minify: 'terser',
terserOptions: {
  compress: {
    drop_console: true,
    drop_debugger: true,
  }
},
    // Optimize chunk sizes
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      '/analytics': {
        target: process.env.VITE_API_BASE || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/videos': {
        target: process.env.VITE_API_BASE || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/upload': {
        target: process.env.VITE_API_BASE || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/live': {
        target: process.env.VITE_API_BASE || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/hls': {
        target: process.env.VITE_API_BASE || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
	  injectRegister: 'script-defer',
      includeAssets: ['favicon.ico', 'favicon-192x192.png', 'favicon-512x512.png'],
      manifest: {
        name: 'AirStreamX',
        short_name: 'AirStreamX',
        description: 'Music & Video Streaming Platform',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' },
        ]
      }
    }),
	    {
      name: 'non-blocking-css',
      transformIndexHtml(html) {
        return html.replace(
          /<link rel="stylesheet" href="([^"]+\.css)">/g,
          `<link rel="preload" as="style" href="$1" onload="this.onload=null;this.rel='stylesheet'">
          <noscript><link rel="stylesheet" href="$1"></noscript>`
        );
      }
    }
  ]
})
