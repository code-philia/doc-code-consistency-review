import os
import re
import json
from prompt import ALIGN_PROMPT_TEMPLATE, REVIEW_PROMPT_TEMPLATE, GENERATE_PROMPT_TEMPLATE
from openai import OpenAI
from utils import chunk_list

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8001/v1")
API_KEY = os.environ.get("API_KEY", "0")
MODEL_NAME = "deepseek-coder-6.7b-instruct"

def query_llm(message, history=None):
    client = OpenAI(
        api_key=API_KEY,
        base_url=API_BASE_URL,
    )
    
    if history is None:
        messages = []
    else:
        messages = history
        
    messages.append({"role": "user", "content": message})
    response = client.chat.completions.create(
        messages=messages, 
        model=MODEL_NAME,
        temperature=0.1,
        top_p=0.9,
        n= 1
    )
    result = response.choices[0].message
    return result

# ================= 对齐 相关代码 =================
def query_related_code(requirement, code_blocks, block_limit=None):
    if block_limit:
        chunked_code_blocks = chunk_list(code_blocks, block_limit)
        related_code_blocks = []
        for c in chunked_code_blocks:
            related_code_blocks.extend(query_related_code_block(requirement, c))
        return related_code_blocks
    else:
        return query_related_code_block(requirement, code_blocks)

def query_related_code_block(requirement, code_blocks):
    """
    查询与需求点最相关的代码行号
    
    参数:
        requirement: 需求文本
        code_blocks: 已经划分好的代码块
        
    返回:
        相关行号列表
    """
    # related_code_blocks = []

    # 构造提示词
    template = ALIGN_PROMPT_TEMPLATE
    prompt = template.format(
        req_content=requirement,
        code_content=code_blocks
    )

    # 解析回复
    response = query_llm(prompt)
    llm_output = response.content
    print("original llm output: ", llm_output)
    parsed_output = parse_alignment_output(llm_output)
    print("parsed llm output: ", parsed_output)
    
    return parsed_output

def parse_alignment_output(response):
    """
    解析对齐输出的JSON
    
    参数:
        response: LLM的完整响应文本
        
    """
    try:
        # 提取Markdown代码块中的JSON
        json_match = re.search(r'```(?:json)?\s*({.*?})\s*```', response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # 如果没有找到代码块，假设整个响应就是JSON
            json_str = response

        data = json.loads(json_str)
        if isinstance(data, dict):
            return [data]
        elif isinstance(data, list):
            return data
        else:
            return []
    except (json.JSONDecodeError, AttributeError) as e:
        print(f"解析对齐输出失败: {e}")
        return []


# ================= 审查 相关代码 =================
def query_review_result(requirement, related_code):
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
        f"需求片段来源: {block['filename']} ，内容:\n{block['content']}"
        for block in requirement
    )
    
    code_context = "\n\n".join(
        f"代码片段来源: {block['filename']}，内容:\n{block['content']}"
        for block in related_code
    )
    
    # 2. 构造提示词
    template = REVIEW_PROMPT_TEMPLATE
    prompt = template.format(
        requirement=requirement_context,
        related_code=code_context
    )
    
    # 3. 调用LLM
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
            # 如果没有找到代码块，假设整个响应就是JSON
            json_str = response

        data = json.loads(json_str)
        return {
            "review_process": data.get("review_process", "未能解析出审查过程。"),
            "issue": data.get("issue") # 如果为null，则返回None
        }
    except (json.JSONDecodeError, AttributeError) as e:
        print(f"解析审查输出失败: {e}")
        # 作为回退，将原始响应作为审查过程
        return {
            "review_process": response,
            "issue": None
        }

# ================= 需求反生成 =================
def query_generated_requirement(related_code):
    """
    需求反生成
    
    参数:
        related_code: 相关代码块列表，每个代码块包含文件名、内容等信息
        
    返回:
        generated_requirement: 审查过程
    """
    # 1. 拼接相关代码
    code_context = "\n\n".join(
        f"所属文件: {block['filename']}\n"
        f"代码:\n{block['content']}"
        for idx, block in enumerate(related_code)
    )
    
    # 2. 构造提示词
    template = GENERATE_PROMPT_TEMPLATE
    prompt = template.format(
        related_code=code_context
    )
    
    # 3. 调用LLM
    try:
        response = query_llm(prompt)
        print("LLM response:", response.content)
        output = response.content
        
    except Exception as e:
        print(f"审查过程中出错: {str(e)}")
        return None, None
    
    return output
    



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