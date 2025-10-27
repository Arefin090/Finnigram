module.exports = {
  root: true,
  extends: ['expo', 'prettier'],
  plugins: ['prettier', 'react-native', '@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    'react-native/react-native': true,
  },
  rules: {
    // Prettier formatting
    'prettier/prettier': 'error',

    // TypeScript rules (relaxed for development)
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // Disable problematic TypeScript rules that aren't available in current version
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/no-wrapper-object-types': 'off',

    // React rules (already included by expo)
    'react/react-in-jsx-scope': 'off', // Not needed with React 17+
    'react/prop-types': 'off', // Using TypeScript for prop validation
    'react-hooks/exhaustive-deps': 'warn',

    // React Native specific
    'react-native/no-unused-styles': 'error',
    'react-native/no-inline-styles': 'warn',
    'react-native/no-color-literals': 'off', // Allow color literals

    // General code quality (relaxed for development)
    'no-console': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    'no-debugger': 'error',
    'no-alert': 'warn',

    // Import rules
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
        'newlines-between': 'never',
      },
    ],
  },
  ignorePatterns: ['node_modules/', 'dist/', '.expo/', 'web-build/'],
};
