import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, Globe } from 'lucide-react';
import api from '../api';
import { useT, LANGUAGES } from '../i18n';

const inputCls = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get('role') || 'patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const { t, lang, setLanguage } = useT();
  const current = LANGUAGES.find(l => l.code === lang);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email, password, role });
      const user = res.data;
      localStorage.setItem('token', user.token);
      localStorage.setItem('user', JSON.stringify(user));
      if (role === 'patient') nav(`/patient/${user.id}`);
      else nav(`/provider/${user.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Language switcher */}
        <div className="flex justify-end mb-4 relative">
          <button onClick={() => setLangOpen(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition">
            <Globe size={12} /> {current?.flag} {current?.label}
          </button>
          {langOpen && (
            <div className="absolute top-8 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 min-w-[140px]">
              {LANGUAGES.map(l => (
                <button key={l.code} onClick={() => { setLanguage(l.code); setLangOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${lang === l.code ? 'text-emerald-600 font-medium' : 'text-gray-700'}`}>
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{t.signInTitle}</h1>
          <p className="text-gray-500 text-sm mt-1">Patient-sovereign healthcare access</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex bg-gray-100 rounded-lg p-1 mb-5">
            {[['patient', t.patientRole], ['provider', t.providerRole]].map(([r, label]) => (
              <button key={r} onClick={() => setRole(r)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${role === r ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.emailLabel}</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                placeholder={role === 'patient' ? 'alice@demo.com' : 'hospital@demo.com'} className={inputCls} required />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t.passwordLabel}</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="demo123" className={inputCls} required />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition">
              {loading ? t.signingIn : t.signInBtn}
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-4">
            {role === 'patient' ? (
              <>{t.newPatient}{' '}<button onClick={() => nav('/register')} className="text-emerald-600 hover:underline">{t.createAccount}</button></>
            ) : (
              <>{t.newProvider}{' '}<button onClick={() => nav('/register/provider')} className="text-emerald-600 hover:underline">{t.createAccount}</button></>
            )}
          </p>
        </div>
        <button onClick={() => nav('/')} className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600">{t.backHome}</button>
      </div>
    </div>
  );
}
