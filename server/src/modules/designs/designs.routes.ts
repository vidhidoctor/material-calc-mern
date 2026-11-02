import { Router } from 'express';
import { guard } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { audited, param } from '../audit/audit.middleware.js';
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
designsRoutes.post('/', guard('PUNCHING_CREATE'), validate({ body: createDesignBody }), audited({ action: 'DESIGN_CREATED', entity: 'Design', id: (_req, body) => (body as { designNo?: unknown } | undefined)?.designNo as string | undefined }), controller.create);
designsRoutes.get('/:designNo', guard('PUNCHING_VIEW'), validate({ params: designParams }), controller.get);
designsRoutes.get('/:designNo/breakdown', guard('PUNCHING_VIEW'), validate({ params: designParams }), controller.breakdown);
designsRoutes.patch(
  '/:designNo',
  guard('PUNCHING_UPDATE'),
  validate({ params: designParams, body: updateDesignBody }),
  // A renamed design is found by its new number afterwards.
  audited({ action: 'DESIGN_UPDATED', entity: 'Design', id: (req, body) => ((body as { designNo?: string } | undefined)?.designNo ?? String(req.params.designNo)) }),
  controller.update,
);
designsRoutes.delete('/:designNo', guard('PUNCHING_UPDATE'), validate({ params: designParams }), audited({ action: 'DESIGN_DELETED', entity: 'Design', id: param('designNo') }), controller.remove);
designsRoutes.put(
  '/:designNo/components/:name',
  guard('PUNCHING_CREATE', 'PUNCHING_UPDATE'),
  validate({ params: componentParams, body: putComponentBody }),
  audited({ action: 'COMPONENT_SAVED', entity: 'Design', id: param('designNo'), detail: param('name') }),
  controller.putComponent,
);
designsRoutes.delete(
  '/:designNo/components/:name',
  guard('PUNCHING_UPDATE'),
  validate({ params: componentParams }),
  audited({ action: 'COMPONENT_REMOVED', entity: 'Design', id: param('designNo'), detail: param('name') }),
  controller.removeComponent,
);
