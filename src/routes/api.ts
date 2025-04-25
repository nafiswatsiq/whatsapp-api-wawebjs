import { Router } from 'express';
import * as whatsAppController from '../controllers/whatsapp';
import { apiKeyAuth, validateClientId } from '../middlewares';

const router = Router();

// Apply API key authentication to all routes
router.use(apiKeyAuth);

// Client management routes
router.post('/client', whatsAppController.initializeClient);
router.get('/client/:clientId/qr', validateClientId, whatsAppController.getQRCode);
router.get('/client/:clientId/status', validateClientId, whatsAppController.getStatus);
router.get('/clients', whatsAppController.getAllClients);
router.post('/client/:clientId/logout', validateClientId, whatsAppController.logoutClient);

// Messaging routes
router.post('/client/:clientId/message', validateClientId, whatsAppController.sendMessage);
router.post('/client/:clientId/media', validateClientId, whatsAppController.sendMedia);
router.get('/client/:clientId/media/:messageId', validateClientId, whatsAppController.downloadMedia);

// Group Messaging routes
router.post('/client/:clientId/group', validateClientId, whatsAppController.createGroup);
router.post('/client/:clientId/group/:groupId/message', validateClientId, whatsAppController.sendGroupMessage);
router.post('/client/:clientId/group/:groupId/media', validateClientId, whatsAppController.sendGroupMedia);
// router.post('/client/:clientId/group/:groupId/rename', validateClientId, whatsAppController.renameGroup);
// router.post('/client/:clientId/group/:groupId/add', validateClientId, whatsAppController.addToGroup);
// router.post('/client/:clientId/group/:groupId/remove', validateClientId, whatsAppController.removeFromGroup);

export default router;