import inspect
import os
import json
from functools import wraps
from flask import jsonify, current_app, request
from flask_login import current_user   # 按你实际的登录方式调整导入


def load_kb_metadata(kb_name):
    """读取知识库 metadata.json，不存在返回 None"""
    kb_root = current_app.config["KB_ROOT"]
    meta_file = os.path.join(kb_root, kb_name, "metadata.json")
    print(f'meta_file: {meta_file}')
    if not os.path.exists(meta_file):
        print('没找到meta_file')
        return None
    with open(meta_file, encoding="utf-8") as f:
        return json.load(f)


def check_kb_perm(kb_name, need="view"):
    """
    校验当前用户对知识库的权限
    need: 'view' 使用权限 | 'edit' 编辑权限 | 'owner' 修改权限配置/删库
    返回 (是否有权限, metadata)
    规则：管理员和创建者放行；editors/viewers 都为空则所有人可见可编辑
    """
    meta = load_kb_metadata(kb_name)
    if meta is None:
        return False, None

    user_id = str(current_user.get_id())          # 按你 user 表字段调整
    is_admin = current_user.role == 'admin'

    # 管理员、创建者无视权限
    if is_admin or meta.get("owner") == user_id:
        return True, meta

    if need == "owner":
        return False, meta

    editors = [str(x) for x in meta.get("editors", [])]
    viewers = [str(x) for x in meta.get("viewers", [])]

    # 两个名单都为空：公开库，不做任何限制
    if not editors and not viewers:
        return True, meta

    if need == "edit":
        return user_id in editors, meta
    # view：在任一名单里即可
    return user_id in editors or user_id in viewers, meta


def get_param(*names, default=None):
    """按顺序从 JSON body 、表单、URL 参数中取第一个非 None 的值"""
    for name in names:
        # 1. JSON body
        if request.is_json:
            data = request.get_json(silent=True) or {}
            if data.get(name) is not None:
                return data.get(name)

        # 2. 表单
        if request.form.get(name) is not None:
            return request.form.get(name)

        # 3. URL 查询参数
        if request.args.get(name) is not None:
            return request.args.get(name)

    return default


def kb_perm_required(need="view"):
    """
    装饰器：加在接口上自动校验权限
    要求视图函数有 kb_name 参数（路由或表单/参数里带）
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            from flask import request
            # 优先从路由参数拿，其次从json/查询参数拿
            kb_name = get_param('name', 'kbName', 'oldName')

            if not kb_name:
                return jsonify({"status": "error", "message": "缺少知识库名称"}), 400

            allowed, meta = check_kb_perm(kb_name, need)
            if meta is None:
                return jsonify({"status": "error", "message": "知识库不存在"}), 404
            if not allowed:
                tip = {"view": "使用", "edit": "编辑", "owner": "管理"}[need]
                return jsonify({"status": "error", "message": f"您没有该知识库的{tip}权限"}), 403

            if "kb_meta" in inspect.signature(func).parameters:
                kwargs["kb_meta"] = meta   # 把 metadata 传给视图函数，省得再读一次
            return func(*args, **kwargs)
        return wrapper
    return decorator
