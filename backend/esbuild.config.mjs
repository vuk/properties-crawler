import * as esbuild from 'esbuild';

await esbuild.build({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/server.js',
    sourcemap: true,
    minify: process.env.NODE_ENV === 'production',
});
