import { useState } from 'react';
import { Shield, LogOut, Globe } from 'lucide-react';
import { useT, LANGUAGES } from '../i18n';

export default function Sidebar({ items, active, onSelect, onLogout }) {
  const [langOpen, setLangOpen] = useState(false);
  const { lang, setLanguage } = useT();
  const current = LANGUAGES.find(l => l.code === lang);

  return (
    <aside className="w-20 bg-gray-900 flex flex-col items-center py-5 shrink-0 sticky top-0 h-screen">
      <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center mb-6">
        <Shield size={20} className="text-white" />
      </div>
      <nav className="flex flex-col gap-2 w-full px-2">
        {items.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} onClick={() => onSelect(key)}
            className={`relative flex flex-col items-center gap-1 py-2.5 rounded-xl text-[11px] font-medium transition ${active === key ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
            <Icon size={18} />
            <span>{label}</span>
            {badge > 0 && <span className="absolute top-1.5 right-3.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{badge}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2 w-full px-2">
        {/* Language toggle */}
        <div className="relative w-full">
          <button
            onClick={() => setLangOpen(v => !v)}
            className="w-full flex flex-col items-center gap-1 py-2.5 rounded-xl text-[11px] text-gray-500 hover:text-white hover:bg-white/5 transition"
          >
            <Globe size={18} />
            <span>{current?.flag}</span>
          </button>
          {langOpen && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 min-w-[140px]">
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => { setLanguage(l.code); setLangOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${lang === l.code ? 'text-emerald-600 font-medium' : 'text-gray-700'}`}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={onLogout} className="flex flex-col items-center gap-1 text-[11px] text-gray-500 hover:text-white py-2 w-full">
          <LogOut size={18} /><span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
