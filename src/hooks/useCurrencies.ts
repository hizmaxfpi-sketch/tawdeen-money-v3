import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  exchangeRate: number;
  isDefault?: boolean;
}

// Currency flags mapping
export const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', TRY: '🇹🇷', CNY: '🇨🇳',
  YER: '🇾🇪', SAR: '🇸🇦', AED: '🇦🇪', EGP: '🇪🇬', KWD: '🇰🇼',
  QAR: '🇶🇦', OMR: '🇴🇲', BHD: '🇧🇭', JOD: '🇯🇴', LBP: '🇱🇧',
  SYP: '🇸🇾', IQD: '🇮🇶', MAD: '🇲🇦', DZD: '🇩🇿', TND: '🇹🇳',
  SDG: '🇸🇩', LYD: '🇱🇾', INR: '🇮🇳', JPY: '🇯🇵', KRW: '🇰🇷',
  RUB: '🇷🇺', CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', MYR: '🇲🇾',
  IDR: '🇮🇩', PKR: '🇵🇰', BRL: '🇧🇷', MXN: '🇲🇽',
};

export const WORLD_CURRENCIES: Omit<Currency, 'id' | 'exchangeRate'>[] = [
  { code: 'USD', name: 'دولار أمريكي', symbol: '$', isDefault: true },
  { code: 'EUR', name: 'يورو', symbol: '€' },
  { code: 'GBP', name: 'جنيه إسترليني', symbol: '£' },
  { code: 'TRY', name: 'ليرة تركية', symbol: '₺' },
  { code: 'CNY', name: 'يوان صيني', symbol: '¥' },
  { code: 'YER', name: 'ريال يمني', symbol: 'ر.ي' },
  { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' },
  { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ' },
  { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م' },
  { code: 'KWD', name: 'دينار كويتي', symbol: 'د.ك' },
  { code: 'QAR', name: 'ريال قطري', symbol: 'ر.ق' },
  { code: 'OMR', name: 'ريال عماني', symbol: 'ر.ع' },
  { code: 'BHD', name: 'دينار بحريني', symbol: 'د.ب' },
  { code: 'JOD', name: 'دينار أردني', symbol: 'د.أ' },
  { code: 'LBP', name: 'ليرة لبنانية', symbol: 'ل.ل' },
  { code: 'SYP', name: 'ليرة سورية', symbol: 'ل.س' },
  { code: 'IQD', name: 'دينار عراقي', symbol: 'د.ع' },
  { code: 'MAD', name: 'درهم مغربي', symbol: 'د.م' },
  { code: 'DZD', name: 'دينار جزائري', symbol: 'د.ج' },
  { code: 'TND', name: 'دينار تونسي', symbol: 'د.ت' },
  { code: 'SDG', name: 'جنيه سوداني', symbol: 'ج.س' },
  { code: 'LYD', name: 'دينار ليبي', symbol: 'د.ل' },
  { code: 'INR', name: 'روبية هندية', symbol: '₹' },
  { code: 'JPY', name: 'ين ياباني', symbol: '¥' },
  { code: 'KRW', name: 'وون كوري', symbol: '₩' },
  { code: 'RUB', name: 'روبل روسي', symbol: '₽' },
  { code: 'CHF', name: 'فرنك سويسري', symbol: 'CHF' },
  { code: 'CAD', name: 'دولار كندي', symbol: 'C$' },
  { code: 'AUD', name: 'دولار أسترالي', symbol: 'A$' },
  { code: 'MYR', name: 'رينغيت ماليزي', symbol: 'RM' },
  { code: 'IDR', name: 'روبية إندونيسية', symbol: 'Rp' },
  { code: 'PKR', name: 'روبية باكستانية', symbol: '₨' },
  { code: 'BRL', name: 'ريال برازيلي', symbol: 'R$' },
  { code: 'MXN', name: 'بيزو مكسيكي', symbol: '$' },
];

export const DEFAULT_APP_CURRENCY: Currency = {
  id: 'default',
  code: 'USD',
  name: 'دولار أمريكي',
  symbol: '$',
  exchangeRate: 1,
  isDefault: true,
};

export function useCurrencies() {
  const { user } = useAuth();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrencies = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('currencies')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.error('Error fetching currencies:', error); }
    else {
      const mapped = (data || []).map(c => ({
        id: c.id,
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        exchangeRate: Number(c.exchange_rate || 1),
        isDefault: c.is_default || false,
      }));
      // Ensure USD exists
      if (!mapped.find(c => c.code === 'USD')) {
        mapped.unshift({ ...DEFAULT_APP_CURRENCY, id: 'usd-default', isDefault: true });
      }
      setCurrencies(mapped);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchCurrencies();
  }, [user, fetchCurrencies]);

  const addCurrency = useCallback(async (currencyCode: string) => {
    if (!user) return;
    const existing = currencies.find(c => c.code === currencyCode);
    if (existing) { toast.error('هذه العملة موجودة بالفعل'); return; }
    const worldCurrency = WORLD_CURRENCIES.find(c => c.code === currencyCode);
    if (!worldCurrency) { toast.error('العملة غير موجودة'); return; }

    const { error } = await supabase.from('currencies').insert({
      user_id: user.id,
      code: worldCurrency.code,
      name: worldCurrency.name,
      symbol: worldCurrency.symbol,
      exchange_rate: 1,
      is_default: false,
    });
    if (error) { toast.error('خطأ في إضافة العملة'); return; }
    toast.success('تمت إضافة العملة بنجاح');
    fetchCurrencies();
  }, [user, currencies, fetchCurrencies]);

  const updateExchangeRate = useCallback(async (currencyId: string, rate: number) => {
    const { error } = await supabase.from('currencies').update({ exchange_rate: rate }).eq('id', currencyId);
    if (error) { toast.error('خطأ في تحديث سعر الصرف'); return; }
    toast.success('تم تحديث سعر الصرف');
    fetchCurrencies();
  }, [fetchCurrencies]);

  const deleteCurrency = useCallback(async (currencyId: string) => {
    const currency = currencies.find(c => c.id === currencyId);
    if (currency?.code === 'USD') { toast.error('لا يمكن حذف الدولار الأمريكي'); return; }
    const { error } = await supabase.from('currencies').delete().eq('id', currencyId);
    if (error) { toast.error('خطأ في حذف العملة'); return; }
    toast.success('تم حذف العملة بنجاح');
    fetchCurrencies();
  }, [currencies, fetchCurrencies]);

  const getDefaultCurrency = useCallback((): Currency => {
    const usdCurrency = currencies.find(c => c.code === 'USD');
    return usdCurrency || DEFAULT_APP_CURRENCY;
  }, [currencies]);

  const getExchangeRate = useCallback((currencyCode: string): number => {
    if (currencyCode === 'USD') return 1;
    const currency = currencies.find(c => c.code === currencyCode);
    return currency?.exchangeRate || 1;
  }, [currencies]);

  const convertToUSD = useCallback((amount: number, currencyCode: string): number => {
    const rate = getExchangeRate(currencyCode);
    return rate > 0 ? amount / rate : amount;
  }, [getExchangeRate]);

  const convertFromUSD = useCallback((amountUSD: number, currencyCode: string): number => {
    const rate = getExchangeRate(currencyCode);
    return amountUSD * rate;
  }, [getExchangeRate]);

  const formatAmount = useCallback((amount: number, currencyCode?: string): string => {
    const currency = currencyCode
      ? currencies.find(c => c.code === currencyCode)
      : getDefaultCurrency();
    const symbol = currency?.symbol || '$';
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }, [currencies, getDefaultCurrency]);

  const exchangeRatesMap = useMemo(() => {
    const map: Record<string, number> = {};
    currencies.forEach(c => { map[c.code] = c.exchangeRate; });
    return map;
  }, [currencies]);

  const refetch = useCallback(() => { fetchCurrencies(); }, [fetchCurrencies]);

  return {
    currencies,
    isLoading,
    addCurrency,
    deleteCurrency,
    updateExchangeRate,
    refetch,
    getDefaultCurrency,
    getExchangeRate,
    convertToUSD,
    convertFromUSD,
    formatAmount,
    exchangeRatesMap,
    defaultCurrency: getDefaultCurrency(),
  };
}
