# Frooxi AI — System Documentation

> **Version**: 1.1 | **Last Updated**: March 26, 2026 | **Stack**: NestJS + Prisma + PostgreSQL (Neon) + Redis + Pinecone + Google Gemini

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Message Flow (End-to-End)](#message-flow)
3. [AI Agents](#ai-agents)
4. [Database Schema](#database-schema)
5. [Redis Caching Layer](#redis-caching-layer)
6. [Product Search Pipeline](#product-search-pipeline)
7. [Order Processing](#order-processing)
8. [Spam Protection (DB-Driven)](#spam-protection)
9. [CRON Jobs](#cron-jobs)
10. [Database Cleanup](#database-cleanup)
11. [Settings & Configuration](#settings--configuration)
12. [API Endpoints](#api-endpoints)
13. [Environment Variables](#environment-variables)
14. [Known Issues & Debt](#known-issues--technical-debt)

---

## Architecture Overview

### System Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js + NestJS | API server, webhook handler |
| Database | PostgreSQL (Neon) | Persistent storage |
| ORM | Prisma | Type-safe database client |
| Cache | Redis (Upstash) | Conversation history, search cache |
| Vector DB | Pinecone | Image similarity search |
| AI | Google Gemini 2.5 | Text generation + embeddings |
| Platform | Facebook Messenger (Graph API v25.0) | Customer chat interface |
| Security | Helmet + CORS + ValidationPipe | HTTP hardening |

### Key Services

| Service | File | Purpose |
|---------|------|---------|
| `MetaWebhookService` | `meta-webhook.service.ts` | Central gateway — routes, spam, typing |
| `MetaApiService` | `meta-api.service.ts` | Facebook Graph API wrapper |
| `GeminiService` | `gemini.service.ts` | Google Gemini AI (text + embeddings) |
| `PineconeService` | `pinecone.service.ts` | Vector similarity search |
| `RedisService` | `redis.service.ts` | Fast cache + conversation history |
| `ProductService` | `product.service.ts` | Product CRUD + search + Pinecone sync |
| `OrderService` | `order.service.ts` | Order lifecycle management |
| `AiAgentService` | `ai-agent.service.ts` | Agent CRUD + toggle + pre-defined messages |
| `StoreService` | `store.service.ts` | Store config + business rules |
| `ShippingService` | `shipping.service.ts` | Delivery fee calculation |
| `SettingsService` | `settings.service.ts` | System-wide settings (spam, retention, currencies) |
| `ProactiveService` | `proactive.service.ts` | Abandoned cart + feedback CRON |
| `DatabaseCleanupService` | `database-cleanup.service.ts` | Scheduled data cleanup |
| `FaqService` | `faq.service.ts` | FAQ matching (fast-path, no AI needed) |
| `EncryptionService` | `encryption.service.ts` | AES-256-GCM for sensitive data at rest |

---

## Message Flow

### Step-by-Step: What happens when a user sends a message

```
1. Facebook POST → /webhook (NestJS controller)
2. handleWebhookEvent(event) — THE GATEWAY
   │
   ├── STEP 1: Echo Check (instant, in-memory)
   │   ├── Bot echo (app_id matches) → ignore
   │   └── Admin/human echo → suppress AI for 30 min for that user
   │
   ├── STEP 2: Parallel Operations
   │   ├── markSeen (fire-and-forget)
   │   ├── startTypingHeartbeat (15s interval)
   │   └── checkSpam (Cached DB settings)
   │
   ├── STEP 3: Spam Gate
   │   └── Blocked? → send block message, return
   │
   ├── STEP 4: Admin Override
   │   └── AI suppressed? → stop typing, return
   │
   ├── STEP 5: Agent Availability
   │   └── Agent OFF? → send unavailableMessage, notify admin, return (Behaviour agent returns silent)
   │
   └── STEP 6: Route to Agent
       ├── Has image? → send "image received" feedback → Visual Agent
       ├── Has audio? → send "voice received" feedback → Voice Agent (60s limit)
       └── Has text? → Text Agent
```

### Voice Agent Flow (`processVoiceAgent`)

```
1. PRE-CHECK:
   └── durationMs > 60000? → send rejection, trigger HANDOFF, return

2. FAST FEEDBACK:
   └── send voiceReceivedMessage immediately (non-blocking)

3. MEMORY-ONLY DOWNLOAD:
   └── httpService.get(url) → Buffer (RAM) — No disk storage used

4. AI PROCESSING (Gemini 1.5):
   ├── Send Audio Buffer + History + Product Context
   └── Logic: Identify Language + Transcribe + Generate Sales Response

5. PERSISTENCE:
   ├── Transcription saved to DB/Redis as USER message ([Voice]: ...)
   └── Response sent via sendOptimizedResponse()
```

### Text Agent Flow (`processTextAgent`)

```
1. PARALLEL FETCH (Promise.all):
   ├── getOrCreateContext(pageId, senderId)     → DB: integration, customer, conversation
   ├── getActiveAgentByName('Text Agent')       → DB: agent config + model
   ├── getActiveAgentByName('Behaviour Agent')  → DB: behaviour agent config
   ├── redis.getHistory(senderId, 10)           → Redis: last 10 messages
   └── redis.get('emotion:{senderId}')          → Redis: cached emotion from LAST message

2. PERSIST MESSAGE (Promise.all):
   ├── persistMessage(conversationId, 'USER', text)  → DB
   └── redis.addMessage(senderId, 'USER', text)       → Redis

3. FAQ FAST PATH:
   └── detectInfoCategory(text) → faqService.findFaqMatch()
       └── Match? → reply immediately, skip AI entirely

4. INTENT DETECTION:
   ├── detectIntentFastPath(text, history)  → Rule-based (handles ~80% of cases)
   └── Fallback: gemini.analyzeEmotionAndIntent()  → Behaviour Agent LLM call

5. FIRE-AND-FORGET: Cache emotion in Redis (10min TTL) for next message's tone

6. PRODUCT SEARCH:
   ├── Ordering mode? → fetch locked product from active order
   ├── Follow-up? → reuse last_product:{senderId} from Redis
   ├── New search → getCachedSearchResults (Redis 5min → Neon DB → Pinecone fallback)
   └── Buy intent? → prune to top result only

7. AI RESPONSE: gemini.generateSalesResponse() (StoreConfig cached in-memory)

8. ORDER EXTRACTION: Parse [ORDER_READY:] and [ORDER_UPDATE:] tags

9. SEND RESPONSE: sendOptimizedResponse() → splits by [SPLIT], sends text + images

10. BACKGROUND: Every 5th message → extract behavioral profile (fire-and-forget)
```

---

## AI Agents

### Agent Details

| Agent | LLM Model | Embedding Model | Purpose |
|-------|-----------|-----------------|---------|
| **Text Agent** | `gemini-1.5-flash` | — | Handles all text conversations, product search, ordering |
| **Visual Agent** | `gemini-1.5-flash` | `gemini-embedding-2-preview` | Image-based product matching via Pinecone |
| **Voice Agent** | `gemini-1.5-flash` | — | Direct audio processing, transcription, language mirroring |
| **Behaviour Agent** | `gemini-1.5-flash` | — | Analyzes emotion/intent, extracts behavioral profiles |

### Agent Database Fields (`ai_agents` table)

| Field | Type | Purpose |
|-------|------|---------|
| `name` | String (unique) | `"Text Agent"`, `"Visual Agent"`, `"Behaviour Agent"` |
| `isActive` | Boolean | Toggle ON/OFF — gateway blocks messages when OFF |
| `prompt` | String? | Main system prompt (personality, strategy) |
| `instructionPrompt` | String? | Detailed instructions (order protocol, formatting) |
| `unavailableMessage` | String? | Message sent when agent is turned OFF |
| `model` | String | LLM model name (e.g., `gemini-2.5-flash`) |
| `createdAt` | DateTime | Creation Timestamp |

*Note: Legacy unused fields (`preDefinedMessage`, `temperature`, `totalConversations`, etc.) were purged to optimize the database.*

### System Pre-Defined Messages (Cached in memory, 5min TTL)

| Key | Default | API |
|-----|---------|-----|
| `imageReceivedMessage` | `"I am checking your images..."` | `PUT /ai-agents/system-messages` |
| `voiceReceivedMessage` | `"I am listening to your voice note... 🎧"` | `PUT /ai-agents/system-messages` |

---

## Database Schema

### All Models (15 models, 3 enums)

| Model | Table Name | Purpose |
|---|---|---|
| `User` | `User` | Admin dashboard authentication |
| `MetaIntegration` | `MetaIntegration` | Facebook page connection (pageId + accessToken) |
| `Customer` | `Customer` | Messenger users |
| `Conversation` | `Conversation` | Links customer ↔ integration |
| `Message` | `Message` | Individual USER/AGENT messages |
| `Product` | `Product` | Synced from Google Sheets → Pinecone |
| `Order` | `Order` | Created by AI via [ORDER_READY] tag |
| `OrderItem` | `OrderItem` | Order line items |
| `Notification` | `Notification` | Admin alerts |
| `Faq` | `Faq` | FAQ entries for fast-path matching |
| `AiAgent` | `ai_agents` | Agent config + toggle (3 agents) |
| `StoreConfig` | `StoreConfig` | Store name, currency, business details |
| `StoreRule` | `StoreRule` | Business rules injected into AI prompts |
| `ShippingZone` | `ShippingZone` | Delivery zones for fee calculation |
| `SystemSettings` | `system_settings` | Key-value system settings |
| `Currency` | `currencies` | Currency configs |

---

## Redis Caching Layer

### Keys & TTLs

| Key Pattern | TTL | Purpose |
|---|---|---|
| `conv:{senderId}` | **24 hours** | Conversation history |
| `msg_count:{senderId}` | **7 days** | Profile extraction trigger |
| `emotion:{senderId}` | **10 minutes** | Fire-and-forget emotion cache |
| `last_product:{senderId}` | **24 hours** | Last discussed product for follow-ups |
| `search:{query}` | **5/10 minutes** | Product search cache |

---

## Order Processing

### Format

```json
{
  "customerName": "Name",
  "phone": "Phone",
  "email": "Email",
  "deliveries": [
    {
      "location": "Address (Thana/District)",
      "items": [
        { "productId": "actual_id", "size": "M", "color": "Black", "quantity": 1 }
      ]
    }
  ]
}
```

### Delivery Fees (Driven by `ShippingZone`)

| Zone | Price | Detection Logic |
|---|---|---|
| Inside Dhaka | **70 BDT** | Address string contains "dhaka" |
| Outside Dhaka | **130 BDT** | Default (anything not containing "dhaka") |

---

## Spam Protection (DB-Driven)

### Configuration

Settings are stored in the database and fetched/cached via `SettingsService`.

| Parameter | Default Value | Configurable |
|---|---|---|
| Max messages per window | **5** | ✅ via `SystemSettings` |
| Time window | **30 seconds** | ⚠️ Hardcoded in webhook |
| Block duration | **60 minutes** | ✅ via `SystemSettings` |
| Block message | "⚠️ You've been temporarily blocked..." | Fixed String |
| Voice Note Limit | **60 seconds** | ⚠️ Hardcoded for stability |

### Multimodal Data Handling (Privacy & Storage)

To protect user privacy and system resources, we follow a **Zero-Storage Policy** for media:
1. **Download-to-RAM**: Images and Voice notes are downloaded from Meta's CDN directly into the server's **volatile memory (RAM)** as a `Buffer`.
2. **Ephemeral Processing**: The data exists only for the duration of the Gemini API call (~5-10 seconds).
3. **No Disk Storage**: Files are **NEVER** saved to the local hard drive/SSD.
4. **Text-Only Persistence**: Only the **transcription** (for voice) or **search metadata** (for images) is saved in the database history. The original media buffer is purged by garbage collection immediately after processing.

---

### 1. Meta Gateway (Webhook)
The system uses a single endpoint (`/webhook`) to receive events from **Facebook Messenger**, **Instagram Direct**, and **WhatsApp Cloud API**.

#### Platform Support
- **Messenger**: Full support for text, images, and quick replies.
- **Instagram**: Support for direct messages and media.
- **WhatsApp**: Support for text, images, and voice notes via Meta's Cloud API.

#### Normalization Layer
Since each platform sends message data in a different JSON structure, the `MetaWebhookService` includes a **Normalization Layer**:
1. **Messenger/IG**: Extracts data from `entry[].messaging[]`.
2. **WhatsApp**: Extracts data from `entry[].changes[0].value.messages[]`.
3. **Unified Format**: All inputs are converted into a `FrooxiMessage` object before being routed to AI agents, ensuring consistent behaviour across all apps.

#### WhatsApp Media Resolving
WhatsApp media (images, voice notes) are not directly accessible via a URL in the webhook payload. Instead, a `media_id` is provided. The system handles this as follows:
1. **Fetch Media URL**: An API call is made to `graph.facebook.com/{media_id}` using the WhatsApp Business Account token to retrieve a temporary URL for the media.
2. **Download to RAM**: The media is then downloaded from this temporary URL directly into RAM, following the Zero-Storage Policy.
3. **Ephemeral Processing**: The media buffer is processed by the respective AI agent (Visual or Voice) and then purged.

---

## Load Balancer & Concurrency Guard

To prevent Out-Of-Memory (OOM) crashes and Gemini API exhaustion during high traffic, an **in-memory priority queue** operates inside `MetaWebhookService`.

| Constraint | Limit | Behavior |
|---|---|---|
| **Max Concurrent Tasks** | `50` | Processes up to 50 users simultaneously. Excess are instantly sent to a waiting queue. |
| **Max Queue Size** | `200` | Capped at 200 users. Users get a wait message: *"We're experiencing high traffic! You're in a short queue..."* |
| **Overload Handoff** | > `250` total | Triggers `SYSTEM_OVERLOAD`. Request is dropped. User gets: *"Our system is currently overwhelmed... support team will respond shortly!"* |

*Note: This mechanism ensures RAM usage never exceeds a predictable threshold (e.g. 50 tasks × 2MB = 100MB max).*

---

## Known Issues & Technical Debt

### 🟢 Security Hardening (V1.2 - Final)

All systems now strictly follow a **Fail-Closed** security model.
- **Admin Access**: Requires valid `x-api-key` header; fails completely if `ADMIN_API_KEY` is undefined.
- **Data Protection**: Enforces 32-character `ENCRYPTION_KEY` for AES-256-GCM encryption of Page Access Tokens.
- **Network Security**: CORS is origin-restricted; Helmet.js provides HTTP hardening.
- **Webhook Verification**: Mandates `META_APP_SECRET` for signature verification and `META_VERIFY_TOKEN` for setup verification.
- **Database Indexing**: All foreign keys (`userId`, `metaIntegrationId`, `customerId`, `orderId`, `productId`) are explicitly indexed in Prisma for query performance at scale.

### 🟡 Tech Debt / Post-Launch (Architectural Audit Findings)

| Severity | Issue | Area | Recommended Fix |
|----------|-------|------|-----------------|
| 🔴 High  | In-Memory Concurrency Guard | `meta-webhook.service.ts` | Move `activeAiTasks` queue to Redis to support multi-instance Kubernetes/PM2 scaling. Currently, scaling instances will multiply the AI slot limit leading to LLM rate limits. |
| 🔴 High  | N+1 DB Queries on Checkout | `order.service.ts` | `createOrder` runs a `Promise.all` loop executing individual `findUnique` queries for every item in the cart. Needs refactoring to a single `findMany({ where: { id: { in: [] } } })` query. |
| 🔴 High  | Cryptographic CPU Overhead | `meta-webhook.service.ts` | Every webhook decrypts AES-256-GCM tokens from Postgres on the fly. High throughput will spike CPU. Should cache decrypted tokens in Redis with 24h TTL. |
| 🟡 Med   | Hardcoded Intent Regex (i18n) | `meta-webhook.service.ts` | `detectIntentFastPath` relies on hardcoded English patterns ("buying", "browsing"). Fails on regional dialects/Banglish, pushing too many trivial queries to the LLM. Move to DB dictionary. |
| 🟡 Med   | Fragile JSON parsing from LLM | `gemini.service.ts` | Wrapping LLM JSON outputs directly in `JSON.parse` with basic try/catch defaults to "Neutral" state on failure. Needs an LLM retry block for malformed JSON outputs. |
| 🟢 Low   | Production Frontend URL  | `main.ts` | Pending Update of `ALLOWED_ORIGINS` for CORS. |
| 🟢 Low   | Usage Counters  | `ai-agent.service.ts` | Agent Usage tracking is not implemented. Needs increment logic. |

*Note: Critical items from V1.0 (duplicate DB tables, empty DB columns, unbounded file logs, uncontrolled DB spam looping) were eradicated in V1.1 patch.*

---

## Facebook Graph API

| Parameter | Default |
|---|---|
| API Version | **v25.0** |
| Base URL | `https://graph.facebook.com/v25.0` |
| Message type | `RESPONSE` |
| Image reusable | `true` |
| Batch images | `attachments[]` array format |
