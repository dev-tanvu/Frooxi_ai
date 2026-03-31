# Messenger E-Commerce AI SaaS — Full System Blueprint

> **Project:** AI-powered customer support + order management SaaS for e-commerce stores via Facebook Messenger  
> **AI Stack:** Google Gemini (Flash + Vision + Audio)  
> **Memory:** Redis (hot) + Neon PostgreSQL (cold) + pgvector  
> **Queue:** BullMQ + Redis  
> **Runtime:** Node.js / TypeScript  

---

## Table of Contents

1. [Technology Choice — Node/TS vs Python](#1-technology-choice)
2. [Webhook Subscriptions](#2-webhook-subscriptions)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Layer 1 — Webhook Ingestion Pipeline](#4-layer-1--webhook-ingestion-pipeline)
5. [Layer 2 — Agent System Design](#5-layer-2--agent-system-design)
6. [Agent Instruction Strategy — Prompts vs Fine-Tuning](#6-agent-instruction-strategy)
7. [Memory Architecture](#7-memory-architecture)
8. [Database Schema](#8-database-schema)
9. [Order Agent — Multi-Turn Flow](#9-order-agent--multi-turn-flow)
10. [Follow-Up Campaign System](#10-follow-up-campaign-system)
11. [Product Catalog and Variants](#11-product-catalog-and-variants)
12. [Reverse Image Search](#12-reverse-image-search)
13. [Voice Message Handling](#13-voice-message-handling)
14. [Spam and Abuse Protection](#14-spam-and-abuse-protection)
15. [Multi-Tenancy Design](#15-multi-tenancy-design)
16. [Human Handoff System](#16-human-handoff-system)
17. [Real-World Problems and Solutions](#17-real-world-problems-and-solutions)
18. [Deployment Architecture](#18-deployment-architecture)
19. [Development Phases](#19-development-phases)

---

## 1. Technology Choice

### Recommendation: **Node.js with TypeScript**

#### Why NOT Python for this project

| Factor | Node.js / TS | Python |
|---|---|---|
| Webhook latency | Excellent (event loop, non-blocking I/O) | Good but needs async frameworks (FastAPI) |
| BullMQ (best-in-class queue) | Native — built for Node | No native equivalent; Celery is heavier |
| Facebook SDK support | Official JS SDK | Community maintained |
| Real-time (typing indicators, SSE) | Native, zero overhead | Needs extra setup |
| TypeScript safety | First-class | Needs mypy, slower iteration |
| Gemini SDK | Full-featured JS SDK | Full-featured Python SDK — tie |
| Team hiring | Massive JS talent pool | Large but more ML-focused |
| Deployment cost | Low (single event loop handles many concurrent connections) | Higher (each worker is heavier) |

**Python wins** only if you plan to do heavy ML training, fine-tuning, or custom model work in-house. Since you're using Gemini as a managed model, Python's ML advantage is irrelevant here.

#### Core Stack Decision

```
Runtime:      Node.js 20+ (LTS)
Language:     TypeScript (strict mode)
Web server:   Fastify (faster than Express, schema validation built-in)
Queue:        BullMQ + Redis
ORM:          Drizzle ORM (TypeScript-native, works great with Neon Postgres)
AI SDK:       @google/generative-ai (Gemini official JS SDK)
Vector:       pgvector via Drizzle or raw SQL
Cache:        ioredis
Scheduler:    BullMQ repeatable jobs (replaces cron)
Auth:         JWT + OAuth2 (Facebook Page login)
Monorepo:     Turborepo (apps/api + apps/dashboard + packages/shared)
```

---

## 2. Webhook Subscriptions

### Must Have (enable these)

| Subscription | Reason |
|---|---|
| `messages` | Core — every text, image, voice message sent by users |
| `message_reads` | Know when user read your reply → track engagement, retry logic |
| `message_echoes` | Log all outbound messages → keep conversation history in sync |
| `messaging_postbacks` | Button/quick-reply clicks → menu navigation, order confirmations |
| `messaging_optins` | User subscribed → enable follow-up campaigns |
| `messaging_optouts` | GDPR compliance — immediately stop messaging opted-out users |
| `message_reactions` | Sentiment signals → 👍 means satisfied, 😠 means escalate |
| `messaging_referrals` | Track campaign ref links → attribution for follow-up discounts |
| `messaging_handovers` | Coordinate AI ↔ human agent handoff protocol |

### Skip These

`standby`, `messaging_payments`, `messaging_pre_checkouts`, `messaging_checkout_updates`, `messaging_account_linking`, `messaging_game_plays`, `messaging_policy_enforcement`, `inbox_labels`, `send_cart`, `group_feed`, `calls`, `call_permission_reply`, `call_settings_update`, `response_feedback`, `message_template_status_update`, `marketing_message_delivery_failed`, `business_integrity`, `feed`

These either handle Facebook-native checkout (you have your own order system), game features, or compliance tools not relevant to an e-commerce support bot.

---

## 3. System Architecture Overview

```
Facebook Messenger
      │
      ▼ POST /webhook
┌─────────────────────────────────┐
│  Webhook Receiver (Fastify)     │  ← Verify hub.signature_256
│  Ack 200 OK in < 200ms          │  ← NEVER do AI work here
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Spam / Dedup Filter (Redis)    │  ← Rate limit per PSID
│                                 │  ← Dedup by message.mid
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  BullMQ Job Queue               │  ← Persistent, retryable
│  Priority lanes: order > chat   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  Router Agent (Gemini Flash)    │  ← Load Redis session context
│                                 │  ← Classify intent
└──┬──────┬──────┬──────┬─────────┘
   │      │      │      │
   ▼      ▼      ▼      ▼
Text   Image  Voice  Order   Follow-up
Agent  Agent  Agent  Agent    Agent
   │      │      │      │       │
   └──────┴──────┴──────┴───────┘
                  │
                  ▼
┌─────────────────────────────────┐
│  Response Formatter             │  ← Text / buttons / product cards
│  → Messenger Send API           │  ← Typing indicator before reply
└─────────────────────────────────┘
```

---

## 4. Layer 1 — Webhook Ingestion Pipeline

### 4.1 Webhook Receiver

```typescript
// apps/api/src/webhooks/messenger.ts
import Fastify from 'fastify';
import { verifySignature } from './verify';
import { messageQueue } from '../queues/message.queue';

app.post('/webhook', async (req, reply) => {
  // Step 1: Verify Facebook signature (MUST be first)
  if (!verifySignature(req.rawBody, req.headers['x-hub-signature-256'])) {
    return reply.status(403).send();
  }

  // Step 2: Ack immediately — Facebook requires < 5s or it retries
  reply.status(200).send('EVENT_RECEIVED');

  // Step 3: Push to queue — never await AI here
  const body = req.body as WebhookBody;
  for (const entry of body.entry) {
    for (const event of entry.messaging) {
      await messageQueue.add('process', {
        pageId: entry.id,
        event,
        receivedAt: Date.now(),
      }, {
        priority: getEventPriority(event),
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
    }
  }
});

function getEventPriority(event: MessagingEvent): number {
  if (event.postback) return 1;           // Highest — button click
  if (event.message?.text) return 2;      // Normal message
  if (event.message?.attachments) return 2; // Image/voice
  return 5;                               // Everything else
}
```

### 4.2 Signature Verification

```typescript
import crypto from 'crypto';

export function verifySignature(rawBody: Buffer, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.FB_APP_SECRET!)
    .update(rawBody)
    .digest('hex');
  return `sha256=${expected}` === signature;
}
```

### 4.3 Spam and Dedup Filter

```typescript
// apps/api/src/filters/spam.filter.ts
import { redis } from '../lib/redis';

const RATE_LIMIT = 10;       // max messages per PSID per minute
const RATE_WINDOW = 60;      // seconds

export async function passesFilter(psid: string, mid: string): Promise<boolean> {
  // 1. Dedup check — already processed this message ID?
  const dedupKey = `dedup:${mid}`;
  const exists = await redis.set(dedupKey, '1', 'EX', 3600, 'NX');
  if (!exists) return false; // duplicate

  // 2. Rate limit check
  const rateKey = `rate:${psid}`;
  const count = await redis.incr(rateKey);
  if (count === 1) await redis.expire(rateKey, RATE_WINDOW);
  if (count > RATE_LIMIT) return false; // spam

  // 3. Block list check
  const blocked = await redis.sismember('blocked_psids', psid);
  if (blocked) return false;

  return true;
}
```

### 4.4 Typing Lock (Prevents Race Conditions)

```typescript
export async function acquireTypingLock(psid: string): Promise<boolean> {
  // Only one AI call at a time per user
  const key = `typing_lock:${psid}`;
  const acquired = await redis.set(key, '1', 'EX', 30, 'NX');
  return !!acquired;
}

export async function releaseTypingLock(psid: string): Promise<void> {
  await redis.del(`typing_lock:${psid}`);
}
```

---

## 5. Layer 2 — Agent System Design

### 5.1 The 6 Agents

| Agent | Model | Trigger | Responsibility |
|---|---|---|---|
| **Router** | Gemini 1.5 Flash | Every event | Classify intent, load context, dispatch |
| **Text** | Gemini 1.5 Flash | Text messages | Product Q&A, pricing, availability, general support |
| **Image** | Gemini 1.5 Pro Vision | Image attachments | Understand image, reverse visual product search |
| **Voice** | Gemini Audio | Audio attachments | Transcribe → pipe to Text agent |
| **Order** | Gemini 1.5 Flash | Order intent | Multi-turn collection, variant resolution, placement |
| **Follow-up** | Gemini 1.5 Flash | Scheduled cron | Abandoned cart, re-engagement, discount campaigns |

### 5.2 Router Agent Logic

```typescript
// Intent classification output — structured JSON
type Intent =
  | { type: 'product_inquiry'; query: string }
  | { type: 'image_search'; hasImage: true }
  | { type: 'voice_message'; audioUrl: string }
  | { type: 'place_order'; productHint?: string }
  | { type: 'order_status'; orderRef?: string }
  | { type: 'coupon_inquiry' }
  | { type: 'shipping_inquiry' }
  | { type: 'human_requested' }
  | { type: 'spam' }
  | { type: 'greeting' };
```

### 5.3 Worker Pipeline

```typescript
// apps/api/src/workers/message.worker.ts
messageQueue.process('process', async (job) => {
  const { pageId, event } = job.data;

  // Load store config for this page
  const store = await db.stores.findByPageId(pageId);
  if (!store) return;

  // Acquire per-user lock
  const psid = event.sender.id;
  const locked = await acquireTypingLock(psid);
  if (!locked) {
    // Re-queue with 2s delay — another message is being processed
    await job.moveToDelayed(Date.now() + 2000);
    return;
  }

  try {
    // Send typing indicator
    await messenger.sendTypingOn(psid, store.pageAccessToken);

    // Load session from Redis
    const session = await loadSession(psid, store.id);

    // Route to correct agent
    const intent = await routerAgent.classify(event, session);
    const response = await dispatchToAgent(intent, event, session, store);

    // Send reply
    await messenger.sendMessage(psid, response, store.pageAccessToken);

    // Persist conversation turn
    await saveConversationTurn(psid, store.id, event, response, intent);

  } finally {
    await releaseTypingLock(psid);
  }
});
```

---

## 6. Agent Instruction Strategy

### The Problem with Long System Prompts

Long prompts sent on every API call are expensive and slow. A 2000-token system prompt × 10,000 messages/day = 20 million tokens/day in system prompt cost alone — before any actual conversation.

### Solution: Layered Instruction Architecture

Use 3 tiers of instructions. Only the cheapest tier runs on every call.

---

#### Tier 1 — Static Core Prompt (sent every call, keep under 200 tokens)

This is the minimal identity and behavior anchor. Short, sharp, never changes.

```
You are an AI assistant for {store.name}, an online store.
You help customers with: product questions, placing orders, order status, shipping, and returns.
Always reply in the same language the customer uses.
Be friendly, concise, and helpful.
If unsure, ask one clarifying question — never guess.
Never make up prices or product details — only use the provided context.
If the customer is angry or asks for a human, trigger: HANDOFF_REQUESTED
```

**Cost:** ~120 tokens. Sent every call. Fine.

---

#### Tier 2 — Dynamic Context Injection (assembled per request, ~300–600 tokens)

Built fresh for each call from your database. Contains only what is relevant to THIS conversation at THIS moment.

```typescript
function buildDynamicContext(session: Session, store: Store, relevantProducts: Product[]): string {
  const parts: string[] = [];

  // Only inject if mid-order
  if (session.orderDraft) {
    parts.push(`CURRENT ORDER DRAFT:\n${JSON.stringify(session.orderDraft, null, 2)}`);
  }

  // Only inject matched products (from vector search)
  if (relevantProducts.length > 0) {
    parts.push(`RELEVANT PRODUCTS:\n${relevantProducts.map(formatProduct).join('\n')}`);
  }

  // Only inject if coupon was mentioned
  if (session.mentionedCoupon) {
    const coupon = await db.coupons.find(session.mentionedCoupon);
    parts.push(`COUPON: ${JSON.stringify(coupon)}`);
  }

  // Store policies (cached, not repeated if already in session)
  if (!session.policiesInjected) {
    parts.push(`STORE POLICIES:\n${store.returnPolicy}\nShipping: ${store.shippingNote}`);
  }

  return parts.join('\n\n');
}
```

**Key principle:** Never inject the entire product catalog. Run a vector search first, inject only the top 3–5 most relevant products. This keeps token count predictable regardless of catalog size.

---

#### Tier 3 — Agent-Specific Tool Definitions (not tokens — function calling)

Instead of writing long "here is what you can do" instructions, define **Gemini function calls** (tools). The model reads the function name + description and knows what to do. This is nearly free in terms of prompt tokens.

```typescript
const orderTools: Tool[] = [
  {
    name: 'collect_order_detail',
    description: 'Call this when you have confirmed a specific piece of order information from the customer',
    parameters: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: ['product_id', 'variant', 'quantity', 'name', 'phone', 'address'] },
        value: { type: 'string' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'confirm_order',
    description: 'Call this when ALL required order fields are collected and customer has confirmed',
    parameters: {
      type: 'object',
      properties: {
        order_draft: { type: 'object' },
      },
    },
  },
  {
    name: 'apply_coupon',
    description: 'Validate and apply a coupon code to the current order',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string' },
      },
    },
  },
];
```

**Why this is better than prompt instructions:** The model understands function signatures intuitively. Writing "when the user wants to place an order, collect name, phone, address, product, variant, quantity" in a prompt costs ~80 tokens AND the model might miss edge cases. The tool definition costs ~40 tokens and the model executes it reliably.

---

#### Tier 4 — Few-Shot Examples in Redis (not in prompt — retrieved on demand)

Store example conversations in Redis as "example banks." Only inject 1–2 examples when the router detects the agent needs them.

```typescript
// Stored in Redis as: examples:order_agent:clothing_variants
const examples = {
  'order_agent:clothing_variants': [
    {
      user: "I want the blue shirt",
      assistant: "Which size would you like? We have S, M, L, XL available.",
      user2: "L please",
      assistant2: "Got it — 1× Blue Shirt (L). Could I get your delivery address?"
    }
  ],
  'text_agent:price_inquiry': [
    {
      user: "how much is the iPhone case?",
      assistant: "The iPhone 15 case is ৳850. It comes in Black, Blue, and Clear. Want to order one?"
    }
  ]
};
```

Inject only when router flags `needsExample: true` — which is rare (edge cases, first-time order flows). 90% of calls never touch this tier.

---

### Token Budget Summary

| Tier | Tokens | Frequency |
|---|---|---|
| Core system prompt | ~120 | Every call |
| Dynamic context | ~200–500 | Every call (but minimal — vector search filtered) |
| Tool definitions | ~150 | Every call (function calling overhead) |
| Few-shot examples | ~200–400 | ~10% of calls only |
| Conversation history | ~300 (last 8 turns from Redis) | Every call |
| **Total per call** | **~970–1,470** | vs 3,000–5,000 with naive long prompts |

**Cost saving: 50–70% reduction** compared to stuffing everything into one system prompt.

---

### What to Instruct Each Agent — Summary

#### Router Agent
- Classify intent into one of 10 predefined categories
- Output structured JSON only — no prose
- Extract key entities (product name, order ref, coupon code) in the same pass
- Never reply to the user — only classify and dispatch

#### Text Agent
- Only answer based on injected product context — never hallucinate specs or prices
- If product not found in context, say "Let me check" and trigger a catalog search tool call
- Upsell naturally: if user asks about product X, mention related product Y once
- Ask only ONE question at a time when clarifying

#### Image Agent
- Describe what you see in the image in 1 sentence
- Run a similarity search against the product catalog
- Present top 3 matching products with prices
- If no match found, say so clearly and offer to help find something similar

#### Voice Agent
- Transcribe accurately — preserve numbers, names, addresses
- If confidence is low (background noise detected), respond: "I had trouble hearing that clearly, could you send a text message?"
- Pass clean transcript to Text agent — do not try to answer yourself

#### Order Agent
- Collect fields in this sequence: product → variant → quantity → name → phone → address
- Never skip steps — always confirm each field before moving on
- Before final confirmation, repeat the full order summary and ask for explicit "yes" or "confirm"
- On "yes", call `confirm_order` tool — never write to DB yourself (the tool handler does it)
- If user abandons mid-flow, persist draft to Redis and set a follow-up flag

#### Follow-up Agent
- Tone: friendly, never pushy — one message only per abandoned cart
- Always include: product name, direct reorder prompt, optional discount if configured
- Respect opt-out status — check before every send
- Do not follow up if user placed any order in the last 48 hours

---

## 7. Memory Architecture

### Redis Keys Design

```
session:{storeId}:{psid}              → Full session object (TTL: 24h)
order_draft:{storeId}:{psid}          → In-progress order (TTL: 30min)
typing_lock:{psid}                    → Concurrency lock (TTL: 30s)
rate:{psid}                           → Rate limit counter (TTL: 60s)
dedup:{mid}                           → Dedup flag (TTL: 1h)
blocked_psids                         → SET of blocked PSIDs
examples:{agentType}:{scenario}       → Few-shot examples (TTL: 24h, refreshed)
store_config:{storeId}                → Cached store settings (TTL: 5min)
```

### Session Object Structure

```typescript
interface Session {
  psid: string;
  storeId: string;
  lastSeen: number;
  messageCount: number;
  currentIntent?: Intent['type'];
  orderDraft?: OrderDraft;
  mentionedProducts: string[];       // product IDs mentioned in conversation
  mentionedCoupon?: string;
  policiesInjected: boolean;         // don't re-inject on every turn
  language: string;                  // detected language
  handoffRequested: boolean;
  lastAgentType: AgentType;
  recentTurns: ConversationTurn[];   // last 8 turns only
}
```

### Memory Load Strategy per Request

```typescript
async function loadSession(psid: string, storeId: string): Promise<Session> {
  const cacheKey = `session:${storeId}:${psid}`;

  // 1. Try Redis first (fast path — < 1ms)
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. Redis miss — load from Postgres (cold start or TTL expired)
  const history = await db.conversations
    .findMany({ psid, storeId, limit: 8, orderBy: 'desc' });

  const session: Session = buildSessionFromHistory(history);

  // 3. Write back to Redis
  await redis.set(cacheKey, JSON.stringify(session), 'EX', 86400);

  return session;
}
```

---

## 8. Database Schema

```sql
-- Stores (SaaS tenants)
CREATE TABLE stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  fb_page_id  VARCHAR(100) UNIQUE NOT NULL,
  page_access_token TEXT NOT NULL,
  plan        VARCHAR(20) DEFAULT 'starter',  -- starter / pro / enterprise
  return_policy TEXT,
  shipping_note TEXT,
  currency    VARCHAR(10) DEFAULT 'BDT',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id) ON DELETE CASCADE,
  name        VARCHAR(500) NOT NULL,
  description TEXT,
  base_price  NUMERIC(10,2),
  category    VARCHAR(100),
  is_active   BOOLEAN DEFAULT TRUE,
  image_urls  TEXT[],
  embedding   VECTOR(768),          -- pgvector — product description embedding
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Product Variants
CREATE TABLE product_variants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  attributes  JSONB NOT NULL,       -- {"color": "blue", "size": "L"}
  sku         VARCHAR(100),
  price       NUMERIC(10,2),
  stock       INTEGER DEFAULT 0,
  image_url   TEXT,
  image_embedding VECTOR(768)       -- per-variant image embedding for visual search
);

-- Orders
CREATE TABLE orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id),
  psid        VARCHAR(100) NOT NULL,   -- Facebook Page-Scoped ID
  customer_name VARCHAR(255),
  phone       VARCHAR(30),
  address     TEXT,
  items       JSONB NOT NULL,          -- [{product_id, variant_id, qty, price}]
  subtotal    NUMERIC(10,2),
  discount    NUMERIC(10,2) DEFAULT 0,
  shipping    NUMERIC(10,2) DEFAULT 0,
  total       NUMERIC(10,2),
  coupon_code VARCHAR(50),
  status      VARCHAR(30) DEFAULT 'pending',  -- pending/confirmed/shipped/delivered/cancelled
  shipping_zone_id UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (full history)
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id),
  psid        VARCHAR(100) NOT NULL,
  role        VARCHAR(10) NOT NULL,    -- 'user' or 'assistant'
  content     TEXT NOT NULL,
  content_type VARCHAR(20) DEFAULT 'text',  -- text/image/voice/postback
  intent      VARCHAR(50),
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_conversations_psid ON conversations(store_id, psid, created_at DESC);

-- Coupons
CREATE TABLE coupons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id),
  code        VARCHAR(50) NOT NULL,
  type        VARCHAR(20),            -- percent / fixed / free_shipping
  value       NUMERIC(10,2),
  min_order   NUMERIC(10,2) DEFAULT 0,
  max_uses    INTEGER,
  used_count  INTEGER DEFAULT 0,
  per_user_limit INTEGER DEFAULT 1,
  applies_to  JSONB,                  -- null = all, or {category: "..."} or {product_ids: [...]}
  expires_at  TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT TRUE
);

-- Shipping Zones
CREATE TABLE shipping_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id),
  name        VARCHAR(100),
  districts   TEXT[],                 -- ['Dhaka', 'Chittagong']
  charge      NUMERIC(10,2),
  est_days    VARCHAR(20)             -- '2-3 days'
);

-- Browse Events (for follow-up campaigns)
CREATE TABLE browse_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id),
  psid        VARCHAR(100),
  product_id  UUID REFERENCES products(id),
  variant_hint VARCHAR(200),
  followed_up BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Opt-out registry
CREATE TABLE messaging_optouts (
  psid        VARCHAR(100),
  store_id    UUID REFERENCES stores(id),
  opted_out_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (psid, store_id)
);
```

---

## 9. Order Agent — Multi-Turn Flow

### State Machine

```
IDLE → PRODUCT_SELECTED → VARIANT_SELECTED → QUANTITY_SET
     → DETAILS_COLLECTING (name → phone → address)
     → SUMMARY_SHOWN → CONFIRMED → ORDER_PLACED
```

### Order Draft in Redis

```typescript
interface OrderDraft {
  state: OrderState;
  productId?: string;
  productName?: string;
  variantId?: string;
  variantDesc?: string;
  quantity?: number;
  price?: number;
  customerName?: string;
  phone?: string;
  address?: string;
  couponCode?: string;
  discount?: number;
  shippingZoneId?: string;
  shippingCharge?: number;
  missingFields: string[];
}
```

### Coupon Validation

```typescript
async function validateCoupon(code: string, storeId: string, order: OrderDraft): Promise<CouponResult> {
  const coupon = await db.coupons.findOne({ code, storeId, isActive: true });

  if (!coupon) return { valid: false, reason: 'Coupon not found' };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { valid: false, reason: 'Expired' };
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return { valid: false, reason: 'Fully used' };
  if (order.subtotal! < coupon.minOrder) return { valid: false, reason: `Minimum order ৳${coupon.minOrder}` };

  // Per-user limit check
  const userUsage = await db.orders.count({ psid: order.psid, couponCode: code });
  if (userUsage >= coupon.perUserLimit) return { valid: false, reason: 'Already used by you' };

  return { valid: true, coupon };
}
```

---

## 10. Follow-Up Campaign System

### How It Works

1. Every time a user asks about a product but doesn't order → log a `browse_event`
2. BullMQ repeatable job runs every 30 minutes
3. Finds browse_events older than 2 hours with no subsequent order
4. Checks opt-out registry — skips opted-out users
5. Checks cooldown — max 1 follow-up per PSID per 48 hours
6. Generates personalized message via Follow-up Agent
7. Optionally attaches a time-limited discount code

```typescript
// Scheduled job
followUpQueue.add('send_followups', {}, {
  repeat: { every: 30 * 60 * 1000 },  // every 30 min
});

followUpQueue.process('send_followups', async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  
  const pending = await db.browseEvents.findMany({
    followedUp: false,
    createdAt: { lt: twoHoursAgo },
  });

  for (const event of pending) {
    const isOptedOut = await db.messagingOptouts.exists(event.psid, event.storeId);
    if (isOptedOut) continue;

    const cooldownKey = `followup_cooldown:${event.storeId}:${event.psid}`;
    const inCooldown = await redis.exists(cooldownKey);
    if (inCooldown) continue;

    const message = await followUpAgent.generate(event);
    await messenger.sendMessage(event.psid, message, store.pageAccessToken);

    await redis.set(cooldownKey, '1', 'EX', 48 * 3600);
    await db.browseEvents.update({ id: event.id, followedUp: true });
  }
});
```

---

## 11. Product Catalog and Variants

### Variant Resolution

When user says "I want the blue one in XL":

```typescript
async function resolveVariant(productId: string, userMessage: string): Promise<ProductVariant | null> {
  // 1. Load all variants for this product
  const variants = await db.productVariants.findMany({ productId });
  
  // 2. Use Gemini to match user's description to variant attributes
  const prompt = `
    User said: "${userMessage}"
    Available variants: ${JSON.stringify(variants.map(v => ({ id: v.id, ...v.attributes })))}
    Return the ID of the best matching variant, or null if unclear.
    Output JSON only: {"variantId": "...", "confidence": 0.9}
  `;
  
  const result = await gemini.generate(prompt);
  const { variantId, confidence } = JSON.parse(result);
  
  if (confidence < 0.7) return null; // Ask user to clarify
  return variants.find(v => v.id === variantId) || null;
}
```

### Product Embedding on Upload

```typescript
async function indexProduct(product: Product): Promise<void> {
  // Build rich text for embedding
  const textToEmbed = `
    ${product.name}. ${product.description}.
    Category: ${product.category}.
    Price: ${product.basePrice}.
    Variants: ${product.variants.map(v => Object.values(v.attributes).join(' ')).join(', ')}
  `;
  
  const embedding = await gemini.embedContent(textToEmbed);
  await db.products.update({ id: product.id, embedding: embedding.values });
  
  // Also embed each variant's image
  for (const variant of product.variants) {
    if (variant.imageUrl) {
      const imgEmbedding = await gemini.embedImage(variant.imageUrl);
      await db.productVariants.update({ id: variant.id, imageEmbedding: imgEmbedding.values });
    }
  }
}
```

---

## 12. Reverse Image Search

```typescript
async function handleImageMessage(imageUrl: string, storeId: string): Promise<Product[]> {
  // 1. Download image
  const imageBuffer = await downloadFile(imageUrl);
  
  // 2. Gemini Vision — describe what's in the image
  const description = await gemini.vision({
    image: imageBuffer,
    prompt: 'Describe this product in detail: type, color, material, style, any visible text. Be concise.',
  });
  
  // 3. Embed the description text
  const queryEmbedding = await gemini.embedContent(description);
  
  // 4. Also embed the image directly for visual similarity
  const imageEmbedding = await gemini.embedImage(imageBuffer);
  
  // 5. Run pgvector similarity search — combine text + image similarity
  const matches = await db.query(`
    SELECT p.*, pv.*,
      (0.5 * (1 - (p.embedding <=> $1)) + 0.5 * (1 - (pv.image_embedding <=> $2))) as score
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id
    WHERE p.store_id = $3
    ORDER BY score DESC
    LIMIT 5
  `, [queryEmbedding.values, imageEmbedding.values, storeId]);
  
  return matches;
}
```

---

## 13. Voice Message Handling

```typescript
async function handleVoiceMessage(audioUrl: string): Promise<string> {
  // 1. Download audio file from Facebook CDN
  const audioBuffer = await downloadFile(audioUrl);
  
  // 2. Transcribe with Gemini
  const transcript = await gemini.transcribeAudio({
    audio: audioBuffer,
    mimeType: 'audio/mp4',
    prompt: 'Transcribe exactly. Preserve numbers, names, and addresses.',
  });
  
  // 3. Low confidence fallback
  if (transcript.confidence < 0.65) {
    return '__TRANSCRIPTION_FAILED__'; // Signal to send fallback message to user
  }
  
  return transcript.text;
}
```

---

## 14. Spam and Abuse Protection

### Three-Layer Defense

```
Layer 1: Redis rate limiter    → 10 messages/min per PSID
Layer 2: Keyword blocklist     → Common spam phrases in Redis SET
Layer 3: Intent classification → Router marks intent as 'spam' → silently drop
```

### Adaptive Blocking

```typescript
async function adaptiveBlock(psid: string, reason: string): Promise<void> {
  const warningKey = `warnings:${psid}`;
  const warnings = await redis.incr(warningKey);
  await redis.expire(warningKey, 86400); // reset daily
  
  if (warnings >= 3) {
    // Auto-block for 24 hours
    await redis.set(`blocked:${psid}`, reason, 'EX', 86400);
  }
}
```

---

## 15. Multi-Tenancy Design

### Tenant Isolation

- Every database query is scoped by `store_id` — no cross-tenant data leakage
- Each store has its own `page_access_token` stored encrypted in Postgres
- Redis keys always include `storeId` prefix
- Agents receive only the store's product context — never another store's data
- Rate limits are per-PSID globally, not per-store (protects shared infrastructure)

### Store Onboarding Flow

```
1. Store owner signs up → account created
2. Connect Facebook Page → OAuth flow → store page_access_token
3. Subscribe webhooks programmatically via Graph API
4. Upload product catalog (CSV or manual)
5. Configure: shipping zones, return policy, currency, brand voice
6. Test mode: AI replies in a shadow mode (stored but not sent) for 24h
7. Go live
```

---

## 16. Human Handoff System

### Triggers for Handoff

- User explicitly asks for human ("talk to agent", "human please")
- User sends angry/abusive message (detected by Router)
- Order value above configured threshold (e.g. > ৳50,000)
- AI confidence below 0.5 on 3 consecutive turns
- Complaint or refund request

### Handoff Protocol

```typescript
async function initiateHandoff(psid: string, store: Store, reason: string): Promise<void> {
  // 1. Flag in Redis — AI stops responding
  await redis.set(`handoff:${psid}`, reason, 'EX', 3600);
  
  // 2. Send user a message
  await messenger.sendMessage(psid, {
    text: `I'm connecting you with our support team. They'll be with you shortly. ` +
          `(Reference: ${generateRef()})`,
  }, store.pageAccessToken);
  
  // 3. Notify store owner (via Messenger to their admin PSID, or email)
  await notifyStoreOwner(store, psid, reason);
  
  // 4. Log handoff event
  await db.handoffEvents.create({ psid, storeId: store.id, reason });
}
```

---

## 17. Real-World Problems and Solutions

| Problem | Solution |
|---|---|
| Facebook retries webhook if no 200 in 5s | Ack instantly, push to BullMQ, never await AI in receiver |
| Duplicate messages (Facebook sends same webhook twice sometimes) | Redis dedup by `message.mid` with 1h TTL |
| Two messages arrive 200ms apart from same user | Per-PSID typing lock in Redis — second job re-queues with 2s delay |
| User abandons order mid-flow | `order_draft` in Redis with 30min TTL + follow-up agent picks it up |
| User sends image asking "do you have this?" | Gemini Vision → embed description → pgvector cosine similarity on product variants |
| Voice message with background noise | Transcription confidence check — fallback to "please send text" if < 0.65 |
| Address outside delivery zone | Geocode address → check against `shipping_zones` districts array → clear error message |
| Expired or already-used coupon | Full coupon validation pipeline before applying — never optimistic discount |
| Angry customer | Router detects negative sentiment → escalate intent score → trigger handoff |
| Same user spamming "hi" 50 times | Redis rate limit 10/min + adaptive block after 3 violations |
| Product catalog changes while user is mid-conversation | Always fetch live from Postgres in dynamic context — never cache product prices in Redis |
| Follow-up messages annoying users | 48h cooldown per PSID + immediate opt-out processing + max 1 follow-up per browse event |
| Wrong language response | Detect language in first message → store in session → inject language instruction in core prompt |

---

## 18. Deployment Architecture

```
                          ┌─────────────────┐
                          │   Cloudflare    │  ← DDoS protection, WAF
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │  Load Balancer  │
                          └────────┬────────┘
                         ┌─────────┴──────────┐
                         │                    │
                ┌────────▼──────┐    ┌────────▼──────┐
                │  API Server 1 │    │  API Server 2 │  ← Fastify (horizontal scale)
                └────────┬──────┘    └────────┬──────┘
                         └─────────┬──────────┘
                                   │
                          ┌────────▼────────┐
                          │  Redis Cluster  │  ← Upstash or Railway Redis
                          └────────┬────────┘
                                   │
                         ┌─────────┴──────────┐
                         │                    │
                ┌────────▼──────┐    ┌────────▼──────┐
                │  BullMQ       │    │  Neon Postgres │
                │  Worker Pool  │    │  + pgvector    │
                └───────────────┘    └───────────────┘
```

### Recommended Hosting (Budget-Friendly Start)

| Service | Provider | Est. Cost |
|---|---|---|
| API + Workers | Railway or Render | $20–50/mo |
| Redis | Upstash (serverless) | $0–20/mo |
| Postgres | Neon (serverless) | $0–25/mo |
| File storage (audio/images) | Cloudflare R2 | $0–5/mo |
| Domain + CDN | Cloudflare | $10/mo |
| **Total MVP** | | **~$35–110/mo** |

---

## 19. Development Phases

### Phase 1 — Core Messaging (Weeks 1–3)
- [ ] Webhook receiver + signature verification
- [ ] Redis setup + BullMQ queue
- [ ] Spam/dedup filter
- [ ] Basic text agent (product Q&A)
- [ ] Session management
- [ ] Messenger Send API integration
- [ ] Multi-tenancy foundation + store onboarding

### Phase 2 — Rich Media + Orders (Weeks 4–6)
- [ ] Image agent + reverse image search
- [ ] Voice agent + transcription
- [ ] Order agent (full multi-turn flow)
- [ ] Coupon validation
- [ ] Shipping zone logic
- [ ] Order status check

### Phase 3 — Campaigns + Intelligence (Weeks 7–9)
- [ ] Follow-up campaign system
- [ ] Human handoff system
- [ ] Sentiment detection + escalation
- [ ] Language detection
- [ ] Analytics (conversations, orders, conversion rate)
- [ ] Store dashboard UI

### Phase 4 — Scale + Polish (Weeks 10–12)
- [ ] Product catalog sync (CSV import + webhook from Shopify/WooCommerce)
- [ ] A/B testing for follow-up messages
- [ ] Rate limiting by plan tier
- [ ] Billing integration (Stripe)
- [ ] Monitoring (Sentry + Grafana)

---

## Quick Reference — Environment Variables

```env
# Facebook
FB_APP_ID=
FB_APP_SECRET=
FB_VERIFY_TOKEN=

# Database
DATABASE_URL=postgresql://...  # Neon Postgres
REDIS_URL=redis://...          # Upstash or local

# Gemini
GEMINI_API_KEY=

# App
NODE_ENV=production
PORT=3000
JWT_SECRET=
ENCRYPTION_KEY=               # For encrypting page_access_tokens at rest
```

---

*Blueprint version 1.0 — Generated as part of initial system design.*  
*Next steps: Product catalog sync design + Dashboard UI wireframes.*
