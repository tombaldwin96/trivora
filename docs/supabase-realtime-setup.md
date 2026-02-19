# Set up and enable Supabase Realtime (1v1 live updates)

Realtime lets your app react instantly when rows change (e.g. when the opponent submits an answer in a 1v1 match). Supabase uses **Postgres Changes**: you add tables to a **publication**, then subscribe to those tables in the client.

---

## Part 1: Enable Realtime for your tables

You can do this in **one** of two ways.

### Option A: Run the migration (recommended)

A migration in the repo adds the 1v1 tables to the Realtime publication:

**File:** `supabase/migrations/20250215000005_realtime_publication.sql`

It runs:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches_1v1;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_rounds;
```

- Apply all migrations as usual (e.g. `supabase db push` or run the SQL in the Dashboard **SQL Editor**).
- If you get an error like “table already in publication”, the tables are already enabled (e.g. you used the dashboard). You can ignore or comment out those lines.

### Option B: Use the Supabase Dashboard

1. Open your project in the [Supabase Dashboard](https://app.supabase.com).
2. In the left sidebar go to **Database**.
3. Click **Publications** (or **Replication** in older UIs; the exact name can vary).
4. Find the publication **`supabase_realtime`**.
5. Turn **on** the tables you want:
   - **`matches_1v1`** – so you get INSERT/UPDATE when a match is created or its status changes.
   - **`match_rounds`** – so you get INSERT/UPDATE when either player submits an answer.

Once a table is in `supabase_realtime`, any INSERT/UPDATE/DELETE on that table can be received by clients that subscribe (subject to RLS).

---

## Part 2: Subscribe in the app (React Native / Expo)

Use the same Supabase client you already use for auth and REST. No extra packages are required.

### Subscribe to all changes on a table

Example: listen to every change on `matches_1v1`:

```ts
import { supabase } from '@/lib/supabase';
import { useEffect } from 'react';

function useMatchChanges() {
  useEffect(() => {
    const channel = supabase
      .channel('matches_1v1_changes')
      .on(
        'postgres_changes',
        {
          event: '*',           // 'INSERT' | 'UPDATE' | 'DELETE' or '*' for all
          schema: 'public',
          table: 'matches_1v1',
        },
        (payload) => {
          console.log('Match change:', payload);
          // payload.new = new row (INSERT/UPDATE); payload.old = old row (UPDATE/DELETE)
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
```

### Subscribe only to one match (by `match_id`)

So each player only gets events for their current match:

```ts
const matchId = '…'; // current match UUID

const channel = supabase
  .channel(`match:${matchId}`)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'match_rounds',
      filter: `match_id=eq.${matchId}`,
    },
    (payload) => {
      // e.g. opponent submitted: payload.new has a_answer / b_answer, etc.
    }
  )
  .subscribe();

// On unmount / leaving match:
// supabase.removeChannel(channel);
```

### Event types

- **`event: '*'`** – all INSERT, UPDATE, DELETE.
- **`event: 'INSERT'`** – only new rows (e.g. new round row when someone answers).
- **`event: 'UPDATE'`** – only updates (e.g. match status or round fields).

### RLS and Realtime

Realtime still enforces **Row Level Security**. The user only receives change events for rows they are allowed to SELECT. Your existing RLS on `matches_1v1` and `match_rounds` (participants can read their matches) is enough; no extra policy is required for Realtime.

---

## Part 3: Quick checklist

| Step | What to do |
|------|------------|
| 1. Enable tables | Run migration `20250215000005_realtime_publication.sql` **or** add `matches_1v1` and `match_rounds` to `supabase_realtime` in **Database → Publications**. |
| 2. Subscribe in code | Use `supabase.channel(...).on('postgres_changes', { schema, table, filter? }, callback).subscribe()`. |
| 3. Clean up | Call `supabase.removeChannel(channel)` when the screen unmounts or the user leaves the match. |

After this, Realtime is set up and enabled for 1v1; the app can react to match and round changes in real time.
