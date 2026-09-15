import { Database } from '@nozbe/watermelondb';
import { synchronize, SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key'
);

export async function syncDatabase(database: Database): Promise<void> {
  await synchronize({
    database,
    sendCreatedAsUpdated: true,
    pullChanges: async ({ lastPulledAt }) => {
      const { data, error } = await supabase.rpc('pull', {
        last_pulled_at: lastPulledAt ?? 0
      });
      if (error) throw new Error(`Pull failed: ${error.message}`);
      const { changes, timestamp } = data as { changes: SyncDatabaseChangeSet; timestamp: number };
      return { changes, timestamp };
    },
    pushChanges: async ({ changes }) => {
      const { error } = await supabase.rpc('push', { changes });
      if (error) throw new Error(`Push failed: ${error.message}`);
    }
  });
}
