import { GoogleGenerativeAI } from "@google/generative-ai";

type ThreatContext = {
  type: string;
  severity: string;
  amount?: number | null;
  chain: string;
  eventType: string;
  description: string;
};

type AIAnalysisResult = {
  riskScore: number; // 0-100
  confidence: number; // 0-100
  reasoning: string;
  recommendations: string[];
  attackVector?: string;
};

class AIAnalyzer {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
      });
      console.log(
        "[AIAnalyzer] Initialized with Gemini 2.5 Flash-Lite (free tier)",
      );
    } else {
      console.warn("[AIAnalyzer] GEMINI_API_KEY not set, AI analysis disabled");
    }
  }

  get isConfigured(): boolean {
    return this.model !== null;
  }

  async analyzeThreat(
    context: ThreatContext,
  ): Promise<AIAnalysisResult | null> {
    if (!this.model) {
      return null;
    }

    try {
      const prompt = this.buildPrompt(context);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return this.parseResponse(text, context);
    } catch (error: any) {
      console.error("[AIAnalyzer] Error analyzing threat:", error.message);
      return null;
    }
  }

  private buildPrompt(context: ThreatContext): string {
    return `You are a DeFi security expert analyzing a potential threat to a blockchain vault.

**Threat Details:**
- Type: ${context.type}
- Severity: ${context.severity}
- Chain: ${context.chain}
- Event: ${context.eventType}
- Amount: ${context.amount ? `${context.amount} ETH` : "N/A"}
- Description: ${context.description}

**Your Task:**
Analyze this threat and provide:
1. Risk Score (0-100): How severe is this threat?
2. Confidence (0-100): How confident are you in this assessment?
3. Reasoning: Brief explanation of why this is or isn't a real threat
4. Attack Vector: If this is an attack, what type? (e.g., "Flash Loan", "Whale Manipulation", "Rug Pull", "Exploit", "Normal Activity")
5. Recommendations: 2-3 specific actions to take

**Response Format (JSON):**
{
  "riskScore": <number 0-100>,
  "confidence": <number 0-100>,
  "reasoning": "<brief explanation>",
  "attackVector": "<attack type or 'None'>",
  "recommendations": ["<action 1>", "<action 2>", "<action 3>"]
}

Respond ONLY with valid JSON, no markdown formatting.`;
  }

  private parseResponse(
    text: string,
    context: ThreatContext,
  ): AIAnalysisResult {
    try {
      // Remove markdown code blocks if present
      let cleanText = text.trim();
      if (cleanText.startsWith("```json")) {
        cleanText = cleanText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      } else if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/```\n?/g, "");
      }

      const parsed = JSON.parse(cleanText);

      return {
        riskScore: Math.min(100, Math.max(0, parsed.riskScore || 50)),
        confidence: Math.min(100, Math.max(0, parsed.confidence || 70)),
        reasoning: parsed.reasoning || "AI analysis completed",
        attackVector: parsed.attackVector || "Unknown",
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations.slice(0, 3)
          : ["Monitor vault activity", "Review transaction patterns"],
      };
    } catch (error) {
      console.error("[AIAnalyzer] Failed to parse AI response:", error);
      // Fallback: extract insights from raw text
      return {
        riskScore: this.estimateRiskFromSeverity(context.severity),
        confidence: 60,
        reasoning: text.slice(0, 200),
        attackVector: this.detectAttackVectorFromText(text),
        recommendations: this.extractRecommendations(text),
      };
    }
  }

  private estimateRiskFromSeverity(severity: string): number {
    switch (severity) {
      case "critical":
        return 95;
      case "high":
        return 80;
      case "medium":
        return 60;
      case "low":
        return 30;
      default:
        return 50;
    }
  }

  private detectAttackVectorFromText(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("flash loan")) return "Flash Loan";
    if (lower.includes("whale")) return "Whale Manipulation";
    if (lower.includes("drain")) return "TVL Drain";
    if (lower.includes("rug pull")) return "Rug Pull";
    if (lower.includes("exploit")) return "Exploit";
    return "Unknown";
  }

  private extractRecommendations(text: string): string[] {
    const recommendations: string[] = [];
    const lines = text.split("\n");

    for (const line of lines) {
      if (
        line.includes("recommend") ||
        line.includes("should") ||
        line.includes("action")
      ) {
        const cleaned = line.replace(/^[-*•]\s*/, "").trim();
        if (cleaned.length > 10 && cleaned.length < 150) {
          recommendations.push(cleaned);
        }
      }
    }

    return recommendations.length > 0
      ? recommendations.slice(0, 3)
      : [
          "Monitor vault for additional suspicious activity",
          "Review transaction patterns and wallet addresses",
          "Consider temporary pause if risk escalates",
        ];
  }

  // Quick risk assessment without full AI analysis (for fast path)
  quickRiskScore(context: ThreatContext): number {
    let score = this.estimateRiskFromSeverity(context.severity);

    // Adjust based on amount
    if (context.amount) {
      if (context.amount > 1) score += 10;
      if (context.amount > 5) score += 10;
      if (context.amount > 10) score += 10;
    }

    // Adjust based on threat type
    if (context.type.toLowerCase().includes("flash loan")) score += 15;
    if (context.type.toLowerCase().includes("drain")) score += 15;
    if (context.type.toLowerCase().includes("correlated")) score += 20;

    return Math.min(100, score);
  }
}

export const aiAnalyzer = new AIAnalyzer();
