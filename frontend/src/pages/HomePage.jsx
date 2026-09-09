import { useState } from 'react';
import { request } from '../api';

export default function HomePage({ session, setSession }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', role: 'CANDIDATE' });
  const [status, setStatus] = useState('');

  const onChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setStatus('Processing...');
    try {
      if (mode === 'register') {
        await request('/auth/register', { method: 'POST', body: form });
        setMode('login');
        setStatus('Registration successful, now log in.');
        return;
      }

      const data = await request('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
      setSession({ token: data.token, user: data.user });
      localStorage.setItem('ethiohire-session', JSON.stringify({ token: data.token, user: data.user }));
      setStatus('Logged in successfully.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-2xl font-semibold">Automated Recruitment Workflow</h2>
        <p className="mt-2 text-slate-600">ATS pre-screening, proctored assessments, and live interviews in one platform.</p>
        <div className="mt-4 space-y-2 text-sm">
          <p>✅ Stage 1: Candidate intake, documents, hard filters, references</p>
          <p>✅ Stage 2: Timed exams, one-attempt policy, proctoring logs</p>
          <p>✅ Stage 3: Recruiter scheduling, scorecards, hiring decisions</p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h3 className="text-lg font-semibold">{mode === 'login' ? 'Login' : 'Register'}</h3>
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <input name="email" type="email" placeholder="Email" className="w-full rounded border px-3 py-2" onChange={onChange} required />
          <input name="password" type="password" placeholder="Password" className="w-full rounded border px-3 py-2" onChange={onChange} required />
          {mode === 'register' && (
            <select name="role" className="w-full rounded border px-3 py-2" value={form.role} onChange={onChange}>
              <option value="CANDIDATE">Candidate</option>
              <option value="RECRUITER">Recruiter</option>
              <option value="ADMIN">Admin</option>
            </select>
          )}
          <button className="w-full rounded bg-blue-600 px-4 py-2 text-white" type="submit">
            {mode === 'login' ? 'Login' : 'Register'}
          </button>
        </form>
        <button className="mt-3 text-sm text-blue-600" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
        </button>
        <p className="mt-2 text-sm text-slate-600">{status}</p>
        {session?.user && <p className="mt-2 text-sm font-medium text-green-700">Active session: {session.user.email}</p>}
      </div>
    </section>
  );
}
