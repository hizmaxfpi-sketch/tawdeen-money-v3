import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendData } from '@/types/finance';

interface BalanceTrendProps {
  data: TrendData[];
}

export function BalanceTrend({ data }: BalanceTrendProps) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 9, fontFamily: 'Tajawal' }}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis 
            tick={{ fontSize: 9, fontFamily: 'Tajawal' }}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value.toLocaleString('ar-SA')} $`,
              name === 'income' ? 'مدين' : name === 'expense' ? 'دائن' : 'الرصيد'
            ]}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontFamily: 'Tajawal',
              fontSize: '10px',
            }}
          />
          <Legend 
            formatter={(value) => value === 'income' ? 'مدين' : value === 'expense' ? 'دائن' : 'الرصيد'}
            wrapperStyle={{ fontFamily: 'Tajawal', fontSize: '10px' }}
          />
          <Line
            type="monotone"
            dataKey="income"
            stroke="hsl(145, 65%, 42%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(145, 65%, 42%)', strokeWidth: 0, r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="expense"
            stroke="hsl(0, 72%, 51%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(0, 72%, 51%)', strokeWidth: 0, r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="hsl(215, 70%, 45%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(215, 70%, 45%)', strokeWidth: 0, r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
