module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'plugin:prettier/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  env: {
    es2022: true,
    node: true
  },
  rules: {
    // Prettier integration
    'prettier/prettier': 'error',
    
    // TypeScript specific rules - all as ERRORS
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_', 
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true 
    }],
    '@typescript-eslint/explicit-function-return-type': 'off', // Too verbose for React Native
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error', // Strict - no any types
    '@typescript-eslint/no-non-null-assertion': 'error',
    
    // General rules - all as ERRORS
    'no-unused-vars': 'off', // Use TypeScript version instead
    'no-console': 'off', // Allow console in mobile development
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'no-duplicate-imports': 'error'
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '.expo/', 'web-build/'],
  
  // Override for specific file patterns
  overrides: [
    {
      files: ['**/*.js'],
      extends: ['eslint:recommended'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off'
      }
    }
  ]
};