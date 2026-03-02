import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
    const { isDark, toggleTheme } = useTheme();
    const { t } = useLanguage();

    return (
        <button
            onClick={toggleTheme}
            className="flex items-center gap-2 p-2 rounded-lg transition-all
        bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]
        text-[var(--color-text)] border border-[var(--color-border)]"
            title={isDark ? t('lightMode') : t('darkMode')}
        >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    );
}
