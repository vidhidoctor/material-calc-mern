import cors from 'cors';
import express, { type Express } from 'express';
import { getEnv } from './config/env.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { costingRoutes } from './modules/costing/costing.routes.js';
import { designsRoutes } from './modules/designs/designs.routes.js';
import { materialCategoriesRoutes } from './modules/material-categories/material-categories.routes.js';
import { materialsRoutes } from './modules/materials/materials.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { productionRoutes } from './modules/production/production.routes.js';
import { purchaseRoutes } from './modules/purchase/purchase.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';

export function createApp(): Express {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/materials', materialsRoutes);
  app.use('/api/material-categories', materialCategoriesRoutes);
  app.use('/api/designs', designsRoutes);
  app.use('/api/production', productionRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/purchase', purchaseRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/costing', costingRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
