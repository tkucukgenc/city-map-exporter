import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import translations, { languages } from '../i18n/translations';
import type { Language } from '../i18n/translations';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    languages: typeof languages;
    isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLang] = useState<Language>(() => {
        const saved = localStorage.getItem('cme-language');
        return (saved as Language) || 'en';
    });

    const setLanguage = useCallback((lang: Language) => {
        setLang(lang);
        localStorage.setItem('cme-language', lang);
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }, []);

    const t = useCallback((key: string): string => {
        const dict = translations[language] as Record<string, string>;
        return dict[key] || key;
    }, [language]);

    const isRTL = language === 'ar';

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, languages, isRTL }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
    return ctx;
}
