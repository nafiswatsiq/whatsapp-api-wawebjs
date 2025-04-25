import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export default {
  port: process.env.PORT || 3000,
  sessionPath: path.resolve(process.env.SESSION_PATH || './sessions'),
  defaultHeadless: process.env.HEADLESS !== 'false',
  apiKey: process.env.API_KEY || 'your-default-api-key',
  defaultClientId: 'default-client'
};