# Frooxi AI — System Documentation

> **Version**: 1.2 | **Last Updated**: March 30, 2026 | **Stack**: NestJS + Prisma + PostgreSQL (Neon) + Redis + Pinecone + Google Gemini

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Message Flow (End-to-End)](#message-flow)
3. [AI Agents](#ai-agents)
4. [Shopping Cart System](#shopping-cart-system)
5. [Database Schema](#database-schema)
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
| AI | Google Gemini 1.5 & 2.0 | Text generation + embeddings |
| Platform | Messenger & WhatsApp (Graph v25.0) | Customer chat interface |
| Security | Helmet + AES-256-GCM + RBAC | HTTP hardening |

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

### Step-by-Step: Unified Processing Pipeline

```
1. Meta POST → /webhook (NestJS controller)
2. handleWebhookEvent(event) — THE GATEWAY
   │
   ├── STEP 1: Webhook Deduplication (Redis SETNX)
   │   └── Prevent processing Meta's retry duplicates (5 min TTL)
   │
   ├── STEP 2: Parallel State Checks (Redis Pipeline)
   │   ├── Get Admin Pause (admin_pause:{senderId})
   │   ├── Get Spam Block (spam_block:{senderId})
   │   └── Get Last Message Timestamp (last_msg_ts:{senderId})
   │
   ├── STEP 3: Spam Protection (Redis Sorted Sets)
   │   └── Check rate limit (5 msgs / 30s) → Block if over
   │
   ├── STEP 4: Session Logic
   │   └── Reset Order session if > 1 hour since last message
   │
   ├── STEP 5: Route to Agent Lifecycle
   │   ├── Has image? → Visual Agent (Multimodal RAG)
   │   ├── Has audio? → Voice Agent (Direct File Processing)
   │   └── Has text?  → Route to Agent Logic
   │       ├── Fast Path Intent detection (High-frequency patterns)
   │       ├── Smart Handoff (Check for Buy/Order intent)
   │       └── Agent Lifecycle Process
```

### Smart Agent Lifecycle (`executeAgentLifecycle`)

Every agent call now follows a standard containerized execution flow to ensure performance:
1.  **Context Loading (Cached):** Loads Integration, Customer, and Conversation from Redis (10m TTL) or DB.
2.  **Concurrency Check:** Atomic **Redis INCR** (Active tasks 0-50). Instant backpressure if full.
3.  **Typing Heartbeat:** Single fire-and-forget call (Meta auto-expires in 20s).
4.  **Logic Execution:** Executes the specific Agent's LLM or code logic.
5.  **Clean up:** Atomic **Redis DECR** to release slot + `typing_off`.

### Optimized Text Agent Flow (`processTextAgent`)

```
1. FAQ FAST PATH:
   └── Check keywords for "hours", "location", "delivery" etc. → Reply & Return.

2. CONDITIONAL RAG (Smart Search):
   ├── CALL LLM (e.g. Gemini 2.0 Flash) → Extract intent and [search_queries]
   ├── Inspect [search_queries]:
   │   ├── HAS QUERIES: Run searchProducts(queries) in parallel across DB/Pinecone.
   │   └── NO QUERIES: Skip all Database and Pinecone searches (0ms cost).
   └── Skip search for "Hello", "Thanks", etc. entirely.

3. SALES RESPONSE:
   └── Use extracted context + results to generate the final customer reply.
```

### Multi-modal Agent Flow (Voice/Visual)

```
1. FAST FEEDBACK:
   └── send "Thinking..." message immediately (non-blocking).

2. ZERO-STORAGE DOWNLOAD:
   └── httpService.get(url) → Buffer (RAM) — No persistent files created.

3. AI PROCESSING:
   ├── Send Media Buffer + History + Context to Gemini.
   └── Response sent via sendOptimizedResponse().
```

---

## AI Agents

### Agent Details

| Agent | LLM Model | Embedding Model | Purpose |
|-------|-----------|-----------------|---------|
| **Text Agent** | `gemini-1.5-flash` | — | Handles all text conversations, product search, ordering |
| **Visual Agent** | `gemini-1.5-flash` | `gemini-embedding-2-preview` | Image-based product matching via Pinecone |
| **Voice Agent** | `gemini-1.5-flash` | — | Direct audio processing, transcription, language mirroring |
| **Behaviour Agent** | `gemini-1.5-flash` | — | Analyzes emotion/intent (Browsing, Buying, Removing), extracts behavioral profiles |

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

## Shopping Cart System

The cart system uses a hybrid approach (Redis for ephemeral interest, Postgres for committed interest) to balance performance and persistence.

### Cart States (`product_interest`)

| State | Storage | Trigger | Action |
|---|---|---|---|
| `NONE` | — | No product mentioned | No action. |
| `DISCUSSING` | Redis | Asking about product | 15 min memory window. |
| `CONFIRMED` | Database | "I want this", "Add to cart" | Persisted as `CartItem`. Supports `size`, `color`, and `quantity` extraction. |
| `REMOVING` | Database | "Remove this", "Delete item" | Deletes matching `CartItem` variation. |
| `CLEAR_ALL` | Database | "Empty my cart", "Clear all" | Deletes all `CartItem` entries for the user. |

### Advanced Cart Logic

| Feature | Description | Implementation |
|---|---|---|
| **Variation Support** | Supports multiple variants of the same product (Size/Color). | Unique key is `cartId + productId + size + color`. |
| **Surgical Removal** | Removal intent deletes specific size/color combinations. | `removeItemByProduct` strictly filters by variation metadata. |
| **Quantity Extraction** | AI extracts numerical amount and operation type. | `quantity` (Int) + `quantity_operation` (`INCREMENT` or `SET`). |
| **Failsafe Delete** | Setting quantity to `0` automatically deletes the item. | Protected in `CartService.addItem`. |

### Abandoned Cart CRM (CRON)

| Interval | Logic | Behavior |
|---|---|---|
| **Frequency** | Every 30 Minutes | Scans for `CartItem` older than 1 hour. |
| **Cap** | **3 Follow-ups** | tracked via `followUpCount` on `CartItem`. |
| **Escalation** | Dynamic | Attempt 1: Gentle check-in; Attempt 2: Service-oriented; Attempt 3: Final reminder. |

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
| `ctx:{pageId}:{senderId}` | **10 minutes** | Integration, Customer, and Conv metadata cache |
| `msg_count:{senderId}` | **7 days** | Profile extraction trigger |
| `spam_block:{senderId}` | **10 minutes** | Active spam block indicator |
| `spam:{senderId}` | **60 seconds** | Sorted set for message frequency window |
| `last_product:{senderId}` | **24 hours** | Last discussed product for follow-ups |
| `search:{query}` | **10 minutes** | Product search cache |

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

### Order Triggering & Hardening

Orders are processed via **AI Logic Tags** embedded in the `Order Agent` response:
- `[ORDER_READY: { ... }]`: Triggers `createOrder` and clears the Postgres cart.
- `[ORDER_UPDATE: { ... }]`: Updates the latest pending order.

**Hardening (Source of Truth)**:
To prevent AI hallucinations from dropping items in the final checkout:
1. **DB Sync**: When `ORDER_READY` is triggered, the system fetches the current **Postgres Cart** as the ground truth.
2. **Contextual Selection**: If the AI specifies items, the system uses those (partial checkout).
3. **Fallback**: If the AI list is empty/incomplete, the system automatically pulls the entire DB Cart.
4. **Price Lock**: All prices are re-validated against the `Product` table, ignoring any prices in the AI prompt.

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
| Block duration | **10 minutes** | ✅ via `SystemSettings` |
| Block message | "⚠️ Warning: Excessive messaging detected..." | Fixed String |

### Detection Logic
The system uses a **Redis Sorted Set** for each user (`spam:{senderId}`).
1. Each message timestamp is added as a member (O(log N)).
2. Timestamps older than 30s are pruned during the same atomic operation.
3. If the count in the set exceeds the threshold (5), a temporary block key (`spam_block:{senderId}`) is set in Redis.

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

To prevent Out-Of-Memory (OOM) crashes and Gemini API exhaustion during high traffic, the system uses an **Atomic Redis Counter**.

| Constraint | Limit | Behavior |
|---|---|---|
| **Max Concurrent Tasks** | `50` | Processes up to 50 users simultaneously across all cluster instances. |
| **Enforcement** | `INCR` | Uses atomic Redis `INCR` to check the limit before processing any AI task. |
| **Backpressure** | > `50` | Rejects the request immediately. Meta retries. User stays in a virtual "busy" state. |
| **Self-Healing** | `TTL` | Counter has persistent 5-minute TTL to prevent permanent locks on crash. |

*Note: This mechanism ensures LLM rate limits are never exceeded and horizontally scales across multiple servers.*

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
| 🔴 High  | Database Migration Safety | `prisma/` | Move GIN trigram indexes to a managed migration (avoid schema reset). |
| 🟡 Med   | Hardcoded Intent Regex (i18n) | `meta-webhook.service.ts` | `detectIntentFastPath` relies on English patterns. Needs multi-language dictionary. |
| 🟡 Med   | Fragile JSON parsing from LLM | `gemini.service.ts` | Needs an LLM auto-retry block for malformed JSON outputs. |
| 🟢 Low   | Production Frontend URL  | `main.ts` | Pending Update of `ALLOWED_ORIGINS` for CORS. |
| 🟢 Low   | Usage Counters  | `ai-agent.service.ts` | Agent Usage tracking is not implemented. |

*Note: Critical items (In-Memory Counters, Webhook Deduplication, N+1 Stats Queries, CPU Token Overhead) were resolved in the V1.2 Optimization Sprint.*

---

## Facebook Graph API

| Parameter | Default |
|---|---|
| API Version | **v25.0** |
| Base URL | `https://graph.facebook.com/v25.0` |
| Message type | `RESPONSE` |
| Image reusable | `true` |
| Batch images | `attachments[]` array format |
