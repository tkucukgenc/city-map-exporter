import { useLanguage } from '../context/LanguageContext';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function LanguageSwitcher() {
    const { language, setLanguage, languages } = useLanguage();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const current = languages.find(l => l.code === language);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
          bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]
          border border-[var(--color-border)]"
                title="Language"
            >
                <Globe size={16} />
                <span>{current?.flag} {current?.name}</span>
            </button>

            {open && (
                <div className="absolute bottom-full mb-2 left-0 w-48 rounded-lg shadow-2xl border
          border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden z-50">
                    {languages.map(lang => (
                        <button
                            key={lang.code}
                            onClick={() => { setLanguage(lang.code); setOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors
                hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]
                ${language === lang.code ? 'bg-[var(--color-primary)]/10 font-semibold' : ''}`}
                        >
                            <span className="text-lg">{lang.flag}</span>
                            <span>{lang.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
