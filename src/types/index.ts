import { Client, Message, MessageMedia } from 'whatsapp-web.js';

export interface WhatsAppClient {
  id: string;
  client: Client;
  ready: boolean;
  qrCode?: string;
  lastActivity?: number;
}

export interface SendMessageRequest {
  to: string;
  message: string;
  quotedMessageId?: string;
  mentions?: string[];
}

export interface SendMediaRequest {
  to: string;
  caption?: string;
  media: string | { data: string; mimetype: string; filename?: string };
  quotedMessageId?: string;
  mentions?: string[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

export interface ClientInfo {
  id: string;
  ready: boolean;
  qrCode?: string;
}

export interface DownloadedMedia {
  filename: string;
  mimetype: string;
  data: string; // Base64 encoded
}

export interface MessageLog {
  messageId: string;
  timestamp: Date;
  from: string;
  to: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  hasMedia: boolean;
  mediaPath?: string;
}