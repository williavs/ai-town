import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';

// Circuit breaker for LLM calls.
// When free-tier providers are exhausted, pause all agent AI activity
// to let rate limits cool down. Prevents garbage 2-message conversations.

const FAILURE_THRESHOLD = 2; // Trip after 2 consecutive failures
const BASE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minute base
const MAX_COOLDOWN_MS = 30 * 60 * 1000; // 30 minute cap

function getCooldown(tripCount: number): number {
  // Exponential backoff: 5min, 10min, 20min, 30min (cap)
  return Math.min(BASE_COOLDOWN_MS * Math.pow(2, tripCount), MAX_COOLDOWN_MS);
}

export const get = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('llmHealth')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
  },
});

export const recordFailure = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('llmHealth')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    const now = Date.now();
    if (existing) {
      const failures = existing.consecutiveFailures + 1;
      const update: any = {
        consecutiveFailures: failures,
        lastFailureTs: now,
      };
      if (failures >= FAILURE_THRESHOLD) {
        const tripCount = (existing.tripCount ?? 0) + 1;
        const cooldown = getCooldown(tripCount - 1);
        update.pausedUntil = now + cooldown;
        update.tripCount = tripCount;
        console.log(
          `LLM circuit breaker OPEN (trip #${tripCount}): ${failures} failures, pausing ${cooldown / 60000}min until ${new Date(update.pausedUntil).toISOString()}`,
        );
      }
      await ctx.db.patch(existing._id, update);
    } else {
      await ctx.db.insert('llmHealth', {
        worldId: args.worldId,
        consecutiveFailures: 1,
        lastFailureTs: now,
        tripCount: 0,
      });
    }
  },
});

export const recordSuccess = internalMutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('llmHealth')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (existing && existing.consecutiveFailures > 0) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: 0,
        pausedUntil: undefined,
        tripCount: 0,
      });
      if (existing.pausedUntil) {
        console.log('LLM circuit breaker CLOSED: successful call, resuming agent activity');
      }
    }
  },
});
