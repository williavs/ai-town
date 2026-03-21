import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

export default defineSchema({
  hnStories: defineTable({
    hnId: v.number(),
    title: v.string(),
    url: v.string(),
    score: v.number(),
    by: v.string(),
    time: v.number(),
    descendants: v.number(),
  }),

  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  townPulse: defineTable({
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
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});
