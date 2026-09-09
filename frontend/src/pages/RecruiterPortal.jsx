export default function RecruiterPortal() {
  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-xl font-semibold">Recruiter / HR Portal</h2>
        <p className="text-slate-600">Manage company profile, job filters, question bank, proctoring audits, and interview scheduling.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow">
          <h3 className="font-semibold">Job Screening Configuration</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>GPA, degree level, graduation year range</li>
            <li>Salary budget matching</li>
            <li>Knockout Yes/No requirements</li>
          </ul>
        </div>
        <div className="rounded-xl bg-white p-5 shadow">
          <h3 className="font-semibold">Interview Workflow</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Schedule live voice/video interviews</li>
            <li>Use structured scoring templates</li>
            <li>Shortlist, reject, or hire candidates</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
