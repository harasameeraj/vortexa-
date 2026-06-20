import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shield } from 'lucide-react';
import api from '../api';

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get('role') || 'patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Sign in to VORTEXA</h1>
          <p className="text-slate-400 text-sm mt-1">Patient-sovereign healthcare access</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          {/* Role toggle */}
          <div className="flex bg-white/5 rounded-lg p-1 mb-5">
            {['patient', 'provider'].map(r => (
              <button key={r} onClick={() => setRole(r)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition capitalize ${role === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {r}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)}
                type="email" placeholder={role === 'patient' ? 'alice@demo.com' : 'hospital@demo.com'}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)}
                type="password" placeholder="demo123"
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500" required />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="text-center text-xs text-slate-500 mt-4">
            {role === 'patient' ? (
              <>New patient?{' '}<button onClick={() => nav('/register')} className="text-blue-400 hover:underline">Create account</button></>
            ) : (
              <>New provider?{' '}<button onClick={() => nav('/register/provider')} className="text-blue-400 hover:underline">Create account</button></>
            )}
          </p>
        </div>
        <button onClick={() => nav('/')} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-400">← Back to home</button>
      </div>
    </div>
  );
}
