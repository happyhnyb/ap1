import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Prevent accidental console.log left in production code
      'no-console':               ['warn', { allow: ['warn', 'error', 'info'] }],
      // Unused variables are almost always bugs
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Explicit any is occasionally necessary — warn but don't block
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Relax rules for test files
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
];

export default config;
