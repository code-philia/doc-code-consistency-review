from celery.result import AsyncResult
from flask import Blueprint, jsonify

from app.db import get_db

task_bp = Blueprint('task', __name__)


@task_bp.route('/get-progress/<task_id>', methods=['GET'])
def get_progress(task_id):
    from tasks import celery
    task_result = celery.AsyncResult(task_id)
    # print(f'task_result======================={task_result}')

    response = {
        "code": 0,
        "task_id": task_id,
        "state": task_result.state,
        "meta": task_result.info
    }
    #print(f'response============================{response}')
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
