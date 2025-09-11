import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default defineConfig({
  input: 'src/index.ts',
  output: [
    // ESM build
    {
      dir: 'dist/esm',
      format: 'esm',
      sourcemap: true,
      entryFileNames: 'index.js',
      exports: 'named',
    },
    // CJS build
    {
      dir: 'dist/cjs',
      format: 'cjs',
      sourcemap: true,
      entryFileNames: 'index.js',
      exports: 'named',
    },
    // UMD builds
    {
      file: 'dist/umd/drawpiano.js',
      format: 'umd',
      name: 'DrawKeyboard',
      sourcemap: true,
    },
    {
      file: 'dist/umd/drawpiano.min.js',
      format: 'umd',
      name: 'DrawKeyboard',
      sourcemap: true,
      plugins: [terser()],
    },
  ],
  plugins: [
    nodeResolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false,
    }),
  ],
});
