from flask import Blueprint, jsonify

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
    # print(f'response============================{response}')
    return jsonify(response)
