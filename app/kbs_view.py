import json
import os

from flask import Blueprint, request, jsonify

from app.rag_chroma import rag_engine

kbs_bp = Blueprint('knowledge_base', __name__)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


@kbs_bp.route('/api/kb/file/delete', methods=['POST'])
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
