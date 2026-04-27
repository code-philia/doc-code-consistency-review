import os
import re
import json
import sys
from flask_login import current_user

# from app.views import logger
from .prompt import ALIGN_PROMPT_TEMPLATE, ALIGN_REQ_PROMPT_TEMPLATE, REVIEW_PROMPT_TEMPLATE, GENERATE_PROMPT_TEMPLATE, THINKING_PROMPT_TEMPLATE, ALIGN_PROMPT_TEMPLATE_ICL, RULE_EXTRACTION_PROMPT, ISSUE_EXTRACTION_PROMPT, ABSTRACT_PROMPT_TEMPLATE, TOTAL_ABSTRACT_PROMPT_TEMPLATE, CODEFILE_PROMPT_TEMPLATE
from .prompt import Combine_Req2Code_Align_UserPrompt, Combine_Code2Req_Align_UserPrompt, Combine_Review_UserPrompt
from openai import OpenAI
from .utils import chunk_list
from .db import get_db_celery

#API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8002/v1")
API_KEY = os.environ.get("API_KEY", "0")
#MODEL_NAME = os.environ.get("MODEL_NAME", "Qwen/Qwen3-8B")

API_BASE_URL = os.environ.get("API_BASE_URL", "http://10.123.0.196:8001/v1")
MODEL_NAME = "Qwen3-32B"

def query_llm(message, history=None):
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
        temperature=0.1,
        top_p=0.9,
        max_tokens=1024,
    )
    #req = RequestLLM('')
    #res = req.request_qwen_14b_llm_output(message)

    text = ""
    if resp.choices and resp.choices[0].message:
        text = resp.choices[0].message.content or ""

    class Resp:
        pass
    r = Resp()
    r.content = text.strip()

    return r


def _resolve_user_id(user_id=None):
    """优先使用显式 user_id；在请求上下文中再回退到 current_user。"""
    if user_id is not None:
        return user_id
    try:
        return current_user.user_id
    except Exception:
        return None


def parse_abstract_output(response):
    """
    解析输出的JSON
    
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
        print(f"解析llm输出失败: {e}")
        return []

def query_codefile_from_abstract(requirement, file_abstract):
    # 构造提示词
    template = CODEFILE_PROMPT_TEMPLATE
    prompt = template.format(
        req_content=requirement,
        file_abstract=file_abstract,
    )

    # 解析回复
    response = query_llm(prompt)
    llm_output = response.content
    #print("original llm output: ", llm_output)
    parsed_output = parse_abstract_output(llm_output)
    #print("requirement: ", requirement)
    print("parse output: ", parsed_output)
    
    file_list = []
    similarity_results = []
    if (len(parsed_output) == 1):
        similarity_results = parsed_output
        file_list.append(parsed_output[0]['file'])
    elif (len(parsed_output) > 1):
        max_sim_results = []
        max_sim = -1.0
        for item in parsed_output:
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
    
    
    print("************")   
    print(similarity_results)   
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
def query_related_code_block(requirement, code_blocks, icl_examples=None, user_id=None):
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

        # 构造提示词
        row = None
        if resolved_user_id is not None:
            db = get_db_celery()
            c = db.cursor()
            c.execute(f'select Req2CodeAlign from prompt where user_id={resolved_user_id}')
            row = c.fetchone()
            db.close()
        
        template = ALIGN_PROMPT_TEMPLATE if row is None else row['Req2CodeAlign']
        prompt = template.format(
            req_content=requirement,
            code_content=code_blocks
        )

    # 解析回复
    max_req = 5
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

def query_related_code(requirement, code_blocks, block_limit=None, icl_examples=None, user_id=None):
    if block_limit:
        chunked_code_blocks = chunk_list(code_blocks, block_limit)
        
        related_code_blocks = []
        for c in chunked_code_blocks:
            res = query_related_code_block(requirement, c, icl_examples, user_id=user_id)
            related_code_blocks.extend(res)
        
        print(related_code_blocks)
        similarity_results = []
        if (len(related_code_blocks) == 1):
            similarity_results = related_code_blocks
        elif (len(related_code_blocks) > 1):
            max_sim_results = []
            max_sim = -1.0
            for item in related_code_blocks:
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
        
        
        print("************")   
        print(similarity_results)   
        return similarity_results
    else:
        return query_related_code_block(requirement, code_blocks, icl_examples, user_id=user_id)
    
    
    
# ================= 对齐：参考用户反馈，根据需求块查找相关代码块 =================
def query_related_code_block_by_feedback(requirement, code_blocks, codeRanges, user_prompt, user_id=None):
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
    row = None
    if resolved_user_id is not None:
        db = get_db_celery()
        c = db.cursor()
        c.execute(f'select Req2CodeAlign from prompt where user_id={resolved_user_id}')
        row = c.fetchone()
        db.close()
    
    #将用户输入的提示词结合到已有的结果中，形成新的提示词
    #准备加到已有提示词的前面，用于优化大模型的输出
    
    original_template = ALIGN_PROMPT_TEMPLATE if row is None else row['Req2CodeAlign']
    original_prompt = original_template.format(
        req_content=requirement,
        code_content=code_blocks
    )

    template = Combine_Req2Code_Align_UserPrompt
    prompt = template.format(
        original_prompt=original_prompt,
        doc_range=requirement,
        code_ranges=codeRanges,
        user_feedback=user_prompt
    )
    #print(prompt)
    
    # 解析回复
    response = query_llm(prompt)
    llm_output = response.content
    # print("original llm output: ", llm_output)
    parsed_output = parse_output(llm_output)
    # print("parsed llm output: ", parsed_output)
    
    return parsed_output    
    
    
def query_related_code_by_feedback(requirement, code_blocks, codeRanges, user_prompt, block_limit=None, user_id=None):

    if block_limit:
        chunked_code_blocks = chunk_list(code_blocks, block_limit)
        
        related_code_blocks = []
        for c in chunked_code_blocks:
            res = query_related_code_block_by_feedback(requirement, c, codeRanges, user_prompt, user_id=user_id)
            related_code_blocks.extend(res)
        
        print(related_code_blocks)
        similarity_results = []
        if (len(related_code_blocks) == 1):
            similarity_results = related_code_blocks
        elif (len(related_code_blocks) > 1):
            max_sim_results = []
            max_sim = -1.0
            for item in related_code_blocks:
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
        
        
        print("************")   
        print(similarity_results)   
        return similarity_results
    else:
        return query_related_code_block_by_feedback(requirement, code_blocks, codeRanges, user_prompt, user_id=user_id)


# ================= 对齐 根据代码块查找相关需求块 =================
def query_related_requirement_block(code, req_blocks, user_id=None):
    """
    查询与代码最相关的需求块
    
    参数:
        code: 代码内容
        req_blocks: 需求块列表
        
    返回:
        相关需求块列表
    """
    user_id = user_id if user_id else current_user.user_id
    # 构造提示词
    # template = ALIGN_REQ_PROMPT_TEMPLATE
    db = get_db_celery()
    c = db.cursor()
    c.execute(f'select Code2ReqAlign from prompt where user_id={user_id}')
    row = c.fetchone()
    db.close()
    
    template = ALIGN_REQ_PROMPT_TEMPLATE if row is None else row['Code2ReqAlign']
    
    prompt = template.format(
        code_content=code,
        req_content=req_blocks
    )

    # 解析回复
    response = query_llm(prompt)
    llm_output = response.content
    print("original llm output (req): ", llm_output)
    parsed_output = parse_output(llm_output)
    print("parsed llm output (req): ", parsed_output)
    
    return parsed_output

def query_related_requirement(code, req_blocks, block_limit=None, user_id=None):
    if block_limit:
        chunked_req_blocks = chunk_list(req_blocks, block_limit)
        
        related_req_blocks = []
        for c in chunked_req_blocks:
            res = query_related_requirement_block(code, c, user_id)
            related_req_blocks.extend(res)
        
        #print(related_req_blocks)
        similarity_results = []
        if (len(related_req_blocks) == 1):
            similarity_results = related_req_blocks
        elif (len(related_req_blocks) > 1):
            max_sim_results = []
            max_sim = -1.0
            for item in related_req_blocks:
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
        
        print("************")   
        print(similarity_results)   
        return similarity_results
    else:
        return query_related_requirement_block(code, req_blocks, user_id)

        
# ================= 对齐 参考用户反馈，根据代码块查找相关需求块 =================
def query_related_requirement_block_by_feedback(code, docRanges, req_blocks, user_prompt, user_id=None):
    """
    查询与代码最相关的需求块
    
    参数:
        code: 代码内容
        req_blocks: 需求块列表
        
    返回:
        相关需求块列表
    """
    user_id = user_id if user_id else current_user.user_id
    # 构造提示词
    # template = ALIGN_REQ_PROMPT_TEMPLATE
    db = get_db_celery()
    c = db.cursor()
    c.execute(f'select Code2ReqAlign from prompt where user_id={user_id}')
    row = c.fetchone()
    db.close()
    
    # template = ALIGN_REQ_PROMPT_TEMPLATE if row is None else row['Code2ReqAlign']
    # prompt = template.format(
        # code_content=code,
        # req_content=req_blocks
    # )
    
    # 构造提示词
    
    #将用户输入的提示词结合到已有的结果中，形成新的提示词
    #准备加到已有提示词的前面，用于优化大模型的输出

    original_template = ALIGN_REQ_PROMPT_TEMPLATE if row is None else row['Code2ReqAlign']
    original_prompt = original_template.format(
        code_content=code,
        req_content=req_blocks
    )

    template = Combine_Code2Req_Align_UserPrompt
    prompt = template.format(
        original_prompt=original_prompt,
        code_content=code,
        req_content=docRanges,
        user_feedback=user_prompt
    )
    #print(prompt)
    
    

    # 解析回复
    response = query_llm(prompt)
    llm_output = response.content
    #print("original llm output (req): ", llm_output)
    parsed_output = parse_output(llm_output)
    print("parsed llm output (req): ", parsed_output)
    
    return parsed_output


def query_related_requirement_by_feedback(code, docRanges, req_blocks, user_prompt, block_limit=None, user_id=None):
    if block_limit:
        chunked_req_blocks = chunk_list(req_blocks, block_limit)
        
        related_req_blocks = []
        for c in chunked_req_blocks:
            res = query_related_requirement_block_by_feedback(code, docRanges, c, user_prompt, user_id)
            related_req_blocks.extend(res)
        
        #print(related_req_blocks)
        similarity_results = []
        if (len(related_req_blocks) == 1):
            similarity_results = related_req_blocks
        elif (len(related_req_blocks) > 1):
            max_sim_results = []
            max_sim = -1.0
            for item in related_req_blocks:
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
        
        print("************")   
        print(similarity_results)   
        return similarity_results
    else:
        return query_related_requirement_block(code, req_blocks, user_id)        
        
        
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
def query_review_result_by_feedback(requirement, related_code, review_thought, user_prompt, rules=None, issues=None, user_id=None):
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

    # 3. 构造提示词
    # template = REVIEW_PROMPT_TEMPLATE
    # original_template = THINKING_PROMPT_TEMPLATE
    user_id = user_id if user_id else current_user.user_id
    db = get_db_celery()
    c = db.cursor()
    c.execute(f'select review from prompt where user_id={user_id}')
    row = c.fetchone()
    db.close()
    
    original_template = THINKING_PROMPT_TEMPLATE if row is None else row['review']
    original_prompt = original_template.format(
        requirement=requirement_context,
        related_code=code_context,
        reference_rules=reference_rules,
        reference_issues=reference_issues
    )
    
    template = Combine_Review_UserPrompt
    prompt = template.format(
        original_prompt=original_prompt,
        review_thought=review_thought,
        user_feedback=user_prompt
    )
    #print(prompt)
    
    # 4. 调用LLM
    try:
        response = query_llm(prompt)
        print("LLM response for review:", response.content)
        parsed_output = parse_review_output(response.content)
        
        return parsed_output.get('review_process'), parsed_output.get('issue')
        
    except Exception as e:
        print(f"审查过程中出错: {str(e)}")
        return f"审查过程中发生错误: {e}", None        
 
 
 
# ================= 审查 相关代码 =================
def query_review_result(requirement, related_code, rules=None, issues=None, user_id=None):
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

    # 3. 构造提示词
    # template = REVIEW_PROMPT_TEMPLATE
    # template = THINKING_PROMPT_TEMPLATE
    user_id = user_id if user_id else current_user.user_id
    db = get_db_celery()
    c = db.cursor()
    c.execute(f'select review from prompt where user_id={user_id}')
    row = c.fetchone()
    template = THINKING_PROMPT_TEMPLATE if row is None else row['review']
    db.close()

    prompt = template.format(
        requirement=requirement_context,
        related_code=code_context,
        reference_rules=reference_rules,
        reference_issues=reference_issues
    )
    
    # 4. 调用LLM
    try:
        response = query_llm(prompt)
        print("LLM response for review:", response.content)
        parsed_output = parse_review_output(response.content)
        
        return parsed_output.get('review_process'), parsed_output.get('issue')
        
    except Exception as e:
        print(f"审查过程中出错: {str(e)}")
        return f"审查过程中发生错误: {e}", None

def parse_review_output(response):
    """
    解析审查输出的JSON
    
    参数:
        response: LLM的完整响应文本
        
    返回:
        包含 "review_process" 和 "issue" 的字典
    """
    try:
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
    except (json.JSONDecodeError, AttributeError) as e:
        print(f"解析审查输出失败: {e}")
        return {
            "review_process": response,
            "issue": None
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
    
def query_flow_chart(code_content):
    prompt = f"""请分析以下代码，生成一个清晰的Mermaid流程图来展示代码的执行流程。
    代码内容：
    {code_content}

    要求：
    1. 使用Mermaid flowchart语法
    2. 展示主要的执行流程和逻辑分支，包含关键的函数调用和数据流
    3. 只返回Mermaid代码，不要包含其他解释文字
    4. 对于输入多段的代码，只考虑主要的部分，不需要为每一段都绘制流程图

    示例：
    ```mermaid
    graph TD;
    A["开始"] --> B["处理数据"];
    B --> C{{"检查条件?"}};
    C -->|"是"| D["执行操作"];
    C -->|"否"| B;
    D --> E["结束"];
    ```
    **注意**所有节点内容需要用引号包围，例如A("..."), B["..."], C{{"..."}}, |"..."|
    请直接返回Mermaid流程图代码，不要包含其他解释文字和思考过程。"""

    response = query_llm(prompt)
    mermaid_code = response.content

    mermaid_pattern = r'```(?:mermaid)?\s*\n?(.*?)\n?```'
    match = re.search(mermaid_pattern, mermaid_code, re.DOTALL)
    
    if match:
        mermaid_code = match.group(1).strip()
    else:
        mermaid_code = mermaid_code.strip()
    
    return mermaid_code


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
