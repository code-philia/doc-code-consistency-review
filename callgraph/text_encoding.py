"""Utilities for reading uploaded source files without losing non-UTF-8 text."""

from __future__ import annotations

from pathlib import Path


_BOM_ENCODINGS = (
    (b"\xff\xfe\x00\x00", "utf-32-le"),
    (b"\x00\x00\xfe\xff", "utf-32-be"),
    (b"\xff\xfe", "utf-16-le"),
    (b"\xfe\xff", "utf-16-be"),
    (b"\xef\xbb\xbf", "utf-8-sig"),
)


def decode_source_bytes(data: bytes) -> str:
    """Decode source bytes while preserving Chinese text and undecodable bytes."""
    if isinstance(data, str):
        return data
    if not data:
        return ""

    for bom, encoding in _BOM_ENCODINGS:
        if data.startswith(bom):
            return data.decode(encoding, errors="replace")

    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        pass

    # GB18030 is a superset of GBK/GB2312 and covers common Chinese source files.
    try:
        return data.decode("gb18030")
    except UnicodeDecodeError:
        pass

    for encoding in ("big5", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue

    # Do not use errors="ignore": dropped bytes change source ranges and content.
    return data.decode("utf-8", errors="replace")


def read_source_file(path: str | Path) -> str:
    """Read a source file using the shared byte-preserving decoder."""
    return decode_source_bytes(Path(path).read_bytes())
