from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from callgraph.build_call_graph import build_call_graph_payload, repo_files, write_call_graph_payload
from callgraph.query_call_graph import query_function_result

from .db import get_code_blocks_by_project, get_project_id_by_path


CALL_GRAPH_DIR_NAME = "call_graph_repo"
CALL_GRAPH_JSON_NAME = "call_graph.json"
CALL_GRAPH_METADATA_NAME = "metadata.json"
DEFAULT_CALL_GRAPH_DEPTH = 3


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
            error_message="未发现可解析的 C/C++ 源文件",
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
    return (block.get("type") or "").strip().lower() == "function"


def _ranges_intersect(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    return max(int(start_a), int(start_b)) <= min(int(end_a), int(end_b))


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
    return path.read_text(encoding="utf-8", errors="ignore")


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
    if start is None or end is None:
        file_content = _read_code_file(project_path, file)
        start, end = _offsets_from_line_range(file_content, start_line, end_line)
        if not content:
            content = file_content[start:end]
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


def _mermaid_node_id(function_id: str) -> str:
    return "n_" + "".join(ch if ch.isalnum() else "_" for ch in function_id)


def _escape_mermaid_label(label: str) -> str:
    return label.replace("\\", "\\\\").replace('"', '\\"')


def _build_mermaid_code(center_function_id: str, nodes: Sequence[Dict[str, object]], edges: Sequence[Tuple[str, str]]) -> str:
    lines = ["flowchart LR"]
    if not nodes:
        return "\n".join(lines)

    for node in nodes:
        function_id = node.get("id") or ""
        label = f"{node.get('qualified_name') or node.get('name') or function_id}<br/>{node.get('file')}:{node.get('line')}"
        lines.append(f'    {_mermaid_node_id(function_id)}["{_escape_mermaid_label(label)}"]')
    if edges:
        for caller_id, callee_id in edges:
            lines.append(f"    {_mermaid_node_id(caller_id)} --> {_mermaid_node_id(callee_id)}")
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
        "type": "function",
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


def query_function_graph(
    project_path: str,
    function_id: str,
    max_depth: int = DEFAULT_CALL_GRAPH_DEPTH,
    direction: str = "both",
) -> Dict[str, object]:
    payload = load_project_call_graph(project_path)
    if not payload:
        raise ValueError("调用图不存在，请先构建调用图")

    safe_depth = max(1, min(int(max_depth or DEFAULT_CALL_GRAPH_DEPTH), 8))
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
        "mermaid_code": _build_mermaid_code(result["query"]["root_function_id"], nodes, edges),
        "code_ranges": code_ranges,
        "max_depth": safe_depth,
        "direction": direction,
    }
