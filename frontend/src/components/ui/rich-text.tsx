/**
 * RichText — WYSIWYG editor (Quill 2) + safe HTML renderer for EthioHire
 * job content (description, role of the employee, education requirements).
 *
 * Editor toolbar: bold / italic / underline / strike, headings, bullet +
 * numbered lists, links — exactly the formatting recruiters asked for.
 * HTML is sanitized server-side (bleach allowlist) before storage; the
 * read-side renderer below re-sanitizes client-side with DOMPurify for
 * defense in depth. Legacy plain-text content (no markup) renders as-is
 * with preserved newlines.
 */
import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import "quill/dist/quill.snow.css";

/** True when the content contains HTML markup (vs legacy plain text). */
export function looksLikeHtml(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /<[a-z][\s\S]*>/i.test(raw);
}

/** Plain-text projection of stored rich text (search previews, snippets). */
export function stripHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  if (!looksLikeHtml(raw)) return raw;
  const el = document.createElement("div");
  el.innerHTML = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return (el.textContent || "").trim();
}

/** Sanitized rich-text viewer — server HTML is already allowlisted; this is
 * a second, client-side pass. Plain-text legacy content keeps its newlines. */
export function RichTextView({ html, className, testId }: { html: string | null | undefined; className?: string; testId?: string }) {
  if (!html) return null;
  if (!looksLikeHtml(html)) {
    return (
      <div className={className} data-testid={testId} style={{ whiteSpace: "pre-wrap" }}>{html}</div>
    );
  }
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "strong", "i", "em", "u", "s", "span", "h1", "h2", "h3", "h4", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
  });
  return <div className={className} data-testid={testId} dangerouslySetInnerHTML={{ __html: clean }} />;
}

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "clean"],
];

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Minimum content height in pixels (default 140). */
  minHeight?: number;
  testId?: string;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 140, testId }: RichTextEditorProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<import("quill").default | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Suppress the value→editor echo so typing isn't clobbered by re-renders.
  const incomingRef = useRef(value);
  incomingRef.current = value;

  useEffect(() => {
    let disposed = false;
    (async () => {
      const Quill = (await import("quill")).default;
      if (disposed || !holderRef.current || quillRef.current) return;
      const q = new Quill(holderRef.current, {
        theme: "snow",
        placeholder,
        modules: { toolbar: TOOLBAR },
      });
      // Disable Quill's markdown auto-conversion ("list autofill"): typing
      // "*", "-" or "1." at the start of a line followed by a space must stay
      // literal text. Recruiters reported typed bullets silently turning into
      // list items — lists are inserted only via the toolbar buttons.
      const kb = q.keyboard as unknown as { bindings: Record<string, Array<{ prefix?: RegExp }>> };
      for (const key of Object.keys(kb.bindings)) {
        kb.bindings[key] = kb.bindings[key].filter((b) => {
          // The list-autofill binding is the only default binding whose
          // prefix regex carries the checkbox marker "[x]".
          return !(b.prefix instanceof RegExp && b.prefix.source.includes("[x]"));
        });
      }
      // Quill renders an empty paragraph as "<p><br></p>" — normalize that to
      // "" so the backend stores null instead of noise.
      q.on("text-change", () => {
        const html = q.root.innerHTML;
        const blank = q.getText().trim().length === 0 && !q.root.querySelector("img");
        onChangeRef.current(blank ? "" : html);
      });
      if (incomingRef.current) q.clipboard.dangerouslyPasteHTML(incomingRef.current);
      quillRef.current = q;
    })();
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-md border bg-background" data-testid={testId}>
      <style>{`.eh-quill .ql-toolbar.ql-snow{border:none;border-bottom:1px solid hsl(var(--border));border-radius:6px 6px 0 0;background:hsl(var(--muted) / 0.35)} .eh-quill .ql-container.ql-snow{border:none;font-family:inherit} .eh-quill .ql-editor{min-height:${minHeight}px} .eh-quill .ql-editor h1{font-size:1.4rem;font-weight:700} .eh-quill .ql-editor h2{font-size:1.2rem;font-weight:700} .eh-quill .ql-editor h3{font-size:1.05rem;font-weight:600}`}</style>
      <div className="eh-quill" ref={holderRef} />
    </div>
  );
}
