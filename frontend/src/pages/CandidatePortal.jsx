import { useEffect, useState } from 'react';

const shortcuts = ['Control', 'Meta', 'Alt'];

export default function CandidatePortal() {
  const [events, setEvents] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setEvents((prev) => [...prev, 'TAB_SWITCH detected']);
    };

    const onFullscreen = () => {
      const enabled = Boolean(document.fullscreenElement);
      setFullscreen(enabled);
      if (!enabled) setEvents((prev) => [...prev, 'EXIT_FULLSCREEN detected']);
    };

    const onCopyPaste = (e) => {
      e.preventDefault();
      setEvents((prev) => [...prev, `${e.type.toUpperCase()} blocked`]);
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      setEvents((prev) => [...prev, 'RIGHT_CLICK blocked']);
    };

    const onShortcut = (e) => {
      if (shortcuts.includes(e.key) || (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setEvents((prev) => [...prev, 'KEYBOARD_SHORTCUT blocked']);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopyPaste);
    document.addEventListener('paste', onCopyPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onShortcut);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopyPaste);
      document.removeEventListener('paste', onCopyPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onShortcut);
    };
  }, []);

  const enterFullscreen = async () => {
    await document.documentElement.requestFullscreen();
    setFullscreen(true);
  };

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-xl font-semibold">Candidate Portal</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Structured CV/Profile builder and credential uploads</li>
          <li>Apply to jobs with pre-screening gates</li>
          <li>Timed proctored assessment (one attempt per job)</li>
          <li>Live interview room entry and application status tracking</li>
        </ul>
        <button onClick={enterFullscreen} className="mt-4 rounded bg-blue-600 px-4 py-2 text-white">
          {fullscreen ? 'Fullscreen enabled' : 'Enter assessment fullscreen'}
        </button>
      </div>
      <div className="rounded-xl bg-white p-5 shadow">
        <h3 className="font-semibold">Proctoring Activity</h3>
        <div className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-sm">
          {events.length === 0 ? 'No suspicious events logged yet.' : events.map((event, i) => <p key={`${event}-${i}`}>{event}</p>)}
        </div>
      </div>
    </section>
  );
}
