import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Factory, Wrench } from 'lucide-react';
import { ProductsTab } from './ProductsTab';
import { ServicesTab } from './ServicesTab';
import type { ProductionMaterial, ProductionProduct, ProductionService, BomEntry } from '@/hooks/useProduction';

interface Props {
  products: ProductionProduct[];
  materials: ProductionMaterial[];
  services: ProductionService[];
  bom: BomEntry[];
  onAddProduct: (data: any) => Promise<void>;
  onUpdateProduct: (id: string, patch: any) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onSetBom: (productId: string, entries: { material_id: string; qty_per_unit: number }[]) => Promise<void>;
  onAddService: (data: { name: string; code?: string; default_price: number; notes?: string }) => Promise<void>;
  onUpdateService: (id: string, patch: Partial<ProductionService>) => Promise<void>;
  onDeleteService: (id: string) => Promise<void>;
}

export function ProductsServicesTab(props: Props) {
  const [tab, setTab] = useState<'products' | 'services'>('products');
  return (
    <div className="space-y-2">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="products" className="text-xs gap-1"><Factory className="h-3.5 w-3.5" />منتجات</TabsTrigger>
          <TabsTrigger value="services" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" />خدمات</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-3">
          <ProductsTab
            products={props.products}
            materials={props.materials}
            bom={props.bom}
            onAdd={props.onAddProduct}
            onUpdate={props.onUpdateProduct}
            onDelete={props.onDeleteProduct}
            onSetBom={props.onSetBom}
          />
        </TabsContent>
        <TabsContent value="services" className="mt-3">
          <ServicesTab
            services={props.services}
            onAdd={props.onAddService}
            onUpdate={props.onUpdateService}
            onDelete={props.onDeleteService}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
