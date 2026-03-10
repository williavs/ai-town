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

    // Get recent messages (last 200) and match keywords from story titles.
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', worldId))
      .order('desc')
      .take(200);

    // Build keyword sets per story (words 4+ chars, lowercased).
    const storyKeywords = stories.map((s) => {
      const words = s.title
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4);
      return { story: s, words };
    });

    // Match messages to stories by keyword overlap.
    const grouped: Record<
      number,
      { authorName: string; text: string; _creationTime: number }[]
    > = {};
    for (const msg of messages) {
      if (!msg.text || msg.text.length < 10) continue;
      const lower = msg.text.toLowerCase();
      for (const { story, words } of storyKeywords) {
        if (words.some((w) => lower.includes(w))) {
          if (!grouped[story.hnId]) grouped[story.hnId] = [];
          if (grouped[story.hnId].length < 4) {
            const desc = await ctx.db
              .query('playerDescriptions')
              .withIndex('worldId', (q) =>
                q.eq('worldId', worldId).eq('playerId', msg.author),
              )
              .first();
            grouped[story.hnId].push({
              authorName: desc?.name ?? msg.author,
              text: msg.text.slice(0, 200),
              _creationTime: msg._creationTime,
            });
          }
          break;
        }
      }
    }

    return stories.map((s) => ({
      ...s,
      discussions: (grouped[s.hnId] ?? []).sort(
        (a, b) => a._creationTime - b._creationTime,
      ),
    }));
  },
});
