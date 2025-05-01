import path from "path";
import fs from "fs";
import config from "../config";

export function getWebhookUrl() {
  return config.webhookUrl;
}

export function getClientWebhookUrl(clientId: string) {
  const filePath = path.join(process.cwd(), 'client-webhooks', `${clientId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const data = fs.readFileSync(filePath, 'utf8');
  const config = JSON.parse(data);
  return config.webhookUrl;
}

export function setClientWebhookUrl(clientId: string, webhookUrl: string) {
  const dirPath = path.join(process.cwd(), 'client-webhooks');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const filePath = path.join(dirPath, `${clientId}.json`);
  const data = JSON.stringify({ clientId, webhookUrl }, null, 2);
  fs.writeFileSync(filePath, data, 'utf8');
}

export function deleteClientWebhookUrl(clientId: string) {
  const filePath = path.join(process.cwd(), 'client-webhooks', `${clientId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  } else {
    console.log(`File ${filePath} does not exist.`);
  }
}
