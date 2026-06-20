import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Brain, Lock, Activity, Globe } from 'lucide-react';
import { useT, LANGUAGES } from '../i18n';

export default function Landing() {
  const nav = useNavigate();
  const { t, lang, setLanguage } = useT();
  const [langOpen, setLangOpen] = useState(false);

  const current = LANGUAGES.find(l => l.code === lang);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight">HealthVault</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Language switcher */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <Globe size={14} />
              <span>{current?.flag} {current?.label}</span>
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 min-w-[140px]">
                {LANGUAGES.map(l => (
                  <button
                    key={l.code}
                    onClick={() => { setLanguage(l.code); setLangOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${lang === l.code ? 'text-emerald-600 font-medium' : 'text-gray-700'}`}
                  >
                    <span>{l.flag}</span> {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => nav('/login')} className="px-4 py-2 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition">
            {t.signIn}
          </button>
          <button onClick={() => nav('/register')} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
            {t.getStarted}
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-8 pt-16 pb-16 text-center">
        {/* Prominent brand name */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Shield size={32} className="text-white" />
          </div>
          <span className="text-5xl font-bold text-gray-900 tracking-tight">HealthVault</span>
        </div>

        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <Shield size={12} /> {t.tagline}
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold leading-tight mb-6 text-gray-900" style={{ letterSpacing: '-1px' }}>
          {t.heroTitle1}<br />
          <span className="text-emerald-600">{t.heroTitle2}</span><br />
          {t.heroTitle3}
        </h1>

        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10 text-center">
          {t.heroDesc}
        </p>

        <div className="flex gap-4 justify-center flex-wrap">
          <button onClick={() => nav('/login?role=patient')} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition">
            {t.patientPortal}
          </button>
          <button onClick={() => nav('/login?role=provider')} className="px-6 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl font-medium transition">
            {t.providerPortal}
          </button>
        </div>
      </main>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Brain,    title: t.f1Title, desc: t.f1Desc },
            { icon: Lock,     title: t.f2Title, desc: t.f2Desc },
            { icon: Shield,   title: t.f3Title, desc: t.f3Desc },
            { icon: Activity, title: t.f4Title, desc: t.f4Desc },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition">
              <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center mb-3">
                <Icon size={18} className="text-emerald-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
