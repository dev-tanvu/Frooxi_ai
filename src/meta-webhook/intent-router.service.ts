import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { EmotionState } from '../ai/gemini.service';

@Injectable()
export class IntentRouterService {
    private readonly logger = new Logger(IntentRouterService.name);

    constructor(
        private redis: RedisService,
    ) { }

    detectIntentFastPath(text: string, history: string[]): EmotionState {
        const lower = text.toLowerCase();
        
        // Contextual Trap: If AI recently proposed an order, force "Ordering"
        if (history.length > 0) {
            const lastAi = history.filter(m => m.startsWith('AGENT:')).slice(-1)[0]?.toLowerCase() || '';
            const isOrderPrompt = /order|started|get that|color|size|address|delivery/i.test(lastAi);
            const isNo = /^(no|nah|na|nope|cancel|stop|r na|na thak)\b/i.test(lower);
            
            // NEW: If user asks a new question or mentions "tshirt", "ache", etc. even after an order prompt, 
            // do NOT force Ordering. Let them browse more products.
            const isProductQuery = /\b(ache|shirt|pant|dress|tshirt|ki|colour|price|dam|kat)\b/i.test(lower);

            if (isOrderPrompt && !isNo && !isProductQuery) {
                return { 
                    intent: 'Ordering', 
                    frustration_level: 0, 
                    urgency: 'Medium', 
                    style: 'Casual', 
                    search_queries: [] 
                };
            }
        }

        const patterns: any = {
            buying: [/^(buy|order|want|get|take)\s+/i, /\b(price|cost|how much|dam|bikri|kenbo)\b/i, /\b(place|confirm)\s+order\b/i],
            browsing: [/^(show|see|looking for|search)\s+/i, /\b(pics?|photos?|images?|sizes?|colors?|ache|shirt|pant|tshirt|golla|fabric|material|ki|dekhao)\b/i],
            support: [/help|problem|issue|refund|return|track|status|shuchok|ashubidha/i],
            handoff: [/human|person|agent|talk to|manager|admin|manush/i]
        };

        for (const [intent, regexes] of Object.entries(patterns)) {
            if ((regexes as any).some((r: any) => r.test(lower))) {
                return { 
                    intent: intent.charAt(0).toUpperCase() + intent.slice(1) as any, 
                    frustration_level: 0, 
                    urgency: 'Low', 
                    style: 'Short', 
                    search_queries: [] 
                };
            }
        }

        return { 
            intent: 'Other', 
            frustration_level: 0, 
            urgency: 'Low', 
            style: 'Short', 
            search_queries: [] 
        };
    }

    async getHistoryIntentFallback(senderId: string): Promise<EmotionState['intent']> {
        const session = await this.redis.get(`order_session:${senderId}`);
        if (session) return 'Ordering';
        return 'Other';
    }
}
