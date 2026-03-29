import { getStoredLanguage, translateText } from '@/i18n/translations';

const MONTH_NAMES: Record<'ar' | 'en' | 'tr', string[]> = {
  ar: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  tr: ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'],
};

/**
 * Format date as Gregorian with Latin numerals
 */
export function formatDateGregorian(d: string | Date, style: 'short' | 'long' = 'short'): string {
  const date = new Date(d);
  const language = getStoredLanguage();
  if (style === 'long') {
    const months = MONTH_NAMES[language];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Format time as HH:MM with Latin numerals (24-hour)
 */
export function formatTime(d: string | Date): string {
  const date = new Date(d);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format date + time as "YYYY-MM-DD HH:MM"
 */
export function formatDateTime(d: string | Date): string {
  return `${formatDateGregorian(d)} ${formatTime(d)}`;
}

/**
 * Format date short (month + day) with Latin numerals
 */
export function formatDateShort(d: string | Date): string {
  const date = new Date(d);
  const months = MONTH_NAMES[getStoredLanguage()];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * Format number with Latin numerals (never Arabic-Indic)
 */
export function formatAmount(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Format integer with Latin numerals
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatCurrencyAmount(amount: number, currency = 'USD', decimals = 2): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${formatAmount(amount, decimals)}`;
}

export function getTranslatedLabel(key: string): string {
  return translateText(key, getStoredLanguage());
}

export function getStatusLabel(status: string): string {
  return translateText(`status.${status}`, getStoredLanguage());
}

export function getCategoryLabel(category: string): string {
  return translateText(`category.${category}`, getStoredLanguage());
}

export function getSourceLabel(sourceType: string): string {
  return translateText(`source.${sourceType}`, getStoredLanguage());
}
