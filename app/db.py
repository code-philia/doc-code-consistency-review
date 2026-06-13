import json as pyjson
import re

import pymysql
from flask import g
from pymysql.cursors import DictCursor


DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '123456',
    'database': 'doc_code',
    'charset': 'utf8mb4',
    'cursorclass': DictCursor,
    'autocommit': False
}


def create_connection():
    """直接创建一个新的MYSQL连接"""
    return pymysql.connect(**DB_CONFIG)


def get_db():
    """HTTP请求内使用， 复用连接"""
    if 'db' not in g:
        g.db = create_connection()
    return g.db


def get_db_celery():
    """celery 任务里使用， 用完自己关"""
    return create_connection()


def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _json_load_if_needed(value, default):
    if value is None:
        return default
    if isinstance(value, (list, dict)):
        return value
    try:
        return pyjson.loads(value)
    except Exception:
        return default

# ==============================================================================================
#                                   需求、代码块相关操作
# ==============================================================================================    

def _compact_title_from_text(text: str, max_len: int = 24):
    if not text:
        return '未命名'
    compact = re.sub(r'\s+', ' ', text).strip()
    if len(compact) <= max_len:
        return compact or '未命名'
    return compact[:max_len].rstrip() + '…'


def get_project_id_by_path(project_path):
    if not project_path:
        return None

    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT project_id FROM project WHERE path=%s LIMIT 1', (project_path,))
    row = cur.fetchone()
    return row.get('project_id') if row else None


def resolve_project_id(project_path, project_id=None):
    resolved = _safe_int(project_id, None)
    if resolved:
        return resolved
    return get_project_id_by_path(project_path)


def _get_next_block_id(table_name, project_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(f'SELECT COALESCE(MAX(id), 0) AS max_id FROM {table_name} WHERE project_id=%s', (project_id,))
    row = cur.fetchone() or {}
    return _safe_int(row.get('max_id'), 0) + 1


def _format_doc_block_row(row):
    content = row.get('content') or ''
    name = row.get('type') or _compact_title_from_text(content, 24)
    return {
        'id': _safe_int(row.get('id')),
        'name': name,
        'type': row.get('type') or '',
        'filename': row.get('filename') or '',
        'documentId': row.get('filename') or '',
        'content': content,
        'start': _safe_int(row.get('start')),
        'end': _safe_int(row.get('end'))
    }


def _format_code_block_row(row):
    related_id = _json_load_if_needed(row.get('related_id'), [])
    related_range = _json_load_if_needed(row.get('related_range'), {})
    start_line = _safe_int(row.get('start_line'))
    end_line = _safe_int(row.get('end_line'))
    code = row.get('code') or ''
    return {
        'id': _safe_int(row.get('id')),
        'file': row.get('file') or '',
        'filename': row.get('file') or '',
        'range': [start_line, end_line],
        'startLine': start_line,
        'endLine': end_line,
        'type': row.get('type') or '',
        'code': code,
        'content': code,
        'related_id': related_id if isinstance(related_id, list) else [],
        'related_range': related_range if isinstance(related_range, dict) else {}
    }


def get_doc_blocks_by_project(project_path, project_id=None, filename=None):
    resolved_project_id = resolve_project_id(project_path, project_id)
    if not resolved_project_id:
        return []

    conn = get_db()
    cur = conn.cursor()
    sql = 'SELECT id, filename, type, content, start, end FROM doc_blocks WHERE project_id=%s'
    params = [resolved_project_id]
    if filename:
        sql += ' AND filename=%s'
        params.append(filename)
    sql += ' ORDER BY filename ASC, start ASC, id ASC'
    cur.execute(sql, tuple(params))

    return [_format_doc_block_row(row) for row in cur.fetchall()]


def get_paginated_doc_blocks_by_project(project_path, project_id=None, filename=None, page=1, page_size=100):
    resolved_project_id = resolve_project_id(project_path, project_id)
    safe_page = max(_safe_int(page, 1), 1)
    safe_page_size = max(_safe_int(page_size, 100), 1)
    if not resolved_project_id:
        return [], {
            'page': safe_page,
            'page_size': safe_page_size,
            'total': 0,
            'pages': 0
        }

    conn = get_db()
    cur = conn.cursor()
    where_sql = ' FROM doc_blocks WHERE project_id=%s'
    params = [resolved_project_id]
    if filename:
        where_sql += ' AND filename=%s'
        params.append(filename)

    cur.execute('SELECT COUNT(*) AS total' + where_sql, tuple(params))
    row = cur.fetchone() or {}
    total = _safe_int(row.get('total'))
    offset = (safe_page - 1) * safe_page_size

    cur.execute(
        'SELECT id, filename, type, content, start, end' + where_sql +
        ' ORDER BY filename ASC, start ASC, id ASC LIMIT %s OFFSET %s',
        tuple(params + [safe_page_size, offset])
    )
    return [_format_doc_block_row(row) for row in cur.fetchall()], {
        'page': safe_page,
        'page_size': safe_page_size,
        'total': total,
        'pages': (total + safe_page_size - 1) // safe_page_size if total > 0 else 0
    }


def get_code_blocks_by_project(project_path, project_id=None, filename=None):
    resolved_project_id = resolve_project_id(project_path, project_id)
    if not resolved_project_id:
        return []

    conn = get_db()
    cur = conn.cursor()
    sql = (
        'SELECT id, file, start_line, end_line, type, code, related_id, related_range '
        'FROM code_blocks WHERE project_id=%s'
    )
    params = [resolved_project_id]
    if filename:
        sql += ' AND file=%s'
        params.append(filename)
    sql += ' ORDER BY file ASC, start_line ASC, end_line ASC, id ASC'
    cur.execute(sql, tuple(params))

    return [_format_code_block_row(row) for row in cur.fetchall()]


def get_paginated_code_blocks_by_project(project_path, project_id=None, filename=None, page=1, page_size=100):
    resolved_project_id = resolve_project_id(project_path, project_id)
    safe_page = max(_safe_int(page, 1), 1)
    safe_page_size = max(_safe_int(page_size, 100), 1)
    if not resolved_project_id:
        return [], {
            'page': safe_page,
            'page_size': safe_page_size,
            'total': 0,
            'pages': 0
        }

    conn = get_db()
    cur = conn.cursor()
    where_sql = ' FROM code_blocks WHERE project_id=%s'
    params = [resolved_project_id]
    if filename:
        where_sql += ' AND file=%s'
        params.append(filename)

    cur.execute('SELECT COUNT(*) AS total' + where_sql, tuple(params))
    row = cur.fetchone() or {}
    total = _safe_int(row.get('total'))
    offset = (safe_page - 1) * safe_page_size

    cur.execute(
        'SELECT id, file, start_line, end_line, type, code, related_id, related_range' + where_sql +
        ' ORDER BY file ASC, start_line ASC, end_line ASC, id ASC LIMIT %s OFFSET %s',
        tuple(params + [safe_page_size, offset])
    )
    return [_format_code_block_row(row) for row in cur.fetchall()], {
        'page': safe_page,
        'page_size': safe_page_size,
        'total': total,
        'pages': (total + safe_page_size - 1) // safe_page_size if total > 0 else 0
    }


def _remap_related_range_keys(related_range, old_to_new):
    if not isinstance(related_range, dict):
        return {}
    remapped = {}
    for key, value in related_range.items():
        old_key = key
        if isinstance(key, str):
            try:
                old_key = int(key)
            except Exception:
                pass
        new_key = old_to_new.get(old_key, old_key)
        remapped[new_key] = value
    return remapped


def save_code_blocks_for_file(project_path, file_name, code_blocks, project_id=None):
    resolved_project_id = resolve_project_id(project_path, project_id)
    if not resolved_project_id:
        raise ValueError(f'未找到项目记录，无法保存代码块: {project_path}')

    conn = get_db()
    cur = conn.cursor()
    cur.execute('DELETE FROM code_blocks WHERE project_id=%s AND file=%s', (resolved_project_id, file_name))

    if not code_blocks:
        return []

    next_id = _get_next_block_id('code_blocks', resolved_project_id)
    old_to_new = {}
    for block in code_blocks:
        old_to_new[block.get('id')] = next_id
        next_id += 1

    stored_blocks = []
    values = []
    for block in code_blocks:
        new_id = old_to_new.get(block.get('id'))
        line_range = block.get('range') if isinstance(block.get('range'), list) else []
        start_line = _safe_int(line_range[0] if len(line_range) == 2 else block.get('startLine'))
        end_line = _safe_int(line_range[1] if len(line_range) == 2 else block.get('endLine'))
        related_ids = []
        for related in block.get('related_id') or []:
            related_ids.append(old_to_new.get(related, related))
        related_range = _remap_related_range_keys(block.get('related_range') or {}, old_to_new)
        stored_block = {
            'id': new_id,
            'file': file_name,
            'filename': file_name,
            'range': [start_line, end_line],
            'startLine': start_line,
            'endLine': end_line,
            'type': block.get('type') or '',
            'code': block.get('code') or block.get('content') or '',
            'content': block.get('code') or block.get('content') or '',
            'related_id': related_ids,
            'related_range': related_range
        }
        stored_blocks.append(stored_block)
        values.append((
            resolved_project_id,
            new_id,
            file_name,
            start_line,
            end_line,
            stored_block['type'],
            stored_block['code'],
            pyjson.dumps(related_ids, ensure_ascii=False),
            pyjson.dumps(related_range, ensure_ascii=False)
        ))

    cur.executemany(
        'INSERT INTO code_blocks(project_id, id, file, start_line, end_line, type, code, related_id, related_range, createdAt, updatedAt) '
        'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        values
    )
    return stored_blocks


def replace_doc_blocks(project_path, doc_blocks):
    project_id = get_project_id_by_path(project_path)
    if not project_id:
        raise ValueError(f'未找到项目记录，无法同步需求块: {project_path}')

    conn = get_db()
    cur = conn.cursor()
    cur.execute('DELETE FROM doc_blocks WHERE project_id=%s', (project_id,))

    if not doc_blocks:
        return project_id

    values = []
    for idx, block in enumerate(doc_blocks, start=1):
        block_id = block.get('id')
        if block_id in (None, ''):
            block_id = idx
            block['id'] = block_id

        values.append((
            project_id,
            _safe_int(block_id, idx),
            block.get('filename') or block.get('documentId') or '',
            block.get('type') or block.get('name') or '',
            block.get('content') or '',
            _safe_int(block.get('start')),
            _safe_int(block.get('end'))
        ))

    cur.executemany(
        'INSERT INTO doc_blocks(project_id, id, filename, type, content, start, end, createdAt, updatedAt) '
        'VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        values
    )
    return project_id


def replace_code_blocks(project_path, code_blocks):
    project_id = get_project_id_by_path(project_path)
    if not project_id:
        raise ValueError(f'未找到项目记录，无法同步代码块: {project_path}')

    conn = get_db()
    cur = conn.cursor()
    cur.execute('DELETE FROM code_blocks WHERE project_id=%s', (project_id,))

    if not code_blocks:
        return project_id

    values = []
    for block in code_blocks:
        line_range = block.get('range') if isinstance(block.get('range'), list) else []
        start_line = line_range[0] if len(line_range) == 2 else block.get('startLine')
        end_line = line_range[1] if len(line_range) == 2 else block.get('endLine')
        related_id = block.get('related_id')
        related_range = block.get('related_range')

        values.append((
            project_id,
            _safe_int(block.get('id')),
            block.get('file') or block.get('filename') or '',
            _safe_int(start_line),
            _safe_int(end_line),
            block.get('type') or '',
            block.get('code') or block.get('content') or '',
            pyjson.dumps(related_id if related_id is not None else [], ensure_ascii=False),
            pyjson.dumps(related_range if related_range is not None else {}, ensure_ascii=False)
        ))

    cur.executemany(
        'INSERT INTO code_blocks(project_id, id, file, start_line, end_line, type, code, related_id, related_range, createdAt, updatedAt) '
        'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        values
    )
    return project_id


def append_missing_doc_blocks(project_path, doc_ranges, block_type=''):
    project_id = get_project_id_by_path(project_path)
    if not project_id or not doc_ranges:
        return

    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, filename, start, end FROM doc_blocks WHERE project_id=%s', (project_id,))
    existing_rows = cur.fetchall()
    existing_keys = {
        (row.get('filename'), _safe_int(row.get('start')), _safe_int(row.get('end')))
        for row in existing_rows
    }
    next_id = max((_safe_int(row.get('id')) for row in existing_rows), default=0) + 1

    values = []
    for doc_range in doc_ranges:
        filename = doc_range.get('filename') or doc_range.get('documentId') or ''
        start = _safe_int(doc_range.get('start'))
        end = _safe_int(doc_range.get('end'))
        key = (filename, start, end)
        if key in existing_keys:
            continue
        values.append((
            project_id,
            next_id,
            filename,
            block_type or doc_range.get('type') or '',
            doc_range.get('content') or '',
            start,
            end
        ))
        existing_keys.add(key)
        next_id += 1

    if values:
        cur.executemany(
            'INSERT INTO doc_blocks(project_id, id, filename, type, content, start, end, createdAt, updatedAt) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            values
        )


def append_missing_code_blocks(project_path, code_ranges):
    project_id = get_project_id_by_path(project_path)
    if not project_id or not code_ranges:
        return

    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, file, start_line, end_line FROM code_blocks WHERE project_id=%s', (project_id,))
    existing_rows = cur.fetchall()
    existing_keys = {
        (row.get('file'), _safe_int(row.get('start_line')), _safe_int(row.get('end_line')))
        for row in existing_rows
    }
    next_id = max((_safe_int(row.get('id')) for row in existing_rows), default=0) + 1

    values = []
    for code_range in code_ranges:
        filename = code_range.get('filename') or code_range.get('documentId') or ''
        start_line = _safe_int(code_range.get('startLine'))
        end_line = _safe_int(code_range.get('endLine'))
        if not filename or start_line <= 0 or end_line <= 0:
            continue
        key = (filename, start_line, end_line)
        if key in existing_keys:
            continue
        values.append((
            project_id,
            next_id,
            filename,
            start_line,
            end_line,
            code_range.get('type') or '',
            code_range.get('content') or '',
            pyjson.dumps([], ensure_ascii=False),
            pyjson.dumps({}, ensure_ascii=False)
        ))
        existing_keys.add(key)
        next_id += 1

    if values:
        cur.executemany(
            'INSERT INTO code_blocks(project_id, id, file, start_line, end_line, type, code, related_id, related_range, createdAt, updatedAt) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            values
        )
