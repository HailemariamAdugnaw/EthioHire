export default function HomePage() {
  return (
    <section className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="text-2xl font-semibold">Automated Recruitment Workflow</h2>
        <p className="mt-2 text-slate-600">
          End-to-end ATS, proctored assessment, and live interview orchestration for Ethiopian employers and candidates.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          'Stage 1: Structured CV and pre-screening filters',
          'Stage 2: Proctored timed assessments with anti-cheat controls',
          'Stage 3: Human-led voice/video interviews with scoring',
        ].map((item) => (
          <div key={item} className="rounded-xl bg-white p-4 shadow">{item}</div>
        ))}
      </div>
    </section>
  );
}
