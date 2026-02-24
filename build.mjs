import { build } from 'esbuild';

await build({
  entryPoints: ['src/handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: 'dist/handler.js',
  format: 'cjs',
  external: ['@aws-sdk/*'],
});
