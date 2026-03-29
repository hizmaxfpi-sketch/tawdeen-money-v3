
-- Add exchange_rate column to currencies table
ALTER TABLE public.currencies 
ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;

-- Add currency_code and exchange_rate to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;

-- Update existing currencies with default exchange rates
UPDATE public.currencies SET exchange_rate = 1 WHERE code = 'USD';
UPDATE public.currencies SET exchange_rate = 32 WHERE code = 'TRY' AND exchange_rate = 1;
UPDATE public.currencies SET exchange_rate = 7.2 WHERE code = 'CNY' AND exchange_rate = 1;
UPDATE public.currencies SET exchange_rate = 250 WHERE code = 'YER' AND exchange_rate = 1;
