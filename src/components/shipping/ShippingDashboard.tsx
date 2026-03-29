import { motion } from 'framer-motion';
import { Ship, Package, TrendingUp, DollarSign, AlertCircle, CheckCircle, Truck, Loader } from 'lucide-react';
import { ShippingStats } from '@/types/finance';

interface ShippingDashboardProps {
  stats: ShippingStats;
}

export function ShippingDashboard({ stats }: ShippingDashboardProps) {
  // إحصائيات العمليات - صف واحد مضغوط
  const operationalStats = [
    { label: 'الحاويات', value: stats.totalContainers, icon: Ship, color: 'text-primary' },
    { label: 'الشحنات', value: stats.totalShipments, icon: Package, color: 'text-blue-600' },
    { label: 'نشطة', value: stats.activeContainers, icon: Loader, color: 'text-yellow-600' },
    { label: 'الاستخدام', value: `${stats.capacityUtilization.toFixed(0)}%`, icon: CheckCircle, color: 'text-income' },
  ];

  // إحصائيات مالية - صف واحد مضغوط
  const financialStats = [
    { 
      label: 'الإيرادات', 
      value: stats.totalRevenue, 
      color: 'text-income',
      bgColor: 'bg-income/10',
    },
    { 
      label: 'التكاليف', 
      value: stats.totalCosts, 
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    { 
      label: 'الربح', 
      value: stats.totalProfit, 
      color: stats.totalProfit >= 0 ? 'text-income' : 'text-destructive',
      bgColor: stats.totalProfit >= 0 ? 'bg-income/10' : 'bg-destructive/10',
    },
    { 
      label: 'مدين', 
      value: stats.totalReceivables, 
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-500/10',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      {/* إحصائيات العمليات - مضغوطة */}
      <div className="flex items-center justify-between bg-card rounded-lg border border-border p-2.5">
        {operationalStats.map((stat, index) => (
          <div key={stat.label} className="flex items-center gap-1.5 flex-1">
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
            <div className="text-center">
              <p className="text-base font-bold leading-none">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{stat.label}</p>
            </div>
            {index < operationalStats.length - 1 && (
              <div className="h-6 w-px bg-border mr-auto" />
            )}
          </div>
        ))}
      </div>

      {/* إحصائيات مالية - صف أفقي مضغوط */}
      <div className="grid grid-cols-4 gap-1.5">
        {financialStats.map((stat) => (
          <div 
            key={stat.label} 
            className={`${stat.bgColor} rounded-lg p-2 text-center`}
          >
            <p className={`text-sm font-bold ${stat.color} leading-none`}>
              {stat.value.toLocaleString('ar-SA')}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
