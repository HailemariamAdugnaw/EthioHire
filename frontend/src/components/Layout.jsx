import { Link } from 'react-router-dom';

export default function Layout({ children, role, setRole }) {
  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-xl font-bold">EthioHire</h1>
            <p className="text-xs text-slate-300">Ethiopia&apos;s Smart Hiring Platform</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/" className="rounded bg-slate-700 px-3 py-1">Home</Link>
            <Link to="/candidate" className="rounded bg-slate-700 px-3 py-1">Candidate</Link>
            <Link to="/recruiter" className="rounded bg-slate-700 px-3 py-1">Recruiter</Link>
            <Link to="/admin" className="rounded bg-slate-700 px-3 py-1">Admin</Link>
            <select className="rounded bg-white px-2 py-1 text-slate-900" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="CANDIDATE">Candidate</option>
              <option value="RECRUITER">Recruiter</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
