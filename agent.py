import os
import re
import json
from prompt import ALIGN_PROMPT_TEMPLATE, REVIEW_PROMPT_TEMPLATE, GENERATE_PROMPT_TEMPLATE
from openai import OpenAI

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8001/v1")
API_KEY = os.environ.get("API_KEY", "0")
MODEL_NAME = "/home/kwy/project/models/deepseek-coder-6.7b-instruct"

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
def query_related_code(requirement, code_files, split_code=False):
    """
    查询与需求点最相关的代码行号
    
    参数:
        requirement: 需求文本
        code_files: 代码文件列表，每个文件包含名称和内容
        split_code: 是否将代码文件拆分为块
        
    返回:
        相关行号列表
    """
    if split_code:
        # 如果需要对代码进行分块处理
        split_code_files = []
        for code_file in code_files:
            lines = code_file["numberedContent"].splitlines()
            for i in range(0, len(lines), 1000):
                chunk_content = "\n".join(lines[i:i + 1000])
                split_code_files.append({
                    "name": code_file['name'],
                    "numberedContent": chunk_content
                })
        code_files = split_code_files  # Replace original code_files with split chunks

    related_code_blocks = []
    for code_file in code_files:
        # 构造提示词
        template = ALIGN_PROMPT_TEMPLATE
        prompt = template.format(
            req_content=requirement,
            code_content=code_file["numberedContent"]
        )
        print("input: ", prompt)
        
        # 解析回复
        response = query_llm(prompt)
        llm_output = response.content
        print("llm output: ", llm_output)
        parsed_output = parse_alignment_output(llm_output)
        
        # Ensure parsed_output contains intervals (e.g., [start, end])
        if all(isinstance(item, list) and len(item) == 2 for item in parsed_output):
            # Sort intervals by their starting line number
            parsed_output = sorted(parsed_output, key=lambda x: x[0])  # 按起始行号排序
        else:
            return []
            
        # 对行号区间进行排序并合并有交集的代码块
        parsed_output = sorted(parsed_output, key=lambda x: x[0])  # 按起始行号排序
        merged_blocks = []
        
        for interval in parsed_output:
            if len(merged_blocks) == 0 or merged_blocks[-1][1] < interval[0] - 1:
                merged_blocks.append(interval)
            else:
                merged_blocks[-1][1] = max(merged_blocks[-1][1], interval[1])
        
        print("merged blocks: ", merged_blocks)

        # 从代码块中提取对应的代码
        for block in merged_blocks:
            start_line, end_line = block
            block_content = "\n".join(
                line
                for line in code_file["numberedContent"].splitlines()
                if line.strip() and ":" in line and start_line <= int(line.split(":")[0]) <= end_line
            )
            related_code_blocks.append({
                "filename": code_file["name"],
                "content": block_content,
                "start": start_line,
                "end": end_line
            })
    
    return related_code_blocks


def query_related_code_backup(requirement_point, code_blocks, language: str = "zh"):
    """
    查询与需求点最相关的代码行号
    
    参数:
        requirement_point: 需求点字典
        code_blocks: 代码块列表
        language: 提示语言 ('zh' 或 'en')
        
    返回:
        相关行号列表
    """
    related_code_blocks = []
    
    for code_block in code_blocks:        
        # 构造提示词
        template = """"""
        prompt = template.format(
            req_type=requirement_point["type"],
            req_content=requirement_point["content"],
            code_content=code_block["content"]
        )
        print("input: ", prompt)
        
        # 解析回复
        response = query_llm(prompt)
        llm_output = response.content
        print("llm output: ", llm_output)
        
        parsed_output = parse_alignment_output(llm_output)  # 行号列表
        print("parsed output: ", parsed_output)
        
        # 对行号进行排序并合并连续行号
        parsed_output = sorted(parsed_output, reverse=True)
        merged_blocks = []
        current_block = []

        for i, line_num in enumerate(parsed_output):
            if not current_block or line_num == current_block[-1] - 1:
                current_block.append(line_num)
            else:
                merged_blocks.append(current_block)
                current_block = [line_num]
        if current_block:
            merged_blocks.append(current_block)
            
        print("merged blocks: ", merged_blocks)

        # 从代码块中提取对应的代码
        for block in merged_blocks:
            start_line = min(block)
            end_line = max(block)
            block_content = "\n".join(
                line.split(":", 1)[1].strip() if ":" in line else line.strip()
                for line in code_block["content"].splitlines()
                if int(line.split(":")[0]) in block
            )
            related_code_blocks.append({
                "filename": code_block["filename"],
                "content": block_content,
                "start_line": start_line,
                "end_line": end_line
            })
    
    return related_code_blocks


def parse_alignment_output(output):
    """
    解析LLM输出，提取行号列表
    
    处理可能的情况：
    1. 直接JSON输出
    2. Markdown代码块包裹的JSON
    3. 不规范的JSON
    """
    # 尝试提取Markdown代码块中的JSON
    json_match = re.search(r'```(?:json)?\s*({.*?})\s*```', output, re.DOTALL)
    if json_match:
        output = json_match.group(1)
    
    try:
        result = json.loads(output)
        if isinstance(result, dict) and "related_code" in result:
            return result["related_code"]
        elif isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass
    
    # 回退：尝试提取所有数字
    return list(map(int, re.findall(r'\b\d+\b', output)))


# ================= 审查 相关代码 =================
def query_review_result(requirement, related_code):
    """
    执行代码一致性审查
    
    参数:
        requirement: 需求内容
        related_code: 相关代码块列表，每个代码块包含文件名、内容等信息
        
    返回:
        review_process: 审查过程
        issues: 问题单
    """
    # 1. 拼接相关代码
    code_context = "\n\n".join(
        f"所属文件: {block['filename']}\n"
        f"代码:\n{block['content']}"
        for idx, block in enumerate(related_code)
    )
    
    # 2. 构造提示词
    template = REVIEW_PROMPT_TEMPLATE
    prompt = template.format(
        requirement=requirement,
        related_code=code_context
    )
    
    # 3. 调用LLM
    try:
        response = query_llm(prompt)
        print("LLM response:", response.content)
        parsed_output = parse_review_output(response.content)
        
    except Exception as e:
        print(f"审查过程中出错: {str(e)}")
        return None, None
    
    return parsed_output['review_process'], parsed_output['issues']


def parse_review_output(response):
    """
    解析审查输出，分离分析过程和问题单
    
    参数:
        response: LLM的完整响应文本
        
    返回:
        包含两个键的字典:
        - "review_process": 审查分析过程文本
        - "issues": 问题单文本
    """
    # 定义分隔符
    process_end_marker = "===== 审查分析过程结束 ====="
    
    # 尝试按分隔符分割
    if process_end_marker in response:
        parts = response.split(process_end_marker)
        
        # 第一部分是审查分析过程
        review_process = parts[0].strip()
        
        # 第二部分是问题单
        issues_text = parts[1].strip() if len(parts) > 1 else ""
        
        # 检查问题单部分是否包含标题
        issues_title = "问题单"
        if issues_title in issues_text:
            # 移除标题
            issues_text = issues_text.split(issues_title, 1)[-1].strip()
        
        return {
            "review_process": review_process,
            "issues": issues_text
        }
    
    # 回退方案：尝试识别标题分割
    review_title = "审查分析过程"
    issues_title = "问题单"
    
    if review_title in response and issues_title in response:
        # 尝试按标题分割
        review_parts = response.split(review_title)
        if len(review_parts) > 1:
            review_section = review_parts[1]
            # 在审查部分中查找问题单标题
            if issues_title in review_section:
                review_parts2 = review_section.split(issues_title)
                review_process = review_parts2[0].strip()
                issues = review_parts2[1].strip() if len(review_parts2) > 1 else ""
            else:
                # 如果没有找到问题单标题，整个第二部分作为问题单
                review_process = review_section
                issues = ""
        else:
            review_process = response
            issues = ""
        
        return {
            "review_process": review_process,
            "issues": issues
        }
    
    # 最后回退：使用正则表达式尝试识别问题单格式
    issue_pattern = r'在\[.*?\]的\[.*?\]处，程序实现是.*?，而需求是.*?，实现与需求不一致，原因是.*?。'
    issues_match = re.findall(issue_pattern, response, re.DOTALL)
    
    if issues_match:
        # 假设问题单之前的内容都是审查分析过程
        issues_start = response.find(issues_match[0])
        review_process = response[:issues_start].strip()
        issues = "\n".join(issues_match)
        
        return {
            "review_process": review_process,
            "issues": issues
        }
    
    # 如果所有方法都失败，返回原始响应作为审查过程
    return {
        "review_process": response,
        "issues": "未能解析出问题单"
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