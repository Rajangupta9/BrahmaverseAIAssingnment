// validators/leads.validators.js
import { body } from 'express-validator';

export const submitLeadValidators = [
  body('name')
    .exists({ checkFalsy: true })
    .withMessage('Name is required.')
    .isString()
    .withMessage('Name must be a string.')
    .notEmpty()
    .withMessage('Name must not be empty.'),

  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Must be a valid email address.')
    .normalizeEmail(),

  body('courseInterest')
    .exists({ checkFalsy: true })
    .withMessage('Course interest is required.')
    .isString()
    .withMessage('Course interest must be a string.')
    .notEmpty()
    .withMessage('Course interest must not be empty.'),

  body('phone')
    .optional({ nullable: true })
    .isString()
    .withMessage('Phone must be a string.'),

  body('notes')
    .optional({ nullable: true })
    .isString()
    .withMessage('Notes must be a string.'),
];

export const createLeadValidators = [
  body('name')
    .exists({ checkFalsy: true })
    .withMessage('Name is required.')
    .isString()
    .withMessage('Name must be a string.')
    .notEmpty()
    .withMessage('Name must not be empty.'),

  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Must be a valid email address.')
    .normalizeEmail(),

  body('courseInterest')
    .exists({ checkFalsy: true })
    .withMessage('Course interest is required.')
    .isString()
    .withMessage('Course interest must be a string.')
    .notEmpty()
    .withMessage('Course interest must not be empty.'),

  body('phone')
    .optional({ nullable: true })
    .isString()
    .withMessage('Phone must be a string.'),

  body('notes')
    .optional({ nullable: true })
    .isString()
    .withMessage('Notes must be a string.'),
];

export const reassignValidators = [
  body('counselorId')
    .exists({ checkFalsy: true })
    .withMessage('Counselor ID is required.')
    .isUUID()
    .withMessage('counselorId must be a valid UUID.'),
];
