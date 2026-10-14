import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import {
  registerValidators,
  loginValidators,
  refreshValidators,
} from '../validators/auth.validators.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', registerValidators, validate, authController.register);
router.post('/login', loginValidators, validate, authController.login);
router.post('/refresh', refreshValidators, validate, authController.refresh);
router.post('/logout', authenticate, authController.logout);

export default router;
