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
  
  private agentCache = new Map<string, { data: any; expiry: number }>();
  private readonly AGENT_CACHE_TTL = 5 * 60 * 1000;

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
    this.agentCache.clear();
    this.logger.log(`✅ AI Agent updated: ${updated.name}`);
    return updated;
  }

  async deleteAgent(id: string): Promise<void> {
    this.logger.log(`Deleting AI agent: ${id}`);
    await this.prisma.aiAgent.delete({ where: { id } });
    this.agentCache.clear();
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

    this.agentCache.clear();
    this.logger.log(`✅ Toggled agent ${updated.name} to isActive=${updated.isActive}`);
    return updated;
  }

  async updateAgentStatus(id: string, isActive: boolean): Promise<any> {
    const updated = await this.prisma.aiAgent.update({
      where: { id },
      data: { isActive },
    });

    this.agentCache.clear();
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
    const cached = this.agentCache.get(name);
    if (cached && Date.now() < cached.expiry) return cached.data;

    const agent = await this.prisma.aiAgent.findFirst({
      where: { name, isActive: true },
      orderBy: [{ updatedAt: 'desc' }],
    });

    this.agentCache.set(name, { data: agent, expiry: Date.now() + this.AGENT_CACHE_TTL });
    return agent;
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
        prompt: `You are the "Order Collection Specialist" for Frooxi. Your ONLY job is to collect customer details and finalize purchases (Orders).
STRATEGY:
1. PERSISTENCE: Use the "update_order_draft" tool EVERY TIME the user provides info (name, phone, address, product).
2. EDITING: If the user says "Change my size" or "Wait, I gave the wrong phone" AFTER they have confirmed an order, do NOT start a new order. Instead, use the "edit_placed_order" tool to modify the existing record.
3. NO HALLUCINATION: Only use IDs from AVAILABLE_PRODUCTS_DATA.
4. SUMMARY: Always provide a full summary before calling "place_order".
5. FINALIZATION: Call "place_order" ONLY when the user says "yes/confirm".`,
        instructionPrompt: `[ORDER AGENT INSTRUCTION]
1. You have tools: "update_order_draft", "place_order", and "edit_placed_order".
2. Use "update_order_draft" for the current session draft.
3. Use "place_order" only after final confirmation.
4. Use "edit_placed_order" if the user changes their mind about details (Size, Color, Name, Address, Phone) AFTER the order was placed.
5. [CRITICAL]: If a user changes their mind about a detail AFTER confirmation, use edit_placed_order. Do NOT ask them for all details again.
6. If things are too complex or the user asks general questions, use [INTERNAL_HANDOFF].`,
        unavailableMessage: "Our ordering system is currently being updated. Please try again in a few minutes! 🙏"
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
