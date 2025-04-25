import app from './app';
import config from './config';
import fs from 'fs';
import path from 'path';

// Ensure session directory exists
const sessionDir = config.sessionPath;
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

const PORT = config.port;

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp API Server running on port ${PORT}`);
  console.log(`Session data will be stored in: ${sessionDir}`);
});