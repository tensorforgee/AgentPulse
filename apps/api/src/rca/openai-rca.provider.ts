import { Injectable } from '@nestjs/common';
import type { RcaProvider, RcaProviderInput } from './rca-provider';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

@Injectable()
export class OpenAiRcaProvider implements RcaProvider {
  isConfigured(): boolean {
    return Boolean(
      process.env.RCA_PROVIDER_API_KEY && process.env.RCA_PROVIDER_MODEL,
    );
  }

  async analyze(input: RcaProviderInput): Promise<string> {
    const apiKey = process.env.RCA_PROVIDER_API_KEY;
    const model = process.env.RCA_PROVIDER_MODEL;
    if (!apiKey || !model) {
      throw new Error('RCA provider is not configured');
    }

    const baseUrl = new URL(
      process.env.RCA_PROVIDER_BASE_URL ?? 'https://api.openai.com/v1',
    );
    if (!['http:', 'https:'].includes(baseUrl.protocol)) {
      throw new Error('RCA provider URL must use HTTP or HTTPS');
    }

    const response = await fetch(
      new URL('chat/completions', ensureTrailingSlash(baseUrl)).toString(),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 250,
          messages: [
            {
              role: 'system',
              content:
                'You diagnose failed AI-agent traces. Give a concise root-cause explanation grounded only in the supplied trace and span evidence. Mention the likely failing span and one practical next check.',
            },
            {
              role: 'user',
              content: JSON.stringify(input),
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new Error(`RCA provider returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('RCA provider returned an empty response');
    }

    return content.trim();
  }
}

function ensureTrailingSlash(url: URL): URL {
  const result = new URL(url);
  result.pathname = `${result.pathname.replace(/\/$/, '')}/`;
  return result;
}
