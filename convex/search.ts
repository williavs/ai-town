import { internalAction } from './_generated/server';
import { v } from 'convex/values';

const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://localhost:8889';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const webSearch = internalAction({
  args: { query: v.string(), maxResults: v.optional(v.number()) },
  handler: async (_ctx, { query, maxResults }): Promise<SearchResult[]> => {
    const limit = maxResults ?? 5;
    try {
      const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&engines=google,duckduckgo,bing&categories=general`;
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        console.error(`SearXNG search failed: ${resp.status}`);
        return [];
      }
      const data = (await resp.json()) as { results: { title: string; url: string; content: string }[] };
      return data.results.slice(0, limit).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 300) ?? '',
      }));
    } catch (e) {
      console.error('SearXNG search error:', e);
      return [];
    }
  },
});

// Tool definition for LLM function calling
export const WEB_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description:
      'Search the web for current information about a topic. Use this when you want to look up recent news, verify facts, find technical details, or get context about something being discussed. Returns titles, URLs, and snippets from search results.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Be specific and concise.',
        },
      },
      required: ['query'],
    },
  },
};
