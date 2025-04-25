import { Request, Response, NextFunction } from 'express';
import config from '../config';
import { createResponse } from '../utils';

/**
 * API key authentication middleware
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey || apiKey !== config.apiKey) {
    res.status(401).json(createResponse(false, 'Unauthorized: Invalid API key'));
    return;
  }

  next();
}

/**
 * Error handling middleware
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error(err.stack);
  
  res.status(500).json(createResponse(
    false,
    'An unexpected error occurred',
    undefined,
    {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }
  ));
}

/**
 * Validates client ID parameter
 */
export function validateClientId(req: Request, res: Response, next: NextFunction): void {
  const clientId = req.params.clientId || req.body.clientId || req.query.clientId as string;
  
  if (!clientId) {
    res.status(400).json(createResponse(false, 'Client ID is required'));
    return;
  }
  
  req.body.clientId = clientId;
  next();
}