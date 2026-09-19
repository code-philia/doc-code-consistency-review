#!/usr/bin/env python3
"""Repair doc_blocks filename/type values and dependent document ranges.

The command is dry-run by default. Pass --apply to commit the transaction.
"""

import argparse
import json
import os
import sys

import pymysql
from pymysql.cursors import DictCursor


REPOSITORY_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPOSITORY_ROOT not in sys.path:
    sys.path.insert(0, REPOSITORY_ROOT)

from app.doc_block_integrity import (  # noqa: E402
    load_project_doc_metadata,
    normalize_doc_block_type,
    resolve_source_document_filename,
)


def parse_args():
    parser = argparse.ArgumentParser(description='Repair doc_blocks integrity')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=3306)
    parser.add_argument('--user', default='root')
    parser.add_argument('--password', default=os.environ.get('DOC_CODE_DB_PASSWORD', '123456'))
    parser.add_argument('--database', default='doc_code')
    parser.add_argument('--apply', action='store_true', help='commit changes (default: rollback preview)')
    return parser.parse_args()


def resolve_repaired_filename(row, conflicts):
    filename = row.get('filename') or ''
    project_path = row.get('project_path')
    if not filename.lower().endswith('.md'):
        return filename
    if not project_path:
        conflict = (row['project_id'], filename, '缺少 project 记录或项目路径，无法核对源文件后缀')
        if conflict not in conflicts:
            conflicts.append(conflict)
        return filename

    try:
        doc_repo, doc_files = load_project_doc_metadata(project_path)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        conflicts.append((row['project_id'], filename, f'无法读取项目元数据: {exc}'))
        return filename

    source_markdown = os.path.join(doc_repo, filename)
    if os.path.isfile(source_markdown):
        return filename

    stem = os.path.splitext(os.path.basename(filename))[0]
    converted_markdown = os.path.join(project_path, 'doc_repo_converted', stem, stem + '.md')
    try:
        return resolve_source_document_filename(converted_markdown, doc_repo, doc_files)
    except ValueError as exc:
        conflicts.append((row['project_id'], filename, str(exc)))
        return filename


def update_alignment_ranges(cursor, changes_by_project):
    updated = 0
    for project_id, changes in changes_by_project.items():
        by_id = {change['id']: change for change in changes}
        by_location = {
            (change['old_filename'], change['start'], change['end']): change
            for change in changes
        }
        cursor.execute('SELECT id, docRanges FROM alignments WHERE project_id=%s', (project_id,))
        for alignment in cursor.fetchall():
            try:
                ranges = json.loads(alignment.get('docRanges') or '[]')
            except (TypeError, ValueError):
                continue
            if not isinstance(ranges, list):
                continue

            modified = False
            for doc_range in ranges:
                if not isinstance(doc_range, dict):
                    continue
                change = by_id.get(doc_range.get('id'))
                if change is None:
                    change = by_location.get((
                        doc_range.get('filename') or doc_range.get('documentId') or '',
                        doc_range.get('start'),
                        doc_range.get('end'),
                    ))
                if change is None:
                    continue
                if doc_range.get('filename') != change['new_filename']:
                    doc_range['filename'] = change['new_filename']
                    modified = True
                if doc_range.get('documentId') != change['new_filename']:
                    doc_range['documentId'] = change['new_filename']
                    modified = True
                if doc_range.get('type') != change['new_type']:
                    doc_range['type'] = change['new_type']
                    modified = True

            if modified:
                cursor.execute(
                    'UPDATE alignments SET docRanges=%s, updatedAt=CURRENT_TIMESTAMP '
                    'WHERE project_id=%s AND id=%s',
                    (json.dumps(ranges, ensure_ascii=False), project_id, alignment['id']),
                )
                updated += 1
    return updated


def main():
    args = parse_args()
    connection = pymysql.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        database=args.database,
        charset='utf8mb4',
        cursorclass=DictCursor,
        autocommit=False,
    )
    conflicts = []
    try:
        cursor = connection.cursor()
        cursor.execute(
            'SELECT d.project_id,d.id,d.filename,d.type,d.content,d.start,d.end,p.path AS project_path '
            'FROM doc_blocks d LEFT JOIN project p ON p.project_id=d.project_id '
            'ORDER BY d.project_id,d.id'
        )
        changes = []
        for row in cursor.fetchall():
            new_type = normalize_doc_block_type(row.get('type'), row.get('content') or '')
            new_filename = resolve_repaired_filename(row, conflicts)
            if new_type == row.get('type') and new_filename == row.get('filename'):
                continue
            changes.append({
                'project_id': row['project_id'],
                'id': row['id'],
                'start': row['start'],
                'end': row['end'],
                'old_filename': row.get('filename') or '',
                'new_filename': new_filename,
                'old_type': row.get('type'),
                'new_type': new_type,
            })

        filename_changes = [change for change in changes if change['old_filename'] != change['new_filename']]
        type_changes = [change for change in changes if change['old_type'] != change['new_type']]
        print(f'待修复需求块: {len(changes)}（filename: {len(filename_changes)}, type: {len(type_changes)}）')
        for change in changes[:30]:
            print(
                f"  project={change['project_id']} id={change['id']} "
                f"filename={change['old_filename']!r}->{change['new_filename']!r} "
                f"type={change['old_type']!r}->{change['new_type']!r}"
            )
        if len(changes) > 30:
            print(f'  ... 另有 {len(changes) - 30} 条')
        for project_id, filename, reason in conflicts:
            print(f'  跳过 filename: project={project_id} filename={filename!r}: {reason}')

        changes_by_project = {}
        for change in changes:
            cursor.execute(
                'UPDATE doc_blocks SET filename=%s,type=%s,updatedAt=CURRENT_TIMESTAMP '
                'WHERE project_id=%s AND id=%s',
                (change['new_filename'], change['new_type'], change['project_id'], change['id']),
            )
            changes_by_project.setdefault(change['project_id'], []).append(change)

        alignment_updates = update_alignment_ranges(cursor, changes_by_project)

        issue_updates = 0
        for change in filename_changes:
            cursor.execute(
                'UPDATE issues SET relatedDocFile=%s,updatedAt=CURRENT_TIMESTAMP '
                'WHERE project_id=%s AND relatedDocFile=%s',
                (change['new_filename'], change['project_id'], change['old_filename']),
            )
            issue_updates += cursor.rowcount

        print(f'关联同步: alignments={alignment_updates}, issues={issue_updates}, 冲突={len(conflicts)}')
        if args.apply:
            connection.commit()
            print('修复已提交。')
        else:
            connection.rollback()
            print('预览完成，未提交；使用 --apply 执行修复。')
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == '__main__':
    main()
