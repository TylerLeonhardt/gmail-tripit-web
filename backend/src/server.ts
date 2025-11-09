import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { DatabaseManager } from './database';
import { createRouter } from './routes';

const app = express();
const PORT = process.env.PORT || 8000;

// Database setup
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/emails.db');
const db = new DatabaseManager(dbPath);

// Middleware
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Flight Email Classifier API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      nextBatch: '/api/emails/next-batch',
      review: '/api/emails/review',
      stats: '/api/stats',
      undo: '/api/emails/undo',
      search: '/api/emails/search',
    },
  });
});

// API routes
const router = createRouter(db);
app.use(router);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, _next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`✈️  Flight Email Classifier API`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${dbPath}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { app, db, server };
