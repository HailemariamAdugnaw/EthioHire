export default function AdminPortal() {
  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-xl font-semibold">System Admin Portal</h2>
        <p className="text-slate-600">Company verification, subscriptions, platform analytics, security logs, and global settings.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {['Company verification', 'Payment/subscription controls', 'Audit & security logs'].map((item) => (
          <div key={item} className="rounded-xl bg-white p-4 shadow text-sm">{item}</div>
        ))}
      </div>
    </section>
  );
}
