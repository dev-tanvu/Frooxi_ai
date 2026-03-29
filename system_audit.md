# Backend System Audit
**Date:** March 2026
**Reviewer:** Senior Systems Architect (Antigravity)

Reviewing the `ai-backend` specifically focusing on `meta-webhook.service.ts`, `gemini.service.ts`, and `order.service.ts`. 

## 🔴 High Priority Issues & Bugs

### 1. In-Memory Concurrency Violates Horizontal Scaling
* **File:** `meta-webhook.service.ts` (lines ~32-35)
* **Issue:** The AI slot queue (`activeAiTasks`, `waitingQueue`) is implemented using in-memory variables. If this Node.js app is deployed on a multi-core environment using PM2 (cluster mode) or horizontal pods (Kubernetes), this concurrency guard completely breaks. Each instance will accept 50 tasks independently, causing you to blow past the 50 max-limit and risk Out of Memory (OOM) crashes or LLM rate limits.
* **Fix:** Move the concurrency queue and locking mechanism to **Redis**. 

### 2. N+1 Database Query Problem
* **File:** `order.service.ts` (lines 22-37)
* **Issue:** When creating an order or updating a cart, the system loops through every item using `Promise.all` and triggers an individual `prisma.product.findUnique` query. If a user orders 10 unique items, it fires 10 separate queries.
* **Fix:** Pluck the `productIds` out of the cart, run a single `findMany({ where: { id: { in: productIds } } })`, and build a price map in memory.

### 3. Cryptographic Decryption Overhead
* **File:** `meta-webhook.service.ts` 
* **Issue:** Every single incoming webhook payload (which can be hundreds per minute) hits the database to find the `MetaIntegration` and runs `encryption.decrypt()` on the AES-256-GCM token. Cryptographic decryption is CPU intensive and blocking.
* **Fix:** Store the decrypted access tokens in Redis with a 24-hour TTL when they are first fetched, drastically reducing CPU load and Postgres DB reads.

## 🟡 Medium Priority (Technical Debt)

### 4. Hardcoded English Regex (i18n Issue)
* **File:** `meta-webhook.service.ts` (`detectIntentFastPath`)
* **Issue:** The fast intent detector uses hardcoded English Regex (`buying`, `browsing`, `hoodie`, `where is`). Considering the prompts mention delivery inside/outside Dhaka (Bangladesh), many users will likely speak Bengali or Banglish. The fast path will fail on Banglish inputs, routing too much traffic to the expensive AI router.
* **Fix:** Add common Banglish/regional terms to the regex OR extract the regex dictionary to the database so admins can configure fast-path keywords.

### 5. Fragile JSON Parsing from LLM
* **File:** `gemini.service.ts` (`analyzeEmotionAndIntent`, `processAudioMessage`)
* **Issue:** While you are doing string splitting to find `{` and `}`, Gemini can sometimes output invalid JSON (e.g., unescaped quotes inside string values). Currently, a `JSON.parse` exception throws an error and completely defaults the emotional brain to neutral state anonymously.
* **Fix:** Wrap the LLM call in a retry block (max 2 retries) requesting Gemini to fix its JSON formatting before falling back.

### 6. God Class Syndrome
* **File:** `meta-webhook.service.ts`
* **Issue:** The file is pushing 1,600 lines. It handles Webhook validation, intent parsing, spam detection, LLM routing, and Meta API message sending. 
* **Fix:** Extract the `Intent Detection` rules and the `Spam Detection` logic into their own dedicated services (`IntentRouterService`, `SecurityService`).

## 🟢 Low Priority (Cleanups)
* **Dead Code:** Check for unused console.logs/loggers.
* **Typing Indication Leaks:** `typingHeartbeats` uses `setInterval`. If an error occurs midway through processing and `stopTypingHeartbeat` is missed in a `finally` block, the intervals could run indefinitely until memory exhaust. The current code correctly uses `finally` throughout, but edge-case monitoring should be added.
