from celery.result import AsyncResult
from flask import Blueprint, jsonify, request
from flask_login import current_user

from app.db import get_db

task_bp = Blueprint('task', __name__)


@task_bp.route('/get-progress/<task_id>', methods=['GET'])
def get_progress(task_id):
    from tasks import celery
    task_result = celery.AsyncResult(task_id)
    # print(f'task_result======================={task_result}')
    meta = task_result.info
    if isinstance(meta, BaseException):
        meta = {
            "error_type": type(meta).__name__,
            "message": str(meta)
        }

    response = {
        "code": 0,
        "task_id": task_id,
        "state": task_result.state,
        # "meta": task_result.info
        "meta": meta
    }
    # print(f'response============================{response}')
    return jsonify(response)


@task_bp.route('/api/stop-task/<task_id>', methods=['POST'])
def stop_task(task_id):
    """
    停止指定的Celery任务
    """
    from tasks import celery as celery_app
    task = celery_app.AsyncResult(task_id)

    # if task.state in ['SUCCESS', 'FAILURE']:
    #     return jsonify({'status': 'error', 'message': '任务已结束，无法停止'}), 400

    # 撤销任务
    # terminate=True 如果任务正在运行，强制杀死worker子进程
    # signal='SIGTERM' (可选) 指定杀死进程的信号，默认是SIGTERM, 也可以用SIGKILL(更暴力)
    # persistent=True 重启后依然记得
    task.revoke(terminate=True, signal='SIGTERM')
    # task.revoke(terminate=True, persistent=True, signal='SIGTERM')

    return jsonify({'status': 'success', 'message': '已发送停止信号'})


@task_bp.route('/api/task-snapshot/<project_id>/<category>', methods=['GET'])
def get_task_snapshot(project_id, category):
    user_id = current_user.user_id
    is_admin = True if current_user.role == 'admin' else False

    db = get_db()
    cursor = db.cursor()
    if is_admin:
        cursor.execute("""SELECT task_id, next_task_id, task_type, task1_total, task2_total, current_total, 
                       current_progress, state, title, is_running
                       FROM user_task_snapshot
                       WHERE project_id = %s AND task_category = %s
                       LIMIT 1""", (int(project_id), category))
    else:
        cursor.execute("""SELECT task_id, next_task_id, task_type, task1_total, task2_total, current_total, 
                        current_progress, state, title, is_running
                        FROM user_task_snapshot
                        WHERE project_id = %s AND task_category = %s
                        LIMIT 1""", (int(project_id), category))

    row = cursor.fetchone()
    if not row:
        return jsonify({'status': 'success', 'data': None})

    return jsonify({
        'status': 'success',
        'data': {
            'taskId': row['task_id'],
            'nextTaskId': row['next_task_id'],
            'type': row['task_type'],
            'task1Total': row['task1_total'],
            'task2Total': row['task2_total'],
            'currentTotal': row['current_total'],
            'currentProgress': row['current_progress'],
            'state': row['state'],
            'title': row['title'],
            'isRunning': bool(row['is_running']),
        }
    })


@task_bp.route('/api/task-snapshot/clear', methods=['POST'])
def clear_task_snapshot():
    user_id = current_user.user_id
    project_id = request.json.get('project_id')
    category = request.json.get('category')
    is_admin = True if current_user.role == 'admin' else False
    db = get_db()
    cursor = db.cursor()
    if is_admin:
        cursor.execute("""
            UPDATE user_task_snapshot
            SET is_running = 0, state = 'SUCCESS'
            WHERE project_id = %s AND task_category = %s
        """, (project_id, category))
    else:
        cursor.execute("""
            UPDATE user_task_snapshot
            SET is_running = 0, state = 'SUCCESS'
            WHERE user_id = %s AND project_id = %s AND task_category = %s
        """, (user_id, project_id, category))

    return jsonify({'status': 'success'})
