import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export default {
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  port: process.env.PORT || 3000,
  sessionPath: path.resolve(process.env.SESSION_PATH || './sessions'),
  defaultHeadless: process.env.HEADLESS !== 'false',
  apiKey: process.env.API_KEY || 'your-default-api-key',
  aiService: process.env.AI_SERVICE || 'gemini',
  defaultClientId: 'default-client',
  geminiApiKey: process.env.GEMINI_API_KEY || 'your-gemini-api-key',
  geminiTextGenerationModel: process.env.GEMINI_TEXT_GENERATION_MODEL || 'gemini-2.5-flash',
  geminiImageGenerationModel: process.env.GEMINI_IMAGE_GENERATION_MODEL || 'gemini-2.0-flash-preview-image-generation',
  webhookUrl: process.env.WEBHOOK_URL || null,
};