import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import demoUsersRouter from './routes/demoUsers.js';
import flatsRouter from './routes/flats.js';
import expensesRouter from './routes/expenses.js';
import balancesRouter from './routes/balances.js';
import { errorHandler } from './middleware/errorHandler.js';
import { ApiError } from './errors/ApiError.js';

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Root / Health
  app.use('/api/health', healthRouter);
  app.use('/api/demo-users', demoUsersRouter);

  // Flat & Expense Operations
  app.use('/api/flats', flatsRouter);
  app.use('/api/flats', expensesRouter);
  app.use('/api/flats', balancesRouter);

  // 404 Handler
  app.use((_req, _res, next) => {
    next(ApiError.notFound('The requested endpoint was not found on this server.'));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export default createServer;
