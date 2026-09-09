import { useEffect, useState } from 'react';
import { request } from '../api';

export default function AdminPortal({ session }) {
  const token = session?.token;
  const isAuthorized = session?.user?.role === 'ADMIN';

  const [status, setStatus] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [companies, setCompanies] = useState([]);

  const loadData = async () => {
    if (!token || !isAuthorized) return;
    try {
      const [analyticsData, companyData] = await Promise.all([
        request('/admin/analytics', { token }),
        request('/admin/companies', { token }),
      ]);
      setAnalytics(analyticsData);
      setCompanies(companyData || []);
    } catch (error) {
      setStatus(error.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const updateVerification = async (companyId, verificationStatus) => {
    try {
      await request('/admin/company-verification', {
        method: 'POST',
        token,
        body: { companyId, verificationStatus },
      });
      setStatus('Company verification updated.');
      await loadData();
    } catch (error) {
      setStatus(error.message);
    }
  };

  if (!session?.user) return <p className="rounded bg-yellow-100 p-3">Login as admin to use this portal.</p>;
  if (!isAuthorized) return <p className="rounded bg-yellow-100 p-3">This portal is only for ADMIN role accounts.</p>;

  return (
    <section className="space-y-4">
      <p className="rounded bg-slate-100 p-3 text-sm">{status || 'Ready'}</p>

      <div className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-xl font-semibold">Platform Analytics</h2>
        {analytics ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <div className="rounded bg-slate-50 p-3">Users: {analytics.totalUsers}</div>
            <div className="rounded bg-slate-50 p-3">Jobs: {analytics.totalJobs}</div>
            <div className="rounded bg-slate-50 p-3">Applications: {analytics.totalApplications}</div>
            <div className="rounded bg-slate-50 p-3">Hired: {analytics.hired}</div>
            <div className="rounded bg-slate-50 p-3">Interviews queued: {analytics.queuedInterviews}</div>
            <div className="rounded bg-slate-50 p-3">Proctoring flags: {analytics.proctoringFlags}</div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No analytics yet.</p>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow">
        <h3 className="font-semibold">Company Verification</h3>
        <div className="mt-3 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border p-2 text-left">Company</th>
                <th className="border p-2 text-left">Owner</th>
                <th className="border p-2 text-left">Status</th>
                <th className="border p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="border p-2">{company.companyName}</td>
                  <td className="border p-2">{company.user.email}</td>
                  <td className="border p-2">{company.verificationStatus}</td>
                  <td className="border p-2 space-x-2">
                    <button className="rounded bg-green-600 px-2 py-1 text-white" onClick={() => updateVerification(company.id, 'VERIFIED')}>Verify</button>
                    <button className="rounded bg-red-600 px-2 py-1 text-white" onClick={() => updateVerification(company.id, 'SUSPENDED')}>Suspend</button>
                    <button className="rounded bg-slate-600 px-2 py-1 text-white" onClick={() => updateVerification(company.id, 'PENDING')}>Reset</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
