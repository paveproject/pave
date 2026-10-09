import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../apps/api/.openapi/openapi.json',
  output: 'src/__generated__',
  plugins: ['@tanstack/react-query'],
});
