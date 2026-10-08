import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { forgotPasswordBody, loginBody, resetPasswordBody, signupBody } from './auth.validation.js';

export const authRoutes = Router();

authRoutes.post('/signup', validate({ body: signupBody }), controller.signup);
authRoutes.post('/login', validate({ body: loginBody }), controller.login);
authRoutes.post('/logout', authenticate, controller.logout);
authRoutes.get('/me', authenticate, controller.me);
authRoutes.post('/forgot-password', validate({ body: forgotPasswordBody }), controller.forgotPassword);
authRoutes.post('/reset-password', validate({ body: resetPasswordBody }), controller.resetPassword);
