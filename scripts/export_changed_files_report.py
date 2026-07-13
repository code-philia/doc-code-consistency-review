#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_FILE = REPO_ROOT / "changed-files-report.html"
SCRIPT_RELATIVE_PATH = Path("scripts/export_changed_files_report.py").as_posix()
OUTPUT_RELATIVE_PATH = OUTPUT_FILE.name
EXCLUDED_PATHS = {SCRIPT_RELATIVE_PATH, OUTPUT_RELATIVE_PATH}

LANGUAGE_BY_NAME = {
    "dockerfile": "dockerfile",
    "makefile": "makefile",
}
LANGUAGE_BY_SUFFIX = {
    ".bash": "bash",
    ".c": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".css": "css",
    ".go": "go",
    ".h": "c",
    ".hpp": "cpp",
    ".htm": "xml",
    ".html": "xml",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "jsx",
    ".md": "markdown",
    ".mjs": "javascript",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".scss": "scss",
    ".sh": "bash",
    ".sql": "sql",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".txt": "plaintext",
    ".vue": "xml",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
}
STATUS_LABELS = {
    "A": "新增",
    "C": "复制",
    "D": "删除",
    "M": "修改",
    "R": "重命名",
    "T": "类型变更",
    "?": "未跟踪",
}


@dataclass
class ChangeEntry:
    path: str
    status: str
    base_path: str | None = None


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
        status_raw = parts[index]
        if not status_raw:
            index += 1
            continue
        status_text = status_raw.decode("utf-8", errors="replace")
        status_code = status_text[:1]
        if status_code in {"R", "C"}:
            if index + 2 >= len(parts):
                break
            old_path = parts[index + 1].decode("utf-8", errors="replace")
            new_path = parts[index + 2].decode("utf-8", errors="replace")
            entries.append(ChangeEntry(path=new_path, status=status_code, base_path=old_path))
            index += 3
            continue
        if index + 1 >= len(parts):
            break
        path = parts[index + 1].decode("utf-8", errors="replace")
        entries.append(ChangeEntry(path=path, status=status_code, base_path=path))
        index += 2
    return entries


def parse_untracked_z(payload: bytes) -> list[ChangeEntry]:
    entries: list[ChangeEntry] = []
    for raw_path in payload.split(b"\0"):
        if raw_path:
            entries.append(ChangeEntry(path=raw_path.decode("utf-8", errors="replace"), status="?"))
    return entries


def list_changed_entries() -> list[ChangeEntry]:
    tracked = parse_name_status_z(run_git("diff", "--name-status", "-z", "HEAD", "--"))
    untracked = parse_untracked_z(run_git("ls-files", "--others", "--exclude-standard", "-z"))
    deduped: dict[str, ChangeEntry] = {}
    for entry in [*tracked, *untracked]:
        if entry.path in EXCLUDED_PATHS:
            continue
        deduped[entry.path] = entry
    return sorted(deduped.values(), key=lambda item: item.path.lower())


def git_show_head(path: str) -> bytes:
    result = subprocess.run(
        ["git", "show", f"HEAD:{path}"],
        cwd=REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return result.stdout if result.returncode == 0 else b""


def read_worktree_file(path: str) -> bytes:
    file_path = REPO_ROOT / path
    return file_path.read_bytes() if file_path.exists() and file_path.is_file() else b""


def is_binary_content(content: bytes) -> bool:
    if not content:
        return False
    if b"\0" in content:
        return True
    sample = content[:4096]
    text_chars = bytes(range(32, 127)) + b"\n\r\t\f\b"
    non_text = sum(byte not in text_chars for byte in sample)
    return non_text / max(len(sample), 1) > 0.30


def decode_text(content: bytes) -> str:
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return content.decode("utf-8", errors="replace")


def detect_language(path: str) -> str:
    file_path = Path(path)
    name = file_path.name.lower()
    if name in LANGUAGE_BY_NAME:
        return LANGUAGE_BY_NAME[name]
    return LANGUAGE_BY_SUFFIX.get(file_path.suffix.lower(), "plaintext")


def build_rows(old_text: str, new_text: str) -> list[dict[str, object]]:
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()
    matcher = SequenceMatcher(None, old_lines, new_lines, autojunk=False)
    rows: list[dict[str, object]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset, line in enumerate(new_lines[j1:j2]):
                rows.append(
                    {
                        "kind": "context",
                        "old_lineno": i1 + offset + 1,
                        "new_lineno": j1 + offset + 1,
                        "text": line,
                    }
                )
        elif tag == "delete":
            for offset, line in enumerate(old_lines[i1:i2]):
                rows.append(
                    {
                        "kind": "remove",
                        "old_lineno": i1 + offset + 1,
                        "new_lineno": None,
                        "text": line,
                    }
                )
        elif tag == "insert":
            for offset, line in enumerate(new_lines[j1:j2]):
                rows.append(
                    {
                        "kind": "add",
                        "old_lineno": None,
                        "new_lineno": j1 + offset + 1,
                        "text": line,
                    }
                )
        else:
            replaced_old = old_lines[i1:i2]
            replaced_new = new_lines[j1:j2]
            max_len = max(len(replaced_old), len(replaced_new))
            for offset in range(max_len):
                if offset < len(replaced_old):
                    rows.append(
                        {
                            "kind": "remove",
                            "old_lineno": i1 + offset + 1,
                            "new_lineno": None,
                            "text": replaced_old[offset],
                        }
                    )
                if offset < len(replaced_new):
                    rows.append(
                        {
                            "kind": "add",
                            "old_lineno": None,
                            "new_lineno": j1 + offset + 1,
                            "text": replaced_new[offset],
                        }
                    )
    if not rows:
        rows.append({"kind": "context", "old_lineno": None, "new_lineno": None, "text": ""})
    return rows


def summarize_rows(rows: Iterable[dict[str, object]]) -> tuple[int, int, int]:
    additions = deletions = changes = 0
    for row in rows:
        if row["kind"] == "add":
            additions += 1
            changes += 1
        elif row["kind"] == "remove":
            deletions += 1
            changes += 1
    return additions, deletions, changes


def build_file_report(entry: ChangeEntry) -> dict[str, object]:
    current_bytes = read_worktree_file(entry.path)
    base_bytes = b"" if entry.status == "?" else git_show_head(entry.base_path or entry.path)
    binary = is_binary_content(base_bytes) or is_binary_content(current_bytes)
    report: dict[str, object] = {
        "path": entry.path,
        "status": entry.status,
        "status_label": STATUS_LABELS.get(entry.status, entry.status),
        "base_path": entry.base_path,
        "language": detect_language(entry.path),
        "is_binary": binary,
    }
    if binary:
        report.update(
            {
                "rows": [],
                "additions": 0,
                "deletions": 0,
                "changes": 0,
                "line_count": 0,
                "message": "二进制文件无法以内联代码方式展示。",
            }
        )
        return report

    old_text = decode_text(base_bytes).replace("\r\n", "\n").replace("\r", "\n")
    new_text = decode_text(current_bytes).replace("\r\n", "\n").replace("\r", "\n")
    rows = build_rows(old_text, new_text)
    additions, deletions, changes = summarize_rows(rows)
    line_count = sum(1 for row in rows if row["kind"] != "remove")
    report.update(
        {
            "rows": rows,
            "additions": additions,
            "deletions": deletions,
            "changes": changes,
            "line_count": line_count,
            "message": "",
        }
    )
    return report


def generate_report() -> dict[str, object]:
    entries = list_changed_entries()
    files = [build_file_report(entry) for entry in entries]
    return {
        "repo_name": REPO_ROOT.name,
        "repo_path": str(REPO_ROOT),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "summary": {
            "file_count": len(files),
            "change_count": sum(file["changes"] for file in files),
        },
        "files": files,
    }


def replace_report_data(html_text: str, report: dict[str, object]) -> str:
    payload = json.dumps(report, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    pattern = re.compile(
        r'(<script id="report-data" type="application/json">).*?(</script>)',
        flags=re.DOTALL,
    )
    updated, count = pattern.subn(lambda m: f"{m.group(1)}{payload}{m.group(2)}", html_text, count=1)
    if count != 1:
        raise RuntimeError("report-data script block not found in changed-files-report.html")
    return updated


def main() -> None:
    if not OUTPUT_FILE.exists():
        raise FileNotFoundError(f"template not found: {OUTPUT_FILE}")
    template = OUTPUT_FILE.read_text(encoding="utf-8")
    updated = replace_report_data(template, generate_report())
    OUTPUT_FILE.write_text(updated, encoding="utf-8")
    print(f"generated {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
