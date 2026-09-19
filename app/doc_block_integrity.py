import json
import os
import re


VALID_DOC_BLOCK_TYPES = frozenset({'text', 'code_block'})
WORD_DOCUMENT_EXTENSIONS = frozenset({'.doc', '.docx'})


def normalize_doc_block_type(block_type, content=''):
    """Return the only two type values accepted by doc_blocks."""
    normalized = str(block_type or '').strip().lower()
    if normalized in VALID_DOC_BLOCK_TYPES:
        return normalized
    if normalized in {'code', 'codeblock', 'fenced_code'}:
        return 'code_block'

    stripped_content = (content or '').lstrip()
    if re.match(r'^(?:`{3,}|~{3,})', stripped_content):
        return 'code_block'
    return 'text'


def load_project_doc_metadata(project_path):
    metadata_path = os.path.join(project_path, 'metadata.json')
    with open(metadata_path, 'r', encoding='utf-8') as metadata_file:
        metadata = json.load(metadata_file)

    doc_repo = metadata.get('doc_repo') or os.path.join(project_path, 'doc_repo')
    doc_files = [
        str(item).replace('\\', '/').lstrip('/')
        for item in metadata.get('doc_files', [])
        if isinstance(item, str) and item.strip()
    ]
    return os.path.abspath(doc_repo), doc_files


def _is_path_within(path, directory):
    try:
        return os.path.commonpath([os.path.abspath(path), os.path.abspath(directory)]) == os.path.abspath(directory)
    except (TypeError, ValueError):
        return False


def _conversion_aliases(source_name):
    basename = os.path.basename(source_name)
    return {
        os.path.splitext(basename)[0].casefold(),
        basename.split('.')[0].casefold(),
    }


def resolve_source_document_filename(markdown_path, doc_repo, doc_files):
    """Map a parsed Markdown path to its original project document filename.

    Markdown files that actually live in doc_repo retain their .md name. A
    Markdown conversion artifact is mapped by its conversion directory/stem
    to metadata.doc_files. Ambiguous matches fail instead of corrupting links.
    """
    markdown_path = os.path.abspath(markdown_path)
    doc_repo = os.path.abspath(doc_repo)
    normalized_doc_files = [item.replace('\\', '/').lstrip('/') for item in doc_files]

    if _is_path_within(markdown_path, doc_repo):
        relative_name = os.path.relpath(markdown_path, doc_repo).replace(os.sep, '/')
        return relative_name

    markdown_stem = os.path.splitext(os.path.basename(markdown_path))[0].casefold()
    parent_stem = os.path.basename(os.path.dirname(markdown_path)).casefold()
    conversion_keys = {markdown_stem, parent_stem}
    candidates = [
        source_name
        for source_name in normalized_doc_files
        if _conversion_aliases(source_name) & conversion_keys
    ]
    word_candidates = [
        source_name
        for source_name in candidates
        if os.path.splitext(source_name)[1].lower() in WORD_DOCUMENT_EXTENSIONS
    ]

    if len(word_candidates) == 1:
        return word_candidates[0]
    if len(candidates) == 1:
        return candidates[0]
    if len(word_candidates) > 1 or len(candidates) > 1:
        raise ValueError(
            f'转换文件 {markdown_path} 对应多个源文档: {word_candidates or candidates}'
        )

    # Keep the legacy name when metadata is stale/missing; guessing an
    # extension would make document navigation less reliable.
    return os.path.basename(markdown_path)
