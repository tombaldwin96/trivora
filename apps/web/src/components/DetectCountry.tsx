'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

/**
 * When mounted and user is logged in, if profile.country is missing we call the
 * detect-country Edge Function (uses client IP). Never overwrites an existing
 * country so the user's choice in profile is always kept.
 */
export function DetectCountry() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('country')
        .eq('id', user.id)
        .single();
      const country = (profile as { country?: string | null } | null)?.country;
      if (country != null && String(country).trim() !== '') return; // keep user's choice
      done.current = true;
      await supabase.functions.invoke('detect-country', { body: {} });
    })();
  }, []);

  return null;
}
