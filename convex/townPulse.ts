import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { VACUUM_MAX_AGE } from './constants';

// Runs before vacuum to snapshot conversation analytics.
// Analyzes all messages from the current period, extracts topics,
// sentiment, notable quotes, and agent stats.

export const gatherPulseData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Look at everything that will be vacuumed (older than 3 days)
    // plus recent data for a complete picture
    const lookback = now - VACUUM_MAX_AGE;

    // Get the last pulse to know where we left off
    const lastPulse = await ctx.db
      .query('townPulse')
      .order('desc')
      .first();
    const periodStart = lastPulse ? lastPulse.periodEnd : lookback;
    const periodEnd = now;

    // Get all messages in period
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_creation_time', (q) =>
        q.gte('_creationTime', periodStart).lt('_creationTime', periodEnd),
      )
      .collect();

    // Get all archived conversations in period
    const conversations = await ctx.db
      .query('archivedConversations')
      .withIndex('by_creation_time', (q) =>
        q.gte('_creationTime', periodStart).lt('_creationTime', periodEnd),
      )
      .collect();

    // Get player descriptions for name mapping
    const playerDescs = await ctx.db.query('playerDescriptions').collect();
    const playerNames: Record<string, string> = {};
    for (const pd of playerDescs) {
      playerNames[pd.playerId] = pd.name;
    }

    // Get HN stories that were active during this period
    const hnStories = await ctx.db.query('hnStories').collect();

    return {
      messages: messages.map((m) => ({
        author: playerNames[m.author] || m.author,
        text: m.text,
        conversationId: m.conversationId,
        time: m._creationTime,
      })),
      conversationCount: conversations.length,
      hnStories: hnStories.map((s) => ({
        title: s.title,
        hnId: s.hnId,
        score: s.score,
        descendants: s.descendants,
      })),
      periodStart,
      periodEnd,
      playerNames,
    };
  },
});

export const analyzePulse = internalAction({
  args: {},
  handler: async (ctx) => {
    const data = await ctx.runQuery(internal.townPulse.gatherPulseData, {});

    if (data.messages.length === 0) {
      console.log('No messages to analyze for town pulse');
      return;
    }

    // Build conversation threads
    const threads: Record<string, { author: string; text: string }[]> = {};
    for (const msg of data.messages) {
      if (!threads[msg.conversationId]) threads[msg.conversationId] = [];
      threads[msg.conversationId].push({ author: msg.author, text: msg.text });
    }

    // Count messages per agent
    const agentMsgCount: Record<string, number> = {};
    const agentConvPartners: Record<string, Record<string, number>> = {};
    for (const msg of data.messages) {
      agentMsgCount[msg.author] = (agentMsgCount[msg.author] || 0) + 1;
    }
    for (const [convId, msgs] of Object.entries(threads)) {
      const participants = [...new Set(msgs.map((m) => m.author))];
      if (participants.length === 2) {
        const [a, b] = participants;
        if (!agentConvPartners[a]) agentConvPartners[a] = {};
        if (!agentConvPartners[b]) agentConvPartners[b] = {};
        agentConvPartners[a][b] = (agentConvPartners[a][b] || 0) + 1;
        agentConvPartners[b][a] = (agentConvPartners[b][a] || 0) + 1;
      }
    }

    // Build agent stats
    const agentStats = Object.entries(agentMsgCount)
      .sort(([, a], [, b]) => b - a)
      .map(([name, messageCount]) => {
        const partners = agentConvPartners[name] || {};
        const topPartner =
          Object.entries(partners).sort(([, a], [, b]) => b - a)[0]?.[0] || 'none';
        return {
          name,
          messageCount,
          topPartner,
          conversationCount: Object.values(partners).reduce((a, b) => a + b, 0),
        };
      });

    // Extract substantive messages (not goodbyes, not too short)
    const goodbyePatterns = /\b(exit|log off|leave|heading off|gotta go|see you|bye|pleasant|nice chat|going to go|time for me|signing off|unplug)\b/i;
    const substantiveMessages = data.messages.filter(
      (m: { text: string }) => m.text.length > 80 && !goodbyePatterns.test(m.text),
    );

    // Find topic keywords from HN stories
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
      'not', 'no', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
      'other', 'some', 'such', 'than', 'too', 'very', 'just', 'about',
      'also', 'back', 'how', 'its', 'new', 'now', 'old', 'our', 'out',
      'own', 'part', 'per', 'so', 'that', 'this', 'what', 'when', 'who',
      'why', 'you', 'your', 'it', 'we', 'they', 'them', 'their', 'there',
    ]);

    const storyTopics: { title: string; hnId: number; keywords: string[]; discussionCount: number }[] = [];
    for (const story of data.hnStories) {
      const keywords = story.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && !stopWords.has(w));
      let discussionCount = 0;
      for (const msg of substantiveMessages) {
        const lower = msg.text.toLowerCase();
        const hits = keywords.filter((k: string) => lower.includes(k));
        if (hits.length >= 2 || (keywords.length === 1 && hits.length === 1)) {
          discussionCount++;
        }
      }
      storyTopics.push({ title: story.title, hnId: story.hnId, keywords, discussionCount });
    }

    // Pick notable quotes -- longest substantive messages with real content
    type SubstantiveMsg = { author: string; text: string; conversationId: string; time: number };
    const notableQuotes = (substantiveMessages as SubstantiveMsg[])
      .sort((a: SubstantiveMsg, b: SubstantiveMsg) => b.text.length - a.text.length)
      .slice(0, 10)
      .map((m: SubstantiveMsg) => {
        // Try to match to an HN story
        const lower = m.text.toLowerCase();
        const matchedStory = storyTopics.find((s) => {
          const hits = s.keywords.filter((k: string) => lower.includes(k));
          return hits.length >= 2;
        });
        return {
          author: m.author,
          text: m.text.slice(0, 500),
          topic: matchedStory?.title || 'general',
        };
      });

    // Build topic sentiment (simple keyword-based)
    const topTopics: { topic: string; mentions: number; sentiment: string }[] = [];
    const sentimentPositive = /\b(great|amazing|love|excellent|brilliant|impressive|revolutionary|exciting|powerful|beautiful)\b/i;
    const sentimentNegative = /\b(terrible|awful|hate|broken|waste|bloated|overhyped|useless|mistake|garbage|flawed)\b/i;

    for (const story of storyTopics) {
      if (story.discussionCount === 0) continue;
      // Gather all messages about this story
      let posCount = 0;
      let negCount = 0;
      for (const msg of substantiveMessages) {
        const lower = msg.text.toLowerCase();
        const hits = story.keywords.filter((k) => lower.includes(k));
        if (hits.length >= 2 || (story.keywords.length === 1 && hits.length === 1)) {
          if (sentimentPositive.test(msg.text)) posCount++;
          if (sentimentNegative.test(msg.text)) negCount++;
        }
      }
      const sentiment = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'mixed';
      topTopics.push({ topic: story.title, mentions: story.discussionCount, sentiment });
    }
    topTopics.sort((a, b) => b.mentions - a.mentions);

    // Build summary
    const summary = [
      `Town Pulse for ${new Date(data.periodStart).toLocaleDateString()} - ${new Date(data.periodEnd).toLocaleDateString()}:`,
      `${data.messages.length} messages across ${data.conversationCount} conversations.`,
      `${substantiveMessages.length} substantive messages (${Math.round((substantiveMessages.length / Math.max(data.messages.length, 1)) * 100)}% signal).`,
      agentStats.length > 0 ? `Most active: ${agentStats[0].name} (${agentStats[0].messageCount} msgs).` : '',
      topTopics.length > 0 ? `Hot topic: "${topTopics[0].topic}" (${topTopics[0].mentions} mentions, ${topTopics[0].sentiment}).` : 'No clear trending topics.',
    ]
      .filter(Boolean)
      .join(' ');

    // Store the pulse
    await ctx.runMutation(internal.townPulse.storePulse, {
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      totalConversations: data.conversationCount,
      totalMessages: data.messages.length,
      topTopics: topTopics.slice(0, 10),
      agentStats,
      notableQuotes,
      hnStoriesCovered: storyTopics
        .filter((s) => s.discussionCount > 0)
        .map((s) => ({ title: s.title, hnId: s.hnId, discussionCount: s.discussionCount })),
      summary,
    });

    console.log(`Town Pulse saved: ${data.messages.length} msgs, ${data.conversationCount} convos`);
  },
});

export const storePulse = internalMutation({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    totalConversations: v.number(),
    totalMessages: v.number(),
    topTopics: v.array(v.object({
      topic: v.string(),
      mentions: v.number(),
      sentiment: v.string(),
    })),
    agentStats: v.array(v.object({
      name: v.string(),
      messageCount: v.number(),
      topPartner: v.string(),
      conversationCount: v.number(),
    })),
    notableQuotes: v.array(v.object({
      author: v.string(),
      text: v.string(),
      topic: v.string(),
    })),
    hnStoriesCovered: v.array(v.object({
      title: v.string(),
      hnId: v.number(),
      discussionCount: v.number(),
    })),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('townPulse', args);
  },
});

// Public query to read pulse history
export const listPulses = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query('townPulse')
      .order('desc')
      .take(limit || 10);
  },
});
