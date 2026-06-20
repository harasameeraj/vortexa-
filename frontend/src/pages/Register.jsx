import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Download, Copy } from 'lucide-react';
import api from '../api';

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', dob: '' });
  const [privateKey, setPrivateKey] = useState('');
  const [patientId, setPatientId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/register/patient', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify({ id: res.data.patient_id, name: res.data.name, role: 'patient' }));
      setPrivateKey(res.data.private_key_pem);
      setPatientId(res.data.patient_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  function downloadKey() {
    const blob = new Blob([privateKey], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vortexa_private_key_${form.name.replace(' ', '_')}.pem`;
    a.click();
  }

  function copyKey() {
    navigator.clipboard.writeText(privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (privateKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <Shield size={20} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Save Your Private Key</h2>
                <p className="text-amber-400 text-xs font-medium">This is shown ONCE — you cannot recover it</p>
              </div>
            </div>
            <p className="text-slate-300 text-sm mb-4">
              This private key is your cryptographic identity. You'll need it to authorize provider access to your health records. Save it securely — VORTEXA does not store it.
            </p>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 mb-4 overflow-auto max-h-40">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">{privateKey}</pre>
            </div>
            <div className="flex gap-3 mb-5">
              <button onClick={downloadKey} className="flex items-center gap-2 flex-1 justify-center bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium transition">
                <Download size={15} /> Download .pem
              </button>
              <button onClick={copyKey} className="flex items-center gap-2 flex-1 justify-center bg-white/10 hover:bg-white/15 text-white py-2.5 rounded-lg text-sm transition">
                <Copy size={15} /> {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button onClick={() => nav(`/patient/${patientId}`)}
              className="w-full bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg font-medium text-sm transition">
              I've saved my key — Go to Dashboard →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create Patient Account</h1>
          <p className="text-slate-400 text-sm mt-1">Your RSA key pair will be generated on registration</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <form onSubmit={handleRegister} className="space-y-4">
            {[
              { label: 'Full Name', key: 'name', type: 'text', placeholder: 'Alice Johnson' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'alice@example.com' },
              { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  type={type} placeholder={placeholder}
                  className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  required />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date of Birth</label>
              <input value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
                type="date" max={new Date().toISOString().split('T')[0]}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition">
              {loading ? 'Generating keys...' : 'Create Account & Generate Keys'}
            </button>
          </form>
          <p className="text-center text-xs text-slate-500 mt-4">
            Already have an account?{' '}
            <button onClick={() => nav('/login')} className="text-blue-400 hover:underline">Sign in</button>
          </p>
        </div>
      </div>
    </div>
  );
}
