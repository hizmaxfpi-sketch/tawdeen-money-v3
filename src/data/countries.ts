// قائمة دول العالم الشاملة
export interface Country {
  id: string;
  label: string;
  labelEn: string;
  region: string;
}

export const WORLD_COUNTRIES: Country[] = [
  // الشرق الأوسط وشمال أفريقيا
  { id: 'SA', label: 'السعودية', labelEn: 'Saudi Arabia', region: 'middle_east' },
  { id: 'AE', label: 'الإمارات', labelEn: 'UAE', region: 'middle_east' },
  { id: 'KW', label: 'الكويت', labelEn: 'Kuwait', region: 'middle_east' },
  { id: 'QA', label: 'قطر', labelEn: 'Qatar', region: 'middle_east' },
  { id: 'BH', label: 'البحرين', labelEn: 'Bahrain', region: 'middle_east' },
  { id: 'OM', label: 'عمان', labelEn: 'Oman', region: 'middle_east' },
  { id: 'IQ', label: 'العراق', labelEn: 'Iraq', region: 'middle_east' },
  { id: 'JO', label: 'الأردن', labelEn: 'Jordan', region: 'middle_east' },
  { id: 'LB', label: 'لبنان', labelEn: 'Lebanon', region: 'middle_east' },
  { id: 'SY', label: 'سوريا', labelEn: 'Syria', region: 'middle_east' },
  { id: 'PS', label: 'فلسطين', labelEn: 'Palestine', region: 'middle_east' },
  { id: 'YE', label: 'اليمن', labelEn: 'Yemen', region: 'middle_east' },
  { id: 'EG', label: 'مصر', labelEn: 'Egypt', region: 'north_africa' },
  { id: 'LY', label: 'ليبيا', labelEn: 'Libya', region: 'north_africa' },
  { id: 'TN', label: 'تونس', labelEn: 'Tunisia', region: 'north_africa' },
  { id: 'DZ', label: 'الجزائر', labelEn: 'Algeria', region: 'north_africa' },
  { id: 'MA', label: 'المغرب', labelEn: 'Morocco', region: 'north_africa' },
  { id: 'SD', label: 'السودان', labelEn: 'Sudan', region: 'north_africa' },
  { id: 'MR', label: 'موريتانيا', labelEn: 'Mauritania', region: 'north_africa' },
  { id: 'SO', label: 'الصومال', labelEn: 'Somalia', region: 'east_africa' },
  { id: 'DJ', label: 'جيبوتي', labelEn: 'Djibouti', region: 'east_africa' },
  { id: 'KM', label: 'جزر القمر', labelEn: 'Comoros', region: 'east_africa' },
  // آسيا
  { id: 'CN', label: 'الصين', labelEn: 'China', region: 'asia' },
  { id: 'TR', label: 'تركيا', labelEn: 'Turkey', region: 'asia' },
  { id: 'IN', label: 'الهند', labelEn: 'India', region: 'asia' },
  { id: 'PK', label: 'باكستان', labelEn: 'Pakistan', region: 'asia' },
  { id: 'BD', label: 'بنغلاديش', labelEn: 'Bangladesh', region: 'asia' },
  { id: 'ID', label: 'إندونيسيا', labelEn: 'Indonesia', region: 'asia' },
  { id: 'MY', label: 'ماليزيا', labelEn: 'Malaysia', region: 'asia' },
  { id: 'TH', label: 'تايلاند', labelEn: 'Thailand', region: 'asia' },
  { id: 'VN', label: 'فيتنام', labelEn: 'Vietnam', region: 'asia' },
  { id: 'PH', label: 'الفلبين', labelEn: 'Philippines', region: 'asia' },
  { id: 'JP', label: 'اليابان', labelEn: 'Japan', region: 'asia' },
  { id: 'KR', label: 'كوريا الجنوبية', labelEn: 'South Korea', region: 'asia' },
  { id: 'TW', label: 'تايوان', labelEn: 'Taiwan', region: 'asia' },
  { id: 'SG', label: 'سنغافورة', labelEn: 'Singapore', region: 'asia' },
  { id: 'MM', label: 'ميانمار', labelEn: 'Myanmar', region: 'asia' },
  { id: 'KH', label: 'كمبوديا', labelEn: 'Cambodia', region: 'asia' },
  { id: 'LK', label: 'سريلانكا', labelEn: 'Sri Lanka', region: 'asia' },
  { id: 'NP', label: 'نيبال', labelEn: 'Nepal', region: 'asia' },
  { id: 'UZ', label: 'أوزبكستان', labelEn: 'Uzbekistan', region: 'asia' },
  { id: 'KZ', label: 'كازاخستان', labelEn: 'Kazakhstan', region: 'asia' },
  { id: 'IR', label: 'إيران', labelEn: 'Iran', region: 'asia' },
  { id: 'AF', label: 'أفغانستان', labelEn: 'Afghanistan', region: 'asia' },
  // أوروبا
  { id: 'DE', label: 'ألمانيا', labelEn: 'Germany', region: 'europe' },
  { id: 'FR', label: 'فرنسا', labelEn: 'France', region: 'europe' },
  { id: 'GB', label: 'بريطانيا', labelEn: 'United Kingdom', region: 'europe' },
  { id: 'IT', label: 'إيطاليا', labelEn: 'Italy', region: 'europe' },
  { id: 'ES', label: 'إسبانيا', labelEn: 'Spain', region: 'europe' },
  { id: 'NL', label: 'هولندا', labelEn: 'Netherlands', region: 'europe' },
  { id: 'BE', label: 'بلجيكا', labelEn: 'Belgium', region: 'europe' },
  { id: 'PT', label: 'البرتغال', labelEn: 'Portugal', region: 'europe' },
  { id: 'PL', label: 'بولندا', labelEn: 'Poland', region: 'europe' },
  { id: 'CZ', label: 'التشيك', labelEn: 'Czech Republic', region: 'europe' },
  { id: 'SE', label: 'السويد', labelEn: 'Sweden', region: 'europe' },
  { id: 'AT', label: 'النمسا', labelEn: 'Austria', region: 'europe' },
  { id: 'CH', label: 'سويسرا', labelEn: 'Switzerland', region: 'europe' },
  { id: 'RO', label: 'رومانيا', labelEn: 'Romania', region: 'europe' },
  { id: 'GR', label: 'اليونان', labelEn: 'Greece', region: 'europe' },
  { id: 'RU', label: 'روسيا', labelEn: 'Russia', region: 'europe' },
  { id: 'UA', label: 'أوكرانيا', labelEn: 'Ukraine', region: 'europe' },
  // أمريكا
  { id: 'US', label: 'أمريكا', labelEn: 'United States', region: 'americas' },
  { id: 'CA', label: 'كندا', labelEn: 'Canada', region: 'americas' },
  { id: 'MX', label: 'المكسيك', labelEn: 'Mexico', region: 'americas' },
  { id: 'BR', label: 'البرازيل', labelEn: 'Brazil', region: 'americas' },
  { id: 'AR', label: 'الأرجنتين', labelEn: 'Argentina', region: 'americas' },
  { id: 'CO', label: 'كولومبيا', labelEn: 'Colombia', region: 'americas' },
  { id: 'CL', label: 'تشيلي', labelEn: 'Chile', region: 'americas' },
  // أفريقيا
  { id: 'NG', label: 'نيجيريا', labelEn: 'Nigeria', region: 'africa' },
  { id: 'ZA', label: 'جنوب أفريقيا', labelEn: 'South Africa', region: 'africa' },
  { id: 'KE', label: 'كينيا', labelEn: 'Kenya', region: 'africa' },
  { id: 'ET', label: 'إثيوبيا', labelEn: 'Ethiopia', region: 'africa' },
  { id: 'GH', label: 'غانا', labelEn: 'Ghana', region: 'africa' },
  { id: 'TZ', label: 'تنزانيا', labelEn: 'Tanzania', region: 'africa' },
  { id: 'SN', label: 'السنغال', labelEn: 'Senegal', region: 'africa' },
  // أوقيانوسيا
  { id: 'AU', label: 'أستراليا', labelEn: 'Australia', region: 'oceania' },
  { id: 'NZ', label: 'نيوزيلندا', labelEn: 'New Zealand', region: 'oceania' },
];

// البلدان الأكثر استخداماً (تظهر في الأعلى)
export const POPULAR_ORIGIN_IDS = ['CN', 'TR', 'IN', 'AE', 'KR', 'JP', 'US', 'DE'];
export const POPULAR_DESTINATION_IDS = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'IQ', 'JO', 'EG'];

export function getCountryLabel(id: string): string {
  return WORLD_COUNTRIES.find(c => c.id === id)?.label || id;
}
