import os
import re
from flask import json
from openai import OpenAI

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000/v1")
API_KEY = os.environ.get("API_KEY", "0")
MODEL_NAME = "deepseek-coder-6.7b-instruct"

# ================= 对齐 相关代码 =================

def query_related_code(requirement_point, code_blocks, language: str = "zh"):
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
        template = CHINESE_PROMPT_TEMPLATE if language == "zh" else ENGLISH_PROMPT_TEMPLATE
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
        
        parsed_output = parse_llm_output(llm_output)  # 行号列表
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
    response = client.chat.completions.create(messages=messages, model=MODEL_NAME)
    result = response.choices[0].message
    return result

# TODO 对齐理由
def parse_llm_output(output):
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
        if isinstance(result, dict) and "related_lines" in result:
            return result["related_lines"]
        elif isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass
    
    # 回退：尝试提取所有数字
    return list(map(int, re.findall(r'\b\d+\b', output)))


CHINESE_PROMPT_TEMPLATE = """你是一位精通航天领域软件系统和C/C++编程的资深专家，请协助完成以下任务。
请分析以下需求点与代码块的关系，找出最相关的代码行号：

# 需求描述
类型：{req_type}
内容：
{req_content}

# 代码文件
{code_content}

# 任务要求
1. 根据需求类型确定相关性标准：
   - "描述文本"：查找实现该功能描述的代码段
   - "表格"：查找表格中提到的所有相关代码
   - "表格行"：查找与该行数据对应的变量/常量定义或使用位置
   - "公式"：查找实现该数学公式的代码段
2. 只返回确实与需求相关的行号
3. 严格按以下JSON格式返回：
```json
{{
  "related_lines": [行号列表],
  "reason": "简要说明匹配理由"
}}
```
"""

ENGLISH_PROMPT_TEMPLATE = """You are a senior expert in aerospace software systems and C/C++ programming. Please assist with the following task.
Please analyze the relationship between the following requirement point and code blocks, identifying the most relevant line numbers:

# Requirement
Type: {req_type}
Content:
{req_content}

# Code Context
{code_content}

# Instructions
1. Determine relevance based on requirement type:
   - "Text Description": Find code segments implementing the described functionality
   - "Table": Locate all code related to the table content
   - "Table Row": Find variable/constant definitions or usage corresponding to the row data
   - "Formula": Locate code implementing the mathematical formula
2. Only return line numbers that are definitively relevant
3. Strictly use the following JSON format:
```json
{{
  "related_lines": [list of line numbers],
  "reason": "brief explanation of matching criteria"
}}
"""


# ================= 审查 相关代码 =================




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