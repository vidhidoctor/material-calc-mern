import { z } from 'zod';
import { componentName } from '../designs/designs.validation.js';

export const createComponentNameBody = z.object({ name: componentName });
export const componentNameParams = z.object({ name: componentName });

export type CreateComponentNameInput = z.infer<typeof createComponentNameBody>;
