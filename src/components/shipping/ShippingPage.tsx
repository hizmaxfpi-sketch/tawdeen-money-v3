import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Ship, Package, Plus, Search, Filter, SortAsc, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabaseShipping } from '@/hooks/useSupabaseShipping';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useSupabaseFinance } from '@/hooks/useSupabaseFinance';
import { useLanguage } from '@/i18n/LanguageContext';
import { Container, Shipment } from '@/types/finance';
import { ContainerCard } from './ContainerCard';
import { ShippingDashboard } from './ShippingDashboard';
import { PaymentModal } from './PaymentModal';
import { toast } from 'sonner';

type SortOption = 'date' | 'client' | 'goods';

export function ShippingPage() {
  const navigate = useNavigate();
  const shippingStore = useSupabaseShipping();
  const financeStore = useSupabaseFinance();
  const perms = useUserPermissions();
  const { t } = useLanguage();
  const canEdit = perms.canEdit('shipping');
  const canDelete = perms.canDelete('shipping');
  const canCreate = perms.canCreate('shipping');
  
  const [paymentShipment, setPaymentShipment] = useState<Shipment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const stats = shippingStore.getShippingStats();

  const filteredContainers = useMemo(() => {
    let result = [...shippingStore.containers];
    if (filterStatus !== 'all') result = result.filter(c => c.status === filterStatus);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => c.containerNumber.toLowerCase().includes(query) || c.route.toLowerCase().includes(query));
    }
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return result;
  }, [shippingStore.containers, filterStatus, searchQuery, sortBy]);

  const allShipments = useMemo(() => {
    let result = [...shippingStore.shipments];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => s.clientName.toLowerCase().includes(query) || s.goodsType.toLowerCase().includes(query) || s.trackingNumber?.toLowerCase().includes(query));
    }
    result.sort((a, b) => {
      if (sortBy === 'client') return a.clientName.localeCompare(b.clientName);
      if (sortBy === 'goods') return a.goodsType.localeCompare(b.goodsType);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return result;
  }, [shippingStore.shipments, searchQuery, sortBy]);

  const handleNavigateAddContainer = () => navigate('/shipping/add-container');
  const handleNavigateAddShipment = (containerId?: string) => {
    navigate(containerId ? `/shipping/add-shipment?containerId=${containerId}` : '/shipping/add-shipment');
  };
  const handleEditContainer = (container: Container) => navigate(`/shipping/edit-container/${container.id}`);

  const handleDeleteContainer = async (containerId: string) => {
    if (confirm(t('shipping.deleteContainerConfirm'))) {
      await shippingStore.deleteContainer(containerId);
      toast.success(t('shipping.containerDeleted'));
    }
  };

  const handleDeleteShipment = async (shipmentId: string) => {
    if (confirm(t('shipping.deleteShipmentConfirm'))) {
      await shippingStore.deleteShipment(shipmentId);
      toast.success(t('shipping.shipmentDeleted'));
    }
  };

  const handleAddPayment = (shipmentId: string) => {
    const shipment = shippingStore.shipments.find(s => s.id === shipmentId);
    if (shipment) setPaymentShipment(shipment);
  };

  const handleSubmitPayment = async (amount: number, fundId: string, note?: string) => {
    if (paymentShipment) {
      await shippingStore.addShipmentPayment(paymentShipment.id, amount, fundId, note);
      setPaymentShipment(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Ship className="h-4 w-4 text-primary" />
          {t('shipping.title')}
        </h2>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
            onClick={() => { shippingStore.fetchContainers(true); shippingStore.fetchShipments(true); }}
            title={t('common.refresh')}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canCreate && (
            <>
              <Button size="sm" variant="outline" className="gap-1 h-8 text-xs px-2" onClick={() => handleNavigateAddShipment()}>
                <Package className="h-3.5 w-3.5" />{t('shipping.shipment')}
              </Button>
              <Button size="sm" className="gap-1 h-8 text-xs px-2" onClick={handleNavigateAddContainer}>
                <Plus className="h-3.5 w-3.5" />{t('shipping.container')}
              </Button>
            </>
          )}
        </div>
      </div>

      {shippingStore.containersLoading ? (
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" />
        </div>
      ) : (
        <ShippingDashboard stats={stats} />
      )}

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('shipping.search')} className="pr-8 text-right h-8 text-sm" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <Filter className="h-3 w-3 ml-1" /><SelectValue placeholder={t('shipping.statusFilter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('shipping.allStatuses')}</SelectItem>
            <SelectItem value="loading">{t('shipping.loadingStatus')}</SelectItem>
            <SelectItem value="shipped">{t('shipping.shippedStatus')}</SelectItem>
            <SelectItem value="arrived">{t('shipping.arrivedStatus')}</SelectItem>
            <SelectItem value="delivered">{t('shipping.deliveredStatus')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SortAsc className="h-3 w-3 ml-1" /><SelectValue placeholder={t('shipping.sortBy')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">{t('shipping.sortDate')}</SelectItem>
            <SelectItem value="client">{t('shipping.sortClient')}</SelectItem>
            <SelectItem value="goods">{t('shipping.sortGoods')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="containers" className="w-full">
        <TabsList className="w-full h-9">
          <TabsTrigger value="containers" className="flex-1 gap-1 text-xs h-7">
            <Ship className="h-3.5 w-3.5" />
            {t('shipping.containers')} ({filteredContainers.length})
          </TabsTrigger>
          <TabsTrigger value="shipments" className="flex-1 gap-1 text-xs h-7">
            <Package className="h-3.5 w-3.5" />
            {t('shipping.shipments')} ({allShipments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="containers" className="mt-3 space-y-2">
          {shippingStore.containersLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          ) : filteredContainers.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-card p-6 shadow-sm border border-border text-center">
              <div className="flex justify-center mb-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Ship className="h-6 w-6 text-muted-foreground opacity-50" />
                </div>
              </div>
              <h3 className="text-sm font-medium mb-1">{t('shipping.noContainers')}</h3>
              <p className="text-xs text-muted-foreground mb-3">{t('shipping.addFirstContainer')}</p>
              {canCreate && (
                <Button size="sm" onClick={handleNavigateAddContainer}>
                  <Plus className="h-3.5 w-3.5 ml-1" />{t('shipping.addContainer')}
                </Button>
              )}
            </motion.div>
          ) : (
            filteredContainers.map(container => (
              <ContainerCard key={container.id} container={container}
                shipments={shippingStore.getContainerShipments(container.id)}
                contacts={financeStore.getAccountOptions()}
                funds={financeStore.getFundOptions()}
                onEdit={handleEditContainer} onDelete={handleDeleteContainer}
                onAddShipment={handleNavigateAddShipment}
                onEditShipment={(shipment) => navigate(`/shipping/edit-shipment/${shipment.id}`)}
                onDeleteShipment={handleDeleteShipment} onAddPayment={handleAddPayment}
                onToggleClosed={canEdit ? shippingStore.toggleContainerClosed : undefined}
                onExpenseChanged={() => { shippingStore.fetchContainers(true); }}
                canEdit={canEdit} canDelete={canDelete} />
            ))
          )}
        </TabsContent>

        <TabsContent value="shipments" className="mt-3">
          {allShipments.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-card p-6 shadow-sm border border-border text-center">
              <div className="flex justify-center mb-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Package className="h-6 w-6 text-muted-foreground opacity-50" />
                </div>
              </div>
              <h3 className="text-sm font-medium mb-1">{t('shipping.noShipments')}</h3>
              <p className="text-xs text-muted-foreground">{t('shipping.addShipmentsInContainers')}</p>
            </motion.div>
          ) : (
            <div className="space-y-1.5">
              {allShipments.map(shipment => {
                const container = shippingStore.containers.find(c => c.id === shipment.containerId);
                return (
                  <motion.div key={shipment.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-card rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <p className="font-bold text-sm">{shipment.clientName}</p>
                        <p className="text-xs text-muted-foreground">{shipment.goodsType}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold">{shipment.cbm.toFixed(2)} CBM</p>
                        <p className="text-[10px] text-muted-foreground">
                          {container?.containerNumber || t('shipping.notSpecified')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span>{t('shipping.contractPrice')}: ${shipment.contractPrice.toLocaleString('en-US')}</span>
                      <span className={shipment.remainingAmount > 0 ? 'text-destructive font-bold' : 'text-income font-bold'}>
                        {t('shipping.remaining')}: ${shipment.remainingAmount.toLocaleString('en-US')}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AnimatePresence>
        {paymentShipment && (
          <PaymentModal shipment={paymentShipment} funds={financeStore.funds}
            onSubmit={handleSubmitPayment} onClose={() => setPaymentShipment(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
