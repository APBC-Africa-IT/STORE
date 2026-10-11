import { Router } from 'express';
import { asyncWrap } from '../../middleware/asyncWrap.js';
import { protectRoute } from '../../middleware/authMiddleware.js';
import * as ctrl from './auth.controller.js';

const router = Router();

// Public
router.post('/register',           asyncWrap(ctrl.register));
router.get( '/verify/:userId/:token', asyncWrap(ctrl.verifyEmail));
router.post('/login',              asyncWrap(ctrl.login));
router.post('/2fa/verify',         asyncWrap(ctrl.completeTwoFactor));
router.post('/refresh',            asyncWrap(ctrl.refresh));
router.post('/logout',             asyncWrap(ctrl.logout));
router.post('/password/forgot',    asyncWrap(ctrl.requestPasswordReset));
router.post('/password/reset/:token', asyncWrap(ctrl.resetPassword));
router.post('/otp/request',        asyncWrap(ctrl.requestOtp));
router.post('/otp/verify',         asyncWrap(ctrl.verifyOtp));

// Protected
router.get( '/me',                 protectRoute, asyncWrap(ctrl.getMe));
router.post('/2fa/setup',          protectRoute, asyncWrap(ctrl.setupTotp));
router.post('/2fa/enable',         protectRoute, asyncWrap(ctrl.enableTotp));
router.post('/2fa/disable',        protectRoute, asyncWrap(ctrl.disableTotp));

export default router;
