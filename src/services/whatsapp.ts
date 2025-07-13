import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import config from '../config';
import { WhatsAppClient, ClientInfo, DownloadedMedia, MessageLog } from '../types';
import { aiGEminiServices } from './ai-gemini-services';
import { getClientWebhookUrl, getWebhookMessageUrl } from '../utils/webhookUrl';
import axios from 'axios';

class WhatsAppService {
  private clients: Map<string, WhatsAppClient>;
  private readonly CLEANUP_INTERVAL = 120000; // 2 minutes in milliseconds
  private readonly MEDIA_DIR = path.join(process.cwd(), 'media');
  private readonly LOGS_DIR = path.join(process.cwd(), 'logs');
  private readonly PROMPT_LOG_DIR = path.join(process.cwd(), 'prompt-logs');
  private readonly CLIENT_WEBHOOKS = path.join(process.cwd(), 'client-webhooks');

  constructor() {
    this.clients = new Map();
    this.startCleanupInterval();
    this.ensureDirectories();
  }

   /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.MEDIA_DIR)) {
      fs.mkdirSync(this.MEDIA_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.LOGS_DIR)) {
      fs.mkdirSync(this.LOGS_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.PROMPT_LOG_DIR)) {
      fs.mkdirSync(this.PROMPT_LOG_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.CLIENT_WEBHOOKS)) {
      fs.mkdirSync(this.CLIENT_WEBHOOKS, { recursive: true });
    }
  }

  /**
   * Start cleanup interval for inactive clients
   */
  private startCleanupInterval(): void {
    setInterval(async () => {
      const now = Date.now();
      for (const [clientId, clientData] of [...this.clients.entries()]) {
        if (clientData.ready) {
          continue;
        }
        // PERIKSA: Apakah klien yang belum ready ini sudah dibuat lebih dari 2 menit yang lalu?
        // gunakan `initTimestamp` yang tidak pernah direset.
        if ((now - clientData.initTimestamp) > this.CLEANUP_INTERVAL) {
          console.log(`[CLEANUP] Removing client ${clientId}. QR code not scanned within ${this.CLEANUP_INTERVAL / 1000} seconds.`);
          try {
            await clientData.client.destroy();
            this.clients.delete(clientId); // Hapus dari daftar setelah berhasil dihancurkan.

            // Kirim webhook jika dikonfigurasi.
            const webhookUrl = config.webhookInactiveClientUrl;
            if (webhookUrl) {
              const payload = {
                clientId,
                ready: false,
                status: 'inactive_timeout'
              };
              
              axios.post(webhookUrl, payload)
                .then(() => console.log(`[CLEANUP] Inactive client webhook sent to ${webhookUrl}`))
                .catch(err => console.error(`[CLEANUP] Failed to send inactive client webhook:`, err.message));
            }
          } catch (error: any) {
            console.error(`[CLEANUP] Error destroying inactive client ${clientId}:`, error.message);
            // Tetap hapus dari daftar untuk menghindari upaya berulang pada klien yang bermasalah.
            this.clients.delete(clientId);
          }
        }
      }
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Log a message to file
   */
  private async logMessage(clientId: string, message: Message): Promise<void> {
    try {
      const logFile = path.join(this.LOGS_DIR, `${clientId}-messages.log`);
      const chat = await message.getChat();
      
      const log: MessageLog = {
        messageId: message.id._serialized,
        timestamp: new Date(message.timestamp * 1000),
        from: message.from,
        to: chat.isGroup ? chat.id._serialized : message.to,
        content: message.body,
        type: 'text',
        hasMedia: message.hasMedia
      };

      if (message.hasMedia) {
        const media = await message.downloadMedia();
        log.type = this.getMessageType(media.mimetype);
        
        if (log.type === 'image') {
          const mediaPath = await this.saveMedia(clientId, message.id._serialized, media);
          log.mediaPath = mediaPath;
        }
      }

      // Append to log file
      const logEntry = JSON.stringify(log) + '\n';
      await fs.appendFileSync(logFile, logEntry);

    } catch (error) {
      console.error('Error logging message:', error);
    }
  }

  /**
   * Save media to local storage
   */
  private async saveMedia(clientId: string, messageId: string, media: MessageMedia): Promise<string> {
    const clientDir = path.join(this.MEDIA_DIR, clientId);
    if (!fs.existsSync(clientDir)) {
      fs.mkdirSync(clientDir, { recursive: true });
    }

    const extension = this.getExtensionFromMimeType(media.mimetype);
    const filename = `${messageId}${extension}`;
    const filePath = path.join(clientDir, filename);

    const buffer = Buffer.from(media.data, 'base64');
    await fs.writeFileSync(filePath, buffer);

    return filePath;
  }

  /**
    * Get message type from mimetype
    */
  public getMessageType(mimetype: string): 'text' | 'image' | 'video' | 'audio' | 'document' {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    return 'document';
  }

    /**
   * Get file extension from mimetype
   */
  public getExtensionFromMimeType(mimetype: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'audio/mp3': '.mp3',
      'audio/ogg': '.ogg',
      'application/pdf': '.pdf'
    };
    return extensions[mimetype] || '.bin';
  }

  private async webhook(clientId: string, message: Message, client: Client): Promise<void> {
    const webhookUrl = getWebhookMessageUrl();
    if (webhookUrl) {
      const chat = await message.getChat();
      const mentions = await message.getMentions();

      const payload = {
        clientId,
        id: message.id,
        from: message.from,
        to: message.to,
        author: message.author,
        body: message.body,
        timestamp: message.timestamp,
        type: message.type,
        isGroup: chat.isGroup,
        isMentioned: mentions.find(m => m.id._serialized === client.info.wid._serialized) !== undefined,
        mentions: mentions.map(m => ({
          id: m.id._serialized,
          name: m.pushname || m.id.user
        }))
      }

      try {
        await axios.post(webhookUrl, payload);
        console.log(`Webhook sent to ${webhookUrl}`);
      } catch (err: any) {
        console.error(`Fail sending webhook to ${webhookUrl}`, err.message);
      }
    }
  }

  private async webhookClient(clientId: string, message: Message, client: Client): Promise<void> {
    const webhookUrl = getClientWebhookUrl(clientId);
    if (webhookUrl) {
      const chat = await message.getChat();
      const mentions = await message.getMentions();
      const payload = {
        clientId,
        id: message.id,
        from: message.from,
        to: message.to,
        author: message.author,
        body: message.body,
        timestamp: message.timestamp,
        type: message.type,
        isGroup: chat.isGroup,
        isMentioned: mentions.find(m => m.id._serialized === client.info.wid._serialized) !== undefined,
        mentions: mentions.map(m => ({
          id: m.id._serialized,
          name: m.pushname || m.id.user
        }))
      };
    
      try {
        await axios.post(webhookUrl, payload);
        console.log(`Webhook sent to ${webhookUrl}`);
      } catch (err: any) {
        console.error(`Fail sending webhook to ${webhookUrl}`, err.message);
      }
    }
  }

  /**
   * Initialize a WhatsApp client
   */
  public async initClient(clientId: string): Promise<void> {
    // If client exists, destroy it first
    if (this.clients.has(clientId)) {
      const existingClient = this.clients.get(clientId);
      if (existingClient) {
        console.log(`Destroying existing client ${clientId} before re-initializing.`);
        try {
          await existingClient.client.destroy(); // Tambah await
        } catch (e) {
          console.error(`Error destroying existing client ${clientId}:`, e);
        }
        this.clients.delete(clientId);
      }
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId,
        dataPath: config.sessionPath
      }),
      puppeteer: {
        headless: config.defaultHeadless,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage', 
          '--disable-accelerated-2d-canvas', 
          '--disable-gpu'
        ]
      }
    });

    const whatsappClient: WhatsAppClient = {
      id: clientId,
      client,
      ready: false,
      lastActivity: Date.now(),
      initTimestamp: Date.now()
    };

    this.setupClientEvents(whatsappClient);
    this.clients.set(clientId, whatsappClient);
    
    // Initialize the client
    client.initialize().catch(error => {
      console.error(`Failed to initialize client ${clientId}:`, error);
    });
  }

  /**
   * Set up client event handlers
   */
  private setupClientEvents(whatsappClient: WhatsAppClient): void {
    const { client, id } = whatsappClient;

    client.on('qr', async (qr) => {
      console.log(`QR RECEIVED for client ${id}`);
      try {
        // Generate QR code as base64 image
        const qrImage = await QRCode.toDataURL(qr);
        whatsappClient.qrCode = qrImage;
        whatsappClient.lastActivity = Date.now();

        const webhookUrl = config.webhookQrUrl;
        if (webhookUrl) {
          const payload = {
            clientId: id,
            qrCode: qrImage
          };
          
          await axios.post(webhookUrl, payload);
          console.log(`QR code webhook sent to ${webhookUrl}`);
        }
      } catch (error) {
        console.error(`Failed to generate QR code for client ${id}:`, error);
      }
    });

    client.on('ready', () => {
      console.log(`Client ${id} is ready!`);
      whatsappClient.ready = true;
      whatsappClient.qrCode = undefined;
      whatsappClient.lastActivity = Date.now();
    });

    client.on('authenticated', () => {
      console.log(`Client ${id} authenticated successfully`);
      whatsappClient.lastActivity = Date.now();

      const webhookUrl = config.webhookAuthenticatedUrl;
      if (webhookUrl) {
        const payload = {
          clientId: id,
          ready: true
        };
        
        axios.post(webhookUrl, payload)
          .then(() => console.log(`Authentication webhook sent to ${webhookUrl}`))
          .catch(err => console.error(`Failed to send authentication webhook to ${webhookUrl}`, err.message));
      }
    });

    client.on('auth_failure', (msg) => {
      console.error(`Client ${id} authentication failure:`, msg);
      whatsappClient.ready = false;
    });

    client.on('disconnected', async (reason) => {
      console.log(`Client ${id} disconnected, reason:`, reason);
      whatsappClient.ready = false;

      const webhookUrl = config.webhookDisconnectedUrl;
      if (webhookUrl) {
        const payload = {
          clientId: id,
          ready: false,
          reason: reason
        };
      
        axios.post(webhookUrl, payload)
          .then(() => console.log(`Disconnected webhook sent to ${webhookUrl}`))
          .catch(err => console.error(`Failed to send disconnected webhook to ${webhookUrl}`, err.message));
      }
      
      if (reason !== 'LOGOUT') {
        setTimeout(() => {
          console.log(`Attempting to reconnect client ${id}...`);
          client.initialize().catch(error => {
            client.destroy();
            this.clients.delete(id);
            console.error(`Failed to reconnect client ${id}:`, error);
          });
        }, 5000);
      } else {
        // Jika sesi tidak valid, hapus klien agar bisa di-scan ulang
        console.log(`Client ${id} session is invalid. Removing client.`);
        try {
          await client.destroy();
        } catch (e: any) {
          console.error(`Error during client destruction on disconnect: ${e.message}`);
        }
        this.clients.delete(id);
      }
      
    });

    // Handle incoming message, group messages and mentions
    client.on('message', async (message) => {
      try {
        console.log(`Received message from ${message.from}: ${message.body}`);
        // log message
        await this.logMessage(id, message);
        // webhook for all messages
        await this.webhook(id, message, client);
        // webhook for all messages by client
        await this.webhookClient(id, message, client);

        const chat = await message.getChat();
        // Check if message is from a group
        // const chat = await message.getChat();
        if (chat.isGroup) {
          const mentions = await message.getMentions();
          
          // Check if the client is mentioned
          const clientMention = mentions.find(mention => 
            mention.id._serialized === client.info.wid._serialized
          );

          if (clientMention) {
            // Get the sender's contact
            const contact = await message.getContact();
            const senderName = contact.pushname || contact.number;
            
            if (config.aiService === 'gemini' || config.aiService === 'GEMINI') {
              const reply = await aiGEminiServices(id, message);

              if (reply.isText) {
                // Reply with mention
                await message.reply(reply.response, undefined, {
                  mentions: [contact.id._serialized]
                });
              } else {
                this.sendGroupMedia(id, chat.id._serialized, reply.response, '', message.id._serialized);
              }
            } else {
              // Default behavior: reply with mention
              await message.reply(`@${senderName}, you mentioned me!`, undefined, {
                mentions: [contact.id._serialized]
              });
            }
          }
        }
      } catch (error) {
        console.error('Error handling group message:', error);
      }
    });
  }

  /**
   * Create a group
   */
  public async createGroup(
    clientId: string,
    groupName: string,
    participants: string[]
  ): Promise<any> {
    const clientData = this.clients.get(clientId);
    if (!clientData || !clientData.ready) {
      throw new Error(`Client ${clientId} is not ready`);
    }
    
    try {
      // format participants
      const formattedParticipants = participants.map(participant => {
        return participant.endsWith('@c.us') ? participant : `${participant}@c.us`;
      });
      
      // Verify all participants exist before creating the group
      const validParticipants = [];
      for (const participant of formattedParticipants) {
        try {
          const contact = await clientData.client.getContactById(participant);
          if (contact && contact.id && contact.id._serialized) {
            validParticipants.push(participant);
          } else {
            console.warn(`Invalid contact structure for: ${participant}`);
          }
        } catch (err) {
          console.warn(`Contact not found: ${participant}`);
        }
      }
      
      if (validParticipants.length === 0) {
        throw new Error('No valid participants found');
      }
  
      const result = await clientData.client.createGroup(groupName, validParticipants);
      return result;
    } catch (error: any) {
      console.error('Create group error:', error);
      throw new Error(`Failed to create group ${groupName}: ${error.message}`);
    }
  }
  /**
   * Send message to a group
   */
  public async sendGroupMessage(
    clientId: string,
    groupId: string,
    message: string,
    quotedMessageId?: string,
    mentions?: string[]
  ): Promise<any> {
    const clientData = this.clients.get(clientId);
    if (!clientData || !clientData.ready) {
      throw new Error(`Client ${clientId} is not ready`);
    }

    // Ensure group ID is in the correct format
    const formattedGroupId = groupId.endsWith('@g.us') ? groupId : `${groupId}@g.us`;

    const chat = await clientData.client.getChatById(formattedGroupId);
    if (!chat.isGroup) {
      throw new Error('Specified chat is not a group');
    }

    const options: any = {};
    if (mentions && mentions.length > 0) {
      // Get contact objects for mentions
      const contacts = await Promise.all(
        mentions.map(id => clientData.client.getContactById(
          id.endsWith('@c.us') ? id : `${id}@c.us`
        ))
      );
      options.mentions = contacts;
      
      // Concatenate mentions to the message string
      contacts.forEach(contact => {
        message += ` @${contact.id.user}`;
      });
    }

    // Handle quoted message
    if (quotedMessageId) {
      try {
        const quotedMessage = await clientData.client.getMessageById(quotedMessageId);
        options.quotedMessageId = quotedMessageId;
        return await chat.sendMessage(message, options);
      } catch (error) {
        console.error('Error getting quoted message:', error);
        return await chat.sendMessage(message, options);
      }
    }

    return await chat.sendMessage(message, options);
  }

  /**
   * Send media to a group
   */
  public async sendGroupMedia(
    clientId: string,
    groupId: string,
    media: string | MessageMedia,
    caption?: string,
    quotedMessageId?: string,
    mentions?: string[]
  ): Promise<any> {
    const clientData = this.clients.get(clientId);
    if (!clientData || !clientData.ready) {
      throw new Error(`Client ${clientId} is not ready`);
    }

    // Ensure group ID is in the correct format
    const formattedGroupId = groupId.endsWith('@g.us') ? groupId : `${groupId}@g.us`;

    const chat = await clientData.client.getChatById(formattedGroupId);
    if (!chat.isGroup) {
      throw new Error('Specified chat is not a group');
    }

    let messageMedia: MessageMedia;
    if (typeof media === 'string') {
      if (media.startsWith('http')) {
        messageMedia = await MessageMedia.fromUrl(media);
      } else {
        const filePath = path.resolve(media);
        if (!fs.existsSync(filePath)) {
          throw new Error('File not found');
        }
        
        const fileData = fs.readFileSync(filePath);
        const mimetype = this.getMimeType(filePath);
        const filename = path.basename(filePath);
        
        messageMedia = new MessageMedia(
          mimetype,
          fileData.toString('base64'),
          filename
        );
      }
    } else {
      messageMedia = new MessageMedia(
        media.mimetype,
        typeof media.data === 'string' ? media.data : String(media.data),
        media.filename
      );
    }

    const options: any = { caption };
    if (mentions && mentions.length > 0) {
      const contacts = await Promise.all(
        mentions.map(id => clientData.client.getContactById(
          id.endsWith('@c.us') ? id : `${id}@c.us`
        ))
      );
      options.mentions = contacts;

      // Concatenate mentions to the message string
      contacts.forEach(contact => {
        options.caption += ` @${contact.id.user}`;
      });
    }

    if (quotedMessageId) {
      try {
        const quotedMessage = await clientData.client.getMessageById(quotedMessageId);
        options.quotedMessageId = quotedMessageId;
        return await chat.sendMessage(messageMedia, options);
      } catch (error) {
        console.error('Error getting quoted message:', error);
        return await chat.sendMessage(messageMedia, options);
      }
    }

    return await chat.sendMessage(messageMedia, options);
  }

  /**
   * Get all clients info
   */
  public getAllClientsInfo(): ClientInfo[] {
    return Array.from(this.clients.values()).map(({ id, ready, qrCode }) => ({
      id,
      ready,
      qrCode
    }));
  }

  /**
   * Get a client by ID
   */
  public getClient(clientId: string): WhatsAppClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Check if a client exists and is ready
   */
  public isClientReady(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return !!client && client.ready;
  }

  /**
   * Get QR code for a client
   */
  public getQRCode(clientId: string): string | undefined {
    const client = this.clients.get(clientId);
    return client?.qrCode;
  }

  /**
   * Send a message
   */
  public async sendMessage(
    clientId: string,
    to: string,
    message: string,
    quotedMessageId?: string,
    mentions?: string[]
  ): Promise<any> {
    const clientData = this.clients.get(clientId);
    if (!clientData || !clientData.ready) {
      throw new Error(`Client ${clientId} is not ready`);
    }

    const options: any = {};
    
    // Handle mentions
    if (mentions && mentions.length > 0) {
      options.mentions = mentions.map(id => {
        if (!id.endsWith('@c.us')) {
          return `${id}@c.us`;
        }
        return id;
      });
    }

    // Handle quoted message
    if (quotedMessageId) {
      try {
        const quotedMessage = await clientData.client.getMessageById(quotedMessageId);
        options.quotedMessageId = quotedMessageId;
        return await quotedMessage.reply(message, undefined, options);
      } catch (error) {
        console.error('Error getting quoted message:', error);
        // If quoted message not found, send without quoting
        return await clientData.client.sendMessage(to, message, options);
      }
    } else {
      return await clientData.client.sendMessage(to, message, options);
    }
  }

  /**
   * Send media message
   */
  public async sendMedia(
    clientId: string,
    to: string,
    media: string | MessageMedia,
    caption?: string,
    quotedMessageId?: string,
    mentions?: string[]
  ): Promise<any> {
    const clientData = this.clients.get(clientId);
    if (!clientData || !clientData.ready) {
      throw new Error(`Client ${clientId} is not ready`);
    }

    let messageMedia: MessageMedia;
    
    if (typeof media === 'string') {
      // Check if it's a URL
      if (media.startsWith('http')) {
        messageMedia = await MessageMedia.fromUrl(media);
      } else {
        // Assume it's a file path
        const filePath = path.resolve(media);
        if (!fs.existsSync(filePath)) {
          throw new Error('File not found');
        }
        
        const fileData = fs.readFileSync(filePath);
        const mimetype = this.getMimeType(filePath);
        const filename = path.basename(filePath);
        
        messageMedia = new MessageMedia(
          mimetype,
          fileData.toString('base64'),
          filename
        );
      }
    } else {
      // It's already a MessageMedia object or compatible format
      messageMedia = new MessageMedia(
        media.mimetype,
        typeof media.data === 'string' ? media.data : String(media.data),
        media.filename
      );
    }

    const options: any = { caption };
    
    // Handle mentions
    if (mentions && mentions.length > 0) {
      options.mentions = mentions.map(id => {
        if (!id.endsWith('@c.us')) {
          return `${id}@c.us`;
        }
        return id;
      });
    }

    // Handle quoted message
    if (quotedMessageId) {
      try {
        const quotedMessage = await clientData.client.getMessageById(quotedMessageId);
        return await quotedMessage.reply(messageMedia, undefined, options);
      } catch (error) {
        console.error('Error getting quoted message:', error);
        // If quoted message not found, send without quoting
        return await clientData.client.sendMessage(to, messageMedia, options);
      }
    }

    return await clientData.client.sendMessage(to, messageMedia, options);
  }

  /**
   * Download media from a message
   */
  public async downloadMedia(clientId: string, messageId: string): Promise<DownloadedMedia> {
    const clientData = this.clients.get(clientId);
    if (!clientData || !clientData.ready) {
      throw new Error(`Client ${clientId} is not ready`);
    }

    const message = await clientData.client.getMessageById(messageId);
    if (!message.hasMedia) {
      throw new Error('Message does not contain media');
    }

    const media = await message.downloadMedia();
    return {
      filename: media.filename || `media_${Date.now()}`,
      mimetype: media.mimetype,
      data: media.data
    };
  }

  /**
   * Logout a client and remove it from the list
   */
  public async logoutClient(clientId: string): Promise<void> {
    const clientData = this.clients.get(clientId);
    if (!clientData) {
      throw new Error(`Client ${clientId} not found`);
    }

    await clientData.client.logout();
    this.clients.delete(clientId);
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.webp': 'image/webp',
      '.ogg': 'audio/ogg',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }
}

export default new WhatsAppService();