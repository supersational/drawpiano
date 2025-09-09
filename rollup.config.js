import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/umd/drawkeyboard.js',
      format: 'umd',
      name: 'DrawKeyboard',
      sourcemap: true,
    },
    {
      file: 'dist/umd/drawkeyboard.min.js',
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
      outDir: 'dist/umd',
    }),
  ],
});
