import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Landmark, CreditCard, Plus, X, ArrowLeftRight, Search, Filter, LayoutGrid, List, Check, Vault, CircleDollarSign, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Fund, FundType } from '@/types/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FundTransferModal } from './FundTransferModal';
import { CurrencyManager } from './CurrencyManager';
import { useCurrencies } from '@/hooks/useCurrencies';
import { usePersistedFilter } from '@/hooks/usePersistedFilters';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useLanguage } from '@/i18n/LanguageContext';

interface FundsPageProps {
  funds: Fund[];
  totalLiquidity?: number;
  onAddFund?: (fund: Omit<Fund, 'id' | 'createdAt' | 'balance'>) => Promise<any>;
  onTransferFunds?: (fromFundId: string, toFundId: string, amount: number, note?: string, currencyCode?: string) => Promise<any>;
  onRefresh?: () => void;
}

const FUND_ICONS: Record<string, typeof Wallet> = {
  cash: Wallet, bank: Landmark, wallet: CreditCard, safe: Vault, other: CircleDollarSign,
};

export function FundsPage({ funds, totalLiquidity, onAddFund, onTransferFunds, onRefresh }: FundsPageProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const permissions = useUserPermissions();
  const { currencies, addCurrency, deleteCurrency, updateExchangeRate } = useCurrencies();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FundType>('cash');
  const [newDescription, setNewDescription] = useState('');
  const [searchQuery, setSearchQuery] = usePersistedFilter('funds-search', '');
  const [selectedTypes, setSelectedTypes] = usePersistedFilter<string[]>('funds-types', []);
  const [viewMode, setViewMode] = usePersistedFilter<'grid' | 'list'>('funds-view', 'grid');

  // ✅ Source of truth: real fund balances from DB; snapshot only as last-resort fallback.
  const localTotal = useMemo(() => funds.reduce((sum, f) => sum + Number(f.balance || 0), 0), [funds]);
  const totalBalance = funds.length > 0 ? localTotal : (totalLiquidity ?? 0);
  const canCreateFunds = !!onAddFund && permissions.canCreate('funds');
  const canTransferFunds = !!onTransferFunds && permissions.canEdit('funds');
  const canManageCurrencies = permissions.canEdit('funds');

  const FUND_LABELS: Record<string, string> = {
    cash: t('funds.cash'), bank: t('funds.bank'), wallet: t('funds.wallet'), safe: t('funds.safe'), other: t('funds.other'),
  };

  const availableTypes = useMemo(() => Array.from(new Set(funds.map(f => f.type))), [funds]);

  const filteredFunds = useMemo(() => {
    let result = funds;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q) || (f.description && f.description.toLowerCase().includes(q)));
    }
    if (selectedTypes.length > 0) result = result.filter(f => selectedTypes.includes(f.type));
    return result;
  }, [funds, searchQuery, selectedTypes]);

  const handleAdd = async () => {
    if (!newName || !onAddFund || !canCreateFunds) return;
    await onAddFund({ name: newName, type: newType, description: newDescription || undefined });
    setNewName(''); setNewType('cash'); setNewDescription(''); setShowAddForm(false);
  };

  const handleFundClick = (fundId: string) => navigate(`/funds/${fundId}`);
  const toggleType = (type: string) => setSelectedTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  const activeFilterCount = selectedTypes.length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-primary p-4 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="h-6 w-6" />
          <span className="text-base font-medium">{t('funds.totalLiquidity')}</span>
        </div>
        <p className="text-3xl font-bold">${totalBalance.toLocaleString('en-US')}</p>
        <p className="text-sm opacity-80 mt-1">{funds.length} {t('funds.title').toLowerCase()}</p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">{t('funds.title')}</h2>
        <div className="flex gap-2">
          {onRefresh && (
            <Button size="sm" variant="outline" onClick={onRefresh} className="gap-1.5 h-8 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />{t('common.refresh')}
            </Button>
          )}
          {funds.length >= 2 && canTransferFunds && (
            <Button size="sm" variant="outline" onClick={() => setShowTransferModal(true)} className="gap-1.5 h-8 text-xs">
              <ArrowLeftRight className="h-3.5 w-3.5" />{t('funds.transfer')}
            </Button>
          )}
          {canCreateFunds && (
            <Button size="sm" onClick={() => setShowAddForm(true)} className="gap-1.5 h-8 text-xs">
              <Plus className="h-3.5 w-3.5" />{t('funds.add')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('funds.search')} className="h-9 text-sm pr-9" />
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowFilterModal(true)}
          className={cn("h-9 w-9 p-0 relative", activeFilterCount > 0 && "border-primary text-primary")}>
          <Filter className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">{activeFilterCount}</span>
          )}
        </Button>
        <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg">
          <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <CurrencyManager currencies={currencies}
        onAddCurrency={canManageCurrencies ? (code) => addCurrency(code) : undefined}
        onDeleteCurrency={canManageCurrencies ? deleteCurrency : undefined}
        onUpdateRate={canManageCurrencies ? updateExchangeRate : undefined} />

      {(searchQuery || selectedTypes.length > 0) && (
        <p className="text-xs text-muted-foreground">
          {filteredFunds.length} / {funds.length}
        </p>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3">
          {filteredFunds.map((fund, index) => {
            const Icon = FUND_ICONS[fund.type] || Wallet;
            return (
              <motion.div key={fund.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
                onClick={() => handleFundClick(fund.id)}
                className="rounded-xl bg-card p-4 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-primary/30 transition-all active:scale-[0.98]">
                <div className="flex flex-col items-center text-center">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-full mb-3",
                    fund.type === 'cash' ? "bg-gradient-income" : fund.type === 'bank' ? "bg-gradient-primary" : "bg-gradient-savings")}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <p className="font-semibold text-base truncate w-full">{fund.name}</p>
                  <p className="text-xs text-muted-foreground mb-2">{FUND_LABELS[fund.type] || fund.type}</p>
                  <p className="text-lg font-bold text-foreground">${fund.balance.toLocaleString('en-US')}</p>
                  {fund.isDefault && <span className="text-xs text-primary mt-1">{t('funds.default')}</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFunds.map((fund, index) => {
            const Icon = FUND_ICONS[fund.type] || Wallet;
            return (
              <motion.div key={fund.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }}
                onClick={() => handleFundClick(fund.id)}
                className="rounded-xl bg-card p-3 shadow-sm border border-border cursor-pointer hover:shadow-md hover:border-primary/30 transition-all active:scale-[0.99] flex items-center gap-3">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  fund.type === 'cash' ? "bg-gradient-income" : fund.type === 'bank' ? "bg-gradient-primary" : "bg-gradient-savings")}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{fund.name}</p>
                  <p className="text-xs text-muted-foreground">{FUND_LABELS[fund.type] || fund.type}</p>
                </div>
                <div className="text-left shrink-0">
                  <p className="text-base font-bold text-foreground">${fund.balance.toLocaleString('en-US')}</p>
                  {fund.isDefault && <span className="text-[10px] text-primary">{t('funds.default')}</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {filteredFunds.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">{t('funds.noMatch')}</div>
      )}

      <AnimatePresence>
        {showFilterModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowFilterModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-card rounded-xl shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-base font-bold">{t('funds.filterByType')}</h3>
                <button onClick={() => setShowFilterModal(false)} className="p-1.5 hover:bg-muted rounded"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                {availableTypes.map(type => (
                  <label key={type} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                    <Checkbox checked={selectedTypes.includes(type)} onCheckedChange={() => toggleType(type)} />
                    <span className="text-sm font-medium">{FUND_LABELS[type] || type}</span>
                  </label>
                ))}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setSelectedTypes(availableTypes)} className="flex-1 text-xs">{t('funds.selectAll')}</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedTypes([])} className="flex-1 text-xs">{t('funds.clear')}</Button>
                </div>
                <Button onClick={() => setShowFilterModal(false)} className="w-full h-10 text-base">{t('funds.apply')}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddForm && canCreateFunds && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowAddForm(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-card rounded-xl shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="text-base font-bold">{t('funds.addNew')}</h3>
                <button onClick={() => setShowAddForm(false)} className="p-1.5 hover:bg-muted rounded"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">{t('funds.nameRequired')}</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('funds.example')} className="h-10 text-base" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">{t('funds.typeRequired')}</label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as FundType)}>
                    <SelectTrigger className="h-10 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash" className="text-base">{t('funds.cash')}</SelectItem>
                      <SelectItem value="bank" className="text-base">{t('funds.bank')}</SelectItem>
                      <SelectItem value="wallet" className="text-base">{t('funds.wallet')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">{t('funds.descriptionLabel')}</label>
                  <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder={t('funds.shortDesc')} className="h-10 text-base" />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowAddForm(false)} className="flex-1 h-10 text-base">{t('common.cancel')}</Button>
                  <Button onClick={handleAdd} disabled={!newName} className="flex-1 h-10 text-base">{t('common.add')}</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTransferModal && canTransferFunds && onTransferFunds && (
          <FundTransferModal funds={funds} currencies={currencies} onTransfer={onTransferFunds} onClose={() => setShowTransferModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
