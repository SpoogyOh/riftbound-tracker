import { build } from 'esbuild';
await build({ entryPoints: ['src/cloud.ts'], bundle: true, format: 'iife', platform: 'browser',
  target: 'es2022', supported: { 'template-literal': false }, minify: true, outfile: 'cloud.js', legalComments: 'inline' });
console.log('TypeScript Supabase client bundled into cloud.js.');
