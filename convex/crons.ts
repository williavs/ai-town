import { cronJobs } from 'convex/server';
import { DELETE_BATCH_SIZE, IDLE_WORLD_TIMEOUT, VACUUM_MAX_AGE } from './constants';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { TableNames } from './_generated/dataModel';
import { v } from 'convex/values';

const crons = cronJobs();

crons.interval(
  'stop inactive worlds',
  { minutes: 10 },
  internal.world.stopInactiveWorlds,
);

crons.interval('restart dead worlds', { minutes: 5 }, internal.world.restartDeadWorlds);

crons.interval('fetch HN stories', { hours: 2 }, internal.hn.fetchTopStories);

// Run town pulse analysis every 2.5 days (before the 3-day vacuum wipes data)
crons.interval('town pulse analysis', { hours: 60 }, internal.townPulse.analyzePulse);

crons.interval('vacuum old entries', { hours: 6 }, internal.crons.vacuumOldEntries);

export default crons;

const TablesToVacuum: TableNames[] = [
  'inputs',
  'memories',
  'memoryEmbeddings',
  'embeddingsCache',
  'messages',
  'archivedConversations',
  'archivedPlayers',
  'archivedAgents',
  'participatedTogether',
];

// One-shot purge: run from Convex dashboard to free space immediately.
// Deletes everything older than 1 hour across all vacuumable tables.
export const purgeNow = internalMutation({
  args: {},
  handler: async (ctx) => {
    const before = Date.now() - 60 * 60 * 1000; // 1 hour ago
    for (const tableName of TablesToVacuum) {
      const exists = await ctx.db
        .query(tableName)
        .withIndex('by_creation_time', (q) => q.lt('_creationTime', before))
        .first();
      if (exists) {
        console.log(`Purging ${tableName}...`);
        await ctx.scheduler.runAfter(0, internal.crons.vacuumTable, {
          tableName,
          before,
          cursor: null,
          soFar: 0,
        });
      }
    }
  },
});

// Wipe embeddingsCache completely (it's excluded from wipeAllTables).
export const purgeEmbeddingsCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const results = await ctx.db
      .query('embeddingsCache')
      .paginate({ cursor: null, numItems: DELETE_BATCH_SIZE });
    for (const row of results.page) {
      await ctx.db.delete(row._id);
    }
    if (!results.isDone) {
      console.log(`Deleted ${results.page.length} embeddingsCache entries, continuing...`);
      await ctx.scheduler.runAfter(0, internal.crons.purgeEmbeddingsCache, {});
    } else {
      console.log(`Finished purging embeddingsCache (${results.page.length} final batch)`);
    }
  },
});

export const vacuumOldEntries = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    const before = Date.now() - VACUUM_MAX_AGE;
    for (const tableName of TablesToVacuum) {
      console.log(`Checking ${tableName}...`);
      const exists = await ctx.db
        .query(tableName)
        .withIndex('by_creation_time', (q) => q.lt('_creationTime', before))
        .first();
      if (exists) {
        console.log(`Vacuuming ${tableName}...`);
        await ctx.scheduler.runAfter(0, internal.crons.vacuumTable, {
          tableName,
          before,
          cursor: null,
          soFar: 0,
        });
      }
    }
  },
});

export const vacuumTable = internalMutation({
  args: {
    tableName: v.string(),
    before: v.number(),
    cursor: v.union(v.string(), v.null()),
    soFar: v.number(),
  },
  handler: async (ctx, { tableName, before, cursor, soFar }) => {
    const results = await ctx.db
      .query(tableName as TableNames)
      .withIndex('by_creation_time', (q) => q.lt('_creationTime', before))
      .paginate({ cursor, numItems: DELETE_BATCH_SIZE });
    for (const row of results.page) {
      await ctx.db.delete(row._id);
    }
    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.crons.vacuumTable, {
        tableName,
        before,
        soFar: results.page.length + soFar,
        cursor: results.continueCursor,
      });
    } else {
      console.log(`Vacuumed ${soFar + results.page.length} entries from ${tableName}`);
    }
  },
});
