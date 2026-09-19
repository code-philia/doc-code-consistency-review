from flask import Blueprint, request, jsonify
from .db import get_db
import logging
import json


details_bp = Blueprint('detail', __name__)


def _is_empty(value):
    """空值判断: None 或去除空白后为空的字符串视为空; 0 不算空值。"""
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    return False


@details_bp.route('/api/detail/updateRequirements', methods=['POST'])
def update_requirements():
    try:
        data = request.get_json(silent=True) or {}
        project_id = data.get("project_id")
        file_name = data.get("file_name")
        start = data.get("start")
        end = data.get("end")
        new_content = data.get("new_content")
        alignment_id = data.get("alignment_id")
        content_index = data.get("content_index")

        # ---- 1. 空值校验(0 不算空值) ------------------------------------
        fields = {
            "project_id": project_id,
            "file_name": file_name,
            "start": start,
            "end": end,
            "new_content": new_content,
            "alignment_id": alignment_id,
            "content_index": content_index,
        }
        empty_fields = [name for name, value in fields.items() if _is_empty(value)]
        if empty_fields:
            return (
                jsonify({"code": 400, "msg": f"参数不能为空: {', '.join(empty_fields)}"}),
                400,
            )

        # content_index 必须能安全转成整数(拒绝浮点数/布尔值/非数字字符串)
        if isinstance(content_index, bool) or not isinstance(content_index, (int, str)):
            return jsonify({"code": 400, "msg": "content_index 必须为整数"}), 400
        try:
            content_index = int(content_index)
        except (TypeError, ValueError):
            return jsonify({"code": 400, "msg": "content_index 必须为整数"}), 400

        db = get_db()
        cursor = db.cursor()

        # ---- 2. 更新 doc_blocks ------------------------------------------
        # 按 project_id + filename + start + end 定位, 不存在则整体失败
        cursor.execute(
            "SELECT id FROM doc_blocks "
            "WHERE project_id = %s AND filename = %s AND start = %s AND end = %s "
            "LIMIT 1",
            (project_id, file_name, start, end),
        )
        block = cursor.fetchone()
        if block is None:
            db.rollback()
            return (
                jsonify({"code": 404, "msg": "doc_blocks 中未找到匹配的数据，需求内容更新失败"}),
                404,
            )
        cursor.execute(
            "UPDATE doc_blocks "
            "SET content = %s, updatedAt = CURRENT_TIMESTAMP "
            "WHERE project_id = %s AND filename = %s AND start = %s AND end = %s",
            (new_content, project_id, file_name, start, end),
        )

        # ---- 3. 更新 alignments ------------------------------------------
        # 按 id + project_id 定位, 不存在则整体失败
        cursor.execute(
            "SELECT id, docRanges FROM alignments "
            "WHERE id = %s AND project_id = %s "
            "LIMIT 1",
            (alignment_id, project_id),
        )
        alignment = cursor.fetchone()
        if alignment is None:
            db.rollback()
            return (
                jsonify({"code": 404, "msg": "alignments 中未找到匹配的数据，需求内容更新失败"}),
                404,
            )

        raw = alignment.get("docRanges")
        try:
            doc_ranges = json.loads(raw) if raw else []
        except (TypeError, ValueError) as exc:
            raise ValueError(f"docRanges 不是合法的 JSON: {exc}") from exc
        if not isinstance(doc_ranges, list):
            raise ValueError("docRanges 解析后不是数组")

        # 通过 content_index 定位数组中的元素, 更新其 content 字段
        if not (0 <= content_index < len(doc_ranges)):
            db.rollback()
            return (
                jsonify(
                    {
                        "code": 400,
                        "msg": f"content_index {content_index} 超出 docRanges 范围"
                        f"(共 {len(doc_ranges)} 个元素)",
                    }
                ),
                400,
            )
        doc_ranges[content_index]["content"] = new_content

        cursor.execute(
            "UPDATE alignments SET docRanges = %s, updatedAt = CURRENT_TIMESTAMP WHERE id = %s",
            (json.dumps(doc_ranges, ensure_ascii=False), alignment["id"]),
        )

        # ---- 4. 两张表都更新成功, 统一提交 --------------------------------
        db.commit()
        return jsonify({"code": 200, "msg": "需求内容更新成功"}), 200

    except BaseException as exc:  # noqa: BLE001 —— 按需求捕获全部异常
        try:
            db.rollback()
        except Exception as e:
            pass
        # 打印失败原因(服务端日志)
        logging.error(f"[updateRequirements] 需求内容更新失败: {exc}", exc_info=True)
        # 如需把原因带回响应, 可改为: {"code": 500, "msg": "需求内容更新失败", "error": str(exc)}
        return jsonify({"code": 500, "msg": "需求内容更新失败"}), 500

    finally:
        cursor.close()