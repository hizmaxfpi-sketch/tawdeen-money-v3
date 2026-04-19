import { useState } from 'react';
import { motion } from 'framer-motion';
import { Factory, Package, ShoppingBag, TrendingUp, Wallet, BarChart3 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProduction } from '@/hooks/useProduction';
import { useSupabaseFinance } from '@/hooks/useSupabaseFinance';
import { useSupabaseContacts } from '@/hooks/useSupabaseContacts';
import { MaterialsTab } from './MaterialsTab';
import { ProductsServicesTab } from './ProductsServicesTab';
import { ProductionRunsTab } from './ProductionRunsTab';
import { cn } from '@/lib/utils';

export function ProductionPage() {
  const [tab, setTab] = useState<'materials' | 'catalog' | 'runs'>('materials');
  const prod = useProduction();
  const { getFundOptions } = useSupabaseFinance();
  const { contacts } = useSupabaseContacts();

  const fundOptions = getFundOptions();

  const cards = [
    { label: 'قيمة المواد', value: prod.summary.materialsValue, icon: Package, color: 'text-primary', gradient: 'bg-gradient-primary' },
    { label: 'قيمة المنتجات', value: prod.summary.productsValue, icon: Factory, color: 'text-primary', gradient: 'bg-gradient-primary' },
    { label: 'إجمالي المبيعات', value: prod.summary.totalSales, icon: ShoppingBag, color: 'text-income', gradient: 'bg-gradient-income' },
    { label: 'تكلفة المبيعات', value: prod.summary.totalCost, icon: Wallet, color: 'text-expense', gradient: 'bg-gradient-expense' },
    { label: 'صافي الربح', value: prod.summary.netProfit, icon: TrendingUp, color: prod.summary.netProfit >= 0 ? 'text-income' : 'text-expense', gradient: 'bg-gradient-primary' },
  ];

  return (
    <div className="space-y-3 py-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <Factory className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">الإنتاج</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-xl bg-card p-2.5 shadow-sm border border-border"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={cn('flex h-6 w-6 items-center justify-center rounded-lg', c.gradient)}>
                  <Icon className="h-3 w-3 text-white" />
                </div>
                <span className="text-[10px] text-muted-foreground">{c.label}</span>
              </div>
              <p className={cn('text-base font-bold', c.color)}>
                ${c.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="materials" className="text-xs gap-1">
            <Package className="h-3.5 w-3.5" /> المواد الخام
          </TabsTrigger>
          <TabsTrigger value="catalog" className="text-xs gap-1">
            <Factory className="h-3.5 w-3.5" /> منتجات وخدمات
          </TabsTrigger>
          <TabsTrigger value="runs" className="text-xs gap-1">
            <BarChart3 className="h-3.5 w-3.5" /> العمليات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="mt-3">
          <MaterialsTab
            materials={prod.materials}
            fundOptions={fundOptions}
            contacts={contacts.filter(c => c.type === 'vendor' || c.type === 'other')}
            onAdd={prod.addMaterial}
            onUpdate={prod.updateMaterial}
            onDelete={prod.deleteMaterial}
            onPurchase={prod.purchaseMaterial}
          />
        </TabsContent>

        <TabsContent value="catalog" className="mt-3">
          <ProductsServicesTab
            products={prod.products}
            materials={prod.materials}
            services={prod.services}
            bom={prod.bom}
            onAddProduct={prod.addProduct}
            onUpdateProduct={prod.updateProduct}
            onDeleteProduct={prod.deleteProduct}
            onSetBom={prod.setProductBom}
            onAddService={prod.addService}
            onUpdateService={prod.updateService}
            onDeleteService={prod.deleteService}
          />
        </TabsContent>

        <TabsContent value="runs" className="mt-3">
          <ProductionRunsTab
            products={prod.products}
            materials={prod.materials}
            services={prod.services}
            bom={prod.bom}
            fundOptions={fundOptions}
            contacts={contacts}
            onProduce={prod.produceProduct}
            onSell={prod.sellProduct}
            onSellMaterial={prod.sellRawMaterial}
            onUpdateSale={prod.updateSale}
            onDeleteSale={prod.deleteSale}
            onDeleteRun={prod.deleteRun}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
