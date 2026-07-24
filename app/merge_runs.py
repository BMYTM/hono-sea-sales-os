#!/usr/bin/env python3
"""
Self-contained run-merger for HONO Proposal Studio.

Word often splits a single visible string ("Dear Keerthana,") across several
<w:r> runs that share identical formatting. The proposal patcher expects those
strings to be contiguous. This utility merges *adjacent, simple text runs that
have identical run-properties* inside each paragraph, so downstream string
replacements find their targets.

It is deliberately conservative: a run is only merged when it contains nothing
but <w:t> text (no breaks, tabs, drawings, fields, footnote refs, etc.), and
only with a neighbour whose <w:rPr> is byte-identical. This preserves every
formatting boundary and never touches non-text runs.

Usage:
    python merge_runs.py <unpacked_dir>          # patches word/document.xml in place
    python merge_runs.py <unpacked_dir>/word/document.xml
"""

import os
import re
import sys

RUN_RE = re.compile(r"<w:r(?:\s[^>]*)?>.*?</w:r>", re.DOTALL)
RPR_RE = re.compile(r"<w:rPr>.*?</w:rPr>", re.DOTALL)
TEXT_RE = re.compile(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", re.DOTALL)
# markers that make a run "not a simple text run" -> never merge it
COMPLEX_MARKERS = ("<w:br", "<w:tab", "<w:drawing", "<w:pict", "<w:fldChar",
                   "<w:instrText", "<w:footnoteReference", "<w:endnoteReference",
                   "<w:sym", "<w:cr", "<w:object", "<mc:", "<w:noBreakHyphen")


def _run_props(run_xml):
    m = RPR_RE.search(run_xml)
    return m.group(0) if m else ""


def _is_simple_text_run(run_xml):
    """True when the run's only content (besides rPr) is <w:t> text."""
    if any(marker in run_xml for marker in COMPLEX_MARKERS):
        return False
    # strip rPr, then whatever remains between <w:r ...> and </w:r> must be only w:t
    body = RPR_RE.sub("", run_xml)
    body = re.sub(r"^<w:r(?:\s[^>]*)?>", "", body)
    body = re.sub(r"</w:r>$", "", body)
    leftover = TEXT_RE.sub("", body).strip()
    return leftover == "" and "<w:t" in run_xml


def _run_text(run_xml):
    return "".join(TEXT_RE.findall(run_xml))


def _merge_paragraph(para_xml):
    runs = list(RUN_RE.finditer(para_xml))
    if len(runs) < 2:
        return para_xml

    # Build a list of (start, end, xml) for runs, then greedily merge neighbours.
    segments = []  # each: dict(start,end,xml)
    for m in runs:
        segments.append({"start": m.start(), "end": m.end(), "xml": m.group(0)})

    merged = []
    i = 0
    while i < len(segments):
        cur = segments[i]
        if _is_simple_text_run(cur["xml"]):
            props = _run_props(cur["xml"])
            text = _run_text(cur["xml"])
            j = i + 1
            while (j < len(segments)
                   and _is_simple_text_run(segments[j]["xml"])
                   and _run_props(segments[j]["xml"]) == props):
                text += _run_text(segments[j]["xml"])
                j += 1
            if j > i + 1:
                # rebuild one run carrying the concatenated text
                new_run = "<w:r>" + props + '<w:t xml:space="preserve">' + text + "</w:t></w:r>"
                merged.append({"start": cur["start"], "end": segments[j - 1]["end"], "xml": new_run})
                i = j
                continue
        merged.append(cur)
        i += 1

    # Reassemble paragraph: text before first run + merged runs (with original
    # inter-run glue preserved) + text after last run.
    out = para_xml[: segments[0]["start"]]
    prev_end = None
    # Map original positions to merged output, keeping any XML that sat between runs.
    idx = 0
    for seg in merged:
        if prev_end is not None:
            out += para_xml[prev_end: seg["start"]]  # glue between runs (usually empty)
        out += seg["xml"]
        prev_end = seg["end"]
        idx += 1
    out += para_xml[prev_end:]
    return out


def merge_document(doc_path):
    with open(doc_path, encoding="utf-8") as f:
        xml = f.read()

    # process paragraph by paragraph so run indexes never cross a <w:p> boundary
    paras = re.split(r"(?=<w:p[ >])", xml)
    rebuilt = [_merge_paragraph(p) if p.startswith("<w:p") else p for p in paras]
    new_xml = "".join(rebuilt)

    with open(doc_path, "w", encoding="utf-8") as f:
        f.write(new_xml)
    return new_xml


def resolve_doc_path(arg):
    if os.path.isdir(arg):
        return os.path.join(arg, "word", "document.xml")
    return arg


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: merge_runs.py <unpacked_dir | document.xml>")
        sys.exit(1)
    path = resolve_doc_path(sys.argv[1])
    if not os.path.exists(path):
        print(f"Not found: {path}")
        sys.exit(1)
    merge_document(path)
    print(f"Merged runs in {path}")
