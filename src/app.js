import express from 'express';
import authRouter from './routes/auth.routes.js';
import leadsRouter from './routes/leads.routes.js';
import { errorHandler } from './utils/errors.js';

const app = express();

// Parse incoming JSON bodies
app.use(express.json());

// Health check / placeholder route
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
app.use('/auth', authRouter);

// Leads routes
app.use('/leads', leadsRouter);

// Global error handler (must be registered after all routes)
app.use(errorHandler);

export default app;
