import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

export interface CreateAiAgentDto {
  name: string;
  prompt?: string;
  instructionPrompt?: string;
  unavailableMessage?: string;
  model?: string;
  isActive?: boolean;
}

export interface UpdateAiAgentDto extends Partial<CreateAiAgentDto> {}

export interface SystemPredefinedMessages {
  imageReceivedMessage: string;
  voiceReceivedMessage: string;
}

@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly logger = new Logger(AiAgentService.name);
  private systemMessagesCache: SystemPredefinedMessages | null = null;
  private systemMessagesCacheExpiry: number = 0;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.prisma.ensureConnected();
    // Ensure default agent rows exist so the frontend toggles can take effect.
    try {
      await this.initializeDefaultAgents();
    } catch (error) {
      const e = error as any;
      if (e?.code === 'P2021') {
        this.logger.warn(
          'Skipping default AI agent initialization: table "ai_agents" does not exist yet. Run Prisma migrations.'
        );
        return;
      }
      throw error;
    }
  }

  async createAgent(createAgentDto: CreateAiAgentDto): Promise<any> {
    this.logger.log(`Creating new AI agent: ${createAgentDto.name}`);
    
    const agent = await this.prisma.aiAgent.create({
      data: createAgentDto,
    });

    this.logger.log(`✅ AI Agent created: ${agent.name} (ID: ${agent.id})`);
    return agent;
  }

  async getAllAgents(): Promise<any[]> {
    return await this.prisma.aiAgent.findMany({
      orderBy: [
        { createdAt: 'desc' }
      ]
    });
  }

  async getActiveAgents(): Promise<any[]> {
    return await this.prisma.aiAgent.findMany({
      where: { isActive: true },
      orderBy: [
        { createdAt: 'desc' }
      ]
    });
  }

  async getAgentById(id: string): Promise<any | null> {
    return await this.prisma.aiAgent.findUnique({
      where: { id }
    });
  }

  async updateAgent(id: string, updateAgentDto: UpdateAiAgentDto): Promise<any> {
    this.logger.log(`Updating AI agent: ${id}`);
    const updated = await this.prisma.aiAgent.update({
      where: { id },
      data: {
        ...updateAgentDto,
      }
    });
    this.logger.log(`✅ AI Agent updated: ${updated.name}`);
    return updated;
  }

  async deleteAgent(id: string): Promise<void> {
    this.logger.log(`Deleting AI agent: ${id}`);
    await this.prisma.aiAgent.delete({ where: { id } });
  }

  async toggleAgentStatus(id: string): Promise<any> {
    const agent = await this.prisma.aiAgent.findUnique({ where: { id } });
    if (!agent) {
      throw new Error(`Agent with ID ${id} not found`);
    }

    const updated = await this.prisma.aiAgent.update({
      where: { id },
      data: { isActive: !agent.isActive },
    });

    this.logger.log(`✅ Toggled agent ${updated.name} to isActive=${updated.isActive}`);
    return updated;
  }

  async updateAgentStatus(id: string, isActive: boolean): Promise<any> {
    const updated = await this.prisma.aiAgent.update({
      where: { id },
      data: { isActive },
    });

    this.logger.log(`✅ Updated agent ${updated.name} isActive=${updated.isActive}`);
    return updated;
  }

  async updateAgentStats(id: string, conversationCount: number = 0, messageCount: number = 0): Promise<any> {
    // Deprecated stats
    return null;
  }

  async getBestAgent(): Promise<any | null> {
    const allAgents = await this.getAllAgents();
    return allAgents.length > 0 ? allAgents[0] : null;
  }

  async getAgentByName(name: string): Promise<any | null> {
    return await this.prisma.aiAgent.findFirst({
      where: { name },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async getActiveAgentByName(name: string): Promise<any | null> {
    return await this.prisma.aiAgent.findFirst({
      where: { name, isActive: true },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async initializeDefaultAgents(): Promise<void> {
    this.logger.log('🤖 Initializing default AI agents...');

    const llmModel = this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    const embeddingModel = this.configService.get<string>('GEMINI_EMBEDDING_MODEL') || 'gemini-embedding-2-preview';

    const defaults = [
      { 
        name: 'Text Agent', 
        model: llmModel,
        prompt: `You are the "Product Information Specialist" for Frooxi. Your ONLY job is to provide product details, answer questions, and help customers explore products.
STRATEGY:
1. PRODUCT INFO: Provide details about products (price, material, sizes, colors, availability) from the AVAILABLE_PRODUCTS_DATA.
2. NO IMAGE REPETITION: Check the "Conversation History". If an image URL was already sent recently, do NOT include it again.
3. NO HALLUCINATION: Only use AVAILABLE_PRODUCTS_DATA. Never invent product details.
4. ENCOURAGE PURCHASE: If a customer shows interest, end with "Would you like to order this?" but do NOT collect order details yourself. The order system will handle that separately.
5. SINGLE PRODUCT FOCUS: If the user asks about a specific product, ONLY talk about THAT product. Do not mention others.
RULES:
- CURRENCY: Always BDT.
- FORMAT: Plain text only (no markdown, no bold, no italics, no headers).
- IMAGES: Include Image URLs ONLY for products that are NEW to the conversation.
- YOU DO NOT HANDLE ORDERS. If a user says "I want to buy", simply say "Great choice! Let me connect you with our ordering system." The system will automatically route them.
- If no products match, say "I could not find that item."
- [CRITICAL - PRODUCT METADATA]: Each product in AVAILABLE_PRODUCTS_DATA contains a 'metadata' object with rich details. YOU MUST check this object to answer specific questions about stock, materials, brands, etc.`,
        instructionPrompt: `[INFO AGENT INSTRUCTION]
1. You are an INFORMATION-ONLY agent. You provide product details, answer questions, and help customers browse.
2. [CRITICAL] USE ONLY PLAIN TEXT. NO BOLD (**), NO ITALICS (_), NO HEADERS (#). Use simple dashes (-) for lists.
3. [ABSOLUTE BAN]: You are FORBIDDEN from collecting order details (name, phone, address). That is the Order Agent's job.
4. [ABSOLUTE BAN]: You are FORBIDDEN from suggesting unrelated products. Talk about ONLY what the user is asking about.
5. If exact products are found, mention ONLY those. Do not dump the catalog.
6. If the user says they want to buy/order, respond with enthusiasm but let the system handle the order routing. Say something like: "Excellent choice! Let me get that order started for you."
7. Mention delivery info if relevant: "Inside Dhaka delivery 70 BDT, Outside Dhaka 130 BDT".
8. Each product's details should include its image URLs when first mentioned.`,
        unavailableMessage: "Our text chat system is currently turned off for maintenance. Our admin team has been notified and will be available soon! 🙏"
      },
      { 
        name: 'Visual Agent', 
        model: embeddingModel,
        prompt: `You are the "Visual Product Matcher" for Frooxi. Your ONLY job is to identify products from images and provide information about them.
STRATEGY:
1. IDENTIFY: Tell the user what product you found that matches their image.
2. PROVIDE INFO: Share the product name, price, available sizes, colors, and material.
3. NO REPETITION: Do not repeat image URLs that were already sent in the history.
4. ENCOURAGE: If they seem interested, say "Would you like to order this?" but do NOT collect order details yourself.
5. FORMAT: Plain text only (no markdown).
6. NO HALLUCINATION: Only use the product data provided to you.`,
        unavailableMessage: "Our image search system is currently turned off for maintenance. Please try sending a text description instead, or our admin team will assist you shortly! 🙏"
      },
      { 
        name: 'Voice Agent', 
        model: llmModel,
        prompt: `You are the "Voice Assistant" for Frooxi. Your goal is to process audio messages, understand what the customer wants, and provide product information.
STRATEGY:
1. LANGUAGE MIRRORING: You MUST respond in the SAME LANGUAGE as the user's voice note.
2. CONCISE RESPONSES: Voice users prefer quick, clear answers.
3. PERSONAL TOUCH: Acknowledge that you heard their voice message.
4. INFO ONLY: Provide product details and answer questions. Do NOT collect order details (name, address, phone) — that is the Order Agent's job.
5. NO REPETITION: Check the "Conversation History" to avoid repeating information.`,
        instructionPrompt: `[VOICE INFO INSTRUCTION]
1. Respond in the same language as the user's voice note.
2. [CRITICAL] USE ONLY PLAIN TEXT.
3. You are an INFORMATION-ONLY agent. Do NOT collect order details.
4. If the user wants to buy something, say "Great! Let me start your order." The system will handle routing.
5. Include image URLs for products being discussed.`,
        unavailableMessage: "Our voice system is currently turned off for maintenance. Please try sending a text message instead, or our admin team will assist you shortly! 🙏"
      },
      {
        name: 'Order Agent',
        model: llmModel,
        prompt: `You are the "Order Collection Specialist" for Frooxi. Your ONLY job is to collect the customer's order details and finalize their purchase.
You are given the PRODUCT the customer wants to buy in the context. Do NOT suggest other products.

STRATEGY:
1. ACKNOWLEDGE: Start by confirming which product the customer wants. Example: "Great choice! Let's get your order for the [Product Name] set up."
2. CHECK HISTORY: Look at the conversation history. The customer may have ALREADY provided some details (like size, color). Do NOT ask for details they already gave. Acknowledge what you already know.
3. COLLECT MISSING DETAILS: Ask for ONLY the details that are still missing. The required details are:
   - Full Name
   - Phone Number
   - Email (optional but ask once)
   - Full Delivery Address (with Thana/District)
   - Product Size (if not already specified)
   - Product Color (if not already specified)
   - Quantity (default 1 if not specified)
4. BE EFFICIENT: If the user provides multiple details in one message, acknowledge ALL of them. Never ask for something they just told you.
5. FINALIZE: Once you have ALL details, confirm the order summary and include the [ORDER_READY] tag.

RULES:
- CURRENCY: Always BDT.
- FORMAT: Plain text only (no markdown, no bold, no italics).
- Mention: "Inside Dhaka delivery 70 BDT, Outside Dhaka 130 BDT".
- NEVER suggest or mention other products. You are here to close THIS order only.`,
        instructionPrompt: `[ORDER AGENT INSTRUCTION]
1. You are the ORDER COLLECTION agent. Your sole purpose is to collect order details efficiently.
2. [CRITICAL] USE ONLY PLAIN TEXT. NO BOLD, NO ITALICS, NO HEADERS.
3. [CRITICAL - HISTORY AWARENESS]: Before asking ANY question, CHECK the conversation history. If the user already said "size S" or "my name is X", DO NOT ask again. Acknowledge it and move to the NEXT missing field.
4. [ORDER_READY TAG]: When ALL order details are collected (name, phone, address, size, color, quantity), you MUST append exactly one [ORDER_READY: {...}] tag at the END of your message. This tag is INVISIBLE to the user and is used by the system to create the order.
   Use this EXACT format:
   [ORDER_READY: {
     "customerName": "N", "phone": "P", "email": "E",
     "deliveries": [
       {
         "location": "Full Address (Thana/District)",
         "items": [ {"productId": "actual_product_id_from_AVAILABLE_PRODUCTS_DATA", "size": "S", "color": "C", "quantity": 1} ]
       }
     ]
   }]
   CRITICAL: The "productId" MUST be the exact "id" field from AVAILABLE_PRODUCTS_DATA. Do NOT use placeholder IDs.
5. [ORDER_UPDATE TAG]: If user wants to edit an existing order, use [ORDER_UPDATE: {...}] with the same JSON schema.
6. After including the [ORDER_READY] tag, confirm: "Your order has been placed successfully! Here are your details: [Product Name], [Size], [Color], [Quantity]. Our support team will call you shortly to confirm."
7. If the user changes their mind and wants info instead, say "No problem! Let me connect you back to our info team." The system will re-route them.`,
        unavailableMessage: "Our ordering system is currently being updated. Please try again in a few minutes, or our admin team will assist you shortly! 🙏"
      },
      { 
        name: 'Behaviour Agent', 
        model: llmModel,
        prompt: `You are the "Emotional Brain" of an AI sales agent. Your job is NOT to reply to the user, but to analyze their behavior and intent.
Analyze the following user message and context, and output ONLY a JSON object with the following schema exactly. Do not use markdown blocks like \`\`\`json. 

{
  "frustration_level": float, // 0.0 (happy/neutral) to 1.0 (very angry/impatient)
  "intent": "Browsing" | "Support" | "Ordering" | "Buying" | "Handoff" | "Other", // Browsing (products), Support (complaining), Ordering/Buying (wants purchase), Handoff (asks for real human agent/admin)
  "urgency": "Low" | "Medium" | "High",
  "style": "Short" | "Detailed" | "Casual" | "Formal", // How does the user type? Are they brief? Do they write long paragraphs?
  "search_queries": [] // Array of string queries if the user is asking for products. Example: ["blue shirt", "black pants"]. Empty array if no products mentioned.
}`,
        instructionPrompt: `You are the "Memory Extraction" module.
Analyze the following conversation history and extract any actionable, persistent behavioral traits or preferences about the user.
Keep it concise. If no new traits are found, return the CURRENT PROFILE exactly as is.
DO NOT include situational facts like "user is angry today" or "user wants a blue shirt right now".
DO include facts like "prefers brief answers", "likes black clothing", "hates high shipping costs".`,
      },
    ];

    for (const d of defaults) {
      const existing = await this.prisma.aiAgent.findUnique({
        where: { name: d.name },
      });

      if (!existing) {
        await this.prisma.aiAgent.create({
          data: {
            name: d.name,
            isActive: true,
            model: d.model,
            prompt: d.prompt,
            instructionPrompt: (d as any).instructionPrompt || null,
            unavailableMessage: (d as any).unavailableMessage || null,
          }
        });
        this.logger.log(`  ✨ Created new agent: ${d.name}`);
      } else {
        // Sync all fields to keep agents up-to-date with code changes
        const needsUpdate = 
          existing.model !== d.model ||
          existing.prompt !== d.prompt ||
          existing.instructionPrompt !== ((d as any).instructionPrompt || null) ||
          existing.unavailableMessage !== ((d as any).unavailableMessage || null);

        if (needsUpdate) {
          await this.prisma.aiAgent.update({
            where: { id: existing.id },
            data: {
              model: d.model,
              prompt: d.prompt,
              instructionPrompt: (d as any).instructionPrompt || null,
              unavailableMessage: (d as any).unavailableMessage || null,
            },
          });
          this.logger.log(`  🔄 Updated agent: ${d.name}`);
        }
      }
    }

    this.logger.log('✅ Default AI agents initialized successfully');
  }

  async getSystemPredefinedMessages(): Promise<SystemPredefinedMessages> {
    // Return from cache if fresh (5 minute TTL)
    if (this.systemMessagesCache && Date.now() < this.systemMessagesCacheExpiry) {
      return this.systemMessagesCache;
    }

    const defaults: SystemPredefinedMessages = {
      imageReceivedMessage: 'I am checking your images, give me some time.',
      voiceReceivedMessage: 'I am listening to your voice note... 🎧',
    };

    const setting = await this.prisma.systemSettings.findUnique({
      where: { key: 'ai-system-predefined-messages' },
    });

    let result: SystemPredefinedMessages;
    if (!setting) {
      result = defaults;
    } else {
      try {
        result = { ...defaults, ...(JSON.parse(setting.value) as Partial<SystemPredefinedMessages>) };
      } catch {
        result = defaults;
      }
    }

    // Cache for 5 minutes
    this.systemMessagesCache = result;
    this.systemMessagesCacheExpiry = Date.now() + 5 * 60 * 1000;
    return result;
  }

  async updateSystemPredefinedMessages(data: Partial<SystemPredefinedMessages>): Promise<SystemPredefinedMessages> {
    const merged = { ...(await this.getSystemPredefinedMessages()), ...data };
    await this.prisma.systemSettings.upsert({
      where: { key: 'ai-system-predefined-messages' },
      update: {
        value: JSON.stringify(merged),
        category: 'ai-agent',
      },
      create: {
        key: 'ai-system-predefined-messages',
        value: JSON.stringify(merged),
        category: 'ai-agent',
      },
    });

    // Invalidate cache after update
    this.systemMessagesCache = null;
    this.systemMessagesCacheExpiry = 0;

    return merged;
  }
}
