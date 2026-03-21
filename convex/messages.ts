import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { insertInput } from './aiTown/insertInput';
import { conversationId, playerId } from './aiTown/ids';
import { VACUUM_MAX_AGE } from './constants';

export const listMessages = query({
  args: {
    worldId: v.id('worlds'),
    conversationId,
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', args.worldId).eq('conversationId', args.conversationId))
      .take(50);
    // Batch-load all player names for this world once instead of per-message.
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const nameMap: Record<string, string> = {};
    for (const pd of playerDescriptions) {
      nameMap[pd.playerId] = pd.name;
    }
    return messages.map((message) => ({
      ...message,
      authorName: nameMap[message.author] ?? message.author,
    }));
  },
});

// All conversations (active + archived) with messages from the 3-day retention window.
export const allConversations = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) return { active: [], archived: [] };

    // Player name map
    const playerDescs = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const nameMap: Record<string, string> = {};
    for (const pd of playerDescs) {
      nameMap[pd.playerId] = pd.name;
    }

    // Active conversations from world state
    const active = [];
    for (const conv of world.conversations) {
      const participants: string[] = [];
      for (const p of conv.participants) {
        if (p.status.kind === 'participating' || p.status.kind === 'walkingOver') {
          participants.push(nameMap[p.playerId] || p.playerId);
        }
      }
      const messages = await ctx.db
        .query('messages')
        .withIndex('conversationId', (q) =>
          q.eq('worldId', args.worldId).eq('conversationId', conv.id),
        )
        .collect();
      active.push({
        id: conv.id,
        participants,
        numMessages: conv.numMessages,
        isTyping: conv.isTyping,
        created: conv.created,
        messages: messages.map((m) => ({
          id: m._id,
          author: nameMap[m.author] || m.author,
          text: m.text,
          time: m._creationTime,
        })),
      });
    }

    // Archived conversations from the retention window
    const archived = await ctx.db
      .query('archivedConversations')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();

    const cutoff = Date.now() - VACUUM_MAX_AGE;
    const recentArchived = archived.filter((c) => c.ended > cutoff);
    // Sort newest first
    recentArchived.sort((a, b) => b.ended - a.ended);

    const archivedWithMessages = [];
    for (const conv of recentArchived) {
      const messages = await ctx.db
        .query('messages')
        .withIndex('conversationId', (q) =>
          q.eq('worldId', args.worldId).eq('conversationId', conv.id),
        )
        .collect();
      archivedWithMessages.push({
        id: conv.id,
        participants: conv.participants.map((p) => nameMap[p] || p),
        numMessages: conv.numMessages,
        created: conv.created,
        ended: conv.ended,
        messages: messages.map((m) => ({
          id: m._id,
          author: nameMap[m.author] || m.author,
          text: m.text,
          time: m._creationTime,
        })),
      });
    }

    return { active, archived: archivedWithMessages };
  },
});

export const writeMessage = mutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    messageUuid: v.string(),
    playerId,
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      messageUuid: args.messageUuid,
      text: args.text,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'finishSendingMessage', {
      conversationId: args.conversationId,
      playerId: args.playerId,
      timestamp: Date.now(),
    });
  },
});
