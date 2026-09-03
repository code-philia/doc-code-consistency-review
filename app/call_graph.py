from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from callgraph.build_call_graph import build_call_graph_payload, repo_files, write_call_graph_payload
from callgraph.query_call_graph import query_function_result

from .alignment_config import CALL_GRAPH_DEFAULT_PREVIEW_DEPTH, CALL_GRAPH_MAX_QUERY_DEPTH
from .db import get_code_blocks_by_project, get_project_id_by_path
from callgraph.text_encoding import read_source_file


CALL_GRAPH_DIR_NAME = "call_graph_repo"
CALL_GRAPH_JSON_NAME = "call_graph.json"
CALL_GRAPH_METADATA_NAME = "metadata.json"
DEFAULT_CALL_GRAPH_DEPTH = CALL_GRAPH_DEFAULT_PREVIEW_DEPTH


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _call_graph_repo_dir(project_path: str) -> Path:
    return Path(project_path).resolve() / CALL_GRAPH_DIR_NAME


def _call_graph_json_path(project_path: str) -> Path:
    return _call_graph_repo_dir(project_path) / CALL_GRAPH_JSON_NAME


def _call_graph_metadata_path(project_path: str) -> Path:
    return _call_graph_repo_dir(project_path) / CALL_GRAPH_METADATA_NAME


def _default_metadata() -> Dict[str, object]:
    return {
        "status": "unavailable",
        "updated_at": None,
        "error_message": "",
        "source_file_count": 0,
    }


def get_call_graph_metadata(project_path: str) -> Dict[str, object]:
    metadata_path = _call_graph_metadata_path(project_path)
    if metadata_path.exists():
        try:
            with metadata_path.open("r", encoding="utf-8") as fh:
                loaded = json.load(fh) or {}
            metadata = _default_metadata()
            metadata.update({
                "status": loaded.get("status") or metadata["status"],
                "updated_at": loaded.get("updated_at"),
                "error_message": loaded.get("error_message") or "",
                "source_file_count": int(loaded.get("source_file_count") or 0),
            })
            return metadata
        except Exception:
            pass

    json_path = _call_graph_json_path(project_path)
    if json_path.exists():
        return {
            "status": "ready",
            "updated_at": datetime.fromtimestamp(json_path.stat().st_mtime, timezone.utc).isoformat(),
            "error_message": "",
            "source_file_count": 0,
        }
    return _default_metadata()


def _write_call_graph_metadata(
    project_path: str,
    *,
    status: str,
    updated_at: Optional[str] = None,
    error_message: str = "",
    source_file_count: int = 0,
) -> Dict[str, object]:
    repo_dir = _call_graph_repo_dir(project_path)
    repo_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": status,
        "updated_at": updated_at,
        "error_message": error_message,
        "source_file_count": int(source_file_count or 0),
    }
    with _call_graph_metadata_path(project_path).open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return payload


def mark_call_graph_building(project_path: str) -> Dict[str, object]:
    code_repo_path = Path(project_path).resolve() / "code_repo"
    source_file_count = len(repo_files(code_repo_path)) if code_repo_path.exists() else 0
    return _write_call_graph_metadata(
        project_path,
        status="building",
        updated_at=_utc_now_iso(),
        error_message="",
        source_file_count=source_file_count,
    )


def _status_message(status: str, error_message: str = "") -> str:
    mapping = {
        "ready": "调用图已就绪",
        "building": "调用图正在构建中",
        "failed": "调用图构建失败",
        "stale": "调用图需要重建",
        "unavailable": "当前项目不可用调用图",
    }
    base = mapping.get(status, "调用图状态未知")
    if error_message:
        return f"{base}: {error_message}"
    return base


def build_project_call_graph(project_path: str) -> Dict[str, object]:
    code_repo_path = Path(project_path).resolve() / "code_repo"
    if not code_repo_path.exists() or not code_repo_path.is_dir():
        metadata = _write_call_graph_metadata(
            project_path,
            status="unavailable",
            updated_at=_utc_now_iso(),
            error_message="代码目录不存在",
            source_file_count=0,
        )
        return {
            "status": metadata["status"],
            "message": _status_message(str(metadata["status"]), str(metadata.get("error_message") or "")),
            "metadata": metadata,
        }

    source_files = repo_files(code_repo_path)
    if not source_files:
        metadata = _write_call_graph_metadata(
            project_path,
            status="unavailable",
            updated_at=_utc_now_iso(),
            error_message="未发现可解析的 C/C++/Verilog/VHDL 源文件",
            source_file_count=0,
        )
        return {
            "status": metadata["status"],
            "message": _status_message(str(metadata["status"]), str(metadata.get("error_message") or "")),
            "metadata": metadata,
        }

    try:
        payload = build_call_graph_payload(code_repo_path)
        write_call_graph_payload(payload, _call_graph_json_path(project_path), pretty=True)
        metadata = _write_call_graph_metadata(
            project_path,
            status="ready",
            updated_at=_utc_now_iso(),
            error_message="",
            source_file_count=len(source_files),
        )
        return {
            "status": "ready",
            "message": _status_message("ready"),
            "metadata": metadata,
            "payload": payload,
        }
    except SystemExit as exc:
        message = str(exc)
        status = "unavailable" if "tree-sitter" in message.lower() or "no c/c++" in message.lower() else "failed"
        metadata = _write_call_graph_metadata(
            project_path,
            status=status,
            updated_at=_utc_now_iso(),
            error_message=message,
            source_file_count=len(source_files),
        )
        return {"status": status, "message": _status_message(status, message), "metadata": metadata}
    except Exception as exc:
        metadata = _write_call_graph_metadata(
            project_path,
            status="failed",
            updated_at=_utc_now_iso(),
            error_message=str(exc),
            source_file_count=len(source_files),
        )
        return {"status": "failed", "message": _status_message("failed", str(exc)), "metadata": metadata}


def load_project_call_graph(project_path: str) -> Optional[Dict[str, object]]:
    json_path = _call_graph_json_path(project_path)
    if not json_path.exists():
        return None
    try:
        with json_path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return None


def ensure_project_call_graph(project_path: str) -> Dict[str, object]:
    metadata = get_call_graph_metadata(project_path)
    payload = load_project_call_graph(project_path)
    if payload:
        return {
            "status": metadata.get("status") or "ready",
            "message": _status_message(str(metadata.get("status") or "ready"), str(metadata.get("error_message") or "")),
            "metadata": metadata,
            "payload": payload,
            "built": False,
        }

    build_result = build_project_call_graph(project_path)
    return {
        "status": build_result.get("status") or "failed",
        "message": build_result.get("message") or _status_message(str(build_result.get("status") or "failed")),
        "metadata": build_result.get("metadata") or get_call_graph_metadata(project_path),
        "payload": build_result.get("payload") or load_project_call_graph(project_path),
        "built": True,
    }


def _is_function_block(block: Optional[Dict[str, object]]) -> bool:
    if not isinstance(block, dict):
        return False
    return (block.get("type") or "").strip().lower() in {
        "function",
        "task",
        "procedure",
        "module",
        "interface",
        "program",
        "entity",
        "architecture",
        "package",
        "package_body",
        "process",
        "always",
        "initial",
    }


def _ranges_intersect(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    return max(int(start_a), int(start_b)) <= min(int(end_a), int(end_b))


def _dedupe_preserve_order(items: Sequence[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for item in items:
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def find_first_intersecting_code_block(
    project_path: str,
    project_id: Optional[int],
    file: str,
    start_line: int,
    end_line: int,
) -> Optional[Dict[str, object]]:
    blocks = get_code_blocks_by_project(project_path, project_id, filename=file)
    for block in blocks:
        block_range = block.get("range") or []
        if len(block_range) != 2:
            continue
        if _ranges_intersect(block_range[0], block_range[1], start_line, end_line):
            return block
    return None


def _candidate_functions_for_block(payload: Dict[str, object], block: Dict[str, object]) -> List[Dict[str, object]]:
    file = block.get("file") or block.get("filename") or ""
    block_range = block.get("range") or []
    if len(block_range) != 2:
        return []
    start_line, end_line = int(block_range[0]), int(block_range[1])
    candidates = []
    for function in (payload.get("functions") or {}).values():
        if function.get("file") != file:
            continue
        func_start = int(function.get("line") or 0)
        func_end = int(function.get("end_line") or func_start)
        if not _ranges_intersect(start_line, end_line, func_start, func_end):
            continue
        candidates.append(function)
    candidates.sort(
        key=lambda item: (
            0 if int(item.get("line") or 0) <= start_line and int(item.get("end_line") or 0) >= end_line else 1,
            abs(int(item.get("line") or 0) - start_line),
            (int(item.get("end_line") or 0) - int(item.get("line") or 0)),
            item.get("qualified_name") or item.get("name") or "",
        )
    )
    return candidates


def _candidate_functions_for_selection(
    payload: Dict[str, object],
    file: str,
    start_line: int,
    end_line: int,
) -> List[Dict[str, object]]:
    candidates = []
    for function in (payload.get("functions") or {}).values():
        if function.get("file") != file:
            continue
        func_start = int(function.get("line") or 0)
        func_end = int(function.get("end_line") or func_start)
        if not _ranges_intersect(start_line, end_line, func_start, func_end):
            continue
        candidates.append(function)
    candidates.sort(
        key=lambda item: (
            0 if int(item.get("line") or 0) <= start_line and int(item.get("end_line") or 0) >= end_line else 1,
            abs(int(item.get("line") or 0) - start_line),
            int(item.get("end_line") or 0) - int(item.get("line") or 0),
            item.get("qualified_name") or item.get("name") or "",
        )
    )
    return candidates


def resolve_code_block_to_function(
    project_path: str,
    project_id: Optional[int],
    file: str,
    start_line: int,
    end_line: int,
) -> Optional[str]:
    payload = load_project_call_graph(project_path)
    if not payload:
        return None
    block = find_first_intersecting_code_block(project_path, project_id, file, start_line, end_line)
    candidates: List[Dict[str, object]] = []
    if _is_function_block(block):
        candidates = _candidate_functions_for_block(payload, block)
    if not candidates:
        candidates = _candidate_functions_for_selection(payload, file, start_line, end_line)
    if not candidates:
        return None
    return candidates[0].get("id")


def _read_code_file(project_path: str, file: str) -> str:
    path = Path(project_path).resolve() / "code_repo" / file
    return read_source_file(path)


def _offsets_from_line_range(content: str, start_line: int, end_line: int) -> Tuple[int, int]:
    lines = content.splitlines(keepends=True)
    if not lines:
        return 0, 0

    safe_start = max(int(start_line), 1)
    safe_end = max(int(end_line), safe_start)
    current_offset = 0
    start_offset = 0
    end_offset = len(content)

    for idx, line in enumerate(lines, start=1):
        if idx == safe_start:
            start_offset = current_offset
        current_offset += len(line)
        if idx == safe_end:
            end_offset = current_offset - (len(line) - len(line.rstrip("\r\n")))
            break

    return start_offset, max(start_offset, end_offset)


def _normalize_code_block_range(project_path: str, block: Dict[str, object]) -> Dict[str, object]:
    file = block.get("file") or block.get("filename") or ""
    block_range = block.get("range") or []
    start_line = int(block_range[0] if len(block_range) == 2 else block.get("startLine") or 0)
    end_line = int(block_range[1] if len(block_range) == 2 else block.get("endLine") or start_line)
    content = block.get("content") or block.get("code") or ""
    start = block.get("start")
    end = block.get("end")
    if file and start_line > 0 and end_line > 0:
        file_content = _read_code_file(project_path, file)
        range_start, range_end = _offsets_from_line_range(file_content, start_line, end_line)
        if start is None or end is None:
            start, end = range_start, range_end
        # Call graph ranges may be backed by existing DB blocks whose content was
        # created before source encoding fallback existed. Re-slice source text so
        # preview-added functions do not persist mojibake Chinese comments.
        content = file_content[range_start:range_end]
    return {
        "name": block.get("name") or "",
        "type": block.get("type") or "",
        "file": file,
        "range": [start_line, end_line],
        "documentId": file,
        "filename": file,
        "start": int(start or 0),
        "end": int(end or 0),
        "startLine": start_line,
        "endLine": end_line,
        "content": content,
    }


def code_block_to_code_range(project_path: str, block: Dict[str, object]) -> Dict[str, object]:
    return _normalize_code_block_range(project_path, block)


def build_selection_code_range(
    project_path: str,
    file: str,
    start_line: int,
    end_line: int,
) -> Dict[str, object]:
    return _normalize_code_block_range(
        project_path,
        {
            "file": file,
            "filename": file,
            "type": "selection",
            "range": [int(start_line), int(end_line)],
        },
    )


def is_function_code_block(block: Optional[Dict[str, object]]) -> bool:
    return _is_function_block(block)


def _function_nodes_in_order(payload: Dict[str, object], function_ids: Sequence[str]) -> List[Dict[str, object]]:
    functions = payload.get("functions") or {}
    nodes = [functions[function_id] for function_id in function_ids if function_id in functions]
    nodes.sort(key=lambda item: (item.get("file") or "", int(item.get("line") or 0), item.get("qualified_name") or ""))
    return nodes


def _build_forward_edges(payload: Dict[str, object], reachable_ids: Sequence[str]) -> List[Tuple[str, str]]:
    reachable_set = set(reachable_ids)
    forward = ((payload.get("call_graph") or {}).get("forward") or {})
    edges: List[Tuple[str, str]] = []
    for function_id in reachable_ids:
        for callee_id in forward.get(function_id, []):
            if callee_id in reachable_set:
                edges.append((function_id, callee_id))
    return edges


def _build_bidirectional_partition(
    payload: Dict[str, object],
    center_function_id: str,
    max_depth: int,
) -> Tuple[set[str], set[str]]:
    forward_result = query_function_result(
        payload,
        function_id=center_function_id,
        max_depth=max_depth,
        direction="forward",
        include_source=False,
    )
    backward_result = query_function_result(
        payload,
        function_id=center_function_id,
        max_depth=max_depth,
        direction="backward",
        include_source=False,
    )
    callee_ids = set(forward_result.get("summary", {}).get("reachable_function_ids", []))
    caller_ids = set(backward_result.get("summary", {}).get("reachable_function_ids", []))
    callee_ids.discard(center_function_id)
    caller_ids.discard(center_function_id)
    return caller_ids, callee_ids


def _mermaid_node_id(function_id: str) -> str:
    return "n_" + "".join(ch if ch.isalnum() else "_" for ch in function_id)


def _escape_mermaid_label(label: str) -> str:
    return label.replace("\\", "\\\\").replace('"', '\\"')


def _build_mermaid_code(
    center_function_id: str,
    nodes: Sequence[Dict[str, object]],
    edges: Sequence[Tuple[str, str]],
    *,
    direction: str = "forward",
    caller_ids: Optional[set[str]] = None,
    callee_ids: Optional[set[str]] = None,
) -> str:
    lines = ["flowchart LR"]
    hidden_link_indexes: List[int] = []
    if not nodes:
        return "\n".join(lines)

    for node in nodes:
        function_id = node.get("id") or ""
        label = f"{node.get('qualified_name') or node.get('name') or function_id}<br/>{node.get('file')}:{node.get('line')}"
        lines.append(f'    {_mermaid_node_id(function_id)}["{_escape_mermaid_label(label)}"]')
    if direction == "both":
        left_nodes = [
            _mermaid_node_id(node.get("id") or "")
            for node in nodes
            if (node.get("id") or "") in (caller_ids or set())
        ]
        right_nodes = [
            _mermaid_node_id(node.get("id") or "")
            for node in nodes
            if (node.get("id") or "") in (callee_ids or set())
        ]
        if left_nodes:
            lines.append('    subgraph callers_side[" "]')
            lines.append("        direction TB")
            for node_id in left_nodes:
                lines.append(f"        {node_id}")
            lines.append("    end")
        if right_nodes:
            lines.append('    subgraph callees_side[" "]')
            lines.append("        direction TB")
            for node_id in right_nodes:
                lines.append(f"        {node_id}")
            lines.append("    end")
    if edges:
        for caller_id, callee_id in edges:
            lines.append(f"    {_mermaid_node_id(caller_id)} --> {_mermaid_node_id(callee_id)}")
    if direction == "both":
        lines.append("    classDef hidden fill:transparent,stroke:transparent,color:transparent;")
        if left_nodes:
            lines.append("    style callers_side fill:transparent,stroke:transparent,color:transparent;")
        if right_nodes:
            lines.append("    style callees_side fill:transparent,stroke:transparent,color:transparent;")
        if caller_ids:
            lines.append('    callers_anchor[" "]')
            lines.append("    class callers_anchor hidden")
            hidden_link_indexes.append(len(edges) + len(hidden_link_indexes))
            lines.append(f"    callers_anchor --> {_mermaid_node_id(center_function_id)}")
        if callee_ids:
            lines.append('    callees_anchor[" "]')
            lines.append("    class callees_anchor hidden")
            hidden_link_indexes.append(len(edges) + len(hidden_link_indexes))
            lines.append(f"    {_mermaid_node_id(center_function_id)} --> callees_anchor")
        if hidden_link_indexes:
            joined_indexes = ",".join(str(index) for index in hidden_link_indexes)
            lines.append(
                f"    linkStyle {joined_indexes} stroke:transparent,color:transparent,fill:none,stroke-width:0px;"
            )
    lines.append("    classDef center fill:#f8dcc8,stroke:#b55422,stroke-width:2px,color:#3c2415;")
    lines.append(f"    class {_mermaid_node_id(center_function_id)} center")
    return "\n".join(lines)


def _find_best_block_for_function(
    project_path: str,
    project_id: Optional[int],
    function_info: Dict[str, object],
) -> Optional[Dict[str, object]]:
    blocks = get_code_blocks_by_project(project_path, project_id, filename=function_info.get("file"))
    candidates = []
    func_start = int(function_info.get("line") or 0)
    func_end = int(function_info.get("end_line") or func_start)
    for block in blocks:
        if not _is_function_block(block):
            continue
        block_range = block.get("range") or []
        if len(block_range) != 2:
            continue
        start_line, end_line = int(block_range[0]), int(block_range[1])
        if not _ranges_intersect(start_line, end_line, func_start, func_end):
            continue
        candidates.append(block)
    candidates.sort(
        key=lambda block: (
            abs(int((block.get("range") or [0])[0]) - func_start),
            abs(int((block.get("range") or [0, 0])[1]) - func_end),
            int((block.get("range") or [0, 0])[1]) - int((block.get("range") or [0, 0])[0]),
        )
    )
    return candidates[0] if candidates else None


def _function_to_block_like(project_path: str, function_info: Dict[str, object]) -> Dict[str, object]:
    file = function_info.get("file") or ""
    start_line = int(function_info.get("line") or 0)
    end_line = int(function_info.get("end_line") or start_line)
    file_content = _read_code_file(project_path, file)
    start, end = _offsets_from_line_range(file_content, start_line, end_line)
    return {
        "id": None,
        "name": function_info.get("qualified_name") or function_info.get("name") or "",
        "type": function_info.get("kind") or function_info.get("type") or "function",
        "file": file,
        "filename": file,
        "range": [start_line, end_line],
        "startLine": start_line,
        "endLine": end_line,
        "start": start,
        "end": end,
        "code": file_content[start:end],
        "content": file_content[start:end],
    }


def resolve_called_functions_in_line_range(
    project_path: str,
    file: str,
    start_line: int,
    end_line: int,
) -> List[Dict[str, object]]:
    payload = load_project_call_graph(project_path)
    if not payload:
        return []

    functions = payload.get("functions") or {}
    matches: List[Dict[str, object]] = []
    for function in sorted(
        functions.values(),
        key=lambda item: (item.get("file") or "", int(item.get("line") or 0), item.get("qualified_name") or item.get("name") or ""),
    ):
        if function.get("file") != file:
            continue
        func_start = int(function.get("line") or 0)
        func_end = int(function.get("end_line") or func_start)
        if not _ranges_intersect(start_line, end_line, func_start, func_end):
            continue
        for call in function.get("calls") or []:
            call_line = int(call.get("line") or 0)
            if call_line < start_line or call_line > end_line:
                continue
            for target_id in call.get("resolved_targets") or []:
                target = functions.get(target_id)
                if not target:
                    continue
                matches.append(
                    {
                        "function_id": target_id,
                        "call_site_line": call_line,
                        "raw_callee": call.get("raw_callee") or call.get("simple_name") or target.get("qualified_name") or target.get("name"),
                        "function": target,
                    }
                )

    seen = set()
    ordered_matches: List[Dict[str, object]] = []
    for item in sorted(
        matches,
        key=lambda entry: (
            int(entry.get("call_site_line") or 0),
            (entry.get("function") or {}).get("qualified_name") or (entry.get("function") or {}).get("name") or "",
            entry.get("function_id") or "",
        ),
    ):
        function_id = item.get("function_id")
        if not function_id or function_id in seen:
            continue
        seen.add(function_id)
        ordered_matches.append(item)
    return ordered_matches


def _merge_code_ranges(range_lists: Sequence[Sequence[Dict[str, object]]]) -> List[Dict[str, object]]:
    merged: List[Dict[str, object]] = []
    seen = set()
    for items in range_lists:
        for item in items or []:
            key = (
                item.get("filename") or item.get("file") or item.get("documentId"),
                int(item.get("startLine") or 0),
                int(item.get("endLine") or 0),
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
    return merged


def _build_preview_item(preview: Dict[str, object]) -> Dict[str, object]:
    root_function = preview.get("center_function") or {}
    return {
        "root_function": {
            "id": root_function.get("id"),
            "name": root_function.get("name"),
            "qualified_name": root_function.get("qualified_name"),
            "file": root_function.get("file"),
            "line": root_function.get("line"),
            "end_line": root_function.get("end_line"),
            "signature": root_function.get("signature"),
        },
        "title": root_function.get("qualified_name") or root_function.get("name") or root_function.get("id") or "",
        "mermaid_code": preview.get("mermaid_code") or "",
        "code_ranges": preview.get("code_ranges") or [],
        "reachable_function_ids": preview.get("reachable_function_ids") or [],
    }


def query_multiple_function_graphs(
    project_path: str,
    function_ids: Sequence[str],
    max_depth: int = DEFAULT_CALL_GRAPH_DEPTH,
    direction: str = "forward",
) -> Dict[str, object]:
    unique_function_ids = _dedupe_preserve_order(list(function_ids))
    previews: List[Dict[str, object]] = []
    all_code_ranges: List[Sequence[Dict[str, object]]] = []
    for function_id in unique_function_ids:
        preview = query_function_graph(
            project_path,
            function_id,
            max_depth=max_depth,
            direction=direction,
        )
        previews.append(_build_preview_item(preview))
        all_code_ranges.append(preview.get("code_ranges") or [])
    return {
        "previews": previews,
        "code_ranges": _merge_code_ranges(all_code_ranges),
    }


def query_function_graph(
    project_path: str,
    function_id: str,
    max_depth: int = DEFAULT_CALL_GRAPH_DEPTH,
    direction: str = "forward",
) -> Dict[str, object]:
    payload = load_project_call_graph(project_path)
    if not payload:
        raise ValueError("调用图不存在，请先构建调用图")

    safe_depth = max(1, min(int(max_depth or DEFAULT_CALL_GRAPH_DEPTH), CALL_GRAPH_MAX_QUERY_DEPTH))
    result = query_function_result(
        payload,
        function_id=function_id,
        max_depth=safe_depth,
        direction=direction,
        include_source=False,
    )
    reachable_ids = result.get("summary", {}).get("reachable_function_ids", [])
    nodes = _function_nodes_in_order(payload, reachable_ids)
    edges = _build_forward_edges(payload, reachable_ids)
    caller_ids: set[str] = set()
    callee_ids: set[str] = set()
    if direction == "both":
        caller_ids, callee_ids = _build_bidirectional_partition(payload, function_id, safe_depth)
    project_id = get_project_id_by_path(project_path)
    code_ranges = []
    seen_ranges = set()
    for node in nodes:
        block = _find_best_block_for_function(project_path, project_id, node)
        if not block:
            block = _function_to_block_like(project_path, node)
        normalized_range = _normalize_code_block_range(project_path, block)
        key = (
            normalized_range["filename"],
            normalized_range["startLine"],
            normalized_range["endLine"],
        )
        if key in seen_ranges:
            continue
        seen_ranges.add(key)
        code_ranges.append(normalized_range)

    return {
        "root_function_id": result["query"]["root_function_id"],
        "center_function": payload["functions"][result["query"]["root_function_id"]],
        "nodes": nodes,
        "edges": [{"caller_id": caller_id, "callee_id": callee_id} for caller_id, callee_id in edges],
        "reachable_function_ids": reachable_ids,
        "mermaid_code": _build_mermaid_code(
            result["query"]["root_function_id"],
            nodes,
            edges,
            direction=direction,
            caller_ids=caller_ids,
            callee_ids=callee_ids,
        ),
        "code_ranges": code_ranges,
        "max_depth": safe_depth,
        "direction": direction,
    }
