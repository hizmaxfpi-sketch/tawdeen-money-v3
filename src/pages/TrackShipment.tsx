import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Package, Ship, MapPin, CheckCircle, Truck, Loader, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatAmount, getStatusLabel } from '@/utils/formatUtils';
import logoImg from '@/assets/logo.png';

const STATUS_STEPS = [
  { key: 'loading', label: 'قيد التحميل', icon: Loader },
  { key: 'shipped', label: 'تم الشحن', icon: Ship },
  { key: 'arrived', label: 'وصلت الميناء', icon: MapPin },
  { key: 'cleared', label: 'تم التخليص', icon: CheckCircle },
  { key: 'delivered', label: 'تم التسليم', icon: Truck },
];

interface TrackingResult {
  packageNumber: string;
  clientName: string;
  goodsType: string;
  cbm: number;
  contractPrice: number;
  amountPaid: number;
  remainingAmount: number;
  paymentStatus: string;
  containerNumber: string;
  containerStatus: string;
  route: string;
}

export default function TrackShipment() {
  const { t, dir } = useLanguage();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);

    const { data: shipment, error: err } = await supabase
      .from('shipments')
      .select('package_number, client_name, goods_type, cbm, contract_price, amount_paid, remaining_amount, payment_status, container_id')
      .eq('package_number', query.trim().toUpperCase())
      .maybeSingle();

    if (err || !shipment) {
      setError(t('track.notFoundError'));
      setLoading(false);
      return;
    }

    const { data: container } = await supabase
      .from('containers')
      .select('container_number, status, route')
      .eq('id', shipment.container_id)
      .maybeSingle();

    setResult({
      packageNumber: shipment.package_number || '',
      clientName: shipment.client_name,
      goodsType: shipment.goods_type,
      cbm: Number(shipment.cbm),
      contractPrice: Number(shipment.contract_price),
      amountPaid: Number(shipment.amount_paid),
      remainingAmount: Number(shipment.remaining_amount),
      paymentStatus: shipment.payment_status,
      containerNumber: container?.container_number || '-',
      containerStatus: container?.status || 'loading',
      route: container?.route || '-',
    });
    setLoading(false);
  };

  const currentStepIndex = result ? STATUS_STEPS.findIndex(s => s.key === result.containerStatus) : -1;

  const paymentLabel: Record<string, string> = { paid: t('status.paidFull'), partial: t('status.partiallyPaid'), unpaid: t('status.unpaid') };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(215,70%,15%)] to-[hsl(215,50%,25%)] flex flex-col items-center" dir={dir}>
      {/* Header */}
      <header className="w-full max-w-lg mx-auto pt-8 pb-4 px-4 text-center">
        <img src={logoImg} alt={t('brand.name')} className="h-14 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-white">{t('track.title')}</h1>
        <p className="text-sm text-white/60 mt-1">{t('track.subtitle')}</p>
      </header>

      {/* Search */}
      <div className="w-full max-w-lg mx-auto px-4 mt-4">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('track.searchPlaceholder')}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40 text-center text-lg h-12"
            dir="ltr"
          />
          <Button onClick={handleSearch} disabled={loading} className="h-12 px-6 bg-primary hover:bg-primary/90">
            {loading ? <Loader className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-lg mx-auto px-4 mt-4">
            <div className="bg-destructive/20 border border-destructive/30 text-white rounded-xl p-4 text-center text-sm">{error}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="w-full max-w-lg mx-auto px-4 mt-6 space-y-4 pb-12">
            {/* Package Info */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-white font-bold">{result.packageNumber}</p>
                  <p className="text-white/50 text-xs">{result.clientName} • {result.goodsType}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <p className="text-white/50 text-[10px]">{t('shipping.container')}</p>
                  <p className="text-white font-bold text-xs">{result.containerNumber}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <p className="text-white/50 text-[10px]">{t('common.routeLabel')}</p>
                  <p className="text-white font-bold text-xs">{result.route}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <p className="text-white/50 text-[10px]">{t('reports.volumeCbm')}</p>
                  <p className="text-white font-bold text-xs">{formatAmount(result.cbm)} CBM</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2 text-center">
                  <p className="text-white/50 text-[10px]">{t('reports.paymentStatus')}</p>
                  <p className={cn("font-bold text-xs", result.paymentStatus === 'paid' ? 'text-emerald-400' : result.paymentStatus === 'partial' ? 'text-amber-400' : 'text-rose-400')}>
                    {paymentLabel[result.paymentStatus] || result.paymentStatus}
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
              <h3 className="text-white font-bold text-sm mb-4">{t('track.shipmentStatus')}</h3>
              <div className="space-y-0">
                {STATUS_STEPS.map((step, i) => {
                  const isActive = i <= currentStepIndex;
                  const isCurrent = i === currentStepIndex;
                  const StepIcon = step.icon;
                  return (
                    <div key={step.key} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all",
                          isCurrent ? "bg-primary border-primary scale-110 shadow-lg shadow-primary/30" :
                          isActive ? "bg-emerald-500/20 border-emerald-500" : "bg-white/5 border-white/20"
                        )}>
                          <StepIcon className={cn("h-4 w-4", isCurrent ? "text-white" : isActive ? "text-emerald-400" : "text-white/30")} />
                        </div>
                        {i < STATUS_STEPS.length - 1 && (
                          <div className={cn("w-0.5 h-8", isActive ? "bg-emerald-500/50" : "bg-white/10")} />
                        )}
                      </div>
                      <div className="pt-1">
                        <p className={cn("text-sm font-medium", isActive ? "text-white" : "text-white/30")}>{step.label}</p>
                         {isCurrent && <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1"><Clock className="h-3 w-3" /> {t('track.currentStatus')}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 p-4">
              <h3 className="text-white font-bold text-sm mb-3">{t('track.financialSummary')}</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-white/5">
                  <p className="text-white/50 text-[10px]">{t('shipping.contractPrice')}</p>
                  <p className="text-white font-bold text-sm">${formatAmount(result.contractPrice)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-emerald-500/10">
                  <p className="text-white/50 text-[10px]">{t('reports.amountPaid')}</p>
                  <p className="text-emerald-400 font-bold text-sm">${formatAmount(result.amountPaid)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-rose-500/10">
                  <p className="text-white/50 text-[10px]">{t('reports.remainingAmount')}</p>
                  <p className={cn("font-bold text-sm", result.remainingAmount > 0 ? "text-rose-400" : "text-emerald-400")}>${formatAmount(result.remainingAmount)}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="mt-auto pb-6 text-center">
         <p className="text-white/30 text-[10px]">{t('brand.name')} © {new Date().getFullYear()} - {t('track.footer')}</p>
      </div>
    </div>
  );
}
