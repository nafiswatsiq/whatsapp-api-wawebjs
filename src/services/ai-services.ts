import { createPartFromUri, createUserContent, GoogleGenAI, Modality } from "@google/genai";
import { Message } from "whatsapp-web.js";
import config from "../config";
import path from "path";
import fs from "fs";
import WhatsAppService from "./whatsapp";

const PROMPT_LOG_DIR = path.join(process.cwd(), 'prompt-logs');
const MEDIA_DIR = path.join(process.cwd(), 'media');

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

async function generateImage(prompt: string){
  try {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: `Generate an image ${prompt}`,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    if (!response.candidates || !response.candidates[0] || !response.candidates[0].content || !response.candidates[0].content.parts) {
      return {
        isText: true,
        result: 'Sorry, no valid response was generated.'
      }
    }

    for (const part of response.candidates[0].content.parts) {
      // Based on the part type, either show the text or save the image
      if (part.text) {
        return {
          isText: true,
          result: part.text,
        }
      } else if (part.inlineData && part.inlineData.data) {
        const imageData = part.inlineData.data;
        // Create ai-generated folder if it doesn't exist
        const aiGeneratedDir = path.join(MEDIA_DIR, 'ai-generated');
        if (!fs.existsSync(aiGeneratedDir)) {
          fs.mkdirSync(aiGeneratedDir, { recursive: true });
        }
        
        // Generate unique filename using timestamp
        const filename = `gemini-image-${Date.now()}.png`;
        const filePath = path.join(aiGeneratedDir, filename);
        
        // Save the image
        const buffer = Buffer.from(imageData, "base64");
        fs.writeFileSync(filePath, buffer);

        return {
          isText: false,
          result: `${config.appUrl}/media/ai-generated/${filename}`
        }
      } else {
        return {
          isText: true,
          result: 'Sorry, no valid response was generated.'
        }
      }
    }
  } catch (error) { 
    console.error('Error generating image:', error);
    return {
      isText: true,
      result: 'Sorry, I encountered an error generating the image.'
    }
  }
}

async function imegeEdit(filePath: string, prompt: string): Promise<{isText: boolean, result: string}> {
  try {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    const imageData = fs.readFileSync(filePath);
    const base64Image = imageData.toString("base64");

    const contents = [
      { text: `update the image ${prompt}` },
      {
        inlineData: {
          mimeType: "image/png",
          data: base64Image,
        },
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: contents,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    if (!response.candidates || !response.candidates[0] || !response.candidates[0].content || !response.candidates[0].content.parts) {
      return {
        isText: true,
        result: 'Sorry, no valid response was generated.'
      }
    }

    for (const part of response.candidates[0].content.parts) {
      // Based on the part type, either show the text or save the image
      if (part.text) {
        return {
          isText: true,
          result: part.text,
        }
      } else if (part.inlineData && part.inlineData.data) {
        const imageData = part.inlineData.data;
        // Create ai-generated folder if it doesn't exist
        const aiGeneratedDir = path.join(MEDIA_DIR, 'ai-generated');
        if (!fs.existsSync(aiGeneratedDir)) {
          fs.mkdirSync(aiGeneratedDir, { recursive: true });
        }
        
        // Generate unique filename using timestamp
        const filename = `gemini-image-${Date.now()}.png`;
        const filePath = path.join(aiGeneratedDir, filename);
        
        // Save the image
        const buffer = Buffer.from(imageData, "base64");
        fs.writeFileSync(filePath, buffer);

        return {
          isText: false,
          result: `${config.appUrl}/media/ai-generated/${filename}`
        }
      }
    }
  } catch (error) {
    console.error('Error generating from image:', error);
    return {
      isText: true,
      result: 'Sorry, I encountered an error processing the image.'
    };
  }

  return {
    isText: true,
    result: 'Sorry, I encountered an error processing the image.'
  }
}

export async function aiServices(clientId: string, message: Message): Promise<{isText: boolean, response: string}> {
  const from = message.from.replace(/@c\.us|@g\.us/g, '');
  const logPrompt = path.join(PROMPT_LOG_DIR, `${from}-prompt.json`);
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
      
      return {
        isText: true,
        response: response.text || 'Sorry, no response was generated.'
      }
    }

    // Check for image generation commands
    const imageGenerationTriggers = [
      'buat gambar',
      'create image',
      'buatkan gambar',
      '/gambar',
      '/buat-gambar'
    ];

    if (imageGenerationTriggers.some(trigger => messageBody.toLowerCase().includes(trigger))) {
      // Extract the prompt by removing the command
      let imagePrompt = messageBody;
      for (const trigger of imageGenerationTriggers) {
        imagePrompt = imagePrompt.replace(new RegExp(trigger, 'i'), '').trim();
      }
      
      if (imagePrompt) {
        const result = await generateImage(imagePrompt);
        if (!result) {
          return {
            isText: true,
            response: "Sorry, I encountered an error generating the image."
          }
        }
        
        if (!result.isText) {
          // Return the path to the generated image
          return {
            isText: false,
            response: result.result
          };
        } else {
          // Return the error message
          return {
            isText: true,
            response: result.result
          }
        }
      } else {
        return {
          isText: true,
          response: "Please provide a description for the image you want me to generate."
        }
      }
    }
    
    // Regular chat flow
    // Load previous conversation history
    const history = await loadConversationHistory(logPrompt);

    if (message.hasMedia) {
      const imageEditTriggers = [
        'ubah gambar',
        'edit gambar',
        'edit image',
        '/edit-gambar',
        '/ubah-gambar',
        '/edit-image',
      ]
      if (imageEditTriggers.some(trigger => messageBody.toLowerCase().includes(trigger))) {
        // Extract the prompt by removing the command
        let imagePrompt = messageBody;
        for (const trigger of imageEditTriggers) {
          imagePrompt = imagePrompt.replace(new RegExp(trigger, 'i'), '').trim();
        }
        
        if (imagePrompt) {
          const filePath = await getFilePath(clientId, message);
          const result = await imegeEdit(filePath, imagePrompt);
          if (!result) {
            return {
              isText: true,
              response: "Sorry, I encountered an error generating the image."
            }
          }
          
          if (!result.isText) {
            // Return the path to the generated image
            return {
              isText: false,
              response: result.result
            };
          } else {
            // Return the error message
            return {
              isText: true,
              response: result.result
            }
          }
        } else {
          return {
            isText: true,
            response: "Please provide a description for the image you want me to generate."
          }
        }
      } else {
        const filePath = await getFilePath(clientId, message);
  
        responseImageGenerate = await generateFromImage(filePath);
        if (messageBody.trim() === '') {
          return {
            isText: true,
            response: responseImageGenerate
          };
        }
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
    
    return {
      isText: true,
      response: response.text || 'Sorry, no response was generated.'
    };
  } catch (error) {
    console.error('Error in AI service:', error);
    return {
      isText: true,
      response: 'Sorry, I encountered an error processing your request.'
    }
  }
}