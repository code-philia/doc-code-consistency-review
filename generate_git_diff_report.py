#!/usr/bin/env python3
"""
Generate a self-contained HTML git diff report from the current uncommitted changes.

Usage:
    python3 generate_git_diff_report.py [output.html]

    If output.html is omitted, prints to stdout.
"""

import subprocess
import json
import sys
import os
from pathlib import Path

TEMPLATE_PATH = Path(__file__).resolve().parent / "git-diff-report-template.html"


def run_git_diff():
    """Run git diff on the current repo and return the unified diff text."""
    result = subprocess.run(
        ["git", "diff", "--unified=3"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Error running git diff: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout


def parse_unified_diff(diff_text):
    """
    Parse unified diff output into the structure expected by the HTML template.

    Returns: { "files": [ { "path", "additions", "deletions", "hunks": [...] } ] }
    """
    if not diff_text.strip():
        return {"files": []}

    files = []
    current_file = None
    current_hunk = None
    lines_buffer = []  # raw lines of the current hunk (type, old_ln, new_ln, text)

    def flush_hunk():
        nonlocal current_hunk, lines_buffer
        if current_hunk is None or not current_file:
            return
        # Compute added_text and removed_text for copy buttons
        added_lines = [l["text"] for l in lines_buffer if l["type"] == "add"]
        removed_lines = [l["text"] for l in lines_buffer if l["type"] == "del"]
        current_hunk["added_text"] = "\n".join(added_lines)
        current_hunk["removed_text"] = "\n".join(removed_lines)
        current_hunk["lines"] = lines_buffer
        current_file["hunks"].append(current_hunk)
        current_hunk = None
        lines_buffer = []

    def flush_file():
        nonlocal current_file
        flush_hunk()
        if current_file is None:
            return
        current_file["additions"] = sum(
            1 for h in current_file["hunks"] for l in h["lines"] if l["type"] == "add"
        )
        current_file["deletions"] = sum(
            1 for h in current_file["hunks"] for l in h["lines"] if l["type"] == "del"
        )
        files.append(current_file)
        current_file = None

    for line in diff_text.split("\n"):
        # New file header
        if line.startswith("diff --git "):
            flush_file()
            # diff --git a/path b/path
            parts = line.split(" ")
            if len(parts) >= 4:
                # parts[2] is "a/path", strip the "a/" prefix
                path = parts[2]
                if path.startswith("a/"):
                    path = path[2:]
            else:
                path = ""
            current_file = {"path": path, "hunks": [], "additions": 0, "deletions": 0}
            continue

        if current_file is None:
            continue

        # Hunk header
        if line.startswith("@@ "):
            flush_hunk()
            # Parse: @@ -old_start,old_count +new_start,new_count @@ optional_context
            # e.g. @@ -1,10 +1,12 @@ function foo() {
            rest = line[3:]  # strip "@@ "
            header_end = rest.find(" @@")
            if header_end != -1:
                numbers_part = rest[:header_end].strip()
                context_header = rest[header_end + 3:].strip()
            else:
                numbers_part = rest.strip()
                context_header = ""

            parts_num = numbers_part.split()
            old_start, old_count = 0, 0
            new_start, new_count = 0, 0
            if len(parts_num) >= 2:
                old_str = parts_num[0].lstrip("-")
                new_str = parts_num[1].lstrip("+")
                old_parts = old_str.split(",")
                new_parts = new_str.split(",")
                old_start = int(old_parts[0])
                old_count = int(old_parts[1]) if len(old_parts) > 1 else 1
                new_start = int(new_parts[0])
                new_count = int(new_parts[1]) if len(new_parts) > 1 else 1

            current_hunk = {
                "old_start": old_start,
                "old_count": old_count,
                "new_start": new_start,
                "new_count": new_count,
                "header": context_header,
            }
            lines_buffer = []
            # Track line numbers as we go through the hunk lines
            current_hunk["_old_ln"] = old_start
            current_hunk["_new_ln"] = new_start
            continue

        if current_hunk is None:
            continue

        # Hunk body lines
        if line.startswith("+"):
            line_type = "add"
            text = line[1:]
            old_ln = None
            new_ln = current_hunk["_new_ln"]
            current_hunk["_new_ln"] += 1
        elif line.startswith("-"):
            line_type = "del"
            text = line[1:]
            old_ln = current_hunk["_old_ln"]
            new_ln = None
            current_hunk["_old_ln"] += 1
        elif line.startswith(" "):
            line_type = "context"
            text = line[1:]
            old_ln = current_hunk["_old_ln"]
            new_ln = current_hunk["_new_ln"]
            current_hunk["_old_ln"] += 1
            current_hunk["_new_ln"] += 1
        elif line == "\\ No newline at end of file":
            # Handle the "No newline" marker as a meta line
            line_type = "meta"
            text = line
            old_ln = None
            new_ln = None
        else:
            # Other lines (e.g., empty after "No newline" or binary diff info)
            continue

        lines_buffer.append({
            "type": line_type,
            "old_lineno": old_ln if old_ln is not None else "",
            "new_lineno": new_ln if new_ln is not None else "",
            "text": text,
        })

    flush_file()

    return {"files": files}


def generate_report(output_path=None):
    """Generate the HTML report and write to output_path or stdout."""
    # Read template
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = f.read()

    # Get and parse git diff
    diff_text = run_git_diff()
    report_data = parse_unified_diff(diff_text)

    # Serialize to JSON and embed
    report_json = json.dumps(report_data, ensure_ascii=False, indent=2)
    html = template.replace("__REPORT_DATA_JSON__", report_json)

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"Report written to: {output_path}")
    else:
        print(html)


if __name__ == "__main__":
    output_path = sys.argv[1] if len(sys.argv) > 1 else None
    generate_report(output_path)
