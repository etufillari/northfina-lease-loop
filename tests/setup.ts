// Runs before each component test file. Testing Library only cleans up by itself when test
// globals are on, and they are off here, so rendered components are removed after each test.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
