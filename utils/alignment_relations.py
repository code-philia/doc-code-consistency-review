import json
import threading
import time

from pymysql.cursors import DictCursor
from app.db import get_db


_last_sync = {}
_sync_lock = threading.Lock()
SYNC_INTERVAL = 30


def sync_on_dialog_open(project_id):
    """打开弹窗时调用: 带节流的按项目同步"""
    now = time.time()
    with _sync_lock:
        if now - _last_sync.get(project_id, 0) < SYNC_INTERVAL:
            return 0, 0
        _last_sync[project_id] = now  # 占位，防止其他线程挤进来
    # 锁外执行同步，避免其他项目的同步被阻塞
    return sync_alignment_relations(project_id)


# ==================== 工具函数 ====================
def safe_parse(v):
    """docRanges/codeRanges 可能是 JSON 字符串、list、单个 dict 或 NULL，容错解析"""
    if not v:
        return []
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        return [v]                      # 单对象也包成列表
    try:
        data = json.loads(v)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]               # JSON 解析出来是单对象也包成列表
        return []
    except (json.JSONDecodeError, TypeError):
        return []


# ==================== 同步方法====================
def sync_alignment_relations(project_id=None):
    """
    遍历 alignments 表，把 docRanges/codeRanges 展开同步到 alignment_relations。
    - docRanges 里有 id 且有效，直接用；id 缺失或失效则用 (project_id+filename+start+end) 反查
    - codeRanges 里没有 id，用 (project_id + file + startLine + endLine) 反查 code_blocks.id
    幂等：先删后插，可反复执行。
    :return: (对齐数, 关系数)
    """
    db = get_db()
    cur = db.cursor(DictCursor)

    sql = "SELECT id, project_id, docRanges, codeRanges FROM alignments"
    params = ()
    if project_id is not None:
        sql += " WHERE project_id = %s"
        params = (project_id,)

    cur.execute(sql, params)
    rows = cur.fetchall()

    # 按项目整体删除旧关系
    if project_id is not None:
        cur.execute("DELETE FROM alignment_relations WHERE project_id = %s", (project_id,))
    else:
        cur.execute("DELETE FROM alignment_relations")

    if not rows:
        return 0, 0

    # 预加载 code_blocks 索引，避免每条 codeRange 都查库
    cur.execute("SELECT id, project_id, file, start_line, end_line FROM code_blocks")
    code_index = {}
    for cb in cur.fetchall():
        key = (cb['project_id'], cb['file'], cb['start_line'], cb['end_line'])
        code_index[key] = cb['id']

    # 预加载 doc_blocks 索引：id 有效性集合 + 位置反查索引
    cur.execute("SELECT id, project_id, filename, start, `end` FROM doc_blocks")
    valid_doc_ids = set()
    doc_index = {}
    for d in cur.fetchall():
        valid_doc_ids.add(d['id'])
        key = (d['project_id'], d['filename'], d['start'], d['end'])
        doc_index[key] = d['id']

    # 解析 JSON，展开成关系行
    values = []
    unmatched = 0
    for r in rows:
        align_id = r['id']
        pid = r.get('project_id') or 0

        # 需求块：优先用 JSON 里的 id；id 缺失或已失效则用位置反查，绝不插 0
        for d in safe_parse(r.get('docRanges')):
            did = d.get('id')
            if did and did in valid_doc_ids:
                values.append((pid, align_id, 'doc', did))
                continue
            # id 缺失/失效 -> 用 文件名+起止偏移 反查 doc_blocks 的真实 id
            key = (pid, d.get('filename'), d.get('start'), d.get('end'))
            did = doc_index.get(key)
            if did is not None:
                values.append((pid, align_id, 'doc', did))
            else:
                unmatched += 1   # 位置也对不上（文档内容改了），跳过

        # 代码块：JSON 里没有 id，用文件名+行号范围反查 code_blocks.id（不变）
        for c in safe_parse(r.get('codeRanges')):
            filename = c.get('documentId') or c.get('filename')
            key = (pid, filename, c.get('startLine'), c.get('endLine'))
            code_id = code_index.get(key)
            if code_id is not None:
                values.append((pid, align_id, 'code', code_id))
            else:
                unmatched += 1

    # 批量插入 (先按 (alignment_id, block_type, block_id) 去重)
    # docRanges/codeRanges 里可能存在重复条目，直接插会撞唯一键
    if values:
        seen = set()
        uniq_values = []
        for v in values:
            key = (v[1], v[2], v[3])
            if key in seen:
                continue
            seen.add(key)
            uniq_values.append(v)
        cur.executemany(
            "INSERT INTO alignment_relations "
            "(project_id, alignment_id, block_type, block_id) "
            "VALUES (%s,%s,%s,%s)",
            uniq_values,
        )

    # 清理指向已删除需求块/代码块的关系行（不变）
    cur.execute("""
        DELETE r FROM alignment_relations r
        LEFT JOIN doc_blocks d ON r.block_type = 'doc' AND d.id = r.block_id
        WHERE r.block_type = 'doc' AND d.id IS NULL
    """)
    cur.execute("""
        DELETE r FROM alignment_relations r
        LEFT JOIN code_blocks c ON r.block_type = 'code' AND c.id = r.block_id
        WHERE r.block_type = 'code' AND c.id IS NULL
    """)

    if unmatched:
        print(f"警告: {unmatched} 条 range 未匹配到 doc_blocks/code_blocks（可能是脏数据）")
    return len(rows), len(values)


