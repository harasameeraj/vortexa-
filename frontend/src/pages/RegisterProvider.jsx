import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import api from '../api';

export default function RegisterProvider() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', provider_type: 'hospital', license_number: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/register/provider', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify({ id: res.data.provider_id, name: res.data.name, role: 'provider', provider_type: res.data.provider_type }));
      nav(`/provider/${res.data.provider_id}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create Provider Account</h1>
          <p className="text-slate-400 text-sm mt-1">Hospital, pharmacy, lab, or insurance</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Provider Type</label>
              <select value={form.provider_type} onChange={e => setForm(f => ({ ...f, provider_type: e.target.value }))}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="hospital" className="bg-slate-800 text-white">Hospital</option>
                <option value="pharmacy" className="bg-slate-800 text-white">Pharmacy</option>
                <option value="lab" className="bg-slate-800 text-white">Laboratory</option>
                <option value="insurance" className="bg-slate-800 text-white">Insurance</option>
              </select>
            </div>
            {[
              { label: 'Organization Name', key: 'name', type: 'text', placeholder: 'City General Hospital' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'contact@hospital.com' },
              { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
              { label: 'License Number', key: 'license_number', type: 'text', placeholder: 'HSP-001' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  type={type} placeholder={placeholder}
                  className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  required={key !== 'license_number'} />
              </div>
            ))}
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition">
              {loading ? 'Creating account...' : 'Create Provider Account'}
            </button>
          </form>
          <p className="text-center text-xs text-slate-500 mt-4">
            Already have an account?{' '}
            <button onClick={() => nav('/login?role=provider')} className="text-blue-400 hover:underline">Sign in</button>
          </p>
        </div>
        <button onClick={() => nav('/')} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-400">← Back to home</button>
      </div>
    </div>
  );
}
