from datetime import datetime

from flask import Blueprint, jsonify
from flask_login import current_user
from . import get_db

project_bp = Blueprint('project', __name__)


@project_bp.route('/project/recent-projects', methods=['GET'])
def get_recent_projects():
    """获取最近打开的项目列表"""

    # 管理员用户记录查询project_access_log表
    if current_user.role == 'admin':
        sql = f"""
        select t.last_access, p.name, p.path, p.project_id
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
        select last_opened, name, path, project_id from project where user_id={current_user.user_id}
        order by last_opened desc;
        """
    db = get_db()
    c = db.cursor()
    c.execute(sql)
    rows = c.fetchall()
    history = []
    for row in rows:
        history.append({'last_opened': row[0], 'name': row[1], 'path': row[2], 'id': row[3]})

    return jsonify({"status": "success", "recentProjects": history})


def project_access(project_id):
    if current_user.role == 'admin':
        sql = f'insert into project_access_log(user_id,project_id,access_time) ' \
              f'values({current_user.user_id},{project_id},"{datetime.now().isoformat()}")'
    else:
        sql = f'update project set last_opened="{datetime.now().isoformat()}" where project_id={project_id}'

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
    return row[0]
