import { Request, Response } from 'express';
import { createResponse } from "../utils";
import { deleteClientWebhookUrl, getClientWebhookUrl, setClientWebhookUrl } from "../utils/webhookUrl";
import axios from 'axios';

export async function addWebhookUrl(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      res.status(400).json(createResponse(false, 'Webhook URL is required'));
      return;
    }

    setClientWebhookUrl(clientId, webhookUrl);
    res.json(createResponse(true, 'Webhook URL set successfully', { clientId, webhookUrl }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to set webhook URL', undefined, error.message));
  }
}

export async function deleteWebhookUrl(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;

    if (!clientId) {
      res.status(400).json(createResponse(false, 'Client ID is required'));
      return;
    }

    deleteClientWebhookUrl(clientId);
    res.json(createResponse(true, 'Webhook URL deleted successfully', { clientId }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to delete webhook URL', undefined, error.message));
  }
}

export async function getWebhookUrl(req: Request, res: Response): Promise<void> {
  try {
    const { clientId } = req.params;

    if (!clientId) {
      res.status(400).json(createResponse(false, 'Client ID is required'));
      return;
    }

    const webhookUrl = getClientWebhookUrl(clientId);
    if (!webhookUrl) {
      res.status(404).json(createResponse(false, 'Webhook URL not found'));
      return;
    }

    res.json(createResponse(true, 'Webhook URL retrieved successfully', { clientId, webhookUrl }));
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to retrieve webhook URL', undefined, error.message));
  }
}

export async function testWebhook(req: Request, res: Response): Promise<void> {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      res.status(400).json(createResponse(false, 'Webhook URL is required for testing'));
      return;
    }

    // Simulate a test callback
    const payload = {
      message: 'This is a test callback',
      timestamp: new Date().toISOString()
    };
    axios.post(webhookUrl, payload)
      .then(() => {
        res.json(createResponse(true, 'Test callback sent successfully', { webhookUrl }));
      })
      .catch((error) => {
        res.status(500).json(createResponse(false, 'Failed to send test callback', undefined, error.message));
      });
  } catch (error: any) {
    res.status(500).json(createResponse(false, 'Failed to perform test callback', undefined, error.message));
  }
}

