import { supabase } from '@/integrations/supabase/client';

export const ASSET_TRANSACTION_CATEGORIES = [
  'asset_purchase',
  'asset_payment',
  'asset_improvement',
  'asset_depreciation',
] as const;

export type AssetTransactionCategory = (typeof ASSET_TRANSACTION_CATEGORIES)[number];
export type AssetTransactionKind = 'purchase' | 'payment' | 'improvement' | 'depreciation';

export function buildAssetMarker(assetId: string, kind: AssetTransactionKind) {
  return `asset:${assetId}:${kind}`;
}

export function buildAssetNote(assetId: string, kind: AssetTransactionKind, note?: string | null) {
  const marker = buildAssetMarker(assetId, kind);
  return note ? `${marker} | ${note}` : marker;
}

export async function createAssetTransaction(params: {
  assetId: string;
  kind: AssetTransactionKind;
  type: 'in' | 'out';
  category: AssetTransactionCategory;
  amount: number;
  description: string;
  date: string;
  fundId?: string | null;
  contactId?: string | null;
  note?: string | null;
}) {
  const { assetId, kind, type, category, amount, description, date, fundId, contactId, note } = params;

  const { data, error } = await supabase.rpc('process_transaction', {
    p_type: type,
    p_category: category,
    p_amount: amount,
    p_description: description,
    p_date: date,
    p_fund_id: fundId ?? null,
    p_contact_id: contactId ?? null,
    p_notes: buildAssetNote(assetId, kind, note),
  });

  if (error) throw error;

  if (data) {
    await (supabase.from('transactions') as any)
      .update({ reference_id: assetId })
      .eq('id', data as string);
  }

  return data as string | null;
}

export async function listAssetTransactionIds(
  assetId: string,
  assetName: string,
  categories: readonly string[] = ASSET_TRANSACTION_CATEGORIES,
) {
  const marker = `asset:${assetId}:`;

  const [byReference, byNotes, byDescription] = await Promise.all([
    (supabase.from('transactions') as any)
      .select('id')
      .eq('reference_id', assetId)
      .in('category', [...categories]),
    (supabase.from('transactions') as any)
      .select('id')
      .in('category', [...categories])
      .ilike('notes', `%${marker}%`),
    assetName
      ? (supabase.from('transactions') as any)
          .select('id')
          .in('category', [...categories])
          .ilike('description', `%${assetName}%`)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ]);

  const ids = new Set<string>();

  for (const row of [...(byReference.data || []), ...(byNotes.data || []), ...(byDescription.data || [])]) {
    if (row?.id) ids.add(row.id);
  }

  return [...ids];
}

export function getAssetDepreciationSnapshot(
  value: number,
  depreciationRate: number,
  purchaseDate: string,
  postedDepreciation = 0,
) {
  const normalizedValue = Number(value || 0);
  const normalizedRate = Number(depreciationRate || 0);
  const monthlyDepreciation = normalizedRate > 0 ? (normalizedValue * normalizedRate / 100) / 12 : 0;
  const monthsSincePurchase = getMonthsSince(purchaseDate);
  const expectedTotal = Math.min(monthlyDepreciation * monthsSincePurchase, normalizedValue);
  const unpostedAmount = Math.max(0, expectedTotal - Number(postedDepreciation || 0));
  const currentValue = Math.max(0, normalizedValue - expectedTotal);

  return {
    monthlyDepreciation: Number(monthlyDepreciation.toFixed(2)),
    monthsSincePurchase,
    expectedTotal: Number(expectedTotal.toFixed(2)),
    unpostedAmount: Number(unpostedAmount.toFixed(2)),
    currentValue: Number(currentValue.toFixed(2)),
  };
}

function getMonthsSince(dateStr: string) {
  const purchase = new Date(dateStr);
  const now = new Date();

  if (Number.isNaN(purchase.getTime())) return 0;

  return Math.max(0, (now.getFullYear() - purchase.getFullYear()) * 12 + (now.getMonth() - purchase.getMonth()));
}