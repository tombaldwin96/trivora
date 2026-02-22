/**
 * Apple In-App Purchase for tournament entry (£5).
 * Product ID must match a consumable IAP in App Store Connect.
 */
export const TOURNAMENT_ENTRY_PRODUCT_ID = 'trivora_tournament_entry_5';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export type TournamentIAPResult = { ok: true } | { ok: false; error: string };

export async function verifyTournamentPurchase(params: {
  tournamentId: string;
  transactionId: string;
  productId: string;
  accessToken: string;
}): Promise<TournamentIAPResult> {
  if (!SUPABASE_URL) return { ok: false, error: 'Not configured' };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-apple-tournament-purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        tournament_id: params.tournamentId,
        transaction_id: params.transactionId,
        product_id: params.productId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? 'Verification failed' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
