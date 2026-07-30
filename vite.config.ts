import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    singleQuote: true,
    semi: false,
    trailingComma: 'all',
  },
  lint: {
    plugins: ['typescript'],
    jsPlugins: [
      {
        name: 'foldkit',
        specifier: '@foldkit/oxlint-plugin',
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: ['dist/**', 'repos/**', '**/*.d.ts', '.turbo/**'],
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'typescript/no-explicit-any': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
})
