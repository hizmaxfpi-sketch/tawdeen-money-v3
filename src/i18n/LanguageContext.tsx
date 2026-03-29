import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { translations, Language, getLanguageDirection, getStoredLanguage, translateLegacyText, translateText, TranslationParams } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: TranslationParams) => string;
  translateTextContent: (text: string) => string;
  dir: 'rtl' | 'ltr';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('tawdeen-language', lang);
  }, []);

  const t = useCallback((key: string, params?: TranslationParams): string => {
    return translateText(key, language, params);
  }, [language]);

  const translateTextContent = useCallback((text: string): string => {
    return translateLegacyText(text, language);
  }, [language]);

  const dir = getLanguageDirection(language);

  // Update document direction
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    document.body.dir = dir;
  }, [dir, language]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const shouldTranslateNode = (node: Node | null): node is HTMLElement => {
      return !!node && node.nodeType === Node.ELEMENT_NODE;
    };

    const translateTextNode = (textNode: Text) => {
      const original = textNode.textContent ?? '';
      if (!/[\u0600-\u06FF]/.test(original)) return;
      const translated = translateLegacyText(original, language);
      if (translated !== original) {
        textNode.textContent = translated;
      }
    };

    const translateElement = (element: HTMLElement) => {
      if (element.dataset.i18nSkip === 'true') return;

      const attributes = ['placeholder', 'title', 'aria-label', 'aria-description'];
      attributes.forEach((attribute) => {
        const current = element.getAttribute(attribute);
        if (!current || !/[\u0600-\u06FF]/.test(current)) return;
        const translated = translateLegacyText(current, language);
        if (translated !== current) {
          element.setAttribute(attribute, translated);
        }
      });

      element.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          translateTextNode(child as Text);
        } else if (shouldTranslateNode(child)) {
          translateElement(child);
        }
      });
    };

    translateElement(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          translateTextNode(mutation.target as Text);
        }

        if (mutation.type === 'attributes' && shouldTranslateNode(mutation.target)) {
          translateElement(mutation.target);
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node as Text);
          } else if (shouldTranslateNode(node)) {
            translateElement(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label', 'aria-description'],
    });

    return () => observer.disconnect();
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, translateTextContent, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
