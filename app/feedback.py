from flask import Blueprint
from flask import request, jsonify
from flask_login import current_user

from app.db import get_db
from app.user import User

feedback_bp = Blueprint('feedback_bp', __name__)


@feedback_bp.route('/api/feedback/submit', methods=['POST'])
def submit_feedback():
    """提交反馈"""
    data = request.get_json() or {}
    title = data.get('title', '').strip()           # 反馈标题
    feedback_type = data.get('feedback_type')        # 1=问题, 2=优化建议
    expect_time = data.get('expect_resolve_time')    # 期望解决时间，YYYY-MM-DD
    content = data.get('content', '').strip()        # 反馈内容

    # 参数校验
    if not title or not content:
        return jsonify({'code': 400, 'msg': '标题和反馈内容不能为空'}), 400
    if feedback_type not in [1, 2]:
        return jsonify({'code': 400, 'msg': '反馈类型错误'}), 400

    # 提交人，从登录态取，没有就默认匿名
    user_id = current_user.user_id

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO feedback (title, feedback_type, expect_resolve_time, content, user_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (title, feedback_type, expect_time or None, content, user_id))
        return jsonify({'code': 200, 'msg': '提交成功'})
    except Exception as e:
        return jsonify({'code': 500, 'msg': str(e)}), 500


@feedback_bp.route('/api/feedback/list', methods=['GET'])
def feedback_list():
    """分页查询反馈列表，支持按类型和状态筛选"""
    page = request.args.get('page', 1, type=int)                 # 当前页码
    page_size = request.args.get('page_size', 10, type=int)      # 每页条数
    feedback_type = request.args.get('feedback_type', type=int)  # 筛选类型
    status = request.args.get('status', type=int)               # 筛选状态

    # 动态拼接 WHERE 条件
    where, params = ["1=1"], []
    if feedback_type:
        where.append("feedback_type = %s")
        params.append(feedback_type)
    if status is not None:
        where.append("status = %s")
        params.append(status)

    where_sql = " AND ".join(where)
    conn = get_db()
    cursor = conn.cursor()
    try:
        # 查总数
        cursor.execute(f"SELECT COUNT(*) as total FROM feedback WHERE {where_sql}", params)
        total = cursor.fetchone()['total']

        # 查分页数据
        cursor.execute(f"""
            SELECT id, title, feedback_type, expect_resolve_time, content,
                   user_id, status, created_at
            FROM feedback WHERE {where_sql}
            ORDER BY created_at DESC LIMIT %s OFFSET %s
        """, params + [page_size, (page - 1) * page_size])
        rows = cursor.fetchall()

        # 映射中文文本，前端直接显示
        type_map = {1: '问题', 2: '优化建议'}
        status_map = {0: '待处理', 1: '已处理', 2: '已关闭'}
        for r in rows:
            r['feedback_type_text'] = type_map.get(r['feedback_type'], '未知')
            r['status_text'] = status_map.get(r['status'], '未知')
            r['submitter'] = User.get(r['user_id']).name
            r['expect_resolve_time'] = r['expect_resolve_time'].strftime('%Y-%m-%d')
            r['created_at'] = r['created_at'].strftime('%Y-%m-%d %H:%M:%S')

        return jsonify({'code': 200, 'data': {
            'list': rows, 'total': total, 'page': page, 'page_size': page_size
        }})
    finally:
        pass


@feedback_bp.route('/api/feedback/update_status', methods=['POST'])
def update_status():
    """变更反馈状态：0=待处理, 1=已处理, 2=已关闭"""
    data = request.get_json() or {}
    fid = data.get('id')      # 反馈ID
    status = data.get('status')  # 目标状态

    if fid is None or status not in [0, 1, 2]:
        return jsonify({'code': 400, 'msg': '参数错误'}), 400

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE feedback SET status = %s WHERE id = %s", (status, fid))
        return jsonify({'code': 200, 'msg': '更新成功'})
    finally:
        pass


@feedback_bp.route('/api/feedback/pending_count', methods=['GET'])
def pending_count():
    """获取待处理(status=0)的反馈数量，用于管理员徽标提示"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) count FROM feedback WHERE status = 0")
        count = cursor.fetchone()['count']
        return jsonify({'code': 200, 'data': {'count': count}})
    finally:
        pass
