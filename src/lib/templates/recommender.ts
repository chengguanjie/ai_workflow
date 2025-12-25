
import { officialTemplates } from './official-templates';
import { aiService } from '@/lib/ai';
import { prisma } from '@/lib/db';
import { safeDecryptApiKey } from '@/lib/crypto';

type WorkflowTemplate = typeof officialTemplates[number];

// Define the structure for a recommended template
export interface RecommendedTemplate {
                  template: WorkflowTemplate;
                  score: number; // Similarity score 0-1
                  reason: string;
}

/**
 * Template Recommender Service
 * Uses simple keyword matching or LLM-based semantic matching to recommend templates.
 */
export class TemplateRecommender {

                  /**
                   * Recommend templates based on user requirement string.
                   * If LLM is available, uses semantic matching. Otherwise falls back to keyword matching.
                   */
                  async recommend(
                                    requirement: string,
                                    organizationId: string,
                                    limit: number = 3
                  ): Promise<RecommendedTemplate[]> {

                                    // 1. Try to get AI Key for semantic matching
                                    const apiKey = await this.getApiKey(organizationId);

                                    if (apiKey) {
                                                      return this.semanticMatch(requirement, apiKey, limit);
                                    } else {
                                                      return this.keywordMatch(requirement, limit);
                                    }
                  }

                  /**
                   * Simple keyword-based matching (Fallback)
                   */
                  private keywordMatch(requirement: string, limit: number): RecommendedTemplate[] {
                                    const keywords = requirement.toLowerCase().split(/\s+/).filter(k => k.length > 1);

                                    const scores = officialTemplates.map(template => {
                                                      let score = 0;
                                                      const text = (template.name + ' ' + template.description + ' ' + (template.tags?.join(' ') || '')).toLowerCase();

                                                      keywords.forEach(keyword => {
                                                                        if (text.includes(keyword)) score += 1;
                                                      });

                                                      // Normalize score vaguely
                                                      const maxPossible = keywords.length;
                                                      const normalizedScore = maxPossible > 0 ? (score / maxPossible) : 0;

                                                      return {
                                                                        template,
                                                                        score: normalizedScore,
                                                                        reason: 'Keyword match'
                                                      };
                                    });

                                    return scores
                                                      .filter(s => s.score > 0)
                                                      .sort((a, b) => b.score - a.score)
                                                      .slice(0, limit);
                  }

                  /**
                   * AI-based semantic matching
                   */
                  private async semanticMatch(
                                    requirement: string,
                                    apiKey: any,
                                    limit: number
                  ): Promise<RecommendedTemplate[]> {
                                    try {
                                                      // Construct a lightweight prompt with template summaries
                                                      const templateSummaries = officialTemplates.map((t, index) =>
                                                                        `${index}. Name: ${t.name}, Desc: ${t.description}, Tags: ${t.tags?.join(',')}`
                                                      ).join('\n');

                                                      const prompt = `
You are a workflow template usage expert.
User Requirement: "${requirement}"

Available Templates:
${templateSummaries}

Task: Identify the top ${limit} templates that best match the user's requirement.
Return a JSON array of objects with fields: "index" (number), "score" (0.0-1.0), and "reason" (short string explanation).
If no template is relevant, return an empty array.
Output JSON only.
`;

                                                      const response = await aiService.chat(
                                                                        apiKey.provider,
                                                                        {
                                                                                          model: apiKey.defaultModel || 'deepseek/deepseek-chat',
                                                                                          messages: [{ role: 'user', content: prompt }],
                                                                                          temperature: 0.1,
                                                                                          maxTokens: 1024
                                                                        },
                                                                        safeDecryptApiKey(apiKey.keyEncrypted),
                                                                        apiKey.baseUrl || undefined
                                                      );

                                                      const jsonStr = response.content.replace(/```json\s*|\s*```/g, '').trim();
                                                      const results = JSON.parse(jsonStr) as Array<{ index: number, score: number, reason: string }>;

                                                      return results
                                                                        .map(r => ({
                                                                                          template: officialTemplates[r.index],
                                                                                          score: r.score,
                                                                                          reason: r.reason
                                                                        }))
                                                                        .filter(r => r.template) // Safety check
                                                                        .sort((a, b) => b.score - a.score);

                                    } catch (error) {
                                                      console.error('Semantic match failed, falling back to keywords', error);
                                                      return this.keywordMatch(requirement, limit);
                                    }
                  }

                  private async getApiKey(organizationId: string) {
                                    return prisma.apiKey.findFirst({
                                                      where: {
                                                                        organizationId,
                                                                        isActive: true,
                                                      }
                                    });
                  }
}

export const templateRecommender = new TemplateRecommender();
