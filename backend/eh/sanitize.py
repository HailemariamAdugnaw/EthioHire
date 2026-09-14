"""EthioHire — HTML sanitization for rich-text job content.

Job description, role description and education requirements are edited with
a WYSIWYG editor (Quill) and stored as HTML. Everything is sanitized
SERVER-SIDE with a strict allowlist before it ever reaches the database, so
the candidate-side renderer can safely display it.

Allowed formatting mirrors what the editor toolbar offers: headings, bold /
italic / underline / strike, bullet + numbered lists, links and paragraphs.
"""
import bleach

ALLOWED_TAGS = [
    "p", "br",
    "b", "strong", "i", "em", "u", "s", "span",
    "h1", "h2", "h3", "h4",
    "ul", "ol", "li",
    "a",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "span": ["class"],  # Quill uses inline classes only; bleach strips everything else
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]

MAX_RICH_TEXT = 30000  # raw HTML cap (plain-text content is far below this)


def clean_html(raw, limit: int = MAX_RICH_TEXT) -> str | None:
    """Sanitize a rich-text payload. Returns None for empty content."""
    if raw is None:
        return None
    text = str(raw)[:limit]
    cleaned = bleach.clean(
        text,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,       # disallowed tags are dropped, their text content kept
        strip_comments=True,
    )
    cleaned = cleaned.strip()
    return cleaned or None


def strip_html(raw) -> str:
    """Plain-text projection of stored rich text (search previews, snippets)."""
    if not raw:
        return ""
    return bleach.clean(str(raw), tags=[], attributes={}, strip=True).strip()


def looks_like_html(raw) -> bool:
    """True when the stored content contains HTML markup (vs legacy plain text)."""
    if not raw:
        return False
    import re

    return bool(re.search(r"<[a-z][\s\S]*>", str(raw)))


__all__ = ["clean_html", "strip_html", "looks_like_html", "MAX_RICH_TEXT"]
