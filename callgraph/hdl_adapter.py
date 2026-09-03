"""Best-effort Verilog/SystemVerilog and VHDL model extraction.

The adapter intentionally depends only on the tree-sitter node API.  HDL
grammar packages have had small node-name differences across releases, so the
implementation uses known node names first and conservative text fallbacks
second.  It models structural instantiation and subprogram calls, not signal
level data flow or elaboration.
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Set, Tuple

try:
    from .text_encoding import decode_source_bytes
except ImportError:  # Supports direct execution/import from the package root.
    from text_encoding import decode_source_bytes


VERILOG_EXTENSIONS = {".v", ".vh", ".vlog"}
SYSTEMVERILOG_EXTENSIONS = {".sv", ".svh"}
VHDL_EXTENSIONS = {".vhd", ".vhdl"}
HDL_EXTENSIONS = VERILOG_EXTENSIONS | SYSTEMVERILOG_EXTENSIONS | VHDL_EXTENSIONS
HDL_LANGUAGES = {"verilog", "systemverilog", "vhdl"}

VERILOG_SYMBOL_TYPES = {
    "module_declaration",
    "interface_declaration",
    "package_declaration",
    "program_declaration",
    "function_declaration",
    "task_declaration",
    "always_construct",
    "always_ff_construct",
    "always_comb_construct",
    "always_latch_construct",
    "initial_construct",
}
VHDL_SYMBOL_TYPES = {
    "entity_declaration",
    "architecture_body",
    "architecture_definition",
    "package_declaration",
    "package_definition",
    "process_statement",
    "procedure_body",
    "function_body",
    "subprogram_definition",
}

VERILOG_KIND_BY_TYPE = {
    "module_declaration": "module",
    "interface_declaration": "interface",
    "package_declaration": "package",
    "program_declaration": "program",
    "function_declaration": "function",
    "task_declaration": "task",
    "always_construct": "always",
    "always_ff_construct": "always",
    "always_comb_construct": "always",
    "always_latch_construct": "always",
    "initial_construct": "initial",
}
VHDL_KIND_BY_TYPE = {
    "entity_declaration": "entity",
    "architecture_body": "architecture",
    "architecture_definition": "architecture",
    "package_declaration": "package",
    "package_body": "package_body",
    "package_definition": "package_body",
    "process_statement": "process",
    "procedure_body": "procedure",
    "function_body": "function",
}

_IDENTIFIER_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_$]*")
_VERILOG_KEYWORDS = {
    "always",
    "always_ff",
    "always_comb",
    "always_latch",
    "assign",
    "begin",
    "end",
    "function",
    "task",
    "module",
    "interface",
    "package",
    "program",
    "if",
    "else",
    "for",
    "while",
    "case",
    "return",
}
_VHDL_KEYWORDS = {
    "architecture",
    "begin",
    "component",
    "entity",
    "function",
    "generic",
    "if",
    "is",
    "loop",
    "map",
    "of",
    "package",
    "port",
    "procedure",
    "process",
    "then",
}


def is_hdl_language(language: str) -> bool:
    return language in HDL_LANGUAGES


def language_for_path(path: Path) -> Optional[str]:
    suffix = path.suffix.lower()
    if suffix in VERILOG_EXTENSIONS:
        return "verilog"
    if suffix in SYSTEMVERILOG_EXTENSIONS:
        return "systemverilog"
    if suffix in VHDL_EXTENSIONS:
        return "vhdl"
    return None


def load_languages(required_languages: Optional[Set[str]] = None) -> Dict[str, object]:
    """Load optional HDL grammars and return parser Language objects."""
    languages: Dict[str, object] = {}
    missing: List[str] = []
    required = required_languages or HDL_LANGUAGES

    if required & {"verilog", "systemverilog"}:
        try:
            import tree_sitter_verilog

            language = tree_sitter_verilog.language()
            languages["verilog"] = language
            languages["systemverilog"] = language
        except ImportError:
            missing.append("tree-sitter-verilog")

    if "vhdl" in required:
        try:
            import tree_sitter_vhdl

            languages["vhdl"] = tree_sitter_vhdl.language()
        except ImportError:
            missing.append("tree-sitter-vhdl")

    if missing:
        raise SystemExit(
            "Missing tree-sitter HDL language packages: "
            + ", ".join(missing)
            + "\nInstall them in your conda env with:\n"
            + "  pip install tree-sitter-verilog tree-sitter-vhdl"
        )
    return languages


def _walk(node) -> Iterator[object]:
    stack = [node]
    while stack:
        current = stack.pop()
        yield current
        stack.extend(reversed(getattr(current, "children", []) or []))


def _child_for_field(node, name: str):
    try:
        return node.child_by_field_name(name)
    except Exception:
        return None


def _node_text(source: bytes, node) -> str:
    return decode_source_bytes(source[node.start_byte : node.end_byte])


def _node_lines(node) -> Tuple[int, int]:
    return node.start_point[0] + 1, node.end_point[0] + 1


def _source_lines(source: bytes) -> List[str]:
    return decode_source_bytes(source).splitlines()


def _find_keyword_end(
    lines: Sequence[str],
    start_index: int,
    end_patterns: Sequence[str],
    *,
    initial_depth: int = 0,
) -> int:
    """Find a construct's ending line using conservative keyword matching."""
    depth = initial_depth
    end_regex = re.compile("|".join(end_patterns), re.IGNORECASE)
    begin_regex = re.compile(r"\bbegin\b", re.IGNORECASE)
    end_token_regex = re.compile(r"\bend\b", re.IGNORECASE)

    for index in range(start_index, len(lines)):
        line = re.sub(r"//.*$", "", lines[index])
        if index == start_index:
            depth += len(begin_regex.findall(line))
        else:
            depth += len(begin_regex.findall(line))
        depth -= len(end_token_regex.findall(line))
        if end_regex.search(line) and depth <= initial_depth:
            return index
    return len(lines) - 1


def _text_symbol(
    *,
    item: Dict[str, object],
    source_text: str,
    kind: str,
    name: str,
    start_line: int,
    end_line: int,
) -> Dict[str, object]:
    lines = source_text.splitlines()
    content = "\n".join(lines[start_line - 1:end_line])
    return {
        "id": "",
        "name": name,
        "qualified_name": name,
        "namespace": "",
        "file": item["rel_path"],
        "filename": item["rel_path"],
        "language": item["language"],
        "kind": kind,
        "type": kind,
        "line": start_line,
        "column": 1,
        "end_line": end_line,
        "signature": content.split("\n", 1)[0].strip(),
        "source": content.strip(),
        "parameters": [],
        "local_symbols": [],
        "calls": [],
        "direct_callees": [],
        "direct_callers": [],
        "global_accesses": [],
        "global_reads": [],
        "global_writes": [],
    }


def _collect_text_symbols(item: Dict[str, object]) -> List[Dict[str, object]]:
    """Recover common HDL constructs when a grammar release uses new node names."""
    source_text = decode_source_bytes(item["source"])
    lines = _source_lines(item["source"])
    language = item["language"]
    symbols: List[Dict[str, object]] = []

    if language in {"verilog", "systemverilog"}:
        declarations = [
            ("module", re.compile(r"^\s*module\s+([A-Za-z_][A-Za-z0-9_$]*)\b", re.IGNORECASE), (r"\bendmodule\b",)),
            ("interface", re.compile(r"^\s*interface\s+([A-Za-z_][A-Za-z0-9_$]*)\b", re.IGNORECASE), (r"\bendinterface\b",)),
            ("package", re.compile(r"^\s*package\s+(?!body\b)([A-Za-z_][A-Za-z0-9_$]*)\b", re.IGNORECASE), (r"\bendpackage\b",)),
            ("program", re.compile(r"^\s*program\s+([A-Za-z_][A-Za-z0-9_$]*)\b", re.IGNORECASE), (r"\bendprogram\b",)),
            ("function", re.compile(r"^\s*function\b(?:\s+automatic\b)?(?:\s+[\w$:\[\]]+)*\s+([A-Za-z_][A-Za-z0-9_$]*)\b", re.IGNORECASE), (r"\bendfunction\b",)),
            ("task", re.compile(r"^\s*task\b(?:\s+automatic\b)?(?:\s+[\w$:\[\]]+)*\s+([A-Za-z_][A-Za-z0-9_$]*)\b", re.IGNORECASE), (r"\bendtask\b",)),
        ]
        for index, line in enumerate(lines):
            for kind, pattern, end_patterns in declarations:
                match = pattern.search(line)
                if not match:
                    continue
                end_index = next(
                    (
                        candidate
                        for candidate in range(index, len(lines))
                        if re.search(end_patterns[0], lines[candidate], re.IGNORECASE)
                    ),
                    len(lines) - 1,
                )
                symbols.append(
                    _text_symbol(
                        item=item,
                        source_text=source_text,
                        kind=kind,
                        name=match.group(1),
                        start_line=index + 1,
                        end_line=end_index + 1,
                    )
                )

            always_match = re.match(
                r"^\s*(?:(?P<label>[A-Za-z_][A-Za-z0-9_$]*)\s*:\s*)?(?P<kind>always_ff|always_comb|always_latch|always|initial)\b",
                line,
                re.IGNORECASE,
            )
            if always_match:
                kind = "initial" if always_match.group("kind").lower() == "initial" else "always"
                name = always_match.group("label") or f"{kind}@{index + 1}"
                end_index = _find_keyword_end(lines, index, (r"\bend\b", r";"))
                symbols.append(
                    _text_symbol(
                        item=item,
                        source_text=source_text,
                        kind=kind,
                        name=name,
                        start_line=index + 1,
                        end_line=max(index + 1, end_index + 1),
                    )
                )
    else:
        declarations = [
            ("entity", re.compile(r"^\s*entity\s+([A-Za-z_][A-Za-z0-9_]*)\b", re.IGNORECASE), r"\bend\s+entity\b"),
            ("architecture", re.compile(r"^\s*architecture\s+([A-Za-z_][A-Za-z0-9_]*)\s+of\s+([A-Za-z_][A-Za-z0-9_]*)\b", re.IGNORECASE), r"\bend\s+architecture\b"),
            ("package_body", re.compile(r"^\s*package\s+body\s+([A-Za-z_][A-Za-z0-9_]*)\b", re.IGNORECASE), r"\bend\s+package\s+body\b"),
            ("package", re.compile(r"^\s*package\s+(?!body\b)([A-Za-z_][A-Za-z0-9_]*)\b", re.IGNORECASE), r"\bend\s+package\b"),
            ("procedure", re.compile(r"^\s*procedure\s+([A-Za-z_][A-Za-z0-9_]*)\b", re.IGNORECASE), r"\bend\s+procedure\b"),
            ("function", re.compile(r"^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\b", re.IGNORECASE), r"\bend\s+function\b"),
        ]
        for index, line in enumerate(lines):
            for kind, pattern, end_pattern in declarations:
                match = pattern.search(line)
                if not match:
                    continue
                # A declaration-only subprogram has no executable body.  It
                # is already represented by the surrounding package/entity
                # block, so do not let the text fallback consume the rest of
                # the file looking for an absent ``end procedure``.
                if kind in {"procedure", "function"} and ";" in line and not re.search(r"\bis\b", line, re.IGNORECASE):
                    continue
                name = match.group(1)
                if kind == "architecture" and len(match.groups()) > 1:
                    name = f"{match.group(2)}.{match.group(1)}"
                end_index = next(
                    (
                        candidate
                        for candidate in range(index, len(lines))
                        if re.search(end_pattern, lines[candidate], re.IGNORECASE)
                    ),
                    len(lines) - 1,
                )
                symbols.append(
                    _text_symbol(
                        item=item,
                        source_text=source_text,
                        kind=kind,
                        name=name,
                        start_line=index + 1,
                        end_line=end_index + 1,
                    )
                )

            process_match = re.match(
                r"^\s*(?:(?P<label>[A-Za-z_][A-Za-z0-9_]*)\s*:\s*)?process\b",
                line,
                re.IGNORECASE,
            )
            if process_match:
                name = process_match.group("label") or f"process@{index + 1}"
                end_index = next(
                    (
                        candidate
                        for candidate in range(index, len(lines))
                        if re.search(r"\bend\s+process\b", lines[candidate], re.IGNORECASE)
                    ),
                    len(lines) - 1,
                )
                symbols.append(
                    _text_symbol(
                        item=item,
                        source_text=source_text,
                        kind="process",
                        name=name,
                        start_line=index + 1,
                        end_line=end_index + 1,
                    )
                )
    return symbols


def _clean_identifier(value: str) -> str:
    value = (value or "").strip()
    value = value.strip("();,: ")
    return value.split(".")[-1].strip()


def _first_identifier(value: str, *, excluded: Iterable[str] = ()) -> str:
    excluded_set = {item.lower() for item in excluded}
    for match in _IDENTIFIER_RE.finditer(value or ""):
        candidate = match.group(0)
        if candidate.lower() not in excluded_set:
            return candidate
    return ""


def _name_from_node(node, source: bytes, language: str, kind: str, line: int) -> str:
    # Architecture names are conventionally qualified as entity.architecture;
    # derive both names from the declaration text instead of only the AST name
    # field, which often contains the architecture identifier alone.
    if language == "vhdl" and kind == "architecture":
        match = re.search(
            r"\barchitecture\s+([A-Za-z_][A-Za-z0-9_]*)\s+of\s+([A-Za-z_][A-Za-z0-9_]*)",
            _node_text(source, node),
            re.IGNORECASE,
        )
        if match:
            return f"{match.group(2)}.{match.group(1)}"

    name_node = _child_for_field(node, "name")
    if name_node is not None:
        name = _clean_identifier(_node_text(source, name_node))
        if name:
            return name

    text = _node_text(source, node)
    if language in {"verilog", "systemverilog"}:
        patterns = {
            "module": r"\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)",
            "interface": r"\binterface\s+([A-Za-z_][A-Za-z0-9_$]*)",
            "package": r"\bpackage\s+([A-Za-z_][A-Za-z0-9_$]*)",
            "program": r"\bprogram\s+([A-Za-z_][A-Za-z0-9_$]*)",
            "function": r"\bfunction\b(?:\s+automatic)?(?:\s+[^;(){}]+)?\s+([A-Za-z_][A-Za-z0-9_$]*)",
            "task": r"\btask\b(?:\s+automatic)?(?:\s+[^;(){}]+)?\s+([A-Za-z_][A-Za-z0-9_$]*)",
        }
        pattern = patterns.get(kind)
        match = re.search(pattern, text, re.IGNORECASE) if pattern else None
        if match:
            return match.group(1)
        if kind in {"always", "initial"}:
            label = re.search(r"(?m)^\s*([A-Za-z_][A-Za-z0-9_$]*)\s*:\s*", text)
            return label.group(1) if label else f"{kind}@{line}"
    else:
        patterns = {
            "entity": r"\bentity\s+([A-Za-z_][A-Za-z0-9_]*)",
            "architecture": r"\barchitecture\s+([A-Za-z_][A-Za-z0-9_]*)\s+of\s+([A-Za-z_][A-Za-z0-9_]*)",
            "package": r"\bpackage\s+(?!body\b)([A-Za-z_][A-Za-z0-9_]*)",
            "package_body": r"\bpackage\s+body\s+([A-Za-z_][A-Za-z0-9_]*)",
            "procedure": r"\bprocedure\s+([A-Za-z_][A-Za-z0-9_]*)",
            "function": r"\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)",
        }
        pattern = patterns.get(kind)
        match = re.search(pattern, text, re.IGNORECASE) if pattern else None
        if match:
            if kind == "architecture" and len(match.groups()) > 1:
                return f"{match.group(2)}.{match.group(1)}"
            return match.group(1)
        if kind == "process":
            label = re.search(r"(?m)^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*process\b", text, re.IGNORECASE)
            return label.group(1) if label else f"process@{line}"
    return f"{kind}@{line}"


def _kind_for_node(node_type: str, text: str, language: str) -> Optional[str]:
    node_type = (node_type or "").lower()
    if language in {"verilog", "systemverilog"}:
        return VERILOG_KIND_BY_TYPE.get(node_type)
    else:
        if node_type in VHDL_KIND_BY_TYPE:
            return VHDL_KIND_BY_TYPE[node_type]
        if node_type == "subprogram_definition":
            return "procedure" if re.search(r"\bprocedure\b", text, re.IGNORECASE) else "function"
    return None


def _ranges_overlap(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    return max(start_a, start_b) <= min(end_a, end_b)


def _collect_symbols(item: Dict[str, object]) -> List[Dict[str, object]]:
    source = item["source"]
    language = item["language"]
    result: Dict[Tuple[int, int, str], Dict[str, object]] = {}
    for node in _walk(item["tree"].root_node):
        kind = _kind_for_node(getattr(node, "type", ""), _node_text(source, node), language)
        if not kind:
            continue
        start_line, end_line = _node_lines(node)
        name = _name_from_node(node, source, language, kind, start_line)
        if not name:
            continue
        key = (start_line, end_line, kind)
        candidate = {
            "id": "",
            "name": name,
            "qualified_name": name,
            "namespace": "",
            "file": item["rel_path"],
            "filename": item["rel_path"],
            "language": language,
            "kind": kind,
            "type": kind,
            "line": start_line,
            "column": node.start_point[1] + 1,
            "end_line": end_line,
            "signature": _node_text(source, node).split("\n", 1)[0].strip(),
            "source": _node_text(source, node).strip(),
            "parameters": [],
            "local_symbols": [],
            "calls": [],
            "direct_callees": [],
            "direct_callers": [],
            "global_accesses": [],
            "global_reads": [],
            "global_writes": [],
        }
        previous = result.get(key)
        if previous is None or len(candidate["source"]) > len(previous["source"]):
            result[key] = candidate
    for candidate in _collect_text_symbols(item):
        key = (int(candidate["line"]), int(candidate["end_line"]), str(candidate["kind"]))
        previous = result.get(key)
        if previous is not None:
            continue
        # Prefer a real AST node when a grammar already recognized the same
        # construct.  This prevents the compatibility regex from creating a
        # second block with a slightly different end line.
        candidate_start = int(candidate["line"])
        candidate_end = int(candidate["end_line"])
        candidate_name = str(candidate.get("name") or "").lower()
        overlaps_ast = any(
            str(existing.get("kind") or "") == str(candidate.get("kind") or "")
            and str(existing.get("name") or "").lower() == candidate_name
            and _ranges_overlap(
                candidate_start,
                candidate_end,
                int(existing.get("line") or 0),
                int(existing.get("end_line") or 0),
            )
            for existing in result.values()
        )
        if not overlaps_ast:
            result[key] = candidate
    symbols = list(result.values())
    symbols.sort(key=lambda value: (value["file"], value["line"], value["end_line"], value["kind"]))
    for symbol in symbols:
        symbol["id"] = f"{symbol['file']}:{symbol['line']}:{symbol['qualified_name']}"
    return symbols


def _add_index(index: Dict[str, List[str]], name: str, function_id: str, language: str) -> None:
    if not name:
        return
    index[name].append(function_id)
    if language == "vhdl":
        index[name.lower()].append(function_id)


def _line_for_match(text: str, base_line: int, offset: int) -> int:
    return base_line + text[:offset].count("\n")


def _append_edge(
    caller: Dict[str, object],
    callee: Dict[str, object],
    *,
    kind: str,
    line: int,
    raw_name: str,
) -> None:
    call = {
        "raw_callee": raw_name,
        "simple_name": callee["name"],
        "kind": kind,
        "line": line,
        "column": 1,
        "resolved_targets": [callee["id"]],
    }
    existing = caller["calls"]
    if any(item["resolved_targets"] == call["resolved_targets"] and item["kind"] == kind for item in existing):
        return
    existing.append(call)
    caller["direct_callees"].append(callee["name"])


def _lookup_candidates(index: Dict[str, List[str]], name: str, language: str) -> List[str]:
    values = index.get(name, [])
    if not values and language == "vhdl":
        values = index.get(name.lower(), [])
    return list(dict.fromkeys(values))


def _is_subprogram_declaration_line(line: str, name: str, language: str) -> bool:
    """Return whether a matching identifier belongs to a declaration header."""
    escaped_name = re.escape(name)
    if language == "vhdl":
        return bool(re.search(rf"\b(?:procedure|function)\s+{escaped_name}\b", line, re.IGNORECASE))
    return bool(re.search(rf"\b(?:task|function)\b.*\b{escaped_name}\b", line, re.IGNORECASE))


def _collect_edges(symbols: List[Dict[str, object]], language: str) -> Dict[str, List[str]]:
    index: Dict[str, List[str]] = defaultdict(list)
    by_id = {symbol["id"]: symbol for symbol in symbols}
    for symbol in symbols:
        _add_index(index, symbol["name"], symbol["id"], language)
        _add_index(index, symbol["qualified_name"], symbol["id"], language)

    forward: Dict[str, Set[str]] = defaultdict(set)
    callable_kinds = {"function", "task", "procedure"}
    structural_kinds = {"module", "interface", "program", "entity"}
    for caller in symbols:
        text = caller["source"]
        caller_start = int(caller["line"])

        if language == "vhdl" and caller["kind"] == "architecture":
            architecture_parts = str(caller["name"]).split(".", 1)
            entity_name = architecture_parts[0] if len(architecture_parts) == 2 else ""
            for target in symbols:
                if target["kind"] != "entity" or target["name"].lower() != entity_name.lower():
                    continue
                _append_edge(
                    caller,
                    target,
                    kind="architecture_of",
                    line=int(caller["line"]),
                    raw_name=target["name"],
                )
                forward[caller["id"]].add(target["id"])
                break

        for target in symbols:
            if target["id"] == caller["id"]:
                continue
            target_name = re.escape(str(target["name"]))
            if language == "vhdl":
                flags = re.IGNORECASE
            else:
                flags = 0

            if target["kind"] in callable_kinds:
                pattern = re.compile(rf"(?<![A-Za-z0-9_$]){target_name}(?![A-Za-z0-9_$])\s*(?=\(|;)", flags)
                for match in pattern.finditer(text):
                    if match.start() == 0 and target["name"].lower() == caller["name"].lower():
                        continue
                    line_start = text.rfind("\n", 0, match.start()) + 1
                    line_end = text.find("\n", match.start())
                    line_text = text[line_start:] if line_end < 0 else text[line_start:line_end]
                    if _is_subprogram_declaration_line(line_text, str(target["name"]), language):
                        continue
                    line = _line_for_match(text, caller_start, match.start())
                    _append_edge(caller, target, kind=f"{target['kind']}_call", line=line, raw_name=target["name"])
                    forward[caller["id"]].add(target["id"])
                    break

            if target["kind"] in structural_kinds:
                if language == "vhdl":
                    instance_pattern = re.compile(
                        rf"(?im)^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*(?:entity\s+[A-Za-z_][A-Za-z0-9_]*\.)?{target_name}\b"
                    )
                else:
                    instance_pattern = re.compile(
                        rf"(?m)^\s*{target_name}\s*(?:#\s*\([^;]*\)\s*)?[A-Za-z_][A-Za-z0-9_$]*\s*\("
                    )
                match = instance_pattern.search(text)
                if match:
                    kind = "entity_instantiation" if language == "vhdl" else "module_instantiation"
                    line = _line_for_match(text, caller_start, match.start())
                    _append_edge(caller, target, kind=kind, line=line, raw_name=target["name"])
                    forward[caller["id"]].add(target["id"])

        # Add a lightweight containment edge so selecting a module/entity also
        # exposes its process/task/function children in the graph.
        parent_candidates = [
            target
            for target in symbols
            if target["id"] != caller["id"]
            and target["file"] == caller["file"]
            and target["kind"] in structural_kinds | {"architecture", "package", "package_body"}
            and int(target["line"]) <= int(caller["line"])
            and int(target["end_line"]) >= int(caller["end_line"])
        ]
        if parent_candidates:
            parent = min(parent_candidates, key=lambda value: int(value["end_line"]) - int(value["line"]))
            _append_edge(parent, caller, kind="contains", line=int(caller["line"]), raw_name=caller["name"])
            forward[parent["id"]].add(caller["id"])

    reverse: Dict[str, Set[str]] = defaultdict(set)
    for caller_id, callee_ids in forward.items():
        for callee_id in callee_ids:
            reverse[callee_id].add(caller_id)
    for symbol in symbols:
        symbol["calls"] = sorted(symbol["calls"], key=lambda call: (call["line"], call["raw_callee"], call["kind"]))
        symbol["direct_callees"] = sorted(set(symbol["direct_callees"]))
        symbol["callee_ids"] = sorted(forward.get(symbol["id"], set()))
        symbol["caller_ids"] = sorted(reverse.get(symbol["id"], set()))
        symbol["direct_callers"] = sorted(by_id[caller_id]["name"] for caller_id in reverse.get(symbol["id"], set()))
    return {
        "forward": {symbol["id"]: sorted(forward.get(symbol["id"], set())) for symbol in symbols},
        "reverse": {symbol["id"]: sorted(reverse.get(symbol["id"], set())) for symbol in symbols},
    }


def _blocks_from_symbols(symbols: Sequence[Dict[str, object]]) -> List[Dict[str, object]]:
    blocks = []
    for symbol in symbols:
        source = symbol.get("source") or ""
        if not source.strip():
            continue
        blocks.append({
            "id": 0,
            "name": symbol["qualified_name"],
            "file": symbol["file"],
            "filename": symbol["file"],
            "range": [symbol["line"], symbol["end_line"]],
            "startLine": symbol["line"],
            "endLine": symbol["end_line"],
            "type": symbol["kind"],
            "code": source,
            "content": source,
            "language": symbol["language"],
            "function_id": symbol["id"],
            "related_id": [],
            "related_range": {},
        })
    return blocks


def build_hdl_model(parsed_files: Sequence[Dict[str, object]]) -> Dict[str, object]:
    functions: Dict[str, Dict[str, object]] = {}
    function_index: Dict[str, List[str]] = defaultdict(list)
    call_graph = {"forward": {}, "reverse": {}}
    code_blocks: List[Dict[str, object]] = []

    symbols_by_language: Dict[str, List[Dict[str, object]]] = defaultdict(list)
    for item in parsed_files:
        if is_hdl_language(item["language"]):
            language_group = "verilog" if item["language"] in {"verilog", "systemverilog"} else "vhdl"
            symbols_by_language[language_group].extend(_collect_symbols(item))

    for language, symbols in symbols_by_language.items():
        file_graph = _collect_edges(symbols, language)
        for symbol in symbols:
            functions[symbol["id"]] = symbol
            _add_index(function_index, symbol["name"], symbol["id"], language)
            _add_index(function_index, symbol["qualified_name"], symbol["id"], language)
        code_blocks.extend(_blocks_from_symbols(symbols))
        call_graph["forward"].update(file_graph["forward"])
        call_graph["reverse"].update(file_graph["reverse"])

    return {
        "functions": functions,
        "function_index": dict(function_index),
        "call_graph": call_graph,
        "code_blocks": code_blocks,
    }
