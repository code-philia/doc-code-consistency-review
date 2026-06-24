import os
import re
import json
import sys
from typing import Any, Dict, List, Optional
from flask_login import current_user
from dotenv import load_dotenv

# from app.views import logger
from .prompt import ALIGN_PROMPT_TEMPLATE, ALIGN_REQ_PROMPT_TEMPLATE, REVIEW_PROMPT_TEMPLATE, \
    REVIEW_PROMPT_TEMPLATE_KBS, GENERATE_PROMPT_TEMPLATE, ALIGN_PROMPT_TEMPLATE_ICL, \
    RULE_EXTRACTION_PROMPT, ISSUE_EXTRACTION_PROMPT, ABSTRACT_PROMPT_TEMPLATE, TOTAL_ABSTRACT_PROMPT_TEMPLATE, \
    CODEFILE_PROMPT_TEMPLATE, ALIGN_PROMPT_TEMPLATE_KBS, ALIGN_REQ_PROMPT_TEMPLATE_KBS, CODE_THINKING_PROMPT_TEMPLATE, \
    CODE_THINKING_PROMPT_TEMPLATE_KBS, DEFAULTS, FLOWCHART_MERMAID_PROMPT_TEMPLATE
from .prompt import Combine_Req2Code_Align_UserPrompt, Combine_Code2Req_Align_UserPrompt, Combine_Review_UserPrompt
from openai import OpenAI
from .utils import chunk_list
from .db import get_db_celery
import traceback

# 从项目根目录加载 .env
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

API_KEY = os.environ.get("API_KEY", "0")
# MODEL_NAME = os.environ.get("MODEL_NAME", "Qwen/Qwen3-8B")
# API_BASE_URL = os.environ.get("API_BASE_URL", "http://10.123.0.196:8001/v1")

API_BASE_URL = os.environ.get("API_BASE_URL", "http://10.123.0.196:8001/v1")
MODEL_NAME = "Qwen3-32B"

# API_BASE_URL = os.environ.get("API_BASE_URL", "http://192.168.0.68:8000/v1")
# MODEL_NAME = "/llm"

# API_BASE_URL = os.environ.get("API_BASE_URL", "http://10.123.0.230:7022/v1")
# MODEL_NAME = "qwen3.6-27b"

MAX_REQ = 3 # 最大重复次数


PROMPT_TYPE_KBS_MAP = {
    'Req2CodeAlign': 'Req2CodeAlignKbs',
    'Code2ReqAlign': 'Code2ReqAlignKbs',
    'review': 'reviewKbs',
    'reviewCode': 'reviewCodeKbs',
}
PROMPT_TYPE_FALLBACK_MAP = {
    'Req2CodeAlignKbs': 'Req2CodeAlign',
    'Code2ReqAlignKbs': 'Code2ReqAlign',
    'reviewKbs': 'review',
    'reviewCodeKbs': 'reviewCode',
}


def _stringify_content_part(part) -> str:
    if part is None:
        return ""
    if isinstance(part, str):
        return part
    if isinstance(part, list):
        return "\n".join(filter(None, (_stringify_content_part(item) for item in part)))
    if isinstance(part, dict):
        for key in ("text", "content", "output_text", "input_text", "reasoning_content"):
            value = part.get(key)
            if isinstance(value, str) and value.strip():
                return value
            if isinstance(value, dict):
                nested = _stringify_content_part(value)
                if nested:
                    return nested
        if isinstance(part.get("text"), dict):
            value = part["text"].get("value")
            if isinstance(value, str):
                return value
        return ""

    for attr in ("text", "content", "output_text", "input_text", "reasoning_content"):
        value = getattr(part, attr, None)
        if isinstance(value, str) and value.strip():
            return value
        if value is not None and not isinstance(value, str):
            nested = _stringify_content_part(value)
            if nested:
                return nested

    return ""


def _extract_message_text(message) -> str:
    if message is None:
        return ""

    content = getattr(message, "content", None)
    text = _stringify_content_part(content)
    if text.strip():
        return text.strip()

    reasoning = getattr(message, "reasoning_content", None)
    text = _stringify_content_part(reasoning)
    if text.strip():
        return text.strip()

    if hasattr(message, "model_dump"):
        dumped = message.model_dump()
        text = _stringify_content_part(dumped)
        if text.strip():
            return text.strip()

    return ""


def query_llm(message, history=None, temperature=0.1, top_p=0.9, max_tokens=1024):
    client = OpenAI(
        api_key=API_KEY,
        base_url=API_BASE_URL,
    )

    messages = []
    if history:
        for turn in history:
            role = turn.get("role", "user")
            if role not in ("system", "user", "assistant"):
                role = "user"
            messages.append({
                "role": role,
                "content": str(turn.get("content", ""))
            })

    messages.append({"role": "user", "content": str(message)})

    resp = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
    )
    #req = RequestLLM('')
    #res = req.request_qwen_14b_llm_output(message)

    text = ""
    if resp.choices and resp.choices[0].message:
        text = _extract_message_text(resp.choices[0].message)

    class Resp:
        pass
    r = Resp()
    r.content = (text or "").strip()

    return r


def _normalize_kb_type_for_use(raw_type: str) -> str:
    kb_type = (raw_type or "other").strip()
    if kb_type in ("rule", "coding_rule", "checklist"):
        return "rule"
    if kb_type in ("issue", "history_issue"):
        return "issue"
    if kb_type in ("align", "history_align"):
        return "align"
    return "other"
    
    
def _resolve_user_id(user_id=None):
    """优先使用显式 user_id；在请求上下文中再回退到 current_user。"""
    if user_id is not None:
        return user_id
    try:
        return current_user.user_id
    except Exception:
        return None


#def _load_selected_kbs(project_path: str, kb_type: str) -> List[str]:
def _load_selected_kb_entries(project_path: str) -> List[Dict[str, str]]:
    if not project_path:
        return []
    metadata_file = os.path.join(project_path, "metadata.json")
    if not os.path.exists(metadata_file):
        return []
    try:
        with open(metadata_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)
            
        entries = []
        for kb in metadata.get("selected_kbs", []):
            name = (kb or {}).get("name")
            if not name:
                continue
            entries.append({
                "name": name,
                "type": _normalize_kb_type_for_use((kb or {}).get("type"))
            })
        return entries
        
    except Exception:
        return []

def _has_any_selected_kb(project_path: str) -> bool:
    return len(_load_selected_kb_entries(project_path)) > 0

def _pick_template(
    row: Optional[Dict[str, Any]],
    use_kbs_template: bool,
    normal_key: str,
    kbs_key: str,
    normal_default: str,
    kbs_default: str
) -> str:
    if use_kbs_template:
        if row and row.get(kbs_key):
            return row.get(kbs_key)
        return kbs_default
    if row and row.get(normal_key):
        return row.get(normal_key)
    return normal_default


def _pick_template_with_meta(
    row: Optional[Dict[str, Any]],
    use_kbs_template: bool,
    normal_key: str,
    kbs_key: str,
    normal_default: str,
    kbs_default: str
):
    if use_kbs_template:
        if row and row.get(kbs_key):
            return row.get(kbs_key), kbs_key, "db"
        return kbs_default, kbs_key, "default"
    if row and row.get(normal_key):
        return row.get(normal_key), normal_key, "db"
    return normal_default, normal_key, "default"


def _resolve_prompt_type_for_kbs(prompt_type: Optional[str], project_path: Optional[str]) -> Optional[str]:
    if not prompt_type:
        return prompt_type
    if _has_any_selected_kb(project_path):
        return PROMPT_TYPE_KBS_MAP.get(prompt_type, prompt_type)
    return prompt_type


def _debug_print_review_prompt(stage: str, template_key: str, template_source: str, prompt: str,
                               use_kbs_template: bool, is_code_only_review: bool,
                               prompt_type: Optional[str] = None, project_path: Optional[str] = None):
    print("\n================ REVIEW PROMPT DEBUG BEGIN ================")
    print(f"stage={stage}")
    print(f"project_path={project_path or ''}")
    print(f"is_code_only_review={is_code_only_review}")
    print(f"use_kbs_template={use_kbs_template}")
    print(f"requested_prompt_type={prompt_type or ''}")
    print(f"resolved_template_key={template_key}")
    print(f"template_source={template_source}")
    print("prompt_content:")
    print(prompt)
    print("================= REVIEW PROMPT DEBUG END =================\n")
	
	
def _load_user_prompt_row(user_id: Optional[int], requested_fields: List[str]) -> Dict[str, Any]:
    if user_id is None:
        return {}
    db = None
    try:
        db = get_db_celery()
        c = db.cursor()
        c.execute("SHOW COLUMNS FROM prompt")
        columns_rows = c.fetchall() or []
        existing_columns = {row.get("Field") for row in columns_rows if row and row.get("Field")}
        available_fields = [f for f in requested_fields if f in existing_columns]
        if not available_fields:
            return {}
        sql = f"select {', '.join(available_fields)} from prompt where user_id=%s"
        c.execute(sql, (user_id,))
        # print('sql=====================', sql)
        row = c.fetchone() or {}
        return row if isinstance(row, dict) else {}
    except Exception:
        return {}
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


def _load_selected_kbs(project_path: str, kb_type: str) -> List[str]:
    entries = _load_selected_kb_entries(project_path)
    return [kb["name"] for kb in entries if kb.get("type") == kb_type and kb.get("name")]    

def _query_kb_items(
    query_text: str,
    kb_type: str,
    kb_names: List[str],
    top_k_per_kb: int = 3
) -> List[Dict[str, Any]]:
    if not query_text or not kb_names:
        return []
    try:
        from .rag_chroma import rag_engine
    except Exception:
        return []

    items: List[Dict[str, Any]] = []
    try:
        rag_engine.initialize()
    except Exception:
        pass

    for kb_name in kb_names:
        try:
            collection = rag_engine.get_collection(kb_type, kb_name)
            if not collection:
                continue
            results = collection.query(query_texts=[query_text], n_results=top_k_per_kb)
            if not results or not results.get("documents"):
                continue

            docs = results.get("documents", [[]])[0] or []
            metas = results.get("metadatas", [[]])[0] or []
            distances = results.get("distances", [[]])[0] or []
            for i, doc in enumerate(docs):
                items.append({
                    "kb_name": kb_name,
                    "doc": doc,
                    "meta": metas[i] if i < len(metas) else {},
                    "distance": distances[i] if i < len(distances) else 999.0
                })
        except Exception:
            continue

    items.sort(key=lambda x: x.get("distance", 999.0))
    return items


def _format_align_references(items: List[Dict[str, Any]], title: str) -> str:
    if not items:
        return "无可用知识库参考"
    parts = []
    for idx, item in enumerate(items[:5], 1):
        meta = item.get("meta") or {}
        req_text = item.get("doc", "") or meta.get("query_text", "")
        code_text = meta.get("code_text", "") or ""
        source_file = meta.get("source_file", "") or meta.get("source", "")
        part = (
            f"{title}{idx} (kb={item.get('kb_name', '')}, source={source_file}, distance={item.get('distance', 999.0)}):\n"
            f"[需求侧]\n{req_text}\n"
            f"[代码侧]\n{code_text}"
        )
        parts.append(part.strip())
    return "\n\n".join(parts)


def _build_align_reference_from_icl(icl_examples: List[Dict[str, Any]], title: str) -> str:
    if not icl_examples:
        return "无可用知识库参考"
    parts = []
    for idx, ex in enumerate(icl_examples[:5], 1):
        req_text = ex.get("query_text") or ex.get("content") or ""
        meta = ex.get("meta") or {}
        code_text = ex.get("code_text") or meta.get("code_text") or ""
        source_file = meta.get("source_file", "") or meta.get("source", "")
        distance = ex.get("score", ex.get("distance", ""))
        parts.append(
            f"{title}{idx} (source={source_file}, distance={distance}):\n"
            f"[需求侧]\n{req_text}\n"
            f"[代码侧]\n{code_text}"
        )
    return "\n\n".join(parts)


def _format_review_references(
    align_items: List[Dict[str, Any]],
    rules: Optional[List[Any]] = None,
    issues: Optional[List[Any]] = None
) -> str:
    parts = []
    if align_items:
        parts.append("历史对齐/审查案例：")
        for idx, item in enumerate(align_items[:5], 1):
            meta = item.get("meta") or {}
            parts.append(
                f"案例{idx} (kb={item.get('kb_name', '')}, source={meta.get('source_file', '')}, distance={item.get('distance', 999.0)}):\n"
                f"需求片段:\n{item.get('doc', '')}\n"
                f"代码片段:\n{meta.get('code_text', '')}"
            )
    if rules:
        parts.append(f"已检索到编码规范条目数: {len(rules)}")
    if issues:
        parts.append(f"已检索到历史问题条目数: {len(issues)}")
    return "\n\n".join(parts) if parts else "无可用历史审查/对齐记录"


def parse_abstract_output(response):
    """
    解析输出的JSON
    
    参数:
        response: LLM的完整响应文本
        
    """
    json_match = re.search(r'```(?:json)?\s*([\[\{].*?[\]\}])\s*```', response, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        json_match = re.search(r'([\[\{].*[\]\}])', response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = response.strip()

    data = _safe_json_loads(json_str)
    if isinstance(data, dict):
        return [data]
    elif isinstance(data, list):
        return data
    else:
        return []

def query_codefile_from_abstract(requirement, file_abstract):
    # 构造提示词
    template = CODEFILE_PROMPT_TEMPLATE
    prompt = template.format(
        req_content=requirement,
        file_abstract=file_abstract,
    )

    # 解析回复
    #response = query_llm(prompt)
    #llm_output = response.content
    # print("original llm output: ", llm_output)
    #parsed_output = parse_abstract_output(llm_output)
    # print("requirement: ", requirement)
    # print("parse output: ", parsed_output)
    
    
    # 多次解析回复
    max_req = MAX_REQ
    parsed_output = ""
    for attempt in range(max_req):
        response = query_llm(prompt)
        llm_output = response.content

        # print("original llm output: ", llm_output)
        try:
            parsed_output = parse_abstract_output(llm_output)
            # print("parsed llm output: ", parsed_output)
            return parsed_output
        except Exception as e:
            print(f"第{attempt+1}次调用大模型输出解析失败")
            print(e)
    print('已尝试多次，无法正确输出和解析摘要')    
    
    
    file_list = []
    similarity_results = []
    if (len(parsed_output) == 1):
        similarity_results = parsed_output
        file_list.append(parsed_output[0]['file'])
    elif (len(parsed_output) > 1):
        max_sim_results = []
        max_sim = -1.0
        for item in parsed_output:
            if not isinstance(item, dict):
                continue    
            if item['similarity'] >= max_sim:
                max_sim = item['similarity']
                if item['similarity'] == max_sim:
                    max_sim_results.append(item)
                elif item['similarity'] > max_sim:
                    max_sim_results = []
                    max_sim_results = [item]
            if item['similarity'] >= 0.85:
                similarity_results.append(item)
                file_list.append(item['file'])
        if len(similarity_results) == 0:
           similarity_results = max_sim_results
           if max_sim_results:
               file_list.append(max_sim_results[0]['file'])
    
    
    #print("************")   
    #print(similarity_results)   
    #print(file_list)
    
    return file_list        
        
        
def query_code_abstract(code_blocks):
    """
    基于大模型，实现代码块的摘要
    
    参数:
        code_blocks: 已经划分好的代码块
        
    返回:
        摘要信息
    """
    
    # 构造提示词
    template = ABSTRACT_PROMPT_TEMPLATE
    prompt = template.format(
        code_content=code_blocks
    )

    # 解析回复
    response = query_llm(prompt)
    llm_output = response.content
    #print("original llm output: ", llm_output)
    #parsed_output = parse_abstract_output(llm_output)
    #print("llm code abstract: ", parsed_output)
    
    return llm_output        
        

def query_codefile_abstract(code_abstracts):
    """
    基于大模型，实现代码文件的摘要
    
    参数:
        code_abstracts: 代码块摘要
        
    返回:
        摘要信息
    """
    # 拼接代码块功能描述
    abstracts = ""
    for item in code_abstracts:
        abstracts += item

    # 构造提示词
    template = ABSTRACT_PROMPT_TEMPLATE
    prompt = template.format(
        code_content=abstracts
    )

    # 解析回复
    response = query_llm(prompt)
    llm_output = response.content
    #print("original llm output: ", llm_output)
    
    return llm_output   
            
        
# ================= 对齐：查找相关代码块 =================
def query_related_code_block(
    requirement,
    code_blocks,
    icl_examples=None,
    user_id=None,
    project_path=None,
    reference_alignments=None
):
    """
    查询与需求点最相关的代码行号
    
    参数:
        requirement: 需求文本
        code_blocks: 已经划分好的代码块
        icl_examples: 检索到的上下文示例 (query_text, code_text)
        
    返回:
        相关行号列表
    """
    
    if icl_examples:
        # 使用检索到的第一个示例
        top = icl_examples[0]
        query_text = top.get("query_text")
        code_text = top.get("code_text")
        template = ALIGN_PROMPT_TEMPLATE_ICL
        prompt = template.format(
            req_content=requirement,
            code_content=code_blocks,
            icl_query_text=query_text,
            icl_code_text=code_text
        )
    else:
        resolved_user_id = _resolve_user_id(user_id)
        if reference_alignments is None and project_path:
            kb_names = _load_selected_kbs(project_path, "align")
            kb_items = _query_kb_items(requirement, "align", kb_names, top_k_per_kb=3)
            reference_alignments = _format_align_references(kb_items, "历史对齐参考")
        elif reference_alignments is None:
            reference_alignments = "无可用知识库参考"

        # 构造提示词
        use_kbs_template = _has_any_selected_kb(project_path)
        row = _load_user_prompt_row(resolved_user_id, ['Req2CodeAlign', 'Req2CodeAlignKbs'])

        template = _pick_template(
            row=row,
            use_kbs_template=use_kbs_template,
            normal_key='Req2CodeAlign',
            kbs_key='Req2CodeAlignKbs',
            normal_default=ALIGN_PROMPT_TEMPLATE,
            kbs_default=ALIGN_PROMPT_TEMPLATE_KBS
        )
        
        prompt = template.format(
            req_content=requirement,
            code_content=code_blocks,
            reference_alignments=reference_alignments
        )

    # 多次解析回复
    max_req = MAX_REQ
    parsed_output = ""
    for attempt in range(max_req):
        response = query_llm(prompt)
        llm_output = response.content
        #print("original llm response: ", response)
        #print("original llm output: ", llm_output)
        try:
            parsed_output = parse_alignment_output(llm_output)
            #print("parsed llm output: ", parsed_output)
            return parsed_output
        except Exception as e:
            print(f"第{attempt+1}次调用大模型输出解析失败")
            print(e)
    print('已尝试多次，无法正确输出和解析结果')        
    return parsed_output

def query_related_code(
    requirement,
    code_blocks,
    block_limit=None,
    icl_examples=None,
    user_id=None,
    project_path=None,
    reference_alignments=None
):
    if block_limit:
        chunked_code_blocks = chunk_list(code_blocks, block_limit)
        
        related_code_blocks = []
        for c in chunked_code_blocks:
            res = query_related_code_block(
                requirement,
                c,
                icl_examples,
                user_id=user_id,
                project_path=project_path,
                reference_alignments=reference_alignments
            )
            related_code_blocks.extend(res)
        
        #print(related_code_blocks)
        similarity_results = []
        if (len(related_code_blocks) == 1):
            similarity_results = related_code_blocks
        elif (len(related_code_blocks) > 1):
            max_sim_results = []
            max_sim = -1.0
            for item in related_code_blocks:
                if not isinstance(item, dict):
                    continue
                if item['similarity'] >= max_sim:
                    max_sim = item['similarity']
                    if item['similarity'] == max_sim:
                        max_sim_results.append(item)
                    elif item['similarity'] > max_sim:
                        max_sim_results = []
                        max_sim_results = [item]
                if item['similarity'] >= 0.9:
                    similarity_results.append(item)
            if len(similarity_results) == 0:
               similarity_results = max_sim_results  
        
        
        #print("************")   
        #print(similarity_results)   
        return similarity_results
    else:
        return query_related_code_block(
            requirement,
            code_blocks,
            icl_examples,
            user_id=user_id,
            project_path=project_path,
            reference_alignments=reference_alignments
        )
    
    
    
# ================= 对齐：参考用户反馈，根据需求块查找相关代码块 =================
def query_related_code_block_by_feedback(
    requirement,
    code_blocks,
    codeRanges,
    user_prompt,
    user_id=None,
    project_path=None,
    reference_alignments=None
):
    """
    查询与需求点最相关的代码行号
    
    参数:
        requirement: 需求文本
        code_blocks: 已经划分好的代码块
        codeRanges: 上一次对齐的代码块
        user_prompt: 用户补充输入的提示词，即用户反馈
        
        
    返回:
        相关行号列表
    """

    # 构造提示词
    resolved_user_id = _resolve_user_id(user_id)
    use_kbs_template = _has_any_selected_kb(project_path)
    row = _load_user_prompt_row(resolved_user_id, ['Req2CodeAlign', 'Req2CodeAlignKbs'])
    
    #将用户输入的提示词结合到已有的结果中，形成新的提示词
    #准备加到已有提示词的前面，用于优化大模型的输出
    if reference_alignments is None and project_path:
        kb_names = _load_selected_kbs(project_path, "align")
        kb_items = _query_kb_items(requirement, "align", kb_names, top_k_per_kb=3)
        reference_alignments = _format_align_references(kb_items, "历史对齐参考")
    elif reference_alignments is None:
        reference_alignments = "无可用知识库参考"
    
    original_template = _pick_template(
        row=row,
        use_kbs_template=use_kbs_template,
        normal_key='Req2CodeAlign',
        kbs_key='Req2CodeAlignKbs',
        normal_default=ALIGN_PROMPT_TEMPLATE,
        kbs_default=ALIGN_PROMPT_TEMPLATE_KBS
    )
    original_prompt = original_template.format(
        req_content=requirement,
        code_content=code_blocks,
        reference_alignments=reference_alignments
    )

    template = Combine_Req2Code_Align_UserPrompt
    prompt = template.format(
        original_prompt=original_prompt,
        doc_range=requirement,
        code_ranges=codeRanges,
        user_feedback=user_prompt
    )
    #print(prompt)
    

    # 多次解析回复
    max_req = MAX_REQ
    parsed_output = ""
    for attempt in range(max_req):
        response = query_llm(prompt)
        llm_output = response.content
        #print("original llm output: ", llm_output)
        try:
            parsed_output = parse_alignment_output(llm_output)
            # print("parsed llm output: ", parsed_output)
            return parsed_output
        except Exception as e:
            print(f"第{attempt+1}次调用大模型输出解析失败")
            print(e)
    print('已尝试多次，无法正确输出和解析结果')        
    
    return parsed_output    
    
    
def query_related_code_by_feedback(
    requirement,
    code_blocks,
    codeRanges,
    user_prompt,
    block_limit=None,
    user_id=None,
    project_path=None,
    reference_alignments=None
):

    if block_limit:
        chunked_code_blocks = chunk_list(code_blocks, block_limit)
        
        related_code_blocks = []
        for c in chunked_code_blocks:
            res = query_related_code_block_by_feedback(
                requirement,
                c,
                codeRanges,
                user_prompt,
                user_id=user_id,
                project_path=project_path,
                reference_alignments=reference_alignments
            )
            related_code_blocks.extend(res)
        
        #print(related_code_blocks)
        similarity_results = []
        if (len(related_code_blocks) == 1):
            similarity_results = related_code_blocks
        elif (len(related_code_blocks) > 1):
            max_sim_results = []
            max_sim = -1.0
            for item in related_code_blocks:
                if not isinstance(item, dict):
                    continue
                if item['similarity'] >= max_sim:
                    max_sim = item['similarity']
                    if item['similarity'] == max_sim:
                        max_sim_results.append(item)
                    elif item['similarity'] > max_sim:
                        max_sim_results = []
                        max_sim_results = [item]
                if item['similarity'] >= 0.9:
                    similarity_results.append(item)
            if len(similarity_results) == 0:
               similarity_results = max_sim_results  
        
        
        #print("************")   
        #print(similarity_results)   
        return similarity_results
    else:
        return query_related_code_block_by_feedback(
            requirement,
            code_blocks,
            codeRanges,
            user_prompt,
            user_id=user_id,
            project_path=project_path,
            reference_alignments=reference_alignments
        )


# ================= 对齐 根据代码块查找相关需求块 =================
def query_related_requirement_block(
    code,
    req_blocks,
    user_id=None,
    icl_examples=None,
    project_path=None,
    reference_alignments=None
):
    """
    查询与代码最相关的需求块
    
    参数:
        code: 代码内容
        req_blocks: 需求块列表
        
    返回:
        相关需求块列表
    """
    resolved_user_id = _resolve_user_id(user_id)
    if reference_alignments is None and icl_examples:
        reference_alignments = _build_align_reference_from_icl(icl_examples, "历史对齐参考")
    elif reference_alignments is None and project_path:
        kb_names = _load_selected_kbs(project_path, "align")
        kb_items = _query_kb_items(code, "align", kb_names, top_k_per_kb=3)
        reference_alignments = _format_align_references(kb_items, "历史对齐参考")
    elif reference_alignments is None:
        reference_alignments = "无可用知识库参考"

    # 构造提示词
    # template = ALIGN_REQ_PROMPT_TEMPLATE
    use_kbs_template = _has_any_selected_kb(project_path)
    row = _load_user_prompt_row(resolved_user_id, ['Code2ReqAlign', 'Code2ReqAlignKbs'])

    template = _pick_template(
        row=row,
        use_kbs_template=use_kbs_template,
        normal_key='Code2ReqAlign',
        kbs_key='Code2ReqAlignKbs',
        normal_default=ALIGN_REQ_PROMPT_TEMPLATE,
        kbs_default=ALIGN_REQ_PROMPT_TEMPLATE_KBS
    )
    
    prompt = template.format(
        code_content=code,
        req_content=req_blocks,
        reference_alignments=reference_alignments
    )

    # 解析回复
    #response = query_llm(prompt)
    #llm_output = response.content
    #print("original llm output (req): ", llm_output)
    #parsed_output = parse_output(llm_output)
    #print("parsed llm output (req): ", parsed_output)
    
    # 多次解析回复
    max_req = MAX_REQ
    parsed_output = ""
    for attempt in range(max_req):
        response = query_llm(prompt)
        llm_output = response.content

        # print("original llm output: ", llm_output)
        try:
            parsed_output = parse_alignment_output(llm_output)
            # print("parsed llm output: ", parsed_output)
            return parsed_output
        except Exception as e:
            print(f"第{attempt+1}次调用大模型输出解析失败")
            print(e)
    print('已尝试多次，无法正确输出和解析结果')        
    
    
    return parsed_output

def query_related_requirement(
    code,
    req_blocks,
    block_limit=None,
    user_id=None,
    icl_examples=None,
    project_path=None,
    reference_alignments=None
):
    if block_limit:
        chunked_req_blocks = chunk_list(req_blocks, block_limit)
        
        related_req_blocks = []
        for c in chunked_req_blocks:
            res = query_related_requirement_block(
                code,
                c,
                user_id,
                icl_examples=icl_examples,
                project_path=project_path,
                reference_alignments=reference_alignments
            )
            related_req_blocks.extend(res)
        
        #print(related_req_blocks)
        similarity_results = []
        if (len(related_req_blocks) == 1):
            similarity_results = related_req_blocks
        elif (len(related_req_blocks) > 1):
            max_sim_results = []
            max_sim = -1.0
            for item in related_req_blocks:
                if not isinstance(item, dict):
                    continue
                if item.get('similarity', 0) >= max_sim:
                    max_sim = item.get('similarity', 0)
                    if item.get('similarity', 0) == max_sim:
                        max_sim_results.append(item)
                    elif item.get('similarity', 0) > max_sim:
                        max_sim_results = []
                        max_sim_results = [item]
                if item.get('similarity', 0) >= 0.9:
                    similarity_results.append(item)
            if len(similarity_results) == 0:
               similarity_results = max_sim_results  
        
        #print("************")   
        #print(similarity_results)   
        return similarity_results
    else:
        return query_related_requirement_block(
            code,
            req_blocks,
            user_id,
            icl_examples=icl_examples,
            project_path=project_path,
            reference_alignments=reference_alignments
        )

        
# ================= 对齐 参考用户反馈，根据代码块查找相关需求块 =================
def query_related_requirement_block_by_feedback(
    code,
    docRanges,
    req_blocks,
    user_prompt,
    user_id=None,
    icl_examples=None,
    project_path=None,
    reference_alignments=None
):
    """
    查询与代码最相关的需求块
    
    参数:
        code: 代码内容
        req_blocks: 需求块列表
        
    返回:
        相关需求块列表
    """
    resolved_user_id = _resolve_user_id(user_id)
    if reference_alignments is None and icl_examples:
        reference_alignments = _build_align_reference_from_icl(icl_examples, "历史对齐参考")
    elif reference_alignments is None and project_path:
        kb_names = _load_selected_kbs(project_path, "align")
        kb_items = _query_kb_items(code, "align", kb_names, top_k_per_kb=3)
        reference_alignments = _format_align_references(kb_items, "历史对齐参考")
    elif reference_alignments is None:
        reference_alignments = "无可用知识库参考"

    # 构造提示词
    # template = ALIGN_REQ_PROMPT_TEMPLATE

    #将用户输入的提示词结合到已有的结果中，形成新的提示词
    #准备加到已有提示词的前面，用于优化大模型的输出

    use_kbs_template = _has_any_selected_kb(project_path)
    row = _load_user_prompt_row(resolved_user_id, ['Code2ReqAlign', 'Code2ReqAlignKbs'])
    original_template = _pick_template(
        row=row,
        use_kbs_template=use_kbs_template,
        normal_key='Code2ReqAlign',
        kbs_key='Code2ReqAlignKbs',
        normal_default=ALIGN_REQ_PROMPT_TEMPLATE,
        kbs_default=ALIGN_REQ_PROMPT_TEMPLATE_KBS
    )
    
    original_prompt = original_template.format(
        code_content=code,
        req_content=req_blocks,
        reference_alignments=reference_alignments
    )

    template = Combine_Code2Req_Align_UserPrompt
    prompt = template.format(
        original_prompt=original_prompt,
        code_content=code,
        req_content=docRanges,
        user_feedback=user_prompt
    )
    #print(prompt)
    
 
    # 多次解析回复
    max_req = MAX_REQ
    parsed_output = ""
    for attempt in range(max_req):
        response = query_llm(prompt)
        llm_output = response.content
        #print("original llm output: ", llm_output)
        try:
            parsed_output = parse_alignment_output(llm_output)
            # print("parsed llm output: ", parsed_output)
            return parsed_output
        except Exception as e:
            print(f"第{attempt+1}次调用大模型输出解析失败")
            print(e)
    print('已尝试多次，无法正确输出和解析结果')        
    
    return parsed_output


def query_related_requirement_by_feedback(
    code,
    docRanges,
    req_blocks,
    user_prompt,
    block_limit=None,
    user_id=None,
    icl_examples=None,
    project_path=None,
    reference_alignments=None
):
    if block_limit:
        chunked_req_blocks = chunk_list(req_blocks, block_limit)
        
        related_req_blocks = []
        for c in chunked_req_blocks:
            res = query_related_requirement_block_by_feedback(
                code,
                docRanges,
                c,
                user_prompt,
                user_id,
                icl_examples=icl_examples,
                project_path=project_path,
                reference_alignments=reference_alignments
            )
            related_req_blocks.extend(res)
        
        #print(related_req_blocks)
        similarity_results = []
        if (len(related_req_blocks) == 1):
            similarity_results = related_req_blocks
        elif (len(related_req_blocks) > 1):
            max_sim_results = []
            max_sim = -1.0
            for item in related_req_blocks:
                if not isinstance(item, dict):
                    continue
                if item.get('similarity', 0) >= max_sim:
                    max_sim = item.get('similarity', 0)
                    if item.get('similarity', 0) == max_sim:
                        max_sim_results.append(item)
                    elif item.get('similarity', 0) > max_sim:
                        max_sim_results = []
                        max_sim_results = [item]
                if item.get('similarity', 0) >= 0.9:
                    similarity_results.append(item)
            if len(similarity_results) == 0:
               similarity_results = max_sim_results  
        
        #print("************")   
        #print(similarity_results)   
        return similarity_results
    else:
        return query_related_requirement_block_by_feedback(
            code,
            docRanges,
            req_blocks,
            user_prompt,
            user_id,
            icl_examples=icl_examples,
            project_path=project_path,
            reference_alignments=reference_alignments
        )
        
        
def parse_alignment_output(response):
    """
    解析对齐输出的JSON
    
    参数:
        response: LLM的完整响应文本
        
    """
    json_match = re.search(r'```(?:json)?\s*([\[\{].*?[\]\}])\s*```', response, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        json_match = re.search(r'([\[\{].*[\]\}])', response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = response.strip()

    data = _safe_json_loads(json_str)
    if isinstance(data, dict):
        return [data]
    elif isinstance(data, list):
        return data
    else:
        return []    
        
        
def parse_output(response):
    """
    解析对齐输出的JSON
    
    参数:
        response: LLM的完整响应文本
        
    """
    try:
        json_match = re.search(r'```(?:json)?\s*([\[\{].*?[\]\}])\s*```', response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_match = re.search(r'([\[\{].*[\]\}])', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_str = response.strip()

        data = _safe_json_loads(json_str)
        if isinstance(data, dict):
            return [data]
        elif isinstance(data, list):
            return data
        else:
            return []
    except (json.JSONDecodeError, AttributeError) as e:
        #print(response)
        print(f"解析对齐输出失败: {e}")
        return []


# ================= 审查：根据用户反馈，审查相关代码 =================
def query_review_result_by_feedback(
    requirement,
    related_code,
    review_thought,
    user_prompt,
    rules=None,
    issues=None,
    user_id=None,
    project_path=None,
    reference_reviews=None,
    prompt_type=None
):
    """
    执行代码一致性审查
    
    参数:
        requirement: 需求内容
        related_code: 相关代码块列表，每个代码块包含文件名、内容等信息
        review_thought: 上一轮的审查结果
        user_prompt: 用户输入的提示词，即用户反馈
        
    返回:
        review_process: 审查过程
        issue: 问题单 (字典) 或 None
    """
    # 1. 拼接需求和代码上下文
    requirement_context = "\n".join(
        f"需求片段来源: {block.get('filename', 'unknown')} ，内容:\n{block.get('content', '')}"
        for block in requirement
    )
    
    code_context = "\n\n".join(
        f"代码片段来源: {block.get('filename', 'unknown')}，内容:\n{block.get('content', '')}"
        for block in related_code
    )
    
    # 2. 知识库上下文
    reference_rules = "无相关编码规范"
    if rules:
        rule_list = []
        for idx, rule in enumerate(rules, 1):
            # 支持字符串或字典格式
            if isinstance(rule, str):
                rule_str = f"参考规则 {idx}: {rule}"
            else:
                rule_str = f"参考规则 {idx}: {json.dumps(rule, ensure_ascii=False)}"
            rule_list.append(rule_str)
        reference_rules = "\n\n".join(rule_list)
        
    reference_issues = "无相关历史问题单"
    if issues:
        issue_list = []
        for idx, issue in enumerate(issues, 1):
            if isinstance(issue, str):
                issue_str = f"参考问题单 {idx}: {issue}"
            else:
                issue_str = f"参考问题单 {idx}: {json.dumps(issue, ensure_ascii=False)}"
            issue_list.append(issue_str)
        reference_issues = "\n\n".join(issue_list)

    if reference_reviews is None and project_path:
        query_text = f"{requirement_context}\n{code_context}"
        align_kbs = _load_selected_kbs(project_path, "align")
        align_items = _query_kb_items(query_text, "align", align_kbs, top_k_per_kb=3)
        reference_reviews = _format_review_references(align_items, rules=rules, issues=issues)
    elif reference_reviews is None:
        reference_reviews = "无可用历史审查/对齐记录"

    # 3. 构造提示词
    resolved_user_id = _resolve_user_id(user_id)
    use_kbs_template = _has_any_selected_kb(project_path)

    is_code_only_review = not requirement and bool(related_code)
    if is_code_only_review:
        row = _load_user_prompt_row(resolved_user_id, ['reviewCode', 'reviewCodeKbs'])
        original_template, original_template_key, original_template_source = _pick_template_with_meta(
            row=row,
            use_kbs_template=use_kbs_template,
            normal_key='reviewCode',
            kbs_key='reviewCodeKbs',
            normal_default=CODE_THINKING_PROMPT_TEMPLATE,
            kbs_default=CODE_THINKING_PROMPT_TEMPLATE_KBS
        )
    else:
        row = _load_user_prompt_row(resolved_user_id, ['review', 'reviewKbs'])
        original_template, original_template_key, original_template_source = _pick_template_with_meta(
            row=row,
            use_kbs_template=use_kbs_template,
            normal_key='review',
            kbs_key='reviewKbs',
            normal_default=REVIEW_PROMPT_TEMPLATE,
            kbs_default=REVIEW_PROMPT_TEMPLATE_KBS
        )
	
	
    original_prompt = original_template.format(
        requirement=requirement_context,
        related_code=code_context,
        reference_rules=reference_rules,
        reference_issues=reference_issues,
        reference_reviews=reference_reviews
    )
    
    template = Combine_Review_UserPrompt
    prompt = template.format(
        original_prompt=original_prompt,
        review_thought=review_thought,
        user_feedback=user_prompt
    )
    #print(prompt)
	
    # _debug_print_review_prompt(
        # stage="query_review_result_by_feedback",
        # template_key=original_template_key,
        # template_source=original_template_source,
        # prompt=prompt,
        # use_kbs_template=use_kbs_template,
        # is_code_only_review=is_code_only_review,
        # project_path=project_path
    # )
    
    # 4. 调用LLM
    try:
        #response = query_llm(prompt)
        #print("LLM response for review:", response.content)
        #parsed_output = parse_review_output(response.content)
        
        # 多次解析回复
        max_req = MAX_REQ
        parsed_output = ""
        for attempt in range(max_req):
            response = query_llm(prompt)
            try:
                parsed_output = parse_review_output(response.content)
                # print("parsed llm output: ", parsed_output)
                return parsed_output.get('review_process'), parsed_output.get('issue')
            except Exception as e:
                print(f"第{attempt+1}次调用大模型输出解析失败")
                print(e)
        print('已尝试多次，无法正确输出和解析结果')
        
        return parsed_output.get('review_process'), parsed_output.get('issue')
        
    except Exception as e:
        traceback.print_exc()
        print(f"审查过程中出错: {str(e)}")
        return f"审查过程中发生错误，请在右键菜单选择“审查”，将执行重新审查。", None        
 
 
 
# ================= 审查 相关代码 =================
def query_review_result(
    requirement,
    related_code,
    rules=None,
    issues=None,
    user_id=None,
    project_path=None,
    reference_reviews=None,
    prompt_type=None
):
    """
    执行代码一致性审查
    
    参数:
        requirement: 需求内容
        related_code: 相关代码块列表，每个代码块包含文件名、内容等信息
        
    返回:
        review_process: 审查过程
        issue: 问题单 (字典) 或 None
    """
    # 1. 拼接需求和代码上下文
    requirement_context = "\n".join(
        f"需求片段来源: {block.get('filename', 'unknown')} ，内容:\n{block.get('content', '')}"
        for block in requirement
    )
    
    code_context = "\n\n".join(
        f"代码片段来源: {block.get('filename', 'unknown')}，内容:\n{block.get('content', '')}"
        for block in related_code
    )
    
    # 2. 知识库上下文
    reference_rules = "无相关编码规范"
    if rules:
        rule_list = []
        for idx, rule in enumerate(rules, 1):
            # 支持字符串或字典格式
            if isinstance(rule, str):
                rule_str = f"参考规则 {idx}: {rule}"
            else:
                rule_str = f"参考规则 {idx}: {json.dumps(rule, ensure_ascii=False)}"
            rule_list.append(rule_str)
        reference_rules = "\n\n".join(rule_list)
        
    reference_issues = "无相关历史问题单"
    if issues:
        issue_list = []
        for idx, issue in enumerate(issues, 1):
            if isinstance(issue, str):
                issue_str = f"参考问题单 {idx}: {issue}"
            else:
                issue_str = f"参考问题单 {idx}: {json.dumps(issue, ensure_ascii=False)}"
            issue_list.append(issue_str)
        reference_issues = "\n\n".join(issue_list)

    if reference_reviews is None and project_path:
        query_text = f"{requirement_context}\n{code_context}"
        align_kbs = _load_selected_kbs(project_path, "align")
        align_items = _query_kb_items(query_text, "align", align_kbs, top_k_per_kb=3)
        reference_reviews = _format_review_references(align_items, rules=rules, issues=issues)
    elif reference_reviews is None:
        reference_reviews = "无可用历史审查/对齐记录"

    # 3. 构造提示词
    resolved_user_id = _resolve_user_id(user_id)
    use_kbs_template = _has_any_selected_kb(project_path)

    is_code_only_review = not requirement and bool(related_code)
    resolved_prompt_type = _resolve_prompt_type_for_kbs(prompt_type, project_path)
	
	
    if is_code_only_review:
        row = _load_user_prompt_row(resolved_user_id, ['reviewCode', 'reviewCodeKbs'])
    else:
        row = _load_user_prompt_row(resolved_user_id, ['review', 'reviewKbs'])

    if resolved_prompt_type:
        template = get_prompt(resolved_prompt_type, resolved_user_id)
        template_key = resolved_prompt_type
        template_source = "db_or_default_by_prompt_type"
    elif is_code_only_review:
        template, template_key, template_source = _pick_template_with_meta(
            row=row,
            use_kbs_template=use_kbs_template,
            normal_key='reviewCode',
            kbs_key='reviewCodeKbs',
            normal_default=CODE_THINKING_PROMPT_TEMPLATE,
            kbs_default=CODE_THINKING_PROMPT_TEMPLATE_KBS
        )
    else:
        template, template_key, template_source = _pick_template_with_meta(
            row=row,
            use_kbs_template=use_kbs_template,
            normal_key='review',
            kbs_key='reviewKbs',
            normal_default=REVIEW_PROMPT_TEMPLATE,
            kbs_default=REVIEW_PROMPT_TEMPLATE_KBS
        )
    # print('template=======================', template)
    prompt = template.format(
        requirement=requirement_context,
        related_code=code_context,
        reference_rules=reference_rules,
        reference_issues=reference_issues,
        reference_reviews=reference_reviews
    )
	
	# _debug_print_review_prompt(
        # stage="query_review_result",
        # template_key=template_key,
        # template_source=template_source,
        # prompt=prompt,
        # use_kbs_template=use_kbs_template,
        # is_code_only_review=is_code_only_review,
        # prompt_type=prompt_type,
        # project_path=project_path
    # )
    
    # 4. 调用LLM
    try:
        #response = query_llm(prompt)
        #print("LLM response for review:", response.content)
        #parsed_output = parse_review_output(response.content)
        
        # 多次解析回复
        max_req = MAX_REQ
        parsed_output = ""
        for attempt in range(max_req):
            response = query_llm(prompt)
            try:
                parsed_output = parse_review_output(response.content)
                # print("parsed llm output: ", parsed_output)
                return parsed_output.get('review_process'), parsed_output.get('issue')
            except Exception as e:
                print(f"第{attempt+1}次调用大模型输出解析失败")
                print(e)
        print('已尝试多次，无法正确输出和解析结果')       
 
        return parsed_output.get('review_process'), parsed_output.get('issue')
        
    except Exception as e:
        print(f"审查过程中出错: {str(e)}")
        #return f"审查过程中发生错误: {e}", None
        return f"审查过程中发生错误，请在右键菜单选择“审查”，将执行重新审查。", None 


def get_prompt(prompt_type, user_id):
    """
    prompt_type: reviewCode 数据库中的字段类型
    根据提示词字段获取提示词，如果没有就返回该提示词类型的默认提示词
    """
    db = get_db_celery()
    c = db.cursor()
    #sql = f"select {prompt_type} from prompt where user_id={user_id}"
    effective_field = prompt_type
    row = None
    try:
        #c.execute(sql)
		#row = row.get(prompt_type)
        c.execute("SHOW COLUMNS FROM prompt")
        columns_rows = c.fetchall() or []
        existing_columns = {item.get("Field") for item in columns_rows if item and item.get("Field")}
        if effective_field not in existing_columns:
            effective_field = PROMPT_TYPE_FALLBACK_MAP.get(prompt_type, prompt_type)
        sql = f"select {effective_field} from prompt where user_id=%s"
        c.execute(sql, (user_id,))
        row = c.fetchone()

        row = row.get(effective_field) if row else None

    except Exception as e:
        print(f'查询出错:{e}')
    finally:
        db.close()
    if not row:
        row = DEFAULTS.get(prompt_type)
    return row

# def parse_review_output(response):
    # """
    # 解析审查输出的JSON
    
    # 参数:
        # response: LLM的完整响应文本
        
    # 返回:
        # 包含 "review_process" 和 "issue" 的字典
    # """
    # try:
        # # 提取Markdown代码块中的JSON
        # json_match = re.search(r'```(?:json)?\s*({.*?})\s*```', response, re.DOTALL)
        # if json_match:
            # json_str = json_match.group(1)
        # else:
            # json_match = re.search(r'({.*})', response, re.DOTALL)
            # if json_match:
                # json_str = json_match.group(1)
            # else:
                # json_str = response

        # data = _safe_json_loads(json_str)
        # return {
            # "review_process": data.get("review_process", "未能解析出审查过程。"),
            # "issue": data.get("issue")
        # }
    # except (json.JSONDecodeError, AttributeError) as e:
        # print(f"解析审查输出失败: {e}")
        # return {
            # "review_process": response,
            # "issue": None
        # }

def parse_review_output(response):
    """
    解析审查输出的JSON
    
    参数:
        response: LLM的完整响应文本
        
    返回:
        包含 "review_process" 和 "issue" 的字典
    """
    # 提取Markdown代码块中的JSON
    json_match = re.search(r'```(?:json)?\s*({.*?})\s*```', response, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        json_match = re.search(r'({.*})', response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = response

    data = _safe_json_loads(json_str)
    return {
        "review_process": data.get("review_process", "未能解析出审查过程。"),
        "issue": data.get("issue")
    }
 

def _repair_json_text(text: str) -> str:
    s = text or ""
    out = []
    in_string = False
    i = 0
    allowed_escapes = {'"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'}

    while i < len(s):
        ch = s[i]

        if not in_string:
            out.append(ch)
            if ch == '"':
                in_string = True
            i += 1
            continue

        if ch == '"':
            backslashes = 0
            j = i - 1
            while j >= 0 and s[j] == '\\':
                backslashes += 1
                j -= 1
            out.append(ch)
            if backslashes % 2 == 0:
                in_string = False
            i += 1
            continue

        if ch == '\n' or ch == '\r':
            out.append('\\n')
            i += 1
            continue

        if ch == '\\':
            nxt = s[i + 1] if i + 1 < len(s) else ''
            if not nxt or nxt not in allowed_escapes:
                out.append('\\\\')
                i += 1
                continue

        out.append(ch)
        i += 1

    return ''.join(out)


def _safe_json_loads(text: str):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        repaired = _repair_json_text(text)
        return json.loads(repaired)

# ================= 需求反生成 =================
def query_generated_requirement(related_code, reference_requirement=""):
    """
    根据相关代码生成需求
    
    Args:
        related_code: 相关代码块列表
        reference_requirement: 参考需求内容，用于格式和风格参考
    
    Returns:
        生成的需求内容
    """
    # 构建代码上下文
    code_context = ""
    for i, code_block in enumerate(related_code):
        filename = code_block.get('filename', f'code_block_{i+1}')
        content = code_block.get('content', '')
        code_context += f"## 文件: {filename}\n```\n{content}\n```\n\n"
    
    # 如果没有提供参考需求，使用默认提示
    if not reference_requirement:
        reference_requirement = "暂无参考需求，请根据代码功能自行生成合适的需求描述。"
    
    # 格式化prompt
    prompt = GENERATE_PROMPT_TEMPLATE.format(
        reference_requirement=reference_requirement,
        related_code=code_context
    )
    
    # 调用LLM
    response = query_llm(prompt)
    return response.content


def _extract_mermaid_code(response_text: str) -> str:
    """从LLM响应中提取Mermaid流程图代码"""
    text = (response_text or "").strip()

    # 尝试匹配 ```mermaid ... ``` 代码块
    mermaid_match = re.search(r'```mermaid\s*([\s\S]*?)```', text, re.IGNORECASE)
    if mermaid_match:
        return mermaid_match.group(1).strip()

    # 尝试匹配 ``` ... ``` 代码块（无语言标记）
    code_match = re.search(r'```\s*(graph|flowchart)[\s\S]*?```', text, re.IGNORECASE)
    if code_match:
        inner = re.search(r'```\s*([\s\S]*?)```', text)
        if inner:
            return inner.group(1).strip()

    # 尝试匹配裸的 graph/flowchart 声明
    bare_match = re.search(r'((?:graph|flowchart)\s+(?:TD|TB|LR|RL)[\s\S]*)', text, re.IGNORECASE)
    if bare_match:
        return bare_match.group(1).strip()

    # 如果没有匹配到，返回原始文本
    return text


def _preview_text(text: str, limit: int = 200) -> str:
    normalized = (text or '').replace('\n', '\\n')
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit] + '...'


def query_flow_chart(code_content):
    """根据代码内容生成Mermaid流程图"""
    system_instruction = (
        "你是Mermaid流程图生成器。"
        "禁止输出分析、解释、思考过程、Markdown标题。"
        "你的回复必须只包含一个```mermaid代码块。"
    )
    primary_prompt = FLOWCHART_MERMAID_PROMPT_TEMPLATE.replace('{code_content}', code_content)

    fallback_prompt = f"""直接输出一个完整的Mermaid流程图。
必须严格包裹为：
```mermaid
graph TD
    ...
```
不要输出"我来分析""让我思考""步骤""说明"等任何文字。
只使用基本的流程图语法：方框[]、菱形{{}}、圆角()、连线-->、文本标签|文字|。
禁止使用style、classDef等样式指令。
节点文案使用简洁中文。

代码：
{code_content}
"""

    errors = []

    for attempt in range(1, 3):
        prompt = primary_prompt if attempt == 1 else fallback_prompt
        response = query_llm(
            prompt,
            history=[{"role": "system", "content": system_instruction}],
            temperature=0.05,
            top_p=0.8,
            max_tokens=2600
        )
        raw_content = response.content or ''
        try:
            mermaid_code = _extract_mermaid_code(raw_content)
            if not mermaid_code:
                raise ValueError("提取的Mermaid代码为空")
            # 基本校验：必须以 graph 或 flowchart 开头
            first_line = mermaid_code.strip().split('\n')[0].strip().lower()
            if not (first_line.startswith('graph') or first_line.startswith('flowchart')):
                raise ValueError(f"Mermaid代码格式不正确，首行: {_preview_text(first_line)}")
            return mermaid_code
        except Exception as exc:
            errors.append(f"第{attempt}次生成失败: {exc}; 返回预览={_preview_text(raw_content)}")

    raise ValueError(" ; ".join(errors))


def smart_parse_doc(text, type='rule'):
    """使用 LLM 对文档进行结构化提取"""
    prompt_template = RULE_EXTRACTION_PROMPT if type == 'rule' else ISSUE_EXTRACTION_PROMPT
    
    # 截断防止超长 (取前6000字符)
    prompt = prompt_template.format(text=text[:6000]) 
    
    try:
        response = query_llm(prompt)
        parsed = parse_output(response.content)
        
        # 标准化输出键名
        normalized = []
        if isinstance(parsed, list):
            for item in parsed:
                if type == 'rule':
                    normalized.append({
                        "id": item.get('id', ''),
                        "description": item.get('description', ''),
                        "violation_code": item.get('violation_code', ''),
                        "compliance_code": item.get('compliance_code', '')
                    })
                else:
                    normalized.append({
                        "id": item.get('id', ''),
                        "desc": item.get('desc', ''),
                        "opinion": item.get('opinion', ''),
                        "trace_id": item.get('trace_id', '')
                    })
        return normalized
    except Exception as e:
        print(f"[Agent] Smart parse failed: {e}")
        return []
        
if __name__ == '__main__':
    message = "你好，简单介绍你自己。"
    response = query_llm(message)
    print(response.content)
    
# from langchain_openai import ChatOpenAI
    # client = ChatOpenAI(
    #     model="deepseek-coder-6.7b-instruct", 
    #     api_key="{}".format(os.environ.get("API_KEY", "0")),
    #     base_url="http://localhost:{}/v1".format(os.environ.get("API_PORT", 8000)),
    # )

    # res = client.invoke("你好，简单介绍你自己。")
    # print(res.content)
