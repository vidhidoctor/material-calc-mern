import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './designs.controller.js';
import {
  componentParams,
  createDesignBody,
  designParams,
  listDesignsQuery,
  putComponentBody,
  updateDesignBody,
} from './designs.validation.js';

/** Mounted at /api/designs — the Punching Master. */
export const designsRoutes = Router();

designsRoutes.get('/', guard('PUNCHING_VIEW'), validate({ query: listDesignsQuery }), controller.list);
designsRoutes.post('/', guard('PUNCHING_CREATE'), validate({ body: createDesignBody }), controller.create);
designsRoutes.get('/:designNo', guard('PUNCHING_VIEW'), validate({ params: designParams }), controller.get);
designsRoutes.patch(
  '/:designNo',
  guard('PUNCHING_UPDATE'),
  validate({ params: designParams, body: updateDesignBody }),
  controller.update,
);
designsRoutes.delete('/:designNo', guard('PUNCHING_UPDATE'), validate({ params: designParams }), controller.remove);
designsRoutes.put(
  '/:designNo/components/:name',
  guard('PUNCHING_CREATE', 'PUNCHING_UPDATE'),
  validate({ params: componentParams, body: putComponentBody }),
  controller.putComponent,
);
designsRoutes.delete(
  '/:designNo/components/:name',
  guard('PUNCHING_UPDATE'),
  validate({ params: componentParams }),
  controller.removeComponent,
);
