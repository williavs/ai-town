import { internalAction, internalQuery } from './_generated/server';
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
