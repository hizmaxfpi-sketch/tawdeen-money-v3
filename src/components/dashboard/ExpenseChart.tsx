import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartData } from '@/types/finance';
import { useLanguage } from '@/i18n/LanguageContext';

interface ExpenseChartProps {
  data: ChartData[];
}

export function ExpenseChart({ data }: ExpenseChartProps) {
  const { t, language } = useLanguage();
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  const formattedData = data.map((item, index) => ({
    ...item,
    name: item.label,
    percentage: ((item.value / total) * 100).toFixed(1),
  }));

  return (
    <div className="flex flex-col md:flex-row items-center gap-3">
      <div className="h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={formattedData}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={60}
              paddingAngle={3}
              dataKey="value"
              animationBegin={0}
              animationDuration={800}
            >
              {formattedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [`${value.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')} $`, t('tx.amount')]}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontFamily: 'Tajawal',
                fontSize: '10px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex-1 grid grid-cols-2 gap-1.5">
        {formattedData.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.08 }}
            className="flex items-center gap-1.5"
          >
            <div
              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-muted-foreground truncate">{item.label}</div>
              <div className="text-[10px] font-semibold">{item.percentage}%</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
