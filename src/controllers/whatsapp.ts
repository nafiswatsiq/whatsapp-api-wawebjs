import { Request, Response } from 'express';
import whatsAppService from '../services/whatsapp';
import { createResponse, formatPhoneNumber, validateRequiredFields } from '../utils';
import { SendMessageRequest, SendMediaRequest } from '../types';
import config from '../config';

export async function initializeClient(req: Request, res: Response): Promise<void> {
  try {
    const { clientId = config.defaultClientId } = req.body;
    
    whatsAppService.initClient(clientId);
    
    res.json(createResponse(true, `WhatsApp client ${clientId} initialization started`));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to initialize client', undefined, error.message));
  }
}

export async function getQRCode(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;
    
    const qrCode = whatsAppService.getQRCode(clientId);
    const clientReady = whatsAppService.isClientReady(clientId);
    
    if (clientReady) {
      res.json(createResponse(true, 'Client is already authenticated', { authenticated: true }));
      return;
    }
    
    if (!qrCode) {
      res.json(createResponse(false, 'QR code not available yet, please try again in a few seconds'));
      return;
    }
    
    res.json(createResponse(true, 'QR code retrieved successfully', { qrCode }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to get QR code', undefined, error.message));
  }
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;
    
    const client = whatsAppService.getClient(clientId);
    
    if (!client) {
      res.status(404).json(createResponse(false, `Client ${clientId} not found`));
      return;
    }
    
    res.json(createResponse(true, 'Client status retrieved', {
      id: client.id,
      ready: client.ready,
      qrCode: client.qrCode
    }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to get status', undefined, error.message));
  }
}

export async function getAllClients(req: Request, res: Response): Promise<void> {
  try {
    const clients = whatsAppService.getAllClientsInfo();
    
    res.json(createResponse(true, 'All clients retrieved', { clients }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to get clients', undefined, error.message));
  }
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;
    const { to, message, quotedMessageId, mentions } = req.body as SendMessageRequest;
    
    // Validate required fields
    const missingFields = validateRequiredFields({ to, message }, ['to', 'message']);
    if (missingFields.length > 0) {
      res.status(400).json(createResponse(
        false,
        `Missing required fields: ${missingFields.join(', ')}`
      ));
      return;
    }
    
    // Validate client
    if (!whatsAppService.isClientReady(clientId)) {
      res.status(400).json(createResponse(
        false,
        `Client ${clientId} is not ready or not authenticated`
      ));
      return;
    }
    
    // Format phone number if needed
    const formattedNumber = formatPhoneNumber(to);
    
    const result = await whatsAppService.sendMessage(
      clientId,
      formattedNumber,
      message,
      quotedMessageId,
      mentions
    );
    
    res.json(createResponse(true, 'Message sent successfully', {
      messageId: result.id._serialized,
      to: formattedNumber
    }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to send message', undefined, error.message));
  }
}

export async function sendMedia(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;
    const { to, caption, media, quotedMessageId, mentions } = req.body as SendMediaRequest;
    
    // Validate required fields
    const missingFields = validateRequiredFields({ to, media }, ['to', 'media']);
    if (missingFields.length > 0) {
      res.status(400).json(createResponse(
        false,
        `Missing required fields: ${missingFields.join(', ')}`
      ));
      return;
    }
    
    // Validate client
    if (!whatsAppService.isClientReady(clientId)) {
      res.status(400).json(createResponse(
        false,
        `Client ${clientId} is not ready or not authenticated`
      ));
      return;
    }
    
    // Format phone number if needed
    const formattedNumber = formatPhoneNumber(to);
    
    const result = await whatsAppService.sendMedia(
      clientId,
      formattedNumber,
      media,
      caption,
      quotedMessageId,
      mentions
    );
    
    res.json(createResponse(true, 'Media sent successfully', {
      messageId: result.id._serialized,
      to: formattedNumber
    }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to send media', undefined, error.message));
  }
}

export async function downloadMedia(req: Request, res: Response): Promise<void> {
  try {
    const { clientId, messageId } = req.params;
    
    // Validate client
    if (!whatsAppService.isClientReady(clientId)) {
      res.status(400).json(createResponse(
        false,
        `Client ${clientId} is not ready or not authenticated`
      ));
      return;
    }
    
    const media = await whatsAppService.downloadMedia(clientId, messageId);
    
    res.json(createResponse(true, 'Media downloaded successfully', media));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to download media', undefined, error.message));
  }
}

export async function logoutClient(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;
    
    await whatsAppService.logoutClient(clientId);
    
    res.json(createResponse(true, `Client ${clientId} logged out successfully`));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to logout client', undefined, error.message));
  }
}

export async function sendGroupMessage(req: Request, res: Response): Promise<void> {
  try {
    const { clientId, groupId } = req.params;
    const { message, quotedMessageId, mentions } = req.body as SendMessageRequest;
    
    // Validate required fields
    const missingFields = validateRequiredFields({ message }, ['message']); 
    if (missingFields.length > 0) {
      res.status(400).json(createResponse(
        false,
        `Missing required fields: ${missingFields.join(', ')}`
      ));
      return;
    }

    // Validate client
    if (!whatsAppService.isClientReady(clientId)) {
      res.status(400).json(createResponse(
        false,
        `Client ${clientId} is not ready or not authenticated`
      ));
      return;
    }

    const result = await whatsAppService.sendGroupMessage(
      clientId,
      groupId,
      message,
      quotedMessageId,
      mentions
    );

    res.json(createResponse(true, 'Group message sent successfully', {
      messageId: result.id._serialized,
    }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to send group message', undefined, error.message));
  }
}

export async function sendGroupMedia(req: Request, res: Response): Promise<void> {
  try {
    const { clientId, groupId } = req.params;
    const { caption, media, quotedMessageId, mentions } = req.body as SendMediaRequest;

    // Validate required fields
    const missingFields = validateRequiredFields({ media }, ['media']);
    if (missingFields.length > 0) {
      res.status(400).json(createResponse(
        false,
        `Missing required fields: ${missingFields.join(', ')}`
      ));
      return;
    }

    // Validate client
    if (!whatsAppService.isClientReady(clientId)) {
      res.status(400).json(createResponse(
        false,
        `Client ${clientId} is not ready or not authenticated`
      ));
      return;
    }

    const result = await whatsAppService.sendGroupMedia(
      clientId,
      groupId,
      media,
      caption,
      quotedMessageId,
      mentions
    );

    res.json(createResponse(true, 'Group media sent successfully', {
      messageId: result.id._serialized,
    }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to send group media', undefined, error.message));
  }
}

export async function createGroup(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;
    const { groupName, participants } = req.body;

    // Validate required fields
    const missingFields = validateRequiredFields({ groupName, participants }, ['groupName', 'participants']);
    if (missingFields.length > 0) {
      res.status(400).json(createResponse(
        false,
        `Missing required fields: ${missingFields.join(', ')}`
      ));
      return;
    }

    // Validate client
    if (!whatsAppService.isClientReady(clientId)) {
      res.status(400).json(createResponse(
        false,
        `Client ${clientId} is not ready or not authenticated`
      ));
      return;
    }

    const result = await whatsAppService.createGroup(clientId, groupName, participants);

    res.json(createResponse(true, 'Group created successfully', result));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to create group', undefined, error.message));
  }
}