# WhatsApp API Bot

A robust WhatsApp API bot built with TypeScript, Express, and whatsapp-web.js that allows for multiple sessions, message sending, media handling, and more.

## Features

- 🔐 Multiple WhatsApp sessions with LocalAuth
- 📱 QR code generation for authentication
- 💬 Send text messages and replies
- 📷 Send and download media (images, videos, documents)
- 👤 Mention users in messages
- 🔄 Connection status monitoring
- 🔒 API key authentication
- ✨ AI conversation
- 🪄 AI image generate and Edit Image generate
- 🔁 Webhook chat

## Prerequisites

- Node.js (v14+)
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on the example:

```
APP_URL=http://localhost:3000
PORT=3000
SESSION_PATH=./sessions
HEADLESS=true
API_KEY=your-api-key-change-this-in-production
GEMINI_API_KEY=
WEBHOOK_URL=
```

4. Build the TypeScript code:

```bash
npm run build
```

## Usage

### Start the server

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Using AI
- get api key from https://aistudio.google.com/
- tag client on group
- use /new or /baru for new conversation

## Using Webhook
- to get all chat webhook set `WEBHOOK_URL` in `.env`
- You can get chat webhooks by client by registering a url webhook via the API 

### API Endpoints

#### Client Management

- `POST /api/client` - Initialize a new WhatsApp client
- `GET /api/client/:clientId/qr` - Get QR code for authentication
- `GET /api/client/:clientId/status` - Check client connection status
- `GET /api/clients` - Get all clients
- `POST /api/client/:clientId/logout` - Logout a client

#### Messaging

- `POST /api/client/:clientId/message` - Send a text message
- `POST /api/client/:clientId/media` - Send media message
- `GET /api/client/:clientId/media/:messageId` - Download media from a message

### Request Examples

Initialize a client:
```bash
curl -X POST http://localhost:3000/api/client \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"clientId": "my-client"}'
```

Get QR code:
```bash
curl -X GET http://localhost:3000/api/client/my-client/qr \
  -H "x-api-key: your-api-key"
```

Send a message:
```bash
curl -X POST http://localhost:3000/api/client/my-client/message \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "to": "6281234567890",
    "message": "Hello from the API!"
  }'
```