import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import apiRoutes from './routes/api';
import { errorHandler } from './middlewares';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the WhatsApp API Server!' });
});

// Routes
app.use('/api', apiRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handling
app.use(errorHandler);

export default app;