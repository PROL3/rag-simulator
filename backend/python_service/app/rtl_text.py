"""Small RTL text-order repairs for PDFs extracted with pypdf's layout mode.

Some PDFs expose Hebrew words and table columns in visual reading order. This
normalizer restores logical reading order while keeping Latin/model-name runs
readable.
"""

from __future__ import annotations

import re

HEBREW = r"\u0590-\u05FF"
_HEBREW_RE = re.compile(f"[{HEBREW}]")
_LATIN_HEBREW_HYPHEN_RE = re.compile(rf"([A-Za-z0-9]+)-([{HEBREW}]+)")
_SCRIPT_BOUNDARY_RE = re.compile(rf"(?<=[{HEBREW}])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[{HEBREW}])")
_LAYOUT_HEBREW_RE = re.compile(rf"[{HEBREW}]+")


def _normalize_rtl_line(line: str) -> str:
    if not _HEBREW_RE.search(line):
        return line.strip()

    # PDFs commonly encode Hebrew prefixes/suffixes next to Latin product names
    # in visual order (for example "API-ה"). Put the Hebrew prefix back first.
    line = _LATIN_HEBREW_HYPHEN_RE.sub(r"\2-\1", line)
    # Split tokens that the PDF text layer joined across writing systems.
    line = _SCRIPT_BOUNDARY_RE.sub(" ", line)

    # Keep contiguous Latin text together (Llama 3 (8B), nomic-embed-text, etc.),
    # while reversing Hebrew word order on the line.
    groups: list[str] = []
    latin_run: list[str] = []
    for word in line.split():
        if _HEBREW_RE.search(word):
            if latin_run:
                groups.append(" ".join(latin_run))
                latin_run.clear()
            groups.append(word)
        else:
            latin_run.append(word)
    if latin_run:
        groups.append(" ".join(latin_run))

    return " ".join(reversed(groups))


def _restore_layout_token(token: str) -> str:
    if not _HEBREW_RE.search(token):
        return token
    if not re.search(r"[A-Za-z0-9]", token):
        # In pypdf layout mode, Hebrew glyphs and their adjacent punctuation are
        # emitted in visual order, so reversing the complete token restores it.
        return token[::-1]
    # Keep Latin model names readable when a Hebrew prefix/suffix is attached.
    token = _LATIN_HEBREW_HYPHEN_RE.sub(r"\2-\1", token)
    return _LAYOUT_HEBREW_RE.sub(lambda match: match.group(0)[::-1], token)


def normalize_rtl_layout_text(text: str) -> str:
    """Restore Hebrew words and table columns from pypdf's fixed-width layout."""
    output: list[str] = []
    previous_blank = True
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            if not previous_blank:
                output.append("")
            previous_blank = True
            continue

        if not _HEBREW_RE.search(line):
            output.append(line)
            previous_blank = False
            continue

        # Wide gaps in layout mode mark separate visual table columns. Hebrew
        # reading order moves from the rightmost column to the leftmost column.
        visual_cells = re.split(r"\s{2,}", line)
        logical_cells: list[str] = []
        for cell in reversed(visual_cells):
            restored = " ".join(_restore_layout_token(token) for token in cell.split())
            logical_cells.append(_normalize_rtl_line(restored))
        output.append(" | ".join(cell for cell in logical_cells if cell))
        previous_blank = False

    normalized = "\n".join(output).strip()
    # Move common punctuation artifacts back to the Latin number/currency value.
    normalized = re.sub(r"(?<!\d)\.(?=\d+(?:GB|MB|TB)\b)", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\$ל-(\d+)\b", r"ל-$\1", normalized)
    normalized = re.sub(r"(?m)^\.([A-Z0-9])", r"\1", normalized)
    normalized = re.sub(r"\bO\s+llama\b", "Ollama", normalized, flags=re.IGNORECASE)
    return normalized
