import os
import shutil
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required
from .db import get_db
import traceback

project_bp = Blueprint('project', __name__)


def _project_now_str():
    return datetime.now(ZoneInfo("Asia/Shanghai")).strftime('%Y-%m-%d %H:%M:%S')


def _serialize_project_time(value):
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    if value is None:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    # 兼容旧数据：历史上这里写入过不带时区的 ISO 字符串，实际语义更接近 UTC。
    # 新数据统一改成空格分隔的本地时间字符串，这里仅对旧的 T 格式做矫正。
    if 'T' in raw and '+' not in raw and raw[-1:] != 'Z':
        for fmt in ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
            try:
                parsed = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
                return parsed.astimezone(ZoneInfo("Asia/Shanghai")).strftime('%Y-%m-%d %H:%M:%S')
            except ValueError:
                continue

    return raw.replace('T', ' ')


@project_bp.route('/project/recent-projects', methods=['GET'])
def get_recent_projects():
    """获取最近打开的项目列表"""

    # 管理员用户记录查询project_access_log表
    if current_user.role == 'admin':
        sql = f"""
        select t.last_access as last_opened, p.name, p.path, p.project_id, p.project_secret_level
        from project p
        left join (
            select project_id, max(access_time) as last_access
            from project_access_log
            where user_id={current_user.user_id}
            group by project_id
        ) t on p.project_id = t.project_id
        order by coalesce(t.last_access, '1970-01-01') desc, p.last_opened desc;
        """
    else:
        sql = f"""
        select last_opened, name, path, project_id, project_secret_level 
        from project where user_id={current_user.user_id}
        order by last_opened desc;
        """
    db = get_db()
    c = db.cursor()
    c.execute(sql)
    rows = c.fetchall()
    history = []
    for row in rows:
        history.append({
            'last_opened': _serialize_project_time(row['last_opened']),
            'name': row['name'],
            'path': row['path'],
            'id': row['project_id'],
            'secret_level': row['project_secret_level']
        })

    return jsonify({"status": "success", "recentProjects": history})


def project_access(project_id):
    now_str = _project_now_str()
    if current_user.role == 'admin':
        sql = f'insert into project_access_log(user_id,project_id,access_time) ' \
              f'values({current_user.user_id},{project_id},"{now_str}")'
    else:
        sql = f'update project set last_opened="{now_str}" where project_id={project_id}'

    db = get_db()
    c = db.cursor()
    c.execute(sql)


def get_project_id_by_name(project_name):
    """
    通过项目名称获取项目id
    """
    sql = f"select project_id from project where name='{project_name}'"
    db = get_db()
    c = db.cursor()
    c.execute(sql)
    row = c.fetchone()
    return row['project_id']


@login_required
@project_bp.route('/project/delete', methods=['delete'])
def delete_project():
    """删除项目目录和历史记录"""
    from .views import logger
    data = request.json

    ids = []
    if 'ids' in data and data.get('ids'):
        ids = data.get('ids') if isinstance(data.get('ids'), list) else [data.get('ids')]
    elif 'project_id' in data:
        ids = [data.get('project_id')]

    paths = []
    if 'paths' in data and data.get('paths'):
        paths = data.get('paths') if isinstance(data.get('paths'), list) else [data.get('paths')]
    elif 'path' in data:
        paths = [data.get('path')]

    if not ids or not paths:
        return jsonify({"status": "error", "message": "缺少必要参数"}), 400

    db = get_db()
    c = db.cursor()

    try:
        
        placeholders = ', '.join(['%s'] * len(ids))  # MySQL 使用 %s，不是 ?
        delete_abs = f"DELETE FROM abstracts WHERE project_id IN ({placeholders})"
        delete_ali = f"DELETE FROM alignments WHERE project_id IN ({placeholders})"
        delete_issues = f"DELETE FROM issues WHERE project_id IN ({placeholders})"
        delete_pro = f"DELETE FROM project WHERE project_id IN ({placeholders})"
        if current_user.role == "admin":
            condition = ""
        else:
            condition = f"and user_id = {current_user.user_id}"
        delete_pro += condition

        c.execute(delete_abs, ids)
        c.execute(delete_ali, ids)
        c.execute(delete_issues, ids)
        c.execute(delete_pro, ids)

        # 删除项目目录
        for folder_path in paths:
            if folder_path and os.path.exists(folder_path):
                try:
                    shutil.rmtree(folder_path)
                    logger.info(f"[Success] 已删除文件夹: {folder_path}")
                except Exception as e:
                    logger.info(f"[Warning] 删除文件夹失败 {folder_path}: {e}")

        return jsonify({"status": "success", "message": "项目删除成功"})

    except PermissionError:
        db.rollback()
        return jsonify({"status": "error", "message": "没有权限删除项目文件"}), 403
    except Exception as e:
        traceback.print_exc()
        db.rollback()
        return jsonify({"status": "error", "message": f"删除项目时出错: {str(e)}"}), 500
