#!/usr/bin/env python3
"""Build a C/C++ call graph with tree-sitter.

Dependencies inside the target Python environment:

    pip install tree-sitter tree-sitter-c tree-sitter-cpp

Example:

    python build_call_graph.py PT016 --output pt016_call_graph.json

The output JSON is organized around:
  - "functions": per-function metadata, direct calls, global reads/writes
  - "globals": global variable definitions discovered at file/namespace scope
  - "function_index": name -> function ids

Notes:
  - This works directly on source text. It does not run the C/C++ preprocessor.
  - Indirect calls such as function pointers are recorded but usually unresolved.
  - Global variable access classification is best-effort and intentionally conservative.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Sequence, Set, Tuple

try:
    from tree_sitter import Language, Parser
except ImportError as exc:  # pragma: no cover - import failure is runtime guidance
    raise SystemExit(
        "Missing dependency: tree-sitter\n"
        "Install it in your conda env with:\n"
        "  pip install tree-sitter tree-sitter-c tree-sitter-cpp"
    ) from exc


C_EXTENSIONS = {".c"}
CPP_EXTENSIONS = {".cc", ".cp", ".cpp", ".cxx", ".c++", ".C"}
HEADER_EXTENSIONS = {".h", ".hh", ".hpp", ".hxx", ".ipp", ".inl", ".tpp"}
SOURCE_EXTENSIONS = C_EXTENSIONS | CPP_EXTENSIONS | HEADER_EXTENSIONS

FUNCTION_DEFINITION_TYPES = {"function_definition"}
DECLARATOR_TYPES = {
    "identifier",
    "field_identifier",
    "qualified_identifier",
    "scoped_identifier",
    "pointer_declarator",
    "reference_declarator",
    "array_declarator",
    "parenthesized_declarator",
    "function_declarator",
    "init_declarator",
    "attributed_declarator",
}
LOCAL_DECLARATION_TYPES = {
    "declaration",
    "field_declaration",
}
GLOBAL_SCOPE_CONTAINER_TYPES = {
    "translation_unit",
    "declaration_list",
    "preproc_if",
    "preproc_ifdef",
    "preproc_ifndef",
    "preproc_else",
    "preproc_elif",
}
IDENTIFIER_TYPES = {"identifier", "field_identifier", "qualified_identifier", "scoped_identifier"}
TYPE_LIKE_NODE_TYPES = {
    "primitive_type",
    "type_identifier",
    "sized_type_specifier",
    "struct_specifier",
    "union_specifier",
    "enum_specifier",
    "class_specifier",
    "namespace_identifier",
}
CLASS_LIKE_NODE_TYPES = {"class_specifier", "struct_specifier", "union_specifier"}
ENUM_NODE_TYPES = {"enum_specifier"}
MACRO_NODE_TYPES = {"preproc_def", "preproc_function_def"}
GLOBAL_DECLARATION_NODE_TYPES = {
    "declaration",
    "type_definition",
    "alias_declaration",
    "using_declaration",
    "namespace_alias_definition",
}
EXPRESSION_WRAPPERS_FOR_LVALUE = {
    "subscript_expression",
    "field_expression",
    "parenthesized_expression",
}
SKIP_DIR_NAMES = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    "build",
    "cmake-build-debug",
    "cmake-build-release",
    "dist",
    "out",
    "__pycache__",
}
INCLUDE_RE = re.compile(r'^\s*#\s*include\s*([<"])([^>"]+)[>"]')


@dataclass
class GlobalVar:
    name: str
    qualified_name: str
    file: str
    line: int
    column: int
    language: str
    declaration: str
    storage: str
    namespace: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "qualified_name": self.qualified_name,
            "file": self.file,
            "line": self.line,
            "column": self.column,
            "language": self.language,
            "declaration": self.declaration,
            "storage": self.storage,
            "namespace": self.namespace,
        }


@dataclass
class CallSite:
    raw_callee: str
    simple_name: str
    kind: str
    line: int
    column: int
    resolved_targets: List[str]

    def to_dict(self) -> Dict[str, object]:
        return {
            "raw_callee": self.raw_callee,
            "simple_name": self.simple_name,
            "kind": self.kind,
            "line": self.line,
            "column": self.column,
            "resolved_targets": self.resolved_targets,
        }


@dataclass
class GlobalAccess:
    name: str
    line: int
    column: int
    mode: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "name": self.name,
            "line": self.line,
            "column": self.column,
            "mode": self.mode,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo_root", help="C/C++ repository root")
    parser.add_argument(
        "--output",
        "-o",
        default="call_graph.json",
        help="Output JSON path (default: call_graph.json)",
    )
    parser.add_argument(
        "--header-language",
        choices=("auto", "c", "cpp"),
        default="auto",
        help="How to parse header files (default: auto)",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print the JSON output",
    )
    return parser.parse_args()


def node_text(source: bytes, node) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="ignore")


def line_col(node) -> Tuple[int, int]:
    row, col = node.start_point
    return row + 1, col + 1


def node_range(node) -> Tuple[int, int]:
    return node.start_point[0] + 1, node.end_point[0] + 1


def walk(node) -> Iterator:
    stack = [node]
    while stack:
        current = stack.pop()
        yield current
        stack.extend(reversed(current.children))


def child_for_field(node, name: str):
    try:
        return node.child_by_field_name(name)
    except Exception:
        return None


def parser_for_language(language: Language) -> Parser:
    if hasattr(Parser(), "set_language"):
        parser = Parser()
        parser.set_language(language)
        return parser

    try:
        parser = Parser()
        parser.language = language
        return parser
    except AttributeError:
        return Parser(language)


def language_from_package(language_pointer: object, name: str) -> Language:
    try:
        return Language(language_pointer)
    except TypeError:
        return Language(language_pointer, name)


def load_languages() -> Dict[str, Language]:
    languages: Dict[str, Language] = {}
    missing: List[str] = []

    try:
        import tree_sitter_c as tsc

        languages["c"] = language_from_package(tsc.language(), "c")
    except ImportError:
        missing.append("tree-sitter-c")

    try:
        import tree_sitter_cpp as tscpp

        languages["cpp"] = language_from_package(tscpp.language(), "cpp")
    except ImportError:
        missing.append("tree-sitter-cpp")

    if missing:
        raise SystemExit(
            "Missing tree-sitter language packages: "
            + ", ".join(missing)
            + "\nInstall them in your conda env with:\n"
            + "  pip install tree-sitter tree-sitter-c tree-sitter-cpp"
        )
    return languages


def repo_files(repo_root: Path) -> List[Path]:
    files: List[Path] = []
    for path in repo_root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIR_NAMES for part in path.parts):
            continue
        if path.suffix in SOURCE_EXTENSIONS:
            files.append(path)
    return sorted(files)


def repo_has_cpp_sources(files: Sequence[Path]) -> bool:
    return any(path.suffix in CPP_EXTENSIONS for path in files)


def normalize_include_name(include_name: str) -> str:
    return include_name.strip().replace("\\", "/").lower()


def classify_file_language(path: Path, header_language: str, default_header_language: str) -> Optional[str]:
    if path.suffix in C_EXTENSIONS:
        return "c"
    if path.suffix in CPP_EXTENSIONS:
        return "cpp"
    if path.suffix in HEADER_EXTENSIONS:
        if header_language == "auto":
            return default_header_language
        return header_language
    return None


def extract_includes(source: bytes) -> List[Dict[str, str]]:
    includes: List[Dict[str, str]] = []
    for raw_line in source.decode("utf-8", errors="ignore").splitlines():
        match = INCLUDE_RE.match(raw_line)
        if not match:
            continue
        delimiter, include_name = match.groups()
        includes.append(
            {
                "name": include_name.strip(),
                "kind": "system" if delimiter == "<" else "local",
                "normalized_name": normalize_include_name(include_name),
            }
        )
    return includes


def extract_namespace_name(node, source: bytes) -> Optional[str]:
    name_node = child_for_field(node, "name")
    if name_node is not None:
        return node_text(source, name_node).strip()
    for child in node.children:
        if child.type == "namespace_identifier":
            return node_text(source, child).strip()
    return None


def iter_scope_nodes(node, source: bytes, namespace_parts: Tuple[str, ...] = ()) -> Iterator[Tuple[object, Tuple[str, ...]]]:
    if node.type in GLOBAL_SCOPE_CONTAINER_TYPES:
        for child in node.children:
            yield from iter_scope_nodes(child, source, namespace_parts)
        return

    if node.type == "namespace_definition":
        namespace_name = extract_namespace_name(node, source)
        next_namespace = namespace_parts + ((namespace_name,) if namespace_name else ())
        body = None
        for child in node.children:
            if child.type == "declaration_list":
                body = child
                break
        if body is not None:
            yield from iter_scope_nodes(body, source, next_namespace)
        return

    if node.type in {"linkage_specification", "template_declaration"}:
        for child in node.children:
            if child.is_named:
                yield from iter_scope_nodes(child, source, namespace_parts)
        return

    yield node, namespace_parts


def is_function_like_declarator(node) -> bool:
    if node is None:
        return False
    if node.type == "function_declarator":
        return True
    direct = child_for_field(node, "declarator")
    if direct is not None and direct is not node:
        return is_function_like_declarator(direct)
    return any(is_function_like_declarator(child) for child in node.children)


def extract_declarator_name(node, source: bytes) -> Optional[str]:
    if node is None:
        return None
    if node.type in {"identifier", "field_identifier", "qualified_identifier", "scoped_identifier"}:
        return node_text(source, node).strip()
    direct = child_for_field(node, "declarator")
    if direct is not None and direct is not node:
        nested = extract_declarator_name(direct, source)
        if nested:
            return nested
    for child in node.children:
        if child.type in DECLARATOR_TYPES or child.type in IDENTIFIER_TYPES:
            nested = extract_declarator_name(child, source)
            if nested:
                return nested
    return None


def is_probable_storage_token(token: str) -> bool:
    return token in {
        "extern",
        "static",
        "thread_local",
        "constexpr",
        "constinit",
        "inline",
        "register",
        "volatile",
        "const",
        "mutable",
    }


def declaration_storage(node, source: bytes) -> str:
    tokens = [node_text(source, child).strip() for child in node.children if child.is_named or node_text(source, child).strip()]
    storage_tokens = [token for token in tokens if is_probable_storage_token(token)]
    return " ".join(storage_tokens)


def collect_declared_variables(declaration_node, source: bytes) -> List[str]:
    names: List[str] = []
    for child in declaration_node.children:
        if child.type not in DECLARATOR_TYPES:
            continue
        target = child_for_field(child, "declarator") if child.type == "init_declarator" else child
        if target is None:
            continue
        if is_function_like_declarator(target):
            continue
        name = extract_declarator_name(target, source)
        if name:
            names.append(name)
    return names


def build_global_symbols(parsed_files: Sequence[Dict[str, object]]) -> Dict[str, List[GlobalVar]]:
    globals_by_name: Dict[str, List[GlobalVar]] = defaultdict(list)
    for item in parsed_files:
        source = item["source"]
        root = item["tree"].root_node
        rel_path = item["rel_path"]
        language = item["language"]
        for node, namespace_parts in iter_scope_nodes(root, source):
            if node.type != "declaration":
                continue
            names = collect_declared_variables(node, source)
            if not names:
                continue
            storage = declaration_storage(node, source)
            namespace = "::".join(namespace_parts)
            declaration = node_text(source, node).strip()
            line, column = line_col(node)
            for name in names:
                qualified_name = f"{namespace}::{name}" if namespace else name
                globals_by_name[name].append(
                    GlobalVar(
                        name=name,
                        qualified_name=qualified_name,
                        file=rel_path,
                        line=line,
                        column=column,
                        language=language,
                        declaration=declaration,
                        storage=storage,
                        namespace=namespace,
                    )
                )
    return globals_by_name


def function_signature(function_node, source: bytes) -> str:
    body = child_for_field(function_node, "body")
    if body is None:
        return node_text(source, function_node).strip()
    return source[function_node.start_byte : body.start_byte].decode("utf-8", errors="ignore").strip()


def collect_parameter_names(function_node, source: bytes) -> Set[str]:
    names: Set[str] = set()
    declarator = child_for_field(function_node, "declarator")
    if declarator is None:
        return names
    for node in walk(declarator):
        if node.type == "parameter_declaration":
            child = child_for_field(node, "declarator")
            name = extract_declarator_name(child, source)
            if name:
                names.add(name)
    return names


def is_inside_function(node) -> bool:
    current = node.parent
    while current is not None:
        if current.type in FUNCTION_DEFINITION_TYPES:
            return True
        current = current.parent
    return False


def collect_local_names(body_node, source: bytes) -> Set[str]:
    names: Set[str] = set()
    for node in walk(body_node):
        if node.type not in LOCAL_DECLARATION_TYPES:
            continue
        if not is_inside_function(node):
            continue
        names.update(collect_declared_variables(node, source))
    return names


def base_identifier_for_call(expr_node, source: bytes) -> Tuple[str, str]:
    raw = node_text(source, expr_node).strip()
    if expr_node.type == "identifier":
        return raw, "direct"
    if expr_node.type in {"qualified_identifier", "scoped_identifier"}:
        return raw.split("::")[-1], "direct"
    if expr_node.type == "field_expression":
        field = child_for_field(expr_node, "field")
        if field is not None:
            return node_text(source, field).strip(), "member"
        return raw, "member"
    if expr_node.type == "subscript_expression":
        return raw, "indirect"
    return raw, "indirect"


def node_contains(outer, inner) -> bool:
    return outer.start_byte <= inner.start_byte and inner.end_byte <= outer.end_byte


def assignment_operator(node, source: bytes) -> str:
    named_children = [child for child in node.children if child is not None]
    if len(named_children) < 2:
        return "="
    left = child_for_field(node, "left")
    right = child_for_field(node, "right")
    if left is None or right is None:
        text = node_text(source, node)
        return "+=" if "+=" in text else "="
    operator_text = source[left.end_byte : right.start_byte].decode("utf-8", errors="ignore").strip()
    return operator_text or "="


def lift_access_root(identifier_node):
    current = identifier_node
    while current.parent is not None:
        parent = current.parent
        if parent.type not in EXPRESSION_WRAPPERS_FOR_LVALUE:
            break
        current = parent
    return current


def classify_access_mode(access_root, source: bytes) -> str:
    parent = access_root.parent
    if parent is None:
        return "read"
    if parent.type == "assignment_expression":
        left = child_for_field(parent, "left")
        if left is not None and node_contains(left, access_root):
            op = assignment_operator(parent, source)
            return "write" if op == "=" else "readwrite"
        return "read"
    if parent.type == "update_expression":
        return "readwrite"
    return "read"


def is_function_call_name(identifier_node) -> bool:
    parent = identifier_node.parent
    if parent is None:
        return False
    if parent.type not in {"call_expression", "field_expression", "qualified_identifier", "scoped_identifier"}:
        return False
    current = identifier_node
    while current.parent is not None:
        parent = current.parent
        if parent.type == "call_expression":
            function_node = child_for_field(parent, "function")
            return function_node is not None and function_node == current
        if parent.type in {"field_expression", "qualified_identifier", "scoped_identifier"}:
            current = parent
            continue
        break
    return False


def is_declaration_name(identifier_node) -> bool:
    current = identifier_node
    while current.parent is not None:
        parent = current.parent
        if parent.type in {
            "init_declarator",
            "pointer_declarator",
            "reference_declarator",
            "array_declarator",
            "function_declarator",
            "parenthesized_declarator",
            "attributed_declarator",
            "parameter_declaration",
            "declaration",
            "field_declaration",
            "function_definition",
        }:
            current = parent
            continue
        break
    return current.type in {
        "init_declarator",
        "pointer_declarator",
        "reference_declarator",
        "array_declarator",
        "function_declarator",
        "parenthesized_declarator",
        "attributed_declarator",
        "parameter_declaration",
        "declaration",
        "field_declaration",
        "function_definition",
    }
    return False


def is_type_context(identifier_node) -> bool:
    current = identifier_node.parent
    while current is not None:
        if current.type in TYPE_LIKE_NODE_TYPES:
            return True
        if current.type in {"declaration", "parameter_declaration"}:
            return False
        current = current.parent
    return False


def analyze_calls(body_node, source: bytes) -> List[CallSite]:
    calls: List[CallSite] = []
    for node in walk(body_node):
        if node.type != "call_expression":
            continue
        function_node = child_for_field(node, "function")
        if function_node is None:
            continue
        simple_name, kind = base_identifier_for_call(function_node, source)
        raw = node_text(source, function_node).strip()
        line, column = line_col(function_node)
        calls.append(
            CallSite(
                raw_callee=raw,
                simple_name=simple_name,
                kind=kind,
                line=line,
                column=column,
                resolved_targets=[],
            )
        )
    return calls


def analyze_global_accesses(
    body_node,
    source: bytes,
    global_names: Set[str],
    local_names: Set[str],
    known_function_names: Set[str],
) -> List[GlobalAccess]:
    accesses: List[GlobalAccess] = []
    for node in walk(body_node):
        if node.type != "identifier":
            continue
        name = node_text(source, node).strip()
        if not name or name not in global_names or name in local_names:
            continue
        if is_declaration_name(node) or is_type_context(node):
            continue
        if is_function_call_name(node) and name in known_function_names:
            continue
        access_root = lift_access_root(node)
        line, column = line_col(node)
        accesses.append(
            GlobalAccess(
                name=name,
                line=line,
                column=column,
                mode=classify_access_mode(access_root, source),
            )
        )
    return accesses


def function_id_for(rel_path: str, line: int, name: str) -> str:
    return f"{rel_path}:{line}:{name}"


def build_functions(
    parsed_files: Sequence[Dict[str, object]],
    globals_by_name: Dict[str, List[GlobalVar]],
) -> Tuple[Dict[str, Dict[str, object]], Dict[str, List[str]], Dict[str, List[str]]]:
    functions: Dict[str, Dict[str, object]] = {}
    function_index: Dict[str, List[str]] = defaultdict(list)

    for item in parsed_files:
        source = item["source"]
        root = item["tree"].root_node
        rel_path = item["rel_path"]
        language = item["language"]
        for node, namespace_parts in iter_scope_nodes(root, source):
            if node.type not in FUNCTION_DEFINITION_TYPES:
                continue
            name = extract_declarator_name(child_for_field(node, "declarator"), source)
            if not name:
                continue
            namespace = "::".join(namespace_parts)
            qualified_name = name if "::" in name or not namespace else f"{namespace}::{name}"
            line, column = line_col(node)
            function_id = function_id_for(rel_path, line, qualified_name)
            body = child_for_field(node, "body")
            if body is None:
                continue
            parameter_names = collect_parameter_names(node, source)
            local_names = parameter_names | collect_local_names(body, source)
            calls = analyze_calls(body, source)
            functions[function_id] = {
                "id": function_id,
                "name": name,
                "qualified_name": qualified_name,
                "namespace": namespace,
                "file": rel_path,
                "language": language,
                "line": line,
                "column": column,
                "end_line": node.end_point[0] + 1,
                "signature": function_signature(node, source),
                "source": node_text(source, node).strip(),
                "parameters": sorted(parameter_names),
                "local_symbols": sorted(local_names),
                "calls": [call.to_dict() for call in calls],
                "direct_callees": [],
                "direct_callers": [],
                "global_accesses": [],
                "global_reads": [],
                "global_writes": [],
            }
            function_index[name].append(function_id)
            if "::" in qualified_name:
                function_index[qualified_name].append(function_id)

    known_function_names = set(function_index)
    global_names = set(globals_by_name)
    reverse_adjacency: Dict[str, Set[str]] = defaultdict(set)
    forward_adjacency: Dict[str, Set[str]] = defaultdict(set)

    for function in functions.values():
        item = next(
            parsed for parsed in parsed_files if parsed["rel_path"] == function["file"]
        )
        root = item["tree"].root_node
        source = item["source"]
        target_node = None
        for node in walk(root):
            if node.type not in FUNCTION_DEFINITION_TYPES:
                continue
            line, _ = line_col(node)
            node_name = extract_declarator_name(child_for_field(node, "declarator"), source)
            if line == function["line"] and node_name == function["name"]:
                target_node = node
                break
        if target_node is None:
            continue
        body = child_for_field(target_node, "body")
        if body is None:
            continue
        local_names = set(function["local_symbols"])
        accesses = analyze_global_accesses(body, source, global_names, local_names, known_function_names)
        reads = sorted({access.name for access in accesses if access.mode in {"read", "readwrite"}})
        writes = sorted({access.name for access in accesses if access.mode in {"write", "readwrite"}})
        direct_callees: Set[str] = set()
        for call in function["calls"]:
            candidates = function_index.get(call["raw_callee"], []) or function_index.get(call["simple_name"], [])
            call["resolved_targets"] = sorted(set(candidates))
            if call["simple_name"]:
                direct_callees.add(call["simple_name"])
            for callee_id in call["resolved_targets"]:
                reverse_adjacency[callee_id].add(function["id"])
                forward_adjacency[function["id"]].add(callee_id)
        function["direct_callees"] = sorted(direct_callees)
        function["global_accesses"] = [access.to_dict() for access in accesses]
        function["global_reads"] = reads
        function["global_writes"] = writes

    for function_id, function in functions.items():
        function["callee_ids"] = sorted(forward_adjacency.get(function_id, set()))
        function["caller_ids"] = sorted(reverse_adjacency.get(function_id, set()))
        function["direct_callers"] = sorted(
            {functions[caller_id]["name"] for caller_id in reverse_adjacency.get(function_id, set())}
        )

    call_graph = {
        "forward": {function_id: sorted(forward_adjacency.get(function_id, set())) for function_id in sorted(functions)},
        "reverse": {function_id: sorted(reverse_adjacency.get(function_id, set())) for function_id in sorted(functions)},
    }
    return functions, dict(function_index), call_graph


def build_parsed_files(
    repo_root: Path,
    files: Sequence[Path],
    header_language: str,
    languages: Dict[str, Language],
) -> List[Dict[str, object]]:
    parsed: List[Dict[str, object]] = []
    default_header_language = "cpp" if repo_has_cpp_sources(files) else "c"
    parsers = {name: parser_for_language(language) for name, language in languages.items()}

    for path in files:
        language = classify_file_language(path, header_language, default_header_language)
        if language is None:
            continue
        source = path.read_bytes()
        tree = parsers[language].parse(source)
        parsed.append(
            {
                "path": path,
                "rel_path": path.relative_to(repo_root).as_posix(),
                "language": language,
                "source": source,
                "tree": tree,
                "includes": extract_includes(source),
            }
        )
    return parsed


def build_include_index(parsed_files: Sequence[Dict[str, object]]) -> Dict[str, object]:
    files: Dict[str, Dict[str, object]] = {}
    included_by_name: Dict[str, Set[str]] = defaultdict(set)

    for item in parsed_files:
        rel_path = item["rel_path"]
        file_name = Path(rel_path).name
        normalized_file_name = normalize_include_name(file_name)
        includes = item.get("includes", [])

        files[rel_path] = {
            "file": rel_path,
            "basename": file_name,
            "normalized_basename": normalized_file_name,
            "language": item["language"],
            "has_parse_errors": item["tree"].root_node.has_error,
            "includes": includes,
            "included_by": [],
        }

        for include in includes:
            included_by_name[include["normalized_name"]].add(rel_path)

    for rel_path, info in files.items():
        info["included_by"] = sorted(included_by_name.get(info["normalized_basename"], set()))

    return {
        "files": files,
        "included_by_name": {key: sorted(value) for key, value in included_by_name.items()},
    }


def sorted_globals(globals_by_name: Dict[str, List[GlobalVar]]) -> Dict[str, List[Dict[str, object]]]:
    result: Dict[str, List[Dict[str, object]]] = {}
    for name, definitions in sorted(globals_by_name.items()):
        result[name] = [definition.to_dict() for definition in sorted(definitions, key=lambda item: (item.file, item.line, item.column))]
    return result


def build_global_index(
    globals_by_name: Dict[str, List[GlobalVar]],
    include_index: Dict[str, object],
) -> Dict[str, Dict[str, object]]:
    files = include_index["files"]
    result: Dict[str, Dict[str, object]] = {}

    for name, definitions in sorted(globals_by_name.items()):
        declaration_files = sorted({definition.file for definition in definitions})
        declaration_basenames = {
            normalize_include_name(Path(path).name)
            for path in declaration_files
        }
        directly_including_files: Set[str] = set()
        for basename in declaration_basenames:
            directly_including_files.update(include_index["included_by_name"].get(basename, []))
        result[name] = {
            "name": name,
            "definitions": [definition.to_dict() for definition in sorted(definitions, key=lambda item: (item.file, item.line, item.column))],
            "declaration_files": declaration_files,
            "declaration_headers": [
                path for path in declaration_files if Path(path).suffix in HEADER_EXTENSIONS
            ],
            "directly_including_files": sorted(directly_including_files),
            "directly_including_source_files": sorted(
                path for path in directly_including_files if Path(path).suffix in C_EXTENSIONS | CPP_EXTENSIONS
            ),
            "declaration_file_details": [files[path] for path in declaration_files if path in files],
        }
    return result


def _nearest_template_wrapper(node):
    parent = node.parent
    if parent is not None and parent.type == "template_declaration":
        return parent
    return node


def _declaration_wrapper_for_specifier(node):
    current = node
    parent = current.parent
    while parent is not None and parent.type in {"declaration", "type_definition"}:
        current = parent
        parent = current.parent
    return _nearest_template_wrapper(current)


def _macro_name(node, source: bytes) -> str:
    name_node = child_for_field(node, "name")
    if name_node is not None:
        return node_text(source, name_node).strip()
    text = node_text(source, node).strip()
    match = re.match(r"#\s*define\s+([A-Za-z_]\w*)", text)
    return match.group(1) if match else ""


def _named_child_text(node, source: bytes) -> str:
    name_node = child_for_field(node, "name")
    if name_node is not None:
        return node_text(source, name_node).strip()
    for child in walk(node):
        if child.type in {"type_identifier", "identifier", "field_identifier"}:
            return node_text(source, child).strip()
    return ""


def _contains_node_type(node, node_types: Set[str]) -> bool:
    return any(child.type in node_types for child in walk(node))


def _build_code_block(
    *,
    block_type: str,
    name: str,
    rel_path: str,
    source: bytes,
    node,
    language: str,
    function_id: Optional[str] = None,
) -> Dict[str, object]:
    start_line, end_line = node_range(node)
    code = node_text(source, node).strip()
    return {
        "id": 0,
        "name": name or block_type,
        "file": rel_path,
        "filename": rel_path,
        "range": [start_line, end_line],
        "startLine": start_line,
        "endLine": end_line,
        "type": block_type,
        "code": code,
        "content": code,
        "language": language,
        "function_id": function_id,
        "related_id": [],
        "related_range": {},
    }


def _function_lookup(functions: Dict[str, Dict[str, object]]) -> Dict[Tuple[str, int, str], str]:
    lookup: Dict[Tuple[str, int, str], str] = {}
    for function_id, function in functions.items():
        lookup[
            (
                str(function.get("file") or ""),
                int(function.get("line") or 0),
                str(function.get("qualified_name") or function.get("name") or ""),
            )
        ] = function_id
    return lookup


def build_code_blocks(
    parsed_files: Sequence[Dict[str, object]],
    functions: Dict[str, Dict[str, object]],
    call_graph: Dict[str, List[str]],
) -> List[Dict[str, object]]:
    blocks: List[Dict[str, object]] = []
    seen_ranges: Set[Tuple[str, int, int, str]] = set()
    function_lookup = _function_lookup(functions)

    def add_block(block: Dict[str, object]) -> None:
        start_line, end_line = block["range"]
        if start_line <= 0 or end_line < start_line or not block.get("code"):
            return
        key = (block["file"], int(start_line), int(end_line), block["type"])
        if key in seen_ranges:
            return
        seen_ranges.add(key)
        blocks.append(block)

    for item in parsed_files:
        source = item["source"]
        root = item["tree"].root_node
        rel_path = item["rel_path"]
        language = item["language"]

        for node in walk(root):
            if node.type not in MACRO_NODE_TYPES:
                continue
            add_block(
                _build_code_block(
                    block_type="macro",
                    name=_macro_name(node, source),
                    rel_path=rel_path,
                    source=source,
                    node=node,
                    language=language,
                )
            )

        for node, namespace_parts in iter_scope_nodes(root, source):
            if node.type in FUNCTION_DEFINITION_TYPES:
                name = extract_declarator_name(child_for_field(node, "declarator"), source)
                if not name:
                    continue
                namespace = "::".join(namespace_parts)
                qualified_name = name if "::" in name or not namespace else f"{namespace}::{name}"
                line, _ = line_col(node)
                function_id = function_lookup.get((rel_path, line, qualified_name))
                add_block(
                    _build_code_block(
                        block_type="function",
                        name=qualified_name,
                        rel_path=rel_path,
                        source=source,
                        node=_nearest_template_wrapper(node),
                        language=language,
                        function_id=function_id,
                    )
                )
                continue

            if node.type in GLOBAL_DECLARATION_NODE_TYPES:
                class_like = next((child for child in walk(node) if child.type in CLASS_LIKE_NODE_TYPES), None)
                if class_like is not None:
                    add_block(
                        _build_code_block(
                            block_type="class/struct",
                            name=_named_child_text(class_like, source),
                            rel_path=rel_path,
                            source=source,
                            node=_declaration_wrapper_for_specifier(class_like),
                            language=language,
                        )
                    )
                    continue

                enum_node = next((child for child in walk(node) if child.type in ENUM_NODE_TYPES), None)
                if enum_node is not None:
                    add_block(
                        _build_code_block(
                            block_type="enum",
                            name=_named_child_text(enum_node, source),
                            rel_path=rel_path,
                            source=source,
                            node=_declaration_wrapper_for_specifier(enum_node),
                            language=language,
                        )
                    )
                    continue

                if _contains_node_type(node, FUNCTION_DEFINITION_TYPES):
                    continue
                names = collect_declared_variables(node, source)
                if names:
                    add_block(
                        _build_code_block(
                            block_type="global_definition",
                            name=", ".join(names),
                            rel_path=rel_path,
                            source=source,
                            node=_nearest_template_wrapper(node),
                            language=language,
                        )
                    )
                    continue

                if node.type in {"type_definition", "alias_declaration", "using_declaration", "namespace_alias_definition"}:
                    add_block(
                        _build_code_block(
                            block_type=node.type,
                            name=_named_child_text(node, source),
                            rel_path=rel_path,
                            source=source,
                            node=_nearest_template_wrapper(node),
                            language=language,
                        )
                    )

    blocks.sort(key=lambda item: (item["file"], item["range"][0], item["range"][1], item["type"]))
    for index, block in enumerate(blocks, start=1):
        block["id"] = index

    function_block_ids = {
        block.get("function_id"): block["id"]
        for block in blocks
        if block.get("function_id")
    }
    block_by_id = {block["id"]: block for block in blocks}
    forward = call_graph.get("forward") or {}
    reverse: Dict[str, Set[str]] = defaultdict(set)
    for caller_id, callee_ids in forward.items():
        for callee_id in callee_ids:
            reverse[callee_id].add(caller_id)

    for function_id, block_id in function_block_ids.items():
        related_function_ids = set(forward.get(function_id, [])) | reverse.get(function_id, set())
        related_block_ids = sorted(
            function_block_ids[related_id]
            for related_id in related_function_ids
            if related_id in function_block_ids and function_block_ids[related_id] != block_id
        )
        block = block_by_id[block_id]
        block["related_id"] = related_block_ids
        block["related_range"] = {
            str(related_id): block_by_id[related_id]["range"]
            for related_id in related_block_ids
        }

    return blocks


def build_call_graph_payload(repo_root: Path | str, header_language: str = "auto") -> Dict[str, object]:
    repo_root = Path(repo_root).resolve()
    if not repo_root.exists():
        raise SystemExit(f"Repository root does not exist: {repo_root}")
    if not repo_root.is_dir():
        raise SystemExit(f"Repository root is not a directory: {repo_root}")

    languages = load_languages()
    files = repo_files(repo_root)
    if not files:
        raise SystemExit(f"No C/C++ source files found under: {repo_root}")

    parsed_files = build_parsed_files(repo_root, files, header_language, languages)
    include_index = build_include_index(parsed_files)
    globals_by_name = build_global_symbols(parsed_files)
    functions, function_index, call_graph = build_functions(parsed_files, globals_by_name)
    global_index = build_global_index(globals_by_name, include_index)
    code_blocks = build_code_blocks(parsed_files, functions, call_graph)

    return {
        "files": include_index["files"],
        "code_blocks": code_blocks,
        "globals": sorted_globals(globals_by_name),
        "global_index": global_index,
        "functions": {key: functions[key] for key in sorted(functions)},
        "function_index": {key: sorted(value) for key, value in sorted(function_index.items())},
        "call_graph": call_graph,
    }


def write_call_graph_payload(payload: Dict[str, object], output_path: Path | str, pretty: bool = True) -> None:
    output_path = Path(output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2 if pretty else None, sort_keys=pretty)
        fh.write("\n")


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_path = Path(args.output).resolve()

    if not repo_root.exists():
        raise SystemExit(f"Repository root does not exist: {repo_root}")
    if not repo_root.is_dir():
        raise SystemExit(f"Repository root is not a directory: {repo_root}")

    payload = build_call_graph_payload(repo_root, header_language=args.header_language)
    write_call_graph_payload(payload, output_path, pretty=args.pretty)

    print(f"Wrote call graph JSON to {output_path}")
    print(
        f"Parsed {len(payload.get('files', {}))} files, "
        f"built {len(payload.get('code_blocks', []))} code blocks, "
        f"found {len(payload.get('functions', {}))} functions and "
        f"{sum(len(values) for values in (payload.get('globals', {}) or {}).values())} global declarations."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
