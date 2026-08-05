import json
import os

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

from app.rag_chroma import rag_engine
from utils.kb_permission import kb_perm_required

kbs_bp = Blueprint('knowledge_base', __name__)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


@kbs_bp.route('/api/kb/file/delete', methods=['POST'])
@kb_perm_required(need="edit")
def delete_kb_item():
    """删除知识库文件"""

    data = request.json
    kb_name = data.get('kbName')
    kb_type = data.get('kbType')
    file_name = data.get('file_name')

    if not kb_name or not kb_type or not file_name:
        return jsonify({"status": "error", "message": "参数缺失"})

    result = rag_engine.delete_file(kb_type, kb_name, file_name)
    if result.get('status') == 'success':
        # Update metadata count
        try:
            kb_path = os.path.join(PROJECT_ROOT, "../rag_database", kb_name)
            meta_file = os.path.join(kb_path, "metadata.json")

            if os.path.exists(meta_file):
                with open(meta_file, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                meta['doc_count'] = result.get('remaining', 0)
                with open(meta_file, 'w', encoding='utf-8') as f:
                    json.dump(meta, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[KB] 更新元数据失败: {e}")

    return jsonify(result)


@kbs_bp.route('/api/kb/my-kbs', methods=['GET'])
@login_required
def my_kbs():
    """获取当前登录用户所有有使用权限的知识库"""
    kb_root = current_app.config["KB_ROOT"]

    kbs = []
    if os.path.exists(kb_root):
        user_id = str(current_user.get_id())
        is_admin = current_user.role == 'admin'

        for kb_name in os.listdir(kb_root):
            kb_path = os.path.join(kb_root, kb_name)
            if not os.path.isdir(kb_path):
                continue

            # 读 metadata
            meta_file = os.path.join(kb_path, 'metadata.json')
            meta = {}
            if os.path.exists(meta_file):
                try:
                    with open(meta_file, 'r', encoding='utf-8') as f:
                        meta = json.load(f)
                except Exception as e:
                    print(f"[KB] 读取元数据失败 {kb_name}: {e}")

            # 权限判断 (管理员/创建者放行; editors/viewers 为空=公开)
            if not is_admin and str(meta.get('owner', '')) != user_id:
                editors = [str(x) for x in (meta.get('editors') or [])]
                viewers = [str(x) for x in (meta.get('viewers') or [])]
                if editors or viewers:
                    if user_id not in editors and user_id not in viewers:
                        continue  # 无使用权限

            kbs.append({
                "name": kb_name,
                "type": meta.get('type', 'other'),
                'description': meta.get('description', ''),
                'doc_count': meta.get('doc_count', 0)
            })

    kbs.sort(key=lambda x: x['name'])
    return jsonify({'status': 'success', 'kbs': kbs})
