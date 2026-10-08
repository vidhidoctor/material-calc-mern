import { getEnv } from '../config/env.js';

const quiet = (): boolean => getEnv().NODE_ENV === 'test';

export const logger = {
  info(message: string): void {
    if (!quiet()) console.info(message);
  },
  error(message: string, error?: unknown): void {
    if (!quiet()) console.error(message, error);
  },
};
