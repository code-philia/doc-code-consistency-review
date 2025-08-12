import os
import markdown
from bs4 import BeautifulSoup
import re
import tiktoken

def count_lines_of_code(filepath):
    """一个简单的代码行数统计函数，忽略空行"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return len([line for line in f if line.strip()])
    except (IOError, UnicodeDecodeError):
        # 如果文件无法读取或解码，则计为0
        return 0

def parse_markdown(md_text):
    """
    解析Markdown文本，提取需求点、表格和公式。
    """
    
    # 转换Markdown为HTML
    html = markdown.markdown(md_text, extensions=['tables'])
    soup = BeautifulSoup(html, 'html.parser')
    
    requirements = []
    
    current_context = []
    grouped_content = ""

    for element in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'table']):
        if element.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            if grouped_content.strip():
                requirements.append({
                    "type": "描述文本",
                    "id": f"text_{len(requirements)}",
                    "content": grouped_content.strip(),
                    "context": " > ".join(current_context)
                })
                grouped_content = ""
            # 更新标题上下文
            current_context = current_context[:int(element.name[1]) - 1] + [element.get_text()]
        elif element.name in ['p', 'li']:
            # 将段落和列表项内容累积到当前上下文
            grouped_content += element.get_text() + "\n"
        elif element.name == 'table':
            # 如果有未处理的内容，添加到需求点
            if grouped_content.strip():
                requirements.append({
                    "type": "描述文本",
                    "id": f"text_{len(requirements)}",
                    "content": grouped_content.strip(),
                    "context": " > ".join(current_context)
                })
                grouped_content = ""
            # 添加整个表格需求
            table_id = f"table_{len(requirements)}"
            requirements.append({
                "type": "表格",
                "id": table_id,
                "content": str(element),
                "context": " > ".join(current_context)
            })
            headers = [th.get_text() for th in element.find_all('th')]
            for i, row in enumerate(element.find_all('tr')[1:]):  # 跳过表头行
                cells = [td.get_text() for td in row.find_all('td')]
                requirements.append({
                    "type": "表格行",
                    "id": f"{table_id}_row_{i}",
                    "content": dict(zip(headers, cells)),
                    "context": " > ".join(current_context + [table_id])
                })

    # 如果有未处理的内容，添加到需求点
    if grouped_content.strip():
        requirements.append({
            "type": "描述文本",
            "id": f"text_{len(requirements)}",
            "content": grouped_content.strip(),
            "context": " > ".join(current_context)
        })

    # 解析公式
    formula_pattern = r'\$(.*?)\$|\$\$(.*?)\$\$'
    formulas = re.findall(formula_pattern, md_text, re.DOTALL)
    for k, formula_pair in enumerate(formulas):
        formula = formula_pair[0] if formula_pair[0] else formula_pair[1]
        requirements.append({
            "type": "公式",
            "id": f"formula_{k}",
            "content": f"${formula.strip()}$" if formula_pair[0] else f"$$ {formula.strip()} $$",
            "context": " > ".join(current_context)
        })
    
    return requirements


def split_code(filename, content, max_length=10000):
    """
    优化后的代码分块函数：
    1. 在分块前为每行代码添加行号
    2. 尽可能填充每个块直到接近最大长度
    3. 不拆分完整代码结构（函数/类等）
    4. 保持行完整性
    
    参数:
        filename: 文件名
        content: 代码内容
        max_length: 最大token长度限制
        
    返回:
        分块列表，每个元素包含:
        - filename: 文件名
        - start_line: 起始行号
        - end_line: 结束行号
        - content: 块内容
    """
    # 添加行号到每行代码
    lines = content.splitlines(keepends=True)
    numbered_lines = [f"{i + 1}: {line}" for i, line in enumerate(lines)]
    
    encoder = tiktoken.get_encoding("cl100k_base")
    line_token_counts = [estimate_tokens(encoder, line) for line in numbered_lines]
    
    # 识别完整代码结构
    protected_blocks = identify_protected_blocks(content)
    
    chunks = []
    current_chunk = []
    current_token_count = 0
    current_start = 0  # 当前块起始行索引
    
    i = 0
    while i < len(numbered_lines):
        line = numbered_lines[i]
        token_count = line_token_counts[i]
        line_num = i + 1
        
        # 检查当前行是否属于某个受保护块
        block = find_enclosing_block(line_num, protected_blocks)
        
        # 情况1：遇到受保护块
        if block:
            block_start, block_end = block
            block_lines = numbered_lines[block_start-1:block_end]
            block_token_count = sum(line_token_counts[block_start-1:block_end])
            
            # 情况1a：当前块为空，直接添加整个受保护块
            if not current_chunk:
                chunks.append(create_chunk(filename, block_start, block_end, block_lines))
                i = block_end
                continue
            
            # 情况1b：添加受保护块会超出限制，先提交当前块
            elif current_token_count + block_token_count > max_length:
                chunks.append(create_chunk(filename, current_start+1, i, current_chunk))
                current_chunk = block_lines
                current_token_count = block_token_count
                current_start = block_start - 1
                i = block_end
            
            # 情况1c：可以添加到当前块
            else:
                current_chunk.extend(block_lines)
                current_token_count += block_token_count
                i = block_end
        
        # 情况2：普通行，添加后会超出限制
        elif current_token_count + token_count > max_length and current_chunk:
            chunks.append(create_chunk(filename, current_start+1, i, current_chunk))
            current_chunk = [line]
            current_token_count = token_count
            current_start = i
            i += 1
        
        # 情况3：可以添加到当前块
        else:
            current_chunk.append(line)
            current_token_count += token_count
            i += 1
    
    # 添加最后一个块
    if current_chunk:
        chunks.append(create_chunk(filename, current_start+1, len(numbered_lines), current_chunk))
    
    return chunks

def identify_protected_blocks(content):
    """识别需要保护的代码块范围（起始行，结束行）"""
    blocks = []
    
    # 函数定义
    for match in re.finditer(r'\b[\w:<>]+\s+\w+\s*\([^)]*\)\s*\{', content):
        start_line = content[:match.start()].count('\n') + 1
        end_line = find_matching_brace(content, match.end()-1)
        if end_line > 0:
            blocks.append((start_line, end_line))
    
    # 类/结构体定义
    for match in re.finditer(r'\b(class|struct)\s+\w+\s*\{', content):
        start_line = content[:match.start()].count('\n') + 1
        end_line = find_matching_brace(content, match.end()-1)
        if end_line > 0:
            blocks.append((start_line, end_line))
    
    # 命名空间
    for match in re.finditer(r'\bnamespace\s+\w+\s*\{', content):
        start_line = content[:match.start()].count('\n') + 1
        end_line = find_matching_brace(content, match.end()-1)
        if end_line > 0:
            blocks.append((start_line, end_line))
    
    return blocks

def find_enclosing_block(line_num, blocks):
    """检查行是否属于某个受保护块"""
    for start, end in blocks:
        if start <= line_num <= end:
            return (start, end)
    return None

def estimate_tokens(encoder, line):
    # return len(re.findall(r'\b\w+\b|[\{\}\(\)\[\];,<>]|\S', line))
    return len(encoder.encode(line))

def find_matching_brace(content, open_pos):
    """找到匹配的闭括号行号"""
    stack = 1
    pos = open_pos + 1
    while pos < len(content) and stack > 0:
        if content[pos] == '{':
            stack += 1
        elif content[pos] == '}':
            stack -= 1
        pos += 1
    return content[:pos].count('\n') + 1 if stack == 0 else -1

def create_chunk(filename, start, end, lines):
    """创建分块字典"""
    return {
        "filename": filename,
        "start_line": start,
        "end_line": end,
        "content": "".join(lines)
    }
    

def get_all_files_with_relative_paths(base_path):
    """递归遍历目录，获取所有文件的相对路径"""
    all_files = []
    for root, _, files in os.walk(base_path):
        for file in files:
            relative_path = os.path.relpath(os.path.join(root, file), base_path)
            all_files.append(relative_path)
    return all_files