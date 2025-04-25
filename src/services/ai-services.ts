import { createPartFromUri, createUserContent, GoogleGenAI } from "@google/genai";
import { Message } from "whatsapp-web.js";
import config from "../config";
import path from "path";
import fs from "fs";
import WhatsAppService from "./whatsapp";

const PROMPT_LOG_DIR = path.join(process.cwd(), 'prompt-logs');
const MEDIA_DIR = path.join(process.cwd(), 'media');

// Ensure prompt logs directory exists
if (!fs.existsSync(PROMPT_LOG_DIR)) {
  fs.mkdirSync(PROMPT_LOG_DIR, { recursive: true });
}

// Interface for conversation history
interface ConversationMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// Load conversation history from log file
async function loadConversationHistory(logFile: string): Promise<ConversationMessage[]> {
  try {
    if (fs.existsSync(logFile)) {
      const content = await fs.promises.readFile(logFile, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error loading conversation history:', error);
  }
  return [];
}

// Save conversation history to log file
async function saveConversationHistory(logFile: string, history: ConversationMessage[]): Promise<void> {
  try {
    await fs.promises.writeFile(logFile, JSON.stringify(history, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving conversation history:', error);
  }
}

async function getFilePath(clientId: string, message: Message): Promise<string> {
  const clientDir = path.join(MEDIA_DIR, clientId);
  const media = await message.downloadMedia();
  const extension = WhatsAppService.getExtensionFromMimeType(media.mimetype);
  const filename = `${message.id._serialized}${extension}`;
  const filePath = path.join(clientDir, filename);

  return filePath;
}

async function generateFromImage(filePath: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

    const image = await ai.files.upload({
      file: filePath,
    });

    if (!image.uri || !image.mimeType) {
      throw new Error("Failed to upload image: missing URI or MIME type");
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        createUserContent([
          "Ubah gambar ini menjadi teks dengan fokus pada akurasi. Jika ada kesalahan dalam pengenalan karakter, silakan perbaiki.",
          createPartFromUri(image.uri, image.mimeType),
        ]),
      ],
    });

    return response.text || 'Sorry, no response was generated.';
  } catch (error) {
    console.error('Error generating from image:', error);
    return 'Sorry, I encountered an error processing the image.';
  }
}

export async function aiServices(clientId: string, message: Message): Promise<string> {
  const logPrompt = path.join(PROMPT_LOG_DIR, `${clientId}-prompt.json`);
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const messageBody = message.body.replace(/@\w+/g, '');
  let responseImageGenerate = '';

  try {
    // Check for reset commands
    if (messageBody.trim().startsWith('/new') || messageBody.trim().startsWith('/baru')) {
      // Clear history by saving an empty array
      await saveConversationHistory(logPrompt, []);
      
      // Create a new chat without history
      const chat = ai.chats.create({
        model: "gemini-2.0-flash"
      });
      
      // Send a greeting message
      const response = await chat.sendMessage({
        message: "Hai Sapa aku!, dan tanyakan apakah saya bisa membantu? (jawab dengan hangat)"
      });
      
      // Get and save the initial chat history
      const currentHistory = chat.getHistory();
      const formattedHistory = currentHistory.map(item => ({
        role: (item.role || 'user') as 'user' | 'model',
        parts: [{ text: item.parts?.[0]?.text || '' }]
      }));
      
      await saveConversationHistory(logPrompt, formattedHistory);
      
      return response.text || 'Sorry, no response was generated.';
    }
    
    // Regular chat flow
    // Load previous conversation history
    const history = await loadConversationHistory(logPrompt);

    if (message.hasMedia) {
      const filePath = await getFilePath(clientId, message);

      responseImageGenerate = await generateFromImage(filePath);
      if (messageBody.trim() === '') {
        return responseImageGenerate;
      }
    }
    
    // Create a chat with history
    const chat = ai.chats.create({
      model: "gemini-2.0-flash",
      history: history
    });

    // Send the message and get response
    const response = await chat.sendMessage({
      message: `${messageBody} ${responseImageGenerate}`
    });
    
    // Get current chat history after sending message
    const currentHistory = chat.getHistory();
    
    // Convert history to match ConversationMessage format
    const formattedHistory = currentHistory.map(item => ({
      role: (item.role || 'user') as 'user' | 'model',
      parts: [{ text: item.parts?.[0]?.text || '' }]
    }));
    
    // Save the updated history
    await saveConversationHistory(logPrompt, formattedHistory);
    
    return response.text || 'Sorry, no response was generated.';
  } catch (error) {
    console.error('Error in AI service:', error);
    return 'Sorry, I encountered an error processing your request.';
  }
}