#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPO_ROOT / "working-tree-diff.html"

STATUS_LABELS = {
    "A": "Added",
    "C": "Copied",
    "D": "Deleted",
    "M": "Modified",
    "R": "Renamed",
    "T": "Type Changed",
    "?": "Untracked",
}


@dataclass
class ChangeEntry:
    path: str
    status: str
    base_path: str | None = None


@dataclass
class DiffLine:
    kind: str
    old_lineno: int | None
    new_lineno: int | None
    text: str


@dataclass
class Hunk:
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    heading: str
    lines: list[DiffLine] = field(default_factory=list)

    @property
    def old_end(self) -> int:
        return self.old_start + max(self.old_count - 1, 0)

    @property
    def new_end(self) -> int:
        return self.new_start + max(self.new_count - 1, 0)

    @property
    def additions(self) -> int:
        return sum(1 for line in self.lines if line.kind == "add")

    @property
    def deletions(self) -> int:
        return sum(1 for line in self.lines if line.kind == "delete")


@dataclass
class FileDiff:
    path: str
    status: str
    old_path: str | None = None
    hunks: list[Hunk] = field(default_factory=list)
    binary: bool = False
    message: str = ""

    @property
    def additions(self) -> int:
        return sum(hunk.additions for hunk in self.hunks)

    @property
    def deletions(self) -> int:
        return sum(hunk.deletions for hunk in self.hunks)


def run_git(*args: str, check: bool = True) -> bytes:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {stderr}")
    return result.stdout


def parse_name_status_z(payload: bytes) -> list[ChangeEntry]:
    entries: list[ChangeEntry] = []
    parts = payload.split(b"\0")
    index = 0
    while index < len(parts):
        raw_status = parts[index]
        if not raw_status:
            index += 1
            continue

        status = raw_status.decode("utf-8", errors="replace")[:1]
        if status in {"R", "C"}:
            if index + 2 >= len(parts):
                break
            old_path = parts[index + 1].decode("utf-8", errors="replace")
            new_path = parts[index + 2].decode("utf-8", errors="replace")
            entries.append(ChangeEntry(path=new_path, status=status, base_path=old_path))
            index += 3
            continue

        if index + 1 >= len(parts):
            break
        path = parts[index + 1].decode("utf-8", errors="replace")
        entries.append(ChangeEntry(path=path, status=status, base_path=path))
        index += 2
    return entries


def parse_untracked_z(payload: bytes) -> list[ChangeEntry]:
    entries: list[ChangeEntry] = []
    for raw_path in payload.split(b"\0"):
        if raw_path:
            entries.append(ChangeEntry(path=raw_path.decode("utf-8", errors="replace"), status="?"))
    return entries


def list_changed_entries(excluded_paths: set[str]) -> list[ChangeEntry]:
    tracked = parse_name_status_z(run_git("diff", "--name-status", "-z", "HEAD", "--"))
    untracked = parse_untracked_z(run_git("ls-files", "--others", "--exclude-standard", "-z"))
    entries: dict[str, ChangeEntry] = {}
    for entry in [*tracked, *untracked]:
        if entry.path in excluded_paths:
            continue
        entries[entry.path] = entry
    return sorted(entries.values(), key=lambda item: item.path.lower())


def read_file(path: str) -> bytes:
    file_path = REPO_ROOT / path
    if not file_path.exists() or not file_path.is_file():
        return b""
    return file_path.read_bytes()


def is_binary_content(content: bytes) -> bool:
    if not content:
        return False
    if b"\0" in content:
        return True
    sample = content[:4096]
    text_chars = bytes(range(32, 127)) + b"\n\r\t\f\b"
    non_text = sum(byte not in text_chars for byte in sample)
    return non_text / max(len(sample), 1) > 0.30


def untracked_file_diff(entry: ChangeEntry) -> str:
    content = read_file(entry.path)
    if is_binary_content(content):
        return (
            f"diff --git a/{entry.path} b/{entry.path}\n"
            "new file mode 100644\n"
            f"Binary files /dev/null and b/{entry.path} differ\n"
        )
    result = subprocess.run(
        ["git", "diff", "--no-index", "--unified=3", "--", "/dev/null", entry.path],
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return result.stdout.decode("utf-8", errors="replace")


def tracked_file_diff(entry: ChangeEntry) -> str:
    result = subprocess.run(
        ["git", "diff", "--find-renames", "--unified=3", "HEAD", "--", entry.path],
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return result.stdout.decode("utf-8", errors="replace")


def parse_hunk_header(line: str) -> tuple[int, int, int, int, str] | None:
    match = re.match(
        r"@@ -(?P<old_start>\d+)(?:,(?P<old_count>\d+))? "
        r"\+(?P<new_start>\d+)(?:,(?P<new_count>\d+))? @@(?P<heading>.*)",
        line,
    )
    if not match:
        return None
    return (
        int(match.group("old_start")),
        int(match.group("old_count") or "1"),
        int(match.group("new_start")),
        int(match.group("new_count") or "1"),
        match.group("heading").strip(),
    )


def parse_diff_text(entry: ChangeEntry, diff_text: str) -> FileDiff:
    file_diff = FileDiff(path=entry.path, status=entry.status, old_path=entry.base_path)
    current_hunk: Hunk | None = None
    old_lineno = 0
    new_lineno = 0

    for line in diff_text.splitlines():
        if line.startswith("Binary files") or line.startswith("GIT binary patch"):
            file_diff.binary = True
            file_diff.message = line
            continue

        header = parse_hunk_header(line)
        if header:
            if current_hunk is not None:
                file_diff.hunks.append(current_hunk)
            old_start, old_count, new_start, new_count, heading = header
            current_hunk = Hunk(old_start, old_count, new_start, new_count, heading)
            old_lineno = old_start
            new_lineno = new_start
            continue

        if current_hunk is None:
            continue

        if line.startswith("\\ No newline at end of file"):
            current_hunk.lines.append(DiffLine("meta", None, None, line))
            continue

        if not line:
            prefix = " "
            text = ""
        else:
            prefix = line[0]
            text = line[1:] if prefix in {" ", "+", "-"} else line

        if prefix == " ":
            current_hunk.lines.append(DiffLine("context", old_lineno, new_lineno, text))
            old_lineno += 1
            new_lineno += 1
        elif prefix == "+":
            current_hunk.lines.append(DiffLine("add", None, new_lineno, text))
            new_lineno += 1
        elif prefix == "-":
            current_hunk.lines.append(DiffLine("delete", old_lineno, None, text))
            old_lineno += 1

    if current_hunk is not None:
        file_diff.hunks.append(current_hunk)
    return file_diff


def build_file_diff(entry: ChangeEntry) -> FileDiff:
    diff_text = untracked_file_diff(entry) if entry.status == "?" else tracked_file_diff(entry)
    if not diff_text.strip():
        return FileDiff(path=entry.path, status=entry.status, old_path=entry.base_path, message="No textual diff.")
    return parse_diff_text(entry, diff_text)


def escape_code(text: str) -> str:
    return html.escape(text, quote=False)


def render_diff_rows(lines: list[DiffLine], side: str) -> str:
    rows: list[str] = []
    for line in lines:
        if line.kind == "meta":
            rows.append(
                '<div class="diff-row diff-row--meta">'
                '<span class="line-no"></span><span class="line-sign"></span>'
                f'<span class="line-code">{escape_code(line.text)}</span></div>'
            )
            continue

        visible = False
        lineno: int | None = None
        sign = " "
        if side == "old":
            visible = line.kind in {"context", "delete"}
            lineno = line.old_lineno
            sign = "-" if line.kind == "delete" else " "
        else:
            visible = line.kind in {"context", "add"}
            lineno = line.new_lineno
            sign = "+" if line.kind == "add" else " "

        row_kind = line.kind if visible else "empty"
        code = escape_code(line.text) if visible else ""
        rows.append(
            f'<div class="diff-row diff-row--{row_kind}">'
            f'<span class="line-no">{"" if lineno is None else lineno}</span>'
            f'<span class="line-sign">{sign if visible else ""}</span>'
            f'<span class="line-code">{code}</span>'
            '</div>'
        )
    return "\n".join(rows)


def render_file_card(file_diff: FileDiff, index: int) -> str:
    status_label = STATUS_LABELS.get(file_diff.status, file_diff.status)
    old_path = f'<span class="old-path">from {html.escape(file_diff.old_path)}</span>' if file_diff.old_path and file_diff.old_path != file_diff.path else ""

    if file_diff.binary:
        body = f'<div class="binary-note">{html.escape(file_diff.message or "Binary file changed.")}</div>'
    elif not file_diff.hunks:
        body = f'<div class="binary-note">{html.escape(file_diff.message or "No diff hunks.")}</div>'
    else:
        hunk_blocks = []
        for hunk_index, hunk in enumerate(file_diff.hunks, start=1):
            heading = html.escape(hunk.heading or "changed block")
            hunk_blocks.append(
                f"""
                <section class="hunk">
                  <div class="hunk-title">
                    <span>Block {hunk_index}</span>
                    <span class="hunk-range">-{hunk.old_start},{hunk.old_count} → +{hunk.new_start},{hunk.new_count}</span>
                    <span class="hunk-heading">{heading}</span>
                  </div>
                  <div class="split-diff">
                    <div class="pane">
                      <div class="pane-title">Original</div>
                      <div class="diff-code">{render_diff_rows(hunk.lines, "old")}</div>
                    </div>
                    <div class="pane">
                      <div class="pane-title">Working Tree</div>
                      <div class="diff-code">{render_diff_rows(hunk.lines, "new")}</div>
                    </div>
                  </div>
                </section>
                """
            )
        body = "\n".join(hunk_blocks)

    return f"""
    <article class="file-card" id="file-{index}">
      <header class="file-header">
        <div>
          <div class="file-path">{html.escape(file_diff.path)}</div>
          {old_path}
        </div>
        <div class="file-meta">
          <span class="status status--{html.escape(file_diff.status.lower().replace('?', 'untracked'))}">{status_label}</span>
          <span class="adds">+{file_diff.additions}</span>
          <span class="dels">-{file_diff.deletions}</span>
        </div>
      </header>
      {body}
    </article>
    """


def render_sidebar(files: list[FileDiff]) -> str:
    items = []
    for index, file_diff in enumerate(files, start=1):
        status_label = STATUS_LABELS.get(file_diff.status, file_diff.status)
        items.append(
            f"""
            <a class="tree-item" href="#file-{index}">
              <span class="tree-status tree-status--{html.escape(file_diff.status.lower().replace('?', 'untracked'))}">{html.escape(file_diff.status)}</span>
              <span class="tree-path">{html.escape(file_diff.path)}</span>
              <span class="tree-count">+{file_diff.additions}/-{file_diff.deletions}</span>
              <span class="tree-label">{status_label}</span>
            </a>
            """
        )
    return "\n".join(items)


def render_html(files: list[FileDiff]) -> str:
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    total_additions = sum(file.additions for file in files)
    total_deletions = sum(file.deletions for file in files)
    file_cards = "\n".join(render_file_card(file, index) for index, file in enumerate(files, start=1))
    sidebar = render_sidebar(files)
    empty_state = "" if files else '<div class="empty-state">Working tree is clean. No uncommitted changes were found.</div>'

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Working Tree Diff</title>
  <style>
    :root {{
      --bg: #f3f3f3;
      --side: #f8f8f8;
      --side2: #ffffff;
      --editor: #ffffff;
      --line: #d0d7de;
      --text: #24292f;
      --muted: #57606a;
      --blue: #0969da;
      --green: #1a7f37;
      --red: #cf222e;
      --add-bg: #dafbe1;
      --del-bg: #ffebe9;
      --empty-bg: #f6f8fa;
      --row-hover: #f6f8fa;
      --gutter: #f6f8fa;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    .layout {{
      display: grid;
      grid-template-columns: 330px minmax(0, 1fr);
      min-height: 100vh;
    }}
    .sidebar {{
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: auto;
      background: var(--side);
      border-right: 1px solid var(--line);
    }}
    .side-header {{
      padding: 14px 14px 10px;
      border-bottom: 1px solid var(--line);
      background: var(--side2);
    }}
    .side-title {{
      margin: 0 0 8px;
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }}
    .side-summary {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }}
    .metric {{
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
    }}
    .metric strong {{
      display: block;
      font-size: 18px;
      line-height: 1.1;
    }}
    .metric span {{ color: var(--muted); font-size: 11px; }}
    .tree {{
      padding: 8px;
    }}
    .tree-item {{
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) auto;
      grid-template-areas:
        "status path count"
        "status label label";
      gap: 1px 6px;
      padding: 7px 8px;
      border-radius: 5px;
      color: var(--text);
      text-decoration: none;
    }}
    .tree-item:hover {{ background: #e8f2ff; }}
    .tree-status {{ grid-area: status; color: var(--blue); font-weight: 700; }}
    .tree-status--m {{ color: #cca700; }}
    .tree-status--a, .tree-status--untracked {{ color: var(--green); }}
    .tree-status--d {{ color: var(--red); }}
    .tree-path {{
      grid-area: path;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: "SFMono-Regular", Consolas, Menlo, monospace;
    }}
    .tree-count {{ grid-area: count; color: var(--muted); font-size: 11px; }}
    .tree-label {{ grid-area: label; color: var(--muted); font-size: 11px; }}
    .main {{
      min-width: 0;
      padding: 18px;
      overflow: auto;
    }}
    .topbar {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
      padding: 11px 14px;
      background: #ffffff;
      border: 1px solid var(--line);
      border-radius: 7px;
    }}
    .topbar h1 {{
      margin: 0;
      font-size: 16px;
      font-weight: 650;
    }}
    .topbar p {{
      margin: 2px 0 0;
      color: var(--muted);
      font-size: 12px;
    }}
    .file-card {{
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--editor);
      margin-bottom: 18px;
      overflow: hidden;
    }}
    .file-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      background: #f6f8fa;
      border-bottom: 1px solid var(--line);
    }}
    .file-path {{
      font-family: "SFMono-Regular", Consolas, Menlo, monospace;
      font-weight: 650;
      word-break: break-all;
    }}
    .old-path {{
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 12px;
    }}
    .file-meta {{
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }}
    .status {{
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 8px;
      color: var(--muted);
    }}
    .adds {{ color: var(--green); }}
    .dels {{ color: var(--red); }}
    .hunk {{
      border-top: 1px solid var(--line);
    }}
    .hunk:first-of-type {{
      border-top: 0;
    }}
    .hunk-title {{
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      color: var(--muted);
      background: #f6f8fa;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }}
    .hunk-range {{
      font-family: "SFMono-Regular", Consolas, Menlo, monospace;
      color: var(--blue);
    }}
    .hunk-heading {{
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }}
    .split-diff {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }}
    .pane + .pane {{
      border-left: 1px solid var(--line);
    }}
    .pane-title {{
      padding: 6px 10px;
      color: var(--muted);
      background: #f6f8fa;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }}
    .diff-code {{
      margin: 0;
      overflow: auto;
      font: 12px/1.55 "SFMono-Regular", Consolas, Menlo, monospace;
      background: var(--editor);
    }}
    .diff-row {{
      display: grid;
      grid-template-columns: 54px 22px minmax(max-content, 1fr);
      min-height: 19px;
      margin: 0;
      padding: 0;
    }}
    .diff-row:hover {{
      background: var(--row-hover);
    }}
    .line-no {{
      padding: 0 10px 0 0;
      text-align: right;
      color: #858585;
      background: var(--gutter);
      border-right: 1px solid #eaeef2;
      user-select: none;
    }}
    .line-sign {{
      color: #858585;
      text-align: center;
      user-select: none;
    }}
    .line-code {{
      padding: 0 12px 0 2px;
      white-space: pre;
    }}
    .diff-row--add {{
      background: var(--add-bg);
    }}
    .diff-row--delete {{
      background: var(--del-bg);
    }}
    .diff-row--empty {{
      background: var(--empty-bg);
    }}
    .diff-row--meta {{
      color: var(--muted);
      background: #f6f8fa;
    }}
    .binary-note, .empty-state {{
      margin: 14px;
      padding: 14px;
      border: 1px dashed var(--line);
      border-radius: 7px;
      color: var(--muted);
      background: #f6f8fa;
    }}
    @media (max-width: 1100px) {{
      .layout {{ grid-template-columns: 1fr; }}
      .sidebar {{ position: relative; height: auto; max-height: 360px; }}
      .split-diff {{ grid-template-columns: 1fr; }}
      .pane + .pane {{ border-left: 0; border-top: 1px solid var(--line); }}
    }}
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="side-header">
        <p class="side-title">Working Tree</p>
        <div class="side-summary">
          <div class="metric"><strong>{len(files)}</strong><span>files</span></div>
          <div class="metric"><strong>{total_additions}</strong><span>additions</span></div>
          <div class="metric"><strong>{total_deletions}</strong><span>deletions</span></div>
        </div>
      </div>
      <nav class="tree">{sidebar}</nav>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1>Working Tree Diff</h1>
          <p>{html.escape(str(REPO_ROOT))}</p>
        </div>
        <p>Generated {generated_at}</p>
      </div>
      {empty_state}
      {file_cards}
    </main>
  </div>
</body>
</html>
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render current uncommitted git diff hunks as a VSCode-like HTML page.")
    parser.add_argument(
        "-o",
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Output HTML path. Defaults to {DEFAULT_OUTPUT.name}.",
    )
    parser.add_argument(
        "--include-report-artifacts",
        action="store_true",
        help="Include the generated HTML if it is uncommitted.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = REPO_ROOT / output_path

    excluded_paths: set[str] = set()
    if not args.include_report_artifacts:
        try:
            excluded_paths.add(output_path.resolve().relative_to(REPO_ROOT).as_posix())
        except ValueError:
            pass

    entries = list_changed_entries(excluded_paths)
    file_diffs = [build_file_diff(entry) for entry in entries]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_html(file_diffs), encoding="utf-8")
    print(f"generated {output_path}")


if __name__ == "__main__":
    main()
