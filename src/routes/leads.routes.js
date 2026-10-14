import { Router } from 'express';
import { leadsController } from '../controllers/leads.controller.js';
import {
  submitLeadValidators,
  createLeadValidators,
  reassignValidators,
} from '../validators/leads.validators.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

// Static routes before parameterized routes
router.post('/submit', submitLeadValidators, validate, leadsController.submit);
router.get('/unclaimed', authenticate, leadsController.getUnclaimed);
router.get('/my', authenticate, leadsController.getMy);

// Root routes (/leads)
router.post('/', authenticate, createLeadValidators, validate, leadsController.create);
router.get('/', authenticate, requireRole('admin'), leadsController.getAll);

// Parameterized routes
router.patch('/:id/claim', authenticate, leadsController.claim);
router.patch(
  '/:id/reassign',
  authenticate,
  requireRole('admin'),
  reassignValidators,
  validate,
  leadsController.reassign,
);

export default router;
