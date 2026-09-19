import json
import os
import re
import uuid

from flask import request, jsonify, Blueprint
from flask_login import current_user

from app.db import get_db
from utils.alignment_relations import sync_alignment_relations, sync_on_dialog_open

align_relation_bp = Blueprint('align_relations', __name__)


def ok(data):
    return jsonify({'code': 0, 'msg': 'success', 'data': data})


def err(msg):
    return jsonify({'code': -1, 'msg': str(msg), 'data': None})


@align_relation_bp.route('/api/alignment/alignments', methods=['GET'])
def api_alignments():
    try:
        project_id = request.args.get('project_id', type=int)
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('page_size', 20, type=int)

        # 打开弹窗顺带同步关系表（复用现有 30 秒节流同步）
        sync_on_dialog_open(project_id)

        db = get_db()
        cur = db.cursor()
        offset = (page - 1) * page_size

        # 1. 总数（排除 is_code_review = 1 的纯代码审查记录, 已对齐/未对齐都统计）
        cur.execute(
            "SELECT COUNT(*) AS total FROM alignments "
            "WHERE project_id = %s AND is_code_review = 0",
            (project_id,),
        )
        total = cur.fetchone()['total']

        # 2. 本页对齐记录
        cur.execute(
            """
            SELECT id, name, align_type, is_alignment, createdAt
            FROM alignments
            WHERE project_id = %s AND is_code_review = 0
            ORDER BY createdAt DESC
            LIMIT %s OFFSET %s
            """,
            (project_id, page_size, offset),
        )
        aligns = cur.fetchall()
        if not aligns:
            return ok({'total': total, 'page': page, 'page_size': page_size, 'list': []})

        # 3. 批量取这些对齐的关系行（一次查询，避免 N+1）
        align_ids = [a['id'] for a in aligns]
        placeholders = ','.join(['%s'] * len(align_ids))
        cur.execute(
            f"""
            SELECT alignment_id, block_type, block_id
            FROM alignment_relations
            WHERE project_id = %s AND alignment_id IN ({placeholders})
            """,
            (project_id, *align_ids),
        )
        rel_rows = cur.fetchall()

        doc_map = {}   # alignment_id -> [doc block_id, ...]
        code_map = {}  # alignment_id -> [code block_id, ...]
        doc_ids = set()
        for r in rel_rows:
            if r['block_type'] == 'doc':
                doc_map.setdefault(r['alignment_id'], []).append(r['block_id'])
                doc_ids.add(r['block_id'])
            elif r['block_type'] == 'code':
                code_map.setdefault(r['alignment_id'], []).append(r['block_id'])

        # 4. 批量取需求块名称
        name_map = {}
        if doc_ids:
            ph = ','.join(['%s'] * len(doc_ids))
            cur.execute(
                f"SELECT id, name FROM doc_blocks WHERE id IN ({ph})",
                tuple(doc_ids),
            )
            for r in cur.fetchall():
                name_map[r['id']] = r['name']

        # 5. 组装返回
        result = []
        for a in aligns:
            d_ids = doc_map.get(a['id'], [])
            result.append({
                'id': a['id'],
                'doc_block_ids': d_ids,
                'doc_block_name': a.get('name') or (name_map.get(d_ids[0], '') if d_ids else ''),
                'code_ids': code_map.get(a['id'], []),
                'align_type': a.get('align_type'),
                'is_alignment': a.get('is_alignment', 0),  # 0 未对齐 1 已对齐
                'created_at': str(a['createdAt']) if a.get('createdAt') else None,
            })

        return ok({'total': total, 'page': page, 'page_size': page_size, 'list': result})
    except Exception as e:
        return err(e)


# 左侧：需求块列表（分页）
# GET /api/alignment/doc_blocks?project_id=1&page=1&page_size=20
@align_relation_bp.route('/api/alignment/doc_blocks', methods=['GET'])
def api_doc_blocks():
    try:
        project_id = request.args.get('project_id', type=int)
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('page_size', 20, type=int)
        doc_block_id = request.args.get('doc_block_id', type=int)  # 新增，可选

        db = get_db()
        cur = db.cursor()

        # ---- 新增：doc_block_id 定位，算所在页码 ----
        if doc_block_id is not None:
            cur.execute(
                "SELECT id FROM doc_blocks WHERE project_id = %s AND id = %s",
                (project_id, doc_block_id),
            )
            if not cur.fetchone():
                return err(f'需求块不存在: doc_block_id={doc_block_id}')
            # 排序规则与列表一致（ORDER BY id），数它前面有多少条即可算出页码
            cur.execute(
                "SELECT COUNT(*) AS c FROM doc_blocks "
                "WHERE project_id = %s AND id < %s",
                (project_id, doc_block_id),
            )
            before = cur.fetchone()['c']
            page = before // page_size + 1

        offset = (page - 1) * page_size

        # 1. 总数
        cur.execute(
            "SELECT COUNT(*) AS total FROM doc_blocks WHERE project_id = %s",
            (project_id,),
        )
        total = cur.fetchone()['total']

        # 2. 本页需求块
        cur.execute(
            """
            SELECT id, doc_block_id, name, type, filename, start, end
            FROM doc_blocks
            WHERE project_id = %s
            ORDER BY id
            LIMIT %s OFFSET %s
            """,
            (project_id, page_size, offset),
        )
        docs = cur.fetchall()
        if not docs:
            return {'total': total, 'page': page, 'page_size': page_size, 'list': []}

        # 3. 本页 doc id -> 对齐的 code_ids（一次查询，避免 N+1）
        doc_ids = [d['id'] for d in docs]
        placeholders = ','.join(['%s'] * len(doc_ids))
        cur.execute(
            f"""
                SELECT DISTINCT rd.block_id AS doc_pk, rc.block_id AS code_pk
                FROM alignment_relations rd
                JOIN alignment_relations rc
                    ON rc.alignment_id = rd.alignment_id AND rc.block_type = 'code'
                WHERE rd.block_type = 'doc' AND rd.block_id IN ({placeholders})
                """,
            doc_ids,
        )
        code_map = {}
        for r in cur.fetchall():
            code_map.setdefault(r['doc_pk'], []).append(r['code_pk'])

        for d in docs:
            ids = code_map.get(d['id'], [])
            d['code_ids'] = ids
            d['aligned'] = len(ids) > 0
        return ok({'total': total, 'page': page, 'page_size': page_size, 'list': docs})
    except Exception as e:
        return err(e)


# 右侧树一级：代码文件列表
# GET /api/alignment/code_files?project_id=1
@align_relation_bp.route('/api/alignment/code_files', methods=['GET'])
def api_code_files():
    try:
        project_id = request.args.get('project_id', type=int)
        db = get_db()
        cur = db.cursor()
        cur.execute(
            """
            SELECT file, COUNT(*) AS count
            FROM code_blocks
            WHERE project_id = %s
            GROUP BY file
            ORDER BY file
            """,
            (project_id,),
        )
        return ok(cur.fetchall())
    except Exception as e:
        return err(e)


# 右侧树二级：某文件下的代码块（懒加载，可分页）
# GET /api/alignment/code_blocks?project_id=1&file=main.cpp&page=1&page_size=100
@align_relation_bp.route('/api/alignment/code_blocks', methods=['GET'])
def api_code_blocks():
    try:
        project_id = request.args.get('project_id', type=int)
        file = request.args.get('file')
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('page_size', 100, type=int)

        db = get_db()
        cur = db.cursor()
        offset = (page - 1) * page_size

        cur.execute(
            "SELECT COUNT(*) AS total FROM code_blocks WHERE project_id = %s AND file = %s",
            (project_id, file),
        )
        total = cur.fetchone()['total']

        cur.execute(
            """
            SELECT DISTINCT
                c.id AS code_pk, c.code_block_row_id, c.name, c.type,
                c.start_line, c.end_line,
                r.alignment_id
            FROM code_blocks c
            LEFT JOIN alignment_relations r
                ON r.block_type = 'code' AND r.block_id = c.id
            WHERE c.project_id = %s AND c.file = %s
            ORDER BY c.start_line
            LIMIT %s OFFSET %s
            """,
            (project_id, file, page_size, offset),
        )
        rows = cur.fetchall()

        # 去重 + 汇总 aligned（一个块可能在多条对齐里，JOIN 出多行）
        blocks = {}
        for r in rows:
            key = r['code_pk']
            if key not in blocks:
                blocks[key] = {
                    'id': r['code_pk'],
                    'code_block_row_id': r['code_block_row_id'],
                    'name': r['name'],
                    'type': r['type'],
                    'startLine': r['start_line'],
                    'endLine': r['end_line'],
                    'aligned': False,
                }
            if r['alignment_id'] is not None:
                blocks[key]['aligned'] = True
        return ok({
            'total': total,
            'page': page,
            'page_size': page_size,
            'list': list(blocks.values()),
        })
    except Exception as e:
        return err(e)


# 点击已对齐需求：定位代码块所属文件
# POST /api/alignment/locate  body: {"code_ids": [12, 13]}
@align_relation_bp.route('/api/alignment/locate', methods=['POST'])
def api_locate():
    try:
        code_ids = (request.get_json() or {}).get('code_ids', [])

        if not code_ids:
            return {}
        db = get_db()
        cur = db.cursor()
        placeholders = ','.join(['%s'] * len(code_ids))
        cur.execute(
            f"SELECT id, file FROM code_blocks WHERE id IN ({placeholders})",
            code_ids,
        )
        result = {}
        for r in cur.fetchall():
            result.setdefault(r['file'], []).append(r['id'])
        return ok(result)
    except Exception as e:
        return err(e)


# 需求块 -> 对齐的代码块明细（备用）
# GET /api/alignment/codes_by_doc?doc_id=6&project_id=1
@align_relation_bp.route('/api/alignment/codes_by_doc', methods=['GET'])
def api_codes_by_doc():
    try:
        doc_id = request.args.get('doc_id', type=int)
        project_id = request.args.get('project_id', type=int)

        db = get_db()
        cur = db.cursor()
        cur.execute(
            """
            SELECT DISTINCT c.*
            FROM alignment_relations rd
            JOIN alignment_relations rc
                ON rc.alignment_id = rd.alignment_id AND rc.block_type = 'code'
            JOIN code_blocks c ON c.id = rc.block_id
            WHERE rd.block_type = 'doc' AND rd.block_id = %s AND rd.project_id = %s
            """,
            (doc_id, project_id),
        )
        return ok(cur.fetchall())
    except Exception as e:
        return err(e)


# 代码块 -> 对齐的需求块明细（备用）
# GET /api/alignment/docs_by_code?code_id=12&project_id=1
@align_relation_bp.route('/api/alignment/docs_by_code', methods=['GET'])
def api_docs_by_code():
    try:
        code_id = request.args.get('code_id', type=int)
        project_id = request.args.get('project_id', type=int)

        db = get_db()
        cur = db.cursor()
        cur.execute(
            """
            SELECT DISTINCT d.*
            FROM alignment_relations rc
            JOIN alignment_relations rd
                ON rd.alignment_id = rc.alignment_id AND rd.block_type = 'doc'
            JOIN doc_blocks d ON d.id = rd.block_id
            WHERE rc.block_type = 'code' AND rc.block_id = %s AND rc.project_id = %s
            """,
            (code_id, project_id),
        )
        return ok(cur.fetchall())
    except Exception as e:
        return err(e)


# 手动触发同步（备用，也可在对齐保存后内部调用 sync_alignment_relations）
# POST /api/alignment/sync  body: {"project_id": 1}  （不传 project_id 则全量）
@align_relation_bp.route('/api/alignment/sync', methods=['POST'])
def api_sync():
    try:
        project_id = (request.get_json() or {}).get('project_id')
        align_count, rel_count = sync_alignment_relations(project_id)
        return ok({'alignments': align_count, 'relations': rel_count})
    except Exception as e:
        return err(e)


# ==================== 工具函数 ====================

def offsets_from_line_range(content, start_line, end_line):
    """行号范围 -> 字符偏移（与前端 getOffsetsFromLineRange 算法一致，行号 1-based）"""
    if not content:
        return {'start': 0, 'end': 0}
    lines = re.split(r'\r\n|\r|\n', content)
    start_offset = 0
    end_offset = 0
    current = 0
    for i, line in enumerate(lines):
        line_len = len(line) + 1  # +1 for newline
        if i + 1 == start_line:
            start_offset = current
        if i + 1 == end_line:
            end_offset = current + len(line)  # 行尾偏移不含换行符
        if end_line > len(lines):
            end_offset = current              # endLine 超出文件长度
            break
        current += line_len
    return {'start': start_offset, 'end': end_offset}


def read_project_file(project_path, rel_file, repo_dir='code_repo'):
    """读取项目下的源文件内容，读不到返回 None（不影响主流程）"""
    if not project_path or not rel_file:
        # print(f'[参数为空]: path={project_path}, file={rel_file}')
        return None
    try:
        base = os.path.normpath(os.path.join(project_path, repo_dir))
        full = os.path.normpath(os.path.join(base, rel_file))
        if not full.startswith(base + os.sep):  # 防目录穿越
            # print(f'穿越校验拦截 full = {full!r}')
            return None
        with open(full, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    except OSError as e:
        # print(f'读取失败: err={e}')
        return None


def build_doc_ranges(cur, project_id, doc_block_ids):
    """由 doc_blocks.id 列表组装 docRanges JSON（结构与旧页面一致）"""
    if not doc_block_ids:
        return []
    placeholders = ','.join(['%s'] * len(doc_block_ids))
    cur.execute(
        f"""
        SELECT id, name, type, filename, content, start, `end`
        FROM doc_blocks
        WHERE project_id = %s AND id IN ({placeholders})
        """,
        (project_id, *doc_block_ids),
    )
    return [{
        'documentId': d['filename'],
        'filename': d['filename'],
        'id': d['id'],
        'name': d['name'],
        'type': d['type'],
        'content': d['content'] or '',
        'start': d['start'],
        'end': d['end'],
    } for d in cur.fetchall()]


def build_code_ranges(cur, project_id, code_ids, project_path=None):
    """由 code_blocks.id 列表组装 codeRanges JSON（结构与旧页面一致）。
    start/end：文件可读时按行号算字符偏移；读不到置 None（sync 反查不受影响）。"""
    if not code_ids:
        return []
    placeholders = ','.join(['%s'] * len(code_ids))
    cur.execute(
        f"""
        SELECT id, name, type, file, start_line, end_line, code
        FROM code_blocks
        WHERE project_id = %s AND id IN ({placeholders})
        """,
        (project_id, *code_ids),
    )
    file_cache = {}  # 同文件只读一次
    ranges = []
    for c in cur.fetchall():
        file = c['file']
        if file not in file_cache:
            file_cache[file] = read_project_file(project_path, file, 'code_repo')
        content = file_cache[file]
        if content is not None:
            offsets = offsets_from_line_range(content, c['start_line'], c['end_line'])
            start, end = offsets['start'], offsets['end']
        else:
            start, end = None, None
        ranges.append({
            'documentId': file,
            'filename': file,
            'start': start,
            'end': end,
            'content': c['code'] or '',
            'startLine': c['start_line'],
            'endLine': c['end_line'],
        })
    return ranges


# ==================== 保存对齐 ====================
# POST /api/alignment/save
# body: {"project_id": 1, "path": "/项目路径(可选)", "doc_block_id": 5, "code_ids": [12, 13]}
@align_relation_bp.route('/api/alignment/save', methods=['POST'])
def api_alignment_save():
    try:
        body = request.get_json() or {}
        project_id = body.get('project_id')
        project_path = body.get('path')
        doc_block_id = body.get('doc_block_id')
        code_ids = body.get('code_ids') or []
        if not project_id or not doc_block_id or not code_ids:
            return err('缺少参数: project_id / doc_block_id / code_ids')

        db = get_db()
        cur = db.cursor()

        doc_ranges = build_doc_ranges(cur, project_id, [doc_block_id])
        code_ranges = build_code_ranges(cur, project_id, code_ids, project_path)
        if not doc_ranges:
            return err(f'需求块不存在: doc_block_id={doc_block_id}')
        if not code_ranges:
            return err('代码块不存在: code_ids=' + ','.join(map(str, code_ids)))

        align_id = 'manual_align_' + uuid.uuid4().hex[:24]
        name = doc_ranges[0].get('name') or '手动对齐'

        cur.execute(
            """
            INSERT INTO alignments(
                id, user_id, project_id, name, isReviewed, reviewThoughts,
                docRanges, codeRanges, createdAt, updatedAt,
                is_code_review, align_type, is_alignment
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, %s, %s, %s)
            """,
            (
                align_id,
                current_user.user_id,   # ← 与 add_alignment 中取值方式保持一致
                project_id,
                name,
                0,
                '',
                json.dumps(doc_ranges, ensure_ascii=False),
                json.dumps(code_ranges, ensure_ascii=False),
                0,          # is_code_review
                'req2code',  # align_type：手动对齐固定 需求->代码
                1,          # is_alignment
            ),
        )

        sync_alignment_relations(project_id)  # 重建关系表
        return ok({'id': align_id})
    except Exception as e:
        return err(e)


# ==================== 修改对齐 ====================
# POST /api/alignment/update
# body: {"id": "manual_align_xxx", "project_id": 1, "path": "/项目路径(可选)",
#        "doc_block_ids": [5, 6](可选), "code_ids": [12, 13, 20]}
# 约定：
#   - doc_block_ids 传了（非空）= 需求变更，更新 docRanges；不传 = docRanges 不动
#   - name 更新策略按 align_type 区分：
#       req2code：name 跟随需求块——doc_block_ids 传了才改名
#       code2req：name 跟随代码块——前端判断代码块变了（code_changed=true）才改名，
#                 改需求不改名；新名字取第一个代码块的 code_blocks.name
@align_relation_bp.route('/api/alignment/update', methods=['POST'])
def api_alignment_update():
    try:
        body = request.get_json() or {}
        align_id = body.get('id')
        project_id = body.get('project_id')
        project_path = body.get('path')
        doc_block_ids = body.get('doc_block_ids')   # 关键：不传 = 需求块没变
        code_ids = body.get('code_ids') or []
        if not align_id or not project_id:
            return err('缺少参数: id / project_id')

        db = get_db()
        cur = db.cursor()

        cur.execute(
            "SELECT align_type FROM alignments WHERE id = %s AND project_id = %s",
            (align_id, project_id),
        )
        row = cur.fetchone()
        if not row:
            return err(f'对齐记录不存在: id={align_id}')

        code_ranges = build_code_ranges(cur, project_id, code_ids, project_path)

        # 代码块是否变了：由前端判断后以 code_changed 标志传入
        # （前端进入修改模式时持有原始 code_ids，与当前勾选对比得出；后端不重复校验）
        code_changed = bool(body.get('code_changed'))

        # ---- name 更新策略（None = 不改名，配合 SQL 的 COALESCE(%s, name)） ----
        new_name = None
        if row.get('align_type') == 'code2req':
            # code2req：name 锚在代码块上。只有代码块变了才跟随新代码块改名；
            # 只改需求不改名（保护现有 name，可能是外部重命名过的）
            if code_changed and code_ranges and code_ids:
                cur.execute(
                    "SELECT name FROM code_blocks WHERE project_id = %s AND id = %s",
                    (project_id, code_ids[0]),
                )
                r = cur.fetchone()
                if r and r['name']:
                    new_name = r['name']
        else:
            # req2code：name 跟随需求块，需求变了才改（doc_ranges 在下面分支构建，
            # 这里先标记，真正取值在 UPDATE 前）
            pass

        if doc_block_ids:
            # 前端明确传了需求块 = 需求变了：更新 docRanges
            doc_ranges = build_doc_ranges(cur, project_id, doc_block_ids)
            if not doc_ranges:
                return err('需求块不存在: doc_block_ids=' + ','.join(map(str, doc_block_ids)))
            if row.get('align_type') != 'code2req':
                new_name = doc_ranges[0]['name']   # req2code：name 跟随新需求块
            is_alignment = 1 if (doc_ranges and code_ranges) else 0
            cur.execute(
                """
                UPDATE alignments
                SET name = COALESCE(%s, name),
                    docRanges = %s,
                    codeRanges = %s,
                    is_alignment = %s,
                    updatedAt = CURRENT_TIMESTAMP
                WHERE id = %s AND project_id = %s
                """,
                (
                    new_name,
                    json.dumps(doc_ranges, ensure_ascii=False),
                    json.dumps(code_ranges, ensure_ascii=False),
                    is_alignment,
                    align_id,
                    project_id,
                ),
            )
        else:
            # 需求没变：docRanges 不动；name 按上面的策略（仅 code2req 且代码块变了才改）
            cur.execute(
                """
                UPDATE alignments
                SET name = COALESCE(%s, name),
                    codeRanges = %s,
                    is_alignment = CASE WHEN docRanges IS NOT NULL AND docRanges != '[]'
                                        AND %s != '[]' THEN 1 ELSE 0 END,
                    updatedAt = CURRENT_TIMESTAMP
                WHERE id = %s AND project_id = %s
                """,
                (
                    new_name,
                    json.dumps(code_ranges, ensure_ascii=False),
                    json.dumps(code_ranges, ensure_ascii=False),
                    align_id,
                    project_id,
                ),
            )
        db.commit()

        sync_alignment_relations(project_id)
        return ok({'id': align_id})
    except Exception as e:
        return err(e)


# ==================== 删除对齐 ====================
# POST /api/alignment/delete
# body: {"id": "manual_align_xxx", "project_id": 1}
@align_relation_bp.route('/api/alignment/delete', methods=['POST'])
def api_alignment_delete():
    try:
        body = request.get_json() or {}
        align_id = body.get('id')
        project_id = body.get('project_id')
        if not align_id or not project_id:
            return err('缺少参数: id / project_id')

        db = get_db()
        cur = db.cursor()

        cur.execute(
            "DELETE FROM alignments WHERE id = %s AND project_id = %s",
            (align_id, project_id),
        )

        sync_alignment_relations(project_id)  # sync 会把这条对齐的关系行一起清掉
        return ok({'id': align_id})
    except Exception as e:
        return err(e)


@align_relation_bp.route('/api/alignment/doc_block_detail', methods=['GET'])
def api_doc_block_detail():
    """需求块查看详情"""
    try:
        project_id = request.args.get('project_id', type=int)
        doc_block_id = request.args.get('doc_block_id', type=int)
        if not project_id or not doc_block_id:
            return err('缺少参数: project_id / doc_block_id')

        db = get_db()
        cur = db.cursor()
        cur.execute(
            """
            SELECT id, name, type, filename, content, start, `end`
            FROM doc_blocks
            WHERE project_id = %s AND id = %s
            """,
            (project_id, doc_block_id),
        )
        row = cur.fetchone()
        if not row:
            return err(f'需求块不存在: doc_block_id={doc_block_id}')
        return ok(row)
    except Exception as e:
        return err(e)
