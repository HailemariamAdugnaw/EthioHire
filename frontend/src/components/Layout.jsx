import { Link } from 'react-router-dom';

export default function Layout({ children, session, onLogout }) {
  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-xl font-bold">EthioHire</h1>
            <p className="text-xs text-slate-300">Ethiopia&apos;s Smart Hiring Platform</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/" className="rounded bg-slate-700 px-3 py-1">Home</Link>
            <Link to="/candidate" className="rounded bg-slate-700 px-3 py-1">Candidate</Link>
            <Link to="/recruiter" className="rounded bg-slate-700 px-3 py-1">Recruiter</Link>
            <Link to="/admin" className="rounded bg-slate-700 px-3 py-1">Admin</Link>
          </div>
          <div className="text-right text-xs text-slate-200">
            {session?.user ? (
              <>
                <p>{session.user.email}</p>
                <p className="font-semibold">{session.user.role}</p>
                <button onClick={onLogout} className="mt-1 rounded bg-red-600 px-2 py-1 text-white">Logout</button>
              </>
            ) : (
              <p>Not logged in</p>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
