import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { insertInput } from './aiTown/insertInput';
import { conversationId, playerId } from './aiTown/ids';
import { VACUUM_MAX_AGE } from './constants';

// Strip inline function-call JSON artifacts that Llama 3.1 8B sometimes embeds in message text.
function cleanMessageText(text: string): string {
  if (!text) return text;
  let cleaned = text;
  // Remove various function call JSON formats:
  // {"name": "web_search", "arguments": {...}}
  // {"name": "function", "function": "web_search", "arguments": {...}}
  // {"type": "function", "name": "web_search", "arguments": {...}}
  cleaned = cleaned.replace(/\{[^{}]*"web_search"[^{}]*\{[^}]*\}[^}]*\}/g, '');
  // Remove <function=web_search>{...}</function> XML-style calls
  cleaned = cleaned.replace(/<function=web_search>\{[^}]*\}<\/function>/g, '');
  return cleaned.trim();
}

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
    return messages
      .map((message) => ({
        ...message,
        text: cleanMessageText(message.text),
        authorName: nameMap[message.author] ?? message.author,
      }))
      .filter((m) => m.text.length > 0);
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
      const rawMessages = await ctx.db
        .query('messages')
        .withIndex('conversationId', (q) =>
          q.eq('worldId', args.worldId).eq('conversationId', conv.id),
        )
        .collect();
      const messages = rawMessages
        .map((m) => ({
          id: m._id,
          author: nameMap[m.author] || m.author,
          text: cleanMessageText(m.text),
          time: m._creationTime,
        }))
        .filter((m) => m.text.length > 0);
      // Only include active conversations that have participants
      if (participants.length > 0) {
        active.push({
          id: conv.id,
          participants,
          numMessages: conv.numMessages,
          isTyping: conv.isTyping,
          created: conv.created,
          messages,
        });
      }
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
      // Skip empty conversations (failed invites with no messages)
      if (conv.numMessages === 0) continue;

      const rawMessages = await ctx.db
        .query('messages')
        .withIndex('conversationId', (q) =>
          q.eq('worldId', args.worldId).eq('conversationId', conv.id),
        )
        .collect();
      const messages = rawMessages
        .map((m) => ({
          id: m._id,
          author: nameMap[m.author] || m.author,
          text: cleanMessageText(m.text),
          time: m._creationTime,
        }))
        .filter((m) => m.text.length > 0);

      // Only include if there are real messages after cleaning
      if (messages.length === 0) continue;

      archivedWithMessages.push({
        id: conv.id,
        participants: conv.participants.map((p) => nameMap[p] || p),
        numMessages: messages.length,
        created: conv.created,
        ended: conv.ended,
        messages,
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
