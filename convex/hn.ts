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

    // Get recent messages and group by conversation.
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', worldId))
      .order('desc')
      .take(300);

    // Group messages by conversationId.
    const convos: Record<string, typeof messages> = {};
    for (const msg of messages) {
      if (!convos[msg.conversationId]) convos[msg.conversationId] = [];
      convos[msg.conversationId].push(msg);
    }

    // Build keyword sets per story (words 4+ chars, lowercased).
    const storyKeywords = stories.map((s) => {
      const words = s.title
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4);
      return { story: s, words };
    });

    // Resolve player names (cache to avoid repeated lookups).
    const nameCache: Record<string, string> = {};
    async function getName(playerId: string) {
      if (nameCache[playerId]) return nameCache[playerId];
      const desc = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) =>
          q.eq('worldId', worldId).eq('playerId', playerId),
        )
        .first();
      nameCache[playerId] = desc?.name ?? playerId;
      return nameCache[playerId];
    }

    // Match entire conversations to stories by keyword overlap.
    type ConvoThread = {
      conversationId: string;
      messages: { authorName: string; text: string; _creationTime: number }[];
    };
    const grouped: Record<number, ConvoThread[]> = {};

    for (const [convoId, msgs] of Object.entries(convos)) {
      // Concatenate all messages to check for topic keywords.
      const allText = msgs.map((m) => m.text).join(' ').toLowerCase();
      for (const { story, words } of storyKeywords) {
        if (words.some((w) => allText.includes(w))) {
          if (!grouped[story.hnId]) grouped[story.hnId] = [];
          if (grouped[story.hnId].length < 5) {
            const sorted = [...msgs].sort(
              (a, b) => a._creationTime - b._creationTime,
            );
            const thread: ConvoThread = {
              conversationId: convoId,
              messages: [],
            };
            for (const m of sorted) {
              thread.messages.push({
                authorName: await getName(m.author),
                text: m.text,
                _creationTime: m._creationTime,
              });
            }
            grouped[story.hnId].push(thread);
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
