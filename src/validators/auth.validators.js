// validators/auth.validators.js
import { body } from 'express-validator';

export const registerValidators = [
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

  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required.')
    .isString()
    .withMessage('Password must be a string.')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.'),

  body('role')
    .exists({ checkFalsy: true })
    .withMessage('Role is required.')
    .isIn(['counselor', 'admin'])
    .withMessage('Role must be one of: counselor, admin.'),
];

export const loginValidators = [
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Must be a valid email address.'),

  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required.')
    .notEmpty()
    .withMessage('Password must not be empty.'),
];

export const refreshValidators = [
  body('refreshToken')
    .exists({ checkFalsy: true })
    .withMessage('Refresh token is required.')
    .notEmpty()
    .withMessage('Refresh token must not be empty.'),
];
