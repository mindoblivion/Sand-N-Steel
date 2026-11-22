import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const largeChunkCompositionReport: import('vite').Plugin = {
  name: 'large-chunk-composition-report',
  apply: 'build',
  generateBundle(_options, bundle) {
    for (const item of Object.values(bundle)) {
      if (item.type !== 'chunk' || item.code.length < 500 * 1024) continue;
      const largestModules = Object.entries(item.modules)
        .map(([id, module]) => ({
          module: id.replace(`${process.cwd()}/`, ''),
          renderedBytes: module.renderedLength,
          originalBytes: module.originalLength,
        }))
        .sort((a, b) => b.renderedBytes - a.renderedBytes)
        .slice(0, 30);
      console.info(`[bundle-composition] ${item.fileName} (${item.code.length} bytes): ${JSON.stringify(largestModules)}`);
    }
  },
};

export default defineConfig(() => {
  return {
    plugins: [tailwindcss(), react(), largeChunkCompositionReport],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@react-three/fiber',
        '@react-three/drei',
        'three',
        'three-stdlib',
        'three/examples/jsm/utils/BufferGeometryUtils.js',
        'three/examples/jsm/utils/SkeletonUtils.js',
        'lucide-react',
        'canvas-confetti',
        'firebase/app',
        'firebase/auth',
      ],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
