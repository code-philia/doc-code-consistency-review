from flask import Blueprint, request, jsonify
from .db import get_db
import logging
from .func_utils import MODEL_CONFIG, OPERATION_TYPES
from flask_login import current_user


logs_bp = Blueprint('logs', __name__)

@logs_bp.route('/api/user_log/user_operation_logs', methods=['GET'])
def get_user_operation_logs():
    # 分页参数
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 10, type=int)
    if page < 1: page = 1
    if page_size < 1 or page_size > 100: page_size = 10

    # 排序参数
    sort_field = request.args.get('sort_field', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')
    allowed_sort_fields = {'id', 'username', 'created_at'}  # 白名单，防止SQL注入
    if sort_field not in allowed_sort_fields:
        sort_field = 'created_at'
    if sort_order.lower() not in ('asc', 'desc'):
        sort_order = 'desc'

    # 获取原始字符串，避免直接使用 type=int 导致空值报错
    operation_type_str = request.args.get('operation_type', '').strip()
    model_key_str = request.args.get('model_key', '').strip()

    # 构建 WHERE 条件
    conditions = ["user_id = %s"]
    params = [current_user.user_id]

    if operation_type_str:
        try:
            op_type = int(operation_type_str)
            if op_type in OPERATION_TYPES:
                conditions.append("operation_type = %s")
                params.append(OPERATION_TYPES[op_type])
        except ValueError:
            pass  # 非法数字忽略
    
    if model_key_str:
        try:
            m_key = model_key_str
            if m_key in MODEL_CONFIG:
                conditions.append("model_key = %s")
                params.append(MODEL_CONFIG[m_key]['name'])
        except ValueError:
            pass # 非法数字忽略

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    offset = (page - 1) * page_size

    db = get_db()
    cursor = db.cursor()
    try:
        # 查询总数
        count_query = f"SELECT COUNT(*) AS total FROM user_operation_log {where_clause}"
        cursor.execute(count_query, tuple(params))
        total = cursor.fetchone()['total']
        
        # 查询列表（带筛选条件 + 排序 + 分页）
        query = f"""
            SELECT id, username, operation_type, model_key, created_at
            FROM user_operation_log
            {where_clause}
            ORDER BY {sort_field} {sort_order}
            LIMIT %s OFFSET %s
        """

        # 注意：params 列表需要加上分页参数
        cursor.execute(query, tuple(params) + (page_size, offset))
        rows = cursor.fetchall()

        logs = []
        for row in rows:
            logs.append({
                'id': row['id'],
                'username': row['username'],
                'operation_type': row['operation_type'],  # 直接返回字符串
                'model_key': row['model_key'],
                'created_at': row['created_at'].strftime('%Y-%m-%d %H:%M:%S') if row['created_at'] else ''
            })

        return jsonify({
            'code': 200,
            'msg': 'success',
            'data': {
                'list': logs,
                'total': total,
                'page': page,
                'page_size': page_size
            }
        })
    except Exception as e:
        logging.error(f"查询操作日志失败: {e}")
        return jsonify({'code': 1, 'msg': '查询日志失败'}), 500
    finally:
        cursor.close()