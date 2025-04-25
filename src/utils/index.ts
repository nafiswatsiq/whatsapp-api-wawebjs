import { ApiResponse } from '../types';

/**
 * Create a standardized API response
 */
export function createResponse<T>(
  success: boolean,
  message: string,
  data?: T,
  error?: any
): ApiResponse<T> {
  return {
    success,
    message,
    data,
    error
  };
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse(str: string) {
  try {
    return JSON.parse(str);
  } catch (error) {
    return null;
  }
}

/**
 * Convert phone number to WhatsApp format
 */
export function formatPhoneNumber(phone: string): string {
  // Remove any non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Ensure it has country code
  if (!cleaned.startsWith('1') && !cleaned.startsWith('62') && !cleaned.startsWith('44')) {
    // Add default country code (e.g., Indonesia 62) if none exists
    cleaned = '62' + cleaned;
  }
  
  // Ensure it's in proper format for WhatsApp API
  if (!cleaned.endsWith('@c.us')) {
    cleaned = `${cleaned}@c.us`;
  }
  
  return cleaned;
}

/**
 * Validate required fields in request
 */
export function validateRequiredFields(obj: Record<string, any>, fields: string[]): string[] {
  const missingFields = fields.filter(field => !obj[field]);
  return missingFields;
}