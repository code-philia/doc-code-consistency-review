import os
import re
import json
from prompt import ALIGN_PROMPT_TEMPLATE, REVIEW_PROMPT_TEMPLATE, GENERATE_PROMPT_TEMPLATE
from openai import OpenAI
from utils import chunk_list
API_KEY = os.environ.get("API_KEY", "0")

# API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8002/v1")
# MODEL_NAME = "Qwen/Qwen3-8B"

API_BASE_URL = os.environ.get("API_BASE_URL", "http://10.123.0.196:8001/v1")
MODEL_NAME = "Qwen3-32B"

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

# ================= 对齐 相关代码 =================
def query_related_code(requirement, code_blocks, random_flag, block_limit=None):

    if block_limit:
        chunked_code_blocks = chunk_list(code_blocks, block_limit, random_flag)
        
        related_code_blocks = []
        for c in chunked_code_blocks:
            res = query_related_code_block(requirement, c)
            related_code_blocks.extend(res)
        
        print(related_code_blocks)
        similarity_results = []
        if (len(related_code_blocks) == 1):
            similarity_results = related_code_blocks
        elif (len(related_code_blocks) > 1):
            max_sim_results = []
            max_sim = 0
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
        return query_related_code_block(requirement, code_blocks)

def parse_alignment_output(response):
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
            json_match = re.search(r'({.*})', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_str = response

        data = json.loads(json_str)
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