from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, BinaryIO, Dict, Iterable, List, Sequence

from docx import Document


REQUIREMENT_START = "$$$$$"
REQUIREMENT_END = "&&&&&"
ENTRY_PATTERN = re.compile(r"@@@@@\((.*?)\)@@@@@", re.DOTALL)
REQUIREMENT_PATTERN = re.compile(
    re.escape(REQUIREMENT_START) + r"(.*?)" + re.escape(REQUIREMENT_END),
    re.DOTALL,
)
FUNCTION_NAME_PATTERN = re.compile(r"^[A-Za-z_~][A-Za-z0-9_:~.$<>-]*$")


@dataclass(frozen=True)
class ParagraphInfo:
    text: str
    start: int
    end: int
    is_heading: bool


def _is_heading(paragraph) -> bool:
    style_name = str(getattr(getattr(paragraph, "style", None), "name", "") or "").lower()
    if style_name.startswith("heading") or "标题" in style_name:
        return True
    text = str(getattr(paragraph, "text", "") or "").strip()
    heading_pattern = r"^(?:第[一二三四五六七八九十百0-9]+[章节]|\d+(?:\.\d+)+)[、.\s]"
    if len(text) <= 100 and re.match(heading_pattern, text):
        return True
    try:
        outline_level = paragraph._p.pPr.xpath("./w:outlineLvl")
        return bool(outline_level) and int(outline_level[0].val) < 9
    except (AttributeError, TypeError, ValueError):
        return False


def _flatten_paragraphs(document) -> tuple[str, List[ParagraphInfo]]:
    parts: List[str] = []
    paragraphs: List[ParagraphInfo] = []
    offset = 0
    for paragraph in document.paragraphs:
        text = paragraph.text or ""
        if parts:
            parts.append("\n")
            offset += 1
        start = offset
        parts.append(text)
        offset += len(text)
        paragraphs.append(ParagraphInfo(text=text, start=start, end=offset, is_heading=_is_heading(paragraph)))
    return "".join(parts), paragraphs


def _clean_title_text(text: str) -> str:
    text = text.replace(REQUIREMENT_START, "").replace(REQUIREMENT_END, "")
    text = ENTRY_PATTERN.sub("", text)
    return re.sub(r"\s+", " ", text).strip(" ，,。；;：:")


def _fallback_title(content: str) -> str:
    compact = re.sub(r"\s+", "", content or "")
    compact = re.sub(r"^[\d.、（）()一二三四五六七八九十]+", "", compact)
    return (compact[:5] or "手动上传需求")


def _resolve_requirement_title(
    full_text: str,
    paragraphs: Sequence[ParagraphInfo],
    marker_start: int,
    content_start: int,
    content_end: int,
    content: str,
) -> str:
    inside_headings = []
    for paragraph in paragraphs:
        if paragraph.end <= content_start or paragraph.start >= content_end or not paragraph.is_heading:
            continue
        title = _clean_title_text(paragraph.text)
        if title and title not in inside_headings:
            inside_headings.append(title)
    if inside_headings:
        return ", ".join(inside_headings)

    marker_paragraph_index = next(
        (idx for idx, paragraph in enumerate(paragraphs) if paragraph.start <= marker_start <= paragraph.end),
        None,
    )
    if marker_paragraph_index is not None:
        marker_paragraph = paragraphs[marker_paragraph_index]
        text_before_marker = full_text[marker_paragraph.start:marker_start].strip()
        if not text_before_marker:
            for paragraph in reversed(paragraphs[:marker_paragraph_index]):
                if not paragraph.text.strip():
                    continue
                if paragraph.is_heading:
                    title = _clean_title_text(paragraph.text)
                    if title:
                        return title
                break
    return _fallback_title(content)


def _parse_function_names(raw: str) -> List[str]:
    names: List[str] = []
    for value in re.split(r"[,，]", raw or ""):
        name = value.strip()
        if name and FUNCTION_NAME_PATTERN.match(name) and name not in names:
            names.append(name)
    return names


def parse_manual_alignment_docx(source: str | Path | BinaryIO) -> List[Dict[str, Any]]:
    """按 manual-align.md 约定解析 DOCX 中的需求和入口函数。"""
    document = Document(source)
    full_text, paragraphs = _flatten_paragraphs(document)
    requirement_matches = list(REQUIREMENT_PATTERN.finditer(full_text))
    parsed: List[Dict[str, Any]] = []

    for index, match in enumerate(requirement_matches):
        search_end = requirement_matches[index + 1].start() if index + 1 < len(requirement_matches) else len(full_text)
        entry_match = ENTRY_PATTERN.search(full_text, match.end(), search_end)
        if not entry_match:
            raise ValueError(f"第 {index + 1} 个需求块后未找到入口函数标记 @@@@@(...)@@@@@")

        function_names = _parse_function_names(entry_match.group(1))
        if not function_names:
            raise ValueError(f"第 {index + 1} 个需求块的入口函数列表为空或格式无效")

        content = match.group(1).strip()
        if not content:
            raise ValueError(f"第 {index + 1} 个需求块内容为空")
        parsed.append({
            "index": index + 1,
            "title": _resolve_requirement_title(
                full_text,
                paragraphs,
                match.start(),
                match.start(1),
                match.end(1),
                content,
            ),
            "content": content,
            "start": match.start(1),
            "end": match.end(1),
            "function_names": function_names,
        })

    if not parsed:
        raise ValueError("未找到由 $$$$$ 和 &&&&& 包围的需求块")
    return parsed


def parse_manual_alignment_text(source: str) -> List[Dict[str, Any]]:
    """Parse converted Markdown so requirement content and offsets match the rendered document."""
    full_text = str(source or "")
    requirement_matches = list(REQUIREMENT_PATTERN.finditer(full_text))
    headings = list(re.finditer(r"(?m)^\s{0,3}#{1,6}\s+(.+?)\s*$", full_text))
    parsed: List[Dict[str, Any]] = []

    for index, match in enumerate(requirement_matches):
        search_end = requirement_matches[index + 1].start() if index + 1 < len(requirement_matches) else len(full_text)
        entry_match = ENTRY_PATTERN.search(full_text, match.end(), search_end)
        if not entry_match:
            raise ValueError(f"第 {index + 1} 个需求块后未找到入口函数标记 @@@@@(...)@@@@@")

        function_names = _parse_function_names(entry_match.group(1))
        if not function_names:
            raise ValueError(f"第 {index + 1} 个需求块的入口函数列表为空或格式无效")

        raw_content = match.group(1)
        leading = len(raw_content) - len(raw_content.lstrip())
        trailing = len(raw_content) - len(raw_content.rstrip())
        content_start = match.start(1) + leading
        content_end = match.end(1) - trailing
        content = full_text[content_start:content_end]
        if not content:
            raise ValueError(f"第 {index + 1} 个需求块内容为空")

        inside_heading = next(
            (heading for heading in headings if content_start <= heading.start() < content_end),
            None,
        )
        preceding_heading = next(
            (heading for heading in reversed(headings) if heading.end() <= match.start()),
            None,
        )
        title_heading = inside_heading or preceding_heading
        title = _clean_title_text(title_heading.group(1)) if title_heading else _fallback_title(content)
        parsed.append({
            "index": index + 1,
            "title": title,
            "content": content,
            "start": content_start,
            "end": content_end,
            "function_names": function_names,
        })

    if not parsed:
        raise ValueError("转换后的 Markdown 中未找到由 $$$$$ 和 &&&&& 包围的需求块")
    return parsed


def hide_manual_alignment_markers(source: str) -> str:
    """Hide control markers without changing character offsets used by doc blocks."""
    text = str(source or "")

    def blank_match(match: re.Match) -> str:
        return "".join("\n" if char == "\n" else " " for char in match.group(0))

    text = text.replace(REQUIREMENT_START, " " * len(REQUIREMENT_START))
    text = text.replace(REQUIREMENT_END, " " * len(REQUIREMENT_END))
    return ENTRY_PATTERN.sub(blank_match, text)


def _normalized_text(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return "".join(char for char in text if char.isalnum() or "\u4e00" <= char <= "\u9fff")


def _ngram_counter(text: str, size: int = 2) -> Counter:
    if len(text) < size:
        return Counter([text]) if text else Counter()
    return Counter(text[index:index + size] for index in range(len(text) - size + 1))


def _cosine_similarity(left: Counter, right: Counter) -> float:
    if not left or not right:
        return 0.0
    dot = sum(value * right.get(key, 0) for key, value in left.items())
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


def requirement_similarity(title: str, content: str, candidate: Dict[str, Any]) -> float:
    wanted = _normalized_text(content)
    existing = _normalized_text(candidate.get("content"))
    if not wanted or not existing:
        return 0.0
    if wanted == existing:
        content_score = 1.0
    else:
        sequence_score = SequenceMatcher(None, wanted, existing, autojunk=False).ratio()
        cosine_score = _cosine_similarity(_ngram_counter(wanted), _ngram_counter(existing))
        content_score = 0.65 * cosine_score + 0.35 * sequence_score
        shorter, longer = sorted((wanted, existing), key=len)
        if len(shorter) >= 8 and shorter in longer:
            content_score = max(content_score, 0.75 + 0.25 * len(shorter) / len(longer))

    wanted_title = _normalized_text(title)
    candidate_title = _normalized_text(candidate.get("name") or candidate.get("type"))
    if wanted_title and candidate_title:
        title_score = SequenceMatcher(None, wanted_title, candidate_title, autojunk=False).ratio()
        return min(1.0, 0.9 * content_score + 0.1 * title_score)
    return content_score


def find_best_requirement_block(
    title: str,
    content: str,
    candidates: Sequence[Dict[str, Any]],
    threshold: float = 0.42,
) -> tuple[Dict[str, Any] | None, float]:
    best_block = None
    best_score = 0.0
    for candidate in candidates:
        score = requirement_similarity(title, content, candidate)
        if score > best_score:
            best_block = candidate
            best_score = score
    if best_score < threshold:
        return None, best_score
    return best_block, best_score


def _identifier_variants(value: str) -> set[str]:
    normalized = unicodedata.normalize("NFKC", str(value or "")).strip().casefold()
    variants = {normalized} if normalized else set()
    for identifier in re.findall(r"[A-Za-z_~][A-Za-z0-9_:~$]*", normalized):
        variants.add(identifier)
        variants.add(identifier.split("::")[-1])
    return {item for item in variants if item}


def _code_match_score(function_name: str, block: Dict[str, Any]) -> int:
    wanted = function_name.casefold()
    wanted_short = wanted.split("::")[-1]
    name = str(block.get("name") or "")
    variants = _identifier_variants(name)
    if wanted in variants:
        return 100
    if wanted_short in variants:
        return 95

    code = str(block.get("content") or block.get("code") or "")
    definition_pattern = re.compile(
        rf"(?m)^\s*(?:[\w:*&<>\[\],~]+\s+)+(?:(?:\w+)::)*{re.escape(wanted_short)}\s*\(",
        re.IGNORECASE,
    )
    if definition_pattern.search(code):
        return 90
    return 0


def match_code_blocks(
    function_names: Iterable[str],
    code_blocks: Sequence[Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], Dict[str, int], List[str]]:
    selected: List[Dict[str, Any]] = []
    matched_ids: set[Any] = set()
    matches: Dict[str, int] = {}
    unmatched: List[str] = []
    for function_name in function_names:
        ranked = sorted(
            ((_code_match_score(function_name, block), index, block) for index, block in enumerate(code_blocks)),
            key=lambda item: (-item[0], str(item[2].get("file") or item[2].get("filename") or ""), item[1]),
        )
        score, _, best = ranked[0] if ranked else (0, 0, None)
        if not best or score <= 0:
            unmatched.append(function_name)
            continue
        matches[function_name] = int(best.get("id") or 0)
        identity = best.get("id") or (
            best.get("file") or best.get("filename"), best.get("startLine"), best.get("endLine")
        )
        if identity not in matched_ids:
            selected.append(best)
            matched_ids.add(identity)
    return selected, matches, unmatched


def as_doc_range(block: Dict[str, Any]) -> Dict[str, Any]:
    filename = block.get("filename") or block.get("documentId") or ""
    return {
        "id": block.get("id"),
        "name": block.get("name") or block.get("type") or "",
        "type": block.get("type") or block.get("name") or "",
        "filename": filename,
        "documentId": filename,
        "content": block.get("content") or "",
        "start": int(block.get("start") or 0),
        "end": int(block.get("end") or 0),
    }


def _line_range_offsets(content: str, start_line: int, end_line: int) -> tuple[int, int]:
    """Convert one-based inclusive line numbers to the UI's character offsets."""
    normalized = (content or "").replace("\r\n", "\n").replace("\r", "\n").replace("\u200b", "")
    lines = normalized.split("\n")
    if not lines:
        return 0, 0
    start_line = min(max(int(start_line or 1), 1), len(lines))
    end_line = min(max(int(end_line or start_line), start_line), len(lines))
    start = sum(len(line) + 1 for line in lines[:start_line - 1])
    end = sum(len(line) + 1 for line in lines[:end_line - 1]) + len(lines[end_line - 1])
    return start, end


def as_code_range(block: Dict[str, Any], source_content: str | None = None) -> Dict[str, Any]:
    filename = block.get("file") or block.get("filename") or block.get("documentId") or ""
    start_line = int(block.get("startLine") or (block.get("range") or [0, 0])[0] or 0)
    end_line = int(block.get("endLine") or (block.get("range") or [0, 0])[-1] or 0)
    result = {
        "id": block.get("id"),
        "name": block.get("name") or block.get("type") or "",
        "type": block.get("type") or "",
        "filename": filename,
        "documentId": filename,
        "content": block.get("content") or block.get("code") or "",
        "range": [start_line, end_line],
        "startLine": start_line,
        "endLine": end_line,
    }
    if source_content is not None:
        result["start"], result["end"] = _line_range_offsets(source_content, start_line, end_line)
    return result
