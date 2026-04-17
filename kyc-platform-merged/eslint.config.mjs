import { dirname } from 'path';
import { fileURLToPath } from 'url';
import nextPlugin from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'public/uploads/**', 'components/layout/dist/**', 'lib/search/dist/**', 'mandi-service/**', 'tests/**', 'scripts/**', 'next-env.d.ts'],
  },
  nextPlugin.configs['core-web-vitals'],
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  }
);
