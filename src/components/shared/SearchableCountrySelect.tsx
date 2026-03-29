import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Globe, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { WORLD_COUNTRIES, Country } from '@/data/countries';

interface SearchableCountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  popularIds?: string[];
  placeholder?: string;
  className?: string;
}

export function SearchableCountrySelect({
  value,
  onChange,
  popularIds = [],
  placeholder = 'اختر البلد',
  className,
}: SearchableCountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = WORLD_COUNTRIES.find(c => c.id === value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      // Show popular first, then rest
      const popular = popularIds
        .map(id => WORLD_COUNTRIES.find(c => c.id === id))
        .filter(Boolean) as Country[];
      const rest = WORLD_COUNTRIES.filter(c => !popularIds.includes(c.id));
      return [...popular, ...rest];
    }
    return WORLD_COUNTRIES.filter(c =>
      c.label.includes(q) || c.labelEn.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [search, popularIds]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background",
          "hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          !selectedCountry && "text-muted-foreground"
        )}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          {selectedCountry ? `${selectedCountry.label} (${selectedCountry.labelEn})` : placeholder}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg">
          <div className="p-1.5">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن البلد..."
                className="h-8 text-xs pr-7"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-3">لا توجد نتائج</p>
            ) : (
              filtered.map((country, idx) => (
                <button
                  key={country.id}
                  type="button"
                  className={cn(
                    "w-full text-right px-2.5 py-1.5 text-xs rounded-md transition-colors",
                    value === country.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                    idx === popularIds.length - 1 && !search && "border-b border-border mb-1 pb-2"
                  )}
                  onClick={() => {
                    onChange(country.id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  {country.label} ({country.labelEn})
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
