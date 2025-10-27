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
    node: true,
    es2022: true,
    jest: true
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
    '@typescript-eslint/explicit-function-return-type': 'off', // Too verbose for Node.js
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error', // Strict - no any types
    '@typescript-eslint/no-non-null-assertion': 'error',
    
    // General rules - all as ERRORS
    'no-unused-vars': 'off', // Use TypeScript version instead
    'no-console': 'error', // No console.log in production code
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'no-duplicate-imports': 'error'
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
  
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