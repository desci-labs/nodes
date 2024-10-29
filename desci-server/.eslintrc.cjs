module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    projectService: true,
    ecmaVersion: '2020',
    tsconfigRootDir: __dirname,
  },

  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:import-x/recommended',
    'plugin:import-x/typescript',
    'prettier',
    'plugin:prettier/recommended',
  ],

  plugins: ['@typescript-eslint'],

  rules: {
    // General
    // '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-empty-interface': 'off',

    // Imports
    'import-x/no-useless-path-segments': 'warn',
    'import-x/no-unused-modules': 'warn',
    // Too slow to enable by default
    'import-x/no-cycle': 'error',
    'import-x/namespace': 'off',
    'import-x/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
  },

  settings: {
    'import-x/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/', '/test'],
      },
      typescript: true,
      // node: true
    },
  },
};
