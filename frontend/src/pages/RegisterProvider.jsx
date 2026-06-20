import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import api from '../api';

const inputCls = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Create Provider Account</h1>
          <p className="text-gray-500 text-sm mt-1">Hospital, pharmacy, lab, or insurance</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Provider Type</label>
              <select value={form.provider_type} onChange={e => setForm(f => ({ ...f, provider_type: e.target.value }))} className={inputCls}>
                <option value="hospital">Hospital</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="lab">Laboratory</option>
                <option value="insurance">Insurance</option>
              </select>
            </div>
            {[
              { label: 'Organization Name', key: 'name', type: 'text', placeholder: 'City General Hospital' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'contact@hospital.com' },
              { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
              { label: 'License Number', key: 'license_number', type: 'text', placeholder: 'HSP-001' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} type={type} placeholder={placeholder} className={inputCls} required={key !== 'license_number'} />
              </div>
            ))}
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition">
              {loading ? 'Creating account...' : 'Create Provider Account'}
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-4">
            Already have an account?{' '}
            <button onClick={() => nav('/login?role=provider')} className="text-emerald-600 hover:underline">Sign in</button>
          </p>
        </div>
        <button onClick={() => nav('/')} className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600">← Back to home</button>
      </div>
    </div>
  );
}
