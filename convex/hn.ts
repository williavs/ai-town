import { internalAction, internalQuery, query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

const HN_API = 'https://hacker-news.firebaseio.com/v0';

export const fetchTopStories = internalAction({
  args: {},
  handler: async (ctx) => {
    const resp = await fetch(`${HN_API}/topstories.json`);
    const ids: number[] = await resp.json();
    const top5 = ids.slice(0, 5);

    const stories = await Promise.all(
      top5.map(async (id) => {
        const storyResp = await fetch(`${HN_API}/item/${id}.json`);
        const story = await storyResp.json();
        return {
          hnId: id,
          title: story.title ?? '',
          url: story.url ?? '',
          score: story.score ?? 0,
          by: story.by ?? '',
          time: story.time ?? 0,
          descendants: story.descendants ?? 0,
        };
      }),
    );

    await ctx.runMutation(internal.hn.upsertStories, { stories });
  },
});

export const upsertStories = internalMutation({
  args: {
    stories: v.array(
      v.object({
        hnId: v.number(),
        title: v.string(),
        url: v.string(),
        score: v.number(),
        by: v.string(),
        time: v.number(),
        descendants: v.number(),
      }),
    ),
  },
  handler: async (ctx, { stories }) => {
    // Clear old stories and insert fresh ones
    const existing = await ctx.db.query('hnStories').collect();
    for (const old of existing) {
      await ctx.db.delete(old._id);
    }
    for (const story of stories) {
      await ctx.db.insert('hnStories', story);
    }
  },
});

export const getTopStories = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const stories = await ctx.db
      .query('hnStories')
      .order('desc')
      .take(limit ?? 3);
    return stories;
  },
});

export const listTopStories = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('hnStories').order('desc').take(5);
  },
});

export const storyDiscussions = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const stories = await ctx.db.query('hnStories').order('desc').take(5);
    if (stories.length === 0) return [];

    // Batch-load all player names for this world.
    const playerDescs = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const nameMap: Record<string, string> = {};
    for (const pd of playerDescs) {
      nameMap[pd.playerId] = pd.name;
    }

    // Get recent messages and group by conversation.
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', worldId))
      .order('desc')
      .take(100);

    // Group messages by conversationId.
    const convos: Record<string, typeof messages> = {};
    for (const msg of messages) {
      if (!convos[msg.conversationId]) convos[msg.conversationId] = [];
      convos[msg.conversationId].push(msg);
    }

    // Build keyword sets per story.
    // Stopwords that appear in tech conversations regardless of topic.
    const stopwords = new Set([
      'about', 'also', 'been', 'being', 'could', 'does', 'from', 'have',
      'into', 'just', 'know', 'like', 'make', 'made', 'more', 'most',
      'much', 'need', 'only', 'open', 'over', 'said', 'show', 'some',
      'such', 'take', 'than', 'that', 'them', 'then', 'they', 'this',
      'very', 'want', 'well', 'were', 'what', 'when', 'will', 'with',
      'your', 'code', 'data', 'work', 'used', 'using', 'really', 'think',
      'going', 'would', 'should', 'there', 'their', 'these', 'those',
      'other', 'after', 'still', 'every', 'first', 'thing', 'people',
      'right', 'great', 'build', 'model', 'system', 'point',
    ]);

    const storyKeywords = stories.map((s) => {
      const words = s.title
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4 && !stopwords.has(w));
      return { story: s, words };
    });

    // Match conversations to stories: require 2+ distinct keyword hits,
    // or 1 hit if the story only has 1 non-stopword keyword.
    type ConvoThread = {
      conversationId: string;
      messages: { authorName: string; text: string; _creationTime: number }[];
    };
    const grouped: Record<number, ConvoThread[]> = {};

    for (const [convoId, msgs] of Object.entries(convos)) {
      const allText = msgs.map((m) => m.text).join(' ').toLowerCase();
      for (const { story, words } of storyKeywords) {
        if (words.length === 0) continue;
        const hits = words.filter((w) => allText.includes(w)).length;
        const threshold = words.length === 1 ? 1 : 2;
        if (hits >= threshold) {
          if (!grouped[story.hnId]) grouped[story.hnId] = [];
          if (grouped[story.hnId].length < 5) {
            const sorted = [...msgs].sort(
              (a, b) => a._creationTime - b._creationTime,
            );
            grouped[story.hnId].push({
              conversationId: convoId,
              messages: sorted.map((m) => ({
                authorName: nameMap[m.author] ?? m.author,
                text: m.text,
                _creationTime: m._creationTime,
              })),
            });
          }
          break;
        }
      }
    }

    return stories.map((s) => ({
      hnId: s.hnId,
      title: s.title,
      score: s.score,
      descendants: s.descendants,
      conversations: grouped[s.hnId] ?? [],
    }));
  },
});

export const agentRelationships = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const allPlayers = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();

    const nameMap: Record<string, string> = {};
    for (const p of allPlayers) {
      nameMap[p.playerId] = p.name;
    }

    // Single query for all recent participation records in this world.
    const allHistory = await ctx.db
      .query('participatedTogether')
      .withIndex('playerHistory', (q) => q.eq('worldId', worldId))
      .order('desc')
      .take(500);

    // Count conversations between each pair.
    const pairCounts: Record<string, { player1: string; player2: string; count: number; lastTalked: number }> = {};
    for (const record of allHistory) {
      const key = [record.player1, record.player2].sort().join('|');
      if (!pairCounts[key]) {
        pairCounts[key] = {
          player1: record.player1,
          player2: record.player2,
          count: 0,
          lastTalked: 0,
        };
      }
      pairCounts[key].count++;
      pairCounts[key].lastTalked = Math.max(pairCounts[key].lastTalked, record.ended);
    }

    const pairs = Object.values(pairCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map((p) => ({
        name1: nameMap[p.player1] ?? p.player1,
        name2: nameMap[p.player2] ?? p.player2,
        count: p.count,
        lastTalked: p.lastTalked,
      }));

    return pairs;
  },
});
