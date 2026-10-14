import { authService } from '../services/auth.service.js';

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    const user = await authService.register({ name, email, password, role });
    return res.status(201).json({
      message: 'User registered successfully.',
      user,
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const tokens = await authService.login({ email, password });
    return res.status(200).json(tokens);
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user.id);
    return res.status(200).json({
      message: 'Logged out successfully.',
    });
  } catch (err) {
    next(err);
  }
}

export const authController = {
  register,
  login,
  refresh,
  logout,
};
