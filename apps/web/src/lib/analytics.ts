import { supabase } from './supabase/client';
import type { AnalyticsEventName } from '@trivora/core';

export function trackEvent(
  name: AnalyticsEventName | string,
  properties?: Record<string, unknown>
) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    (supabase.from('analytics_events') as any).insert({
      name,
      properties: properties ?? null,
      user_id: user?.id ?? null,
    }).then(() => {}).catch(() => {});
  });
}
