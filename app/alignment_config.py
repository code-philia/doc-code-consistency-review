from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


def _env_int(name: str, default: int, *, minimum: int | None = None) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, value) if minimum is not None else value


def _env_float(
    name: str,
    default: float,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


# 自动对齐时，从种子函数沿 caller/callee 扩展调用图的深度。
# 默认 2：比只看直接邻居有更高召回率；若结果过多或噪声大，可调为 1。
CALL_GRAPH_ALIGN_DEPTH = _env_int("CALL_GRAPH_ALIGN_DEPTH", 2, minimum=1)

# 自动对齐时，语义匹配阶段最多保留多少个种子代码块用于调用图扩展。
# 默认 3：控制调用图扩散起点数量；调大提高召回，调小提高精度和速度。
CALL_GRAPH_SEED_LIMIT = _env_int("CALL_GRAPH_SEED_LIMIT", 3, minimum=1)

# 自动对齐时，语义匹配结果成为调用图种子的最低相似度。
# 默认 0.75：低于该阈值的块不参与调用图扩展；调高会减少弱相关扩散。
CALL_GRAPH_MIN_SEED_SIMILARITY = _env_float(
    "CALL_GRAPH_MIN_SEED_SIMILARITY",
    0.75,
    minimum=0.0,
    maximum=1.0,
)

# 手动预览调用图时的默认查询深度。
# 默认 3：用于前端未显式传入 maxDepth 的情况；只影响预览默认值，不强制限制用户输入。
CALL_GRAPH_DEFAULT_PREVIEW_DEPTH = _env_int("CALL_GRAPH_DEFAULT_PREVIEW_DEPTH", 3, minimum=1)

# 调用图查询允许的最大深度。
# 默认 8：防止超大图拖慢响应或撑爆前端；调大需确认项目规模和浏览器渲染能力。
CALL_GRAPH_MAX_QUERY_DEPTH = _env_int("CALL_GRAPH_MAX_QUERY_DEPTH", 8, minimum=1)

# 调用图 rerank 后最多保留的 primary 代码块数量。
ALIGN_GRAPH_RERANK_PRIMARY_LIMIT = CALL_GRAPH_ALIGN_DEPTH

# 调用图 rerank 后最多保留的 supporting 代码块数量。
# supporting 表示调用者、被调用函数、辅助逻辑、配置/状态定义等；默认 2，用于控制上下文膨胀。
ALIGN_GRAPH_RERANK_SUPPORTING_LIMIT = _env_int("ALIGN_GRAPH_RERANK_SUPPORTING_LIMIT", 6, minimum=0)

# 调用图 rerank 后最终代码块总数上限。
# 默认等于 primary + supporting；即使模型返回更多结果，也会按相似度和角色裁剪到该上限。
ALIGN_GRAPH_RERANK_TOTAL_LIMIT = _env_int(
    "ALIGN_GRAPH_RERANK_TOTAL_LIMIT",
    ALIGN_GRAPH_RERANK_PRIMARY_LIMIT + ALIGN_GRAPH_RERANK_SUPPORTING_LIMIT,
    minimum=1,
)

# 调用图 rerank 结果的最低相似度。
# 默认 0.85：只保留模型认为强相关的结果；如果漏召回，可降到 0.75-0.80。
ALIGN_GRAPH_RERANK_MIN_SIMILARITY = _env_float(
    "ALIGN_GRAPH_RERANK_MIN_SIMILARITY",
    0.85,
    minimum=0.0,
    maximum=1.0,
)

# 调用图 rerank 的 LLM temperature。
# 默认 0.05：保持输出稳定和保守；调高会增加多样性，但可能导致结果不稳定。
ALIGN_GRAPH_RERANK_TEMPERATURE = _env_float(
    "ALIGN_GRAPH_RERANK_TEMPERATURE",
    0.05,
    minimum=0.0,
    maximum=2.0,
)

# 调用图 rerank 的 LLM nucleus sampling top_p。
# 默认 0.8：配合低 temperature 使用；通常不需要调整，过高可能增加不稳定输出。
ALIGN_GRAPH_RERANK_TOP_P = _env_float(
    "ALIGN_GRAPH_RERANK_TOP_P",
    0.8,
    minimum=0.0,
    maximum=1.0,
)

# 调用图 rerank 的最大输出 token 数。
# 默认 2048：足够返回若干 JSON 结果和 reason；如果候选很多或 reason 较长，可适当调大。
ALIGN_GRAPH_RERANK_MAX_TOKENS = _env_int("ALIGN_GRAPH_RERANK_MAX_TOKENS", 2048, minimum=1)

# 需求找代码时，代码文件摘要过多时每批交给模型筛选的文件数量。
# 默认 40：调小可降低单次 prompt 长度，调大可减少请求次数但更容易超过上下文或降低注意力。
ALIGN_FILE_ABSTRACT_BATCH_LIMIT = _env_int("ALIGN_FILE_ABSTRACT_BATCH_LIMIT", 40, minimum=1)
