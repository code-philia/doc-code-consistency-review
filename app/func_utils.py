MODEL_CONFIG = {
    "modelA": {"name": "qwen3.8-27b", "url": "http://10.123.0.196:6025/v1"},
    "modelB": {"name": "qwen3.8-27b-w8a8", "url": "http://10.123.0.196:1025/v1"}
}

OPERATION_TYPES = {
    1: '需求反生成',
    2: '自动审查',
    3: '自动对齐 代码=>需求',
    4: '自动对齐 需求=>代码',
    5: '模型切换'
}


def get_model_data(model_type):
    data = {
        "name": MODEL_CONFIG['modelA']['name'],
        "url": MODEL_CONFIG[model_type]['url'],
    }
    if model_type in MODEL_CONFIG:
        data["name"] = MODEL_CONFIG[model_type]['name']
        data["url"] = MODEL_CONFIG[model_type]['url']

    return data


def record_user_operation(operation_type, current_user, logger, get_db, change_model=None):
    """
    通用操作日志记录函数。
    - operation_type: int，对应 OPERATION_TYPES 中的键。
    - 从会话中获取当前用户和模型key。
    - 日志写入失败不影响主业务。
    """
    try:
        # 获取当前登录用户信息，
        if not current_user.is_authenticated:
            logger.warning("记录操作日志失败：用户未认证")
            return False
        username = current_user.username
        userid = current_user.user_id
        model_key = current_user.default_model_key
        if not username or not model_key:
            logger.warning("记录操作日志失败：用户信息不完整")
            return False
        model_name = MODEL_CONFIG.get(model_key)['name']
        db = get_db()
        cursor = db.cursor()
        try:
            sql = """
                INSERT INTO user_operation_log (user_id, username, operation_type, model_key)
                VALUES (%s, %s, %s, %s)
            """
            operation_type_name = OPERATION_TYPES.get(operation_type)
            if change_model:
                change_model = MODEL_CONFIG.get(change_model)['name']
                # operation_type_name = f"{OPERATION_TYPES.get(operation_type)}到{change_model}"
                model_name = f"{model_name} —> {change_model}" 
            cursor.execute(sql, (userid, username, operation_type_name, model_name))
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.error(f"写入操作日志失败: {e}")
            return False
        finally:
            cursor.close()
    except Exception as e:
        logger.error(f"记录操作日志异常: {e}")
        return False