import os
import markdown
from bs4 import BeautifulSoup
import re
from doc2md import docToMd
import random
import sys
import zipfile
import xml.etree.ElementTree as ET

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
    
    # encoder = tiktoken.get_encoding("cl100k_base")
    encoder = None # Mock encoder
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
    # Fallback when tiktoken is not available: approx 1 token = 4 chars
    return len(line) // 4 + 1

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
    

def get_all_files_with_relative_paths(base_path, type = 'code'):
    """递归遍历目录，获取所有文件的相对路径"""
    all_files = []
    for root, _, files in os.walk(base_path):
        for file in files:
            if type == 'code' and not (file.endswith('.py') or file.endswith('.java') or file.endswith('.cpp') or file.endswith('.js') or file.endswith('.c') or file.endswith('.h')):
                continue
            if type == 'doc' and not (file.endswith('.docx') or file.endswith('.md')):
                continue
            
            relative_path = os.path.relpath(os.path.join(root, file), base_path)
            all_files.append(relative_path)
            
    return all_files

def convert_doc_to_markdown(doc_repo_path):
    converted_repo_path = os.path.join(os.path.dirname(doc_repo_path), "doc_repo_converted")
    os.makedirs(converted_repo_path, exist_ok=True)
    
    for root, _, files in os.walk(doc_repo_path):
        for file in files:
            if not file.endswith('.docx'):
                continue
            
            file_name_prefix = os.path.splitext(file)[0]
            converted_md_path = os.path.join(converted_repo_path, file_name_prefix, file_name_prefix + '.md')
            
            if os.path.exists(converted_md_path):
                continue

            docToMd.convertDocToMarkdown(os.path.join(root, file), converted_repo_path)

def get_filename_without_extension(filepath):
    """获取不带扩展名的文件名"""
    return os.path.splitext(os.path.basename(filepath))[0]

# def chunk_list(lst, limit):
#     result = []
#     for i in range(0, len(lst), limit):
#         result.append(lst[i:i+limit])
#     return result

def chunk_list(code_blocks, max_chunk_size):
    all_chunks = []
    current_chunk = []
    max_chunk_size = 30000

    # 尝试随机打乱list中元素顺序
    # if random_flag:
        # random.shuffle(code_blocks)
    
    for block in code_blocks:
        block_str_len = len(str(block))
        
        # 某个块本身就大于max_chunk_size
        if block_str_len >= max_chunk_size:
            # 当前有未保存的chunk，先保存
            if len(current_chunk) > 0:
                all_chunks.append(current_chunk)
                current_chunk = []
            
            # 将这个大块独立为一个chunk，最后到模型输入处截断
            all_chunks.append([block])

        # 正常块，先尝试放入
        potential_chunk = current_chunk + [block]
        potential_chunk_len = len(str(potential_chunk))

        if potential_chunk_len < max_chunk_size:
            current_chunk.append(block)
        else: #放入后超了max_chunk_size，放入新的chunk
            if len(current_chunk) > 0:
                all_chunks.append(current_chunk)
            current_chunk = [block]

    if len(current_chunk) > 0:
        all_chunks.append(current_chunk)

    print(f"共有{len(code_blocks)}个代码块，分{len(all_chunks)}次询问模型")
    return all_chunks



def replace_text_in_docx(doc, replacements):
    """在DOCX文档中替换文本，保持原有格式"""
    
    def replace_text_in_runs(paragraph, old_text, new_text):
        """在段落的runs中替换文本，保持格式"""
        full_text = paragraph.text
        if old_text not in full_text:
            return False
        
        # 找到替换位置
        start_pos = full_text.find(old_text)
        end_pos = start_pos + len(old_text)
        
        # 遍历runs，找到包含目标文本的runs
        current_pos = 0
        runs_to_modify = []
        
        for i, run in enumerate(paragraph.runs):
            run_start = current_pos
            run_end = current_pos + len(run.text)
            
            # 检查这个run是否与目标文本有重叠
            if run_start < end_pos and run_end > start_pos:
                runs_to_modify.append({
                    'index': i,
                    'run': run,
                    'start': run_start,
                    'end': run_end,
                    'text': run.text
                })
            
            current_pos = run_end
        
        if not runs_to_modify:
            return False
        
        # 执行替换
        # 如果替换文本完全在一个run内
        if len(runs_to_modify) == 1:
            run_info = runs_to_modify[0]
            run = run_info['run']
            relative_start = start_pos - run_info['start']
            relative_end = end_pos - run_info['start']
            
            new_run_text = (run.text[:relative_start] + 
                           new_text + 
                           run.text[relative_end:])
            run.text = new_run_text
        else:
            # 替换文本跨越多个runs
            for i, run_info in enumerate(runs_to_modify):
                run = run_info['run']
                
                if i == 0:  # 第一个run
                    relative_start = start_pos - run_info['start']
                    run.text = run.text[:relative_start] + new_text
                elif i == len(runs_to_modify) - 1:  # 最后一个run
                    relative_end = end_pos - run_info['start']
                    run.text = run.text[relative_end:]
                else:  # 中间的runs
                    run.text = ""
        
        return True
    
    # 替换段落中的文本
    for paragraph in doc.paragraphs:
        for old_text, new_text in replacements.items():
            if old_text in paragraph.text:
                replace_text_in_runs(paragraph, old_text, new_text)
    
    # 替换表格中的文本
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    for old_text, new_text in replacements.items():
                        if old_text in paragraph.text:
                            replace_text_in_runs(paragraph, old_text, new_text)

def generate_issue_content(issue, form_data):
    """生成问题单文件内容"""
    content = []
    
    # 表单信息
    content.append("=" * 50)
    content.append("问题单信息")
    content.append("=" * 50)
    content.append(f"被测产品名称: {form_data.get('productName', '')}")
    content.append(f"问题单标识: {form_data.get('issueId', '')}")
    content.append(f"被测产品标识: {form_data.get('productId', '')}")
    content.append(f"发现手段: {form_data.get('discoveryMethod', '')}")
    content.append(f"问题追踪: {form_data.get('issueTracking', '')}")
    content.append(f"问题类别: {', '.join(form_data.get('issueCategories', []))}")
    content.append(f"问题级别: {issue.get('level', '')}")
    content.append("")
    
    # 问题单详细信息
    content.append("=" * 50)
    content.append("问题详情")
    content.append("=" * 50)
    content.append(f"问题ID: {issue.get('id', '')}")
    content.append(f"问题摘要: {issue.get('summary', '')}")
    content.append(f"问题级别: {issue.get('level', '')}")
    content.append(f"相关文档: {issue.get('relatedDocFile', '')}")
    content.append(f"相关代码: {issue.get('relatedCodeFile', '')}")
    content.append(f"创建时间: {issue.get('createdDate', '')}")
    content.append(f"状态: {issue.get('status', '')}")
    content.append("")
    
    # 问题描述
    content.append("=" * 50)
    content.append("问题描述")
    content.append("=" * 50)
    description = issue.get('description', '暂无描述')
    content.append(description)
    content.append("")
    
    return "\n".join(content)

def include_related_blocks(related_code, all_code_blocks):
    """
    检查查询结果中每个 code_block 的 related_id，将缺失的相关 block 加入结果
    
    参数:
        related_code: 查询返回的相关代码块列表，格式为 [{"file": "xxx", "range": [start, end]}, ...]
        all_code_blocks: 所有代码块的列表，包含完整的代码块信息
        
    返回:
        包含相关块的完整代码块列表
    """
    # 创建一个字典，以便快速查找代码块
    block_dict = {}
    for block in all_code_blocks:
        # 使用文件名和行号范围作为唯一标识
        key = (block['file'], tuple(block['range']))
        block_dict[key] = block
    
    # 首先根据 file 和 range 匹配到完整的代码块
    matched_blocks = []
    for related_item in related_code:
        file_name = related_item['file']
        range_info = related_item['range']
        key = (file_name, tuple(range_info))
        
        if key in block_dict:
            matched_blocks.append(block_dict[key])
        else:
            # 如果精确匹配失败，尝试找到包含该范围的代码块
            for block in all_code_blocks:
                if (block['file'] == file_name and 
                    block['range'][0] <= range_info[0] and 
                    block['range'][1] >= range_info[1]):
                    matched_blocks.append(block)
                    break
                
                # 如果精确匹配失败，尝试找到小于该范围的代码块
                elif (block['file'] == file_name and 
                    block['range'][0] >= range_info[0] and 
                    block['range'][1] <= range_info[1]):
                    matched_blocks.append(block)

    
    # 创建结果集合，避免重复
    result_blocks = []
    added_keys = set()
    
    # 添加匹配到的代码块
    for block in matched_blocks:
        key = (block['file'], tuple(block['range']))
        if key not in added_keys:
            result_blocks.append(block)
            added_keys.add(key)
    
    # 仅检查匹配到的代码块的一层 related_id，不递归
    for matched_block in matched_blocks:
        # 检查当前块的 related_id
        if 'related_id' in matched_block and matched_block['related_id']:
            for related_id in matched_block['related_id']:
                # 在所有代码块中查找对应的 related_id
                for block in all_code_blocks:
                    if block.get('id') == related_id:
                        # key = (block['file'], tuple(block['range']))
                        # if key not in added_keys:
                            
                        # 按照related_range添加具体的代码片段
                        temp_block = {}
                        temp_block['file'] = block['file']
                        temp_block['range'] = []
                        
                        re_id = [matched_block['related_range'][str(block['id'])]]
                        if len(re_id) > 1:
                            temp_block['range'].append(re_id)
                        else:
                            temp_block['range'] = [re_id[0], re_id[0]]
                            
                        # key = (block['file'], temp_block['range'])
                        # if key not in added_keys:
                            # print(temp_block['range'])
                        temp_block['type'] = block['type']
                        # # 按照\n切分
                        temp_list = block['code'].split('\n')
                                      
                        pos_start = temp_block['range'][0] - block['range'][0]
                        pos_end = temp_block['range'][1] - block['range'][0]
                        
                        temp_block['code'] = temp_list[pos_start:pos_end+1][0]
                        
                        
                        temp_block['id'] = block['id']
                        temp_block['related_id'] = []
                        temp_block['related_id'].append(matched_block['id'])
                        temp_block['related_range'] = {str(matched_block['id']):block['related_range'][str(matched_block['id'])]}
                        
                        
                        # print(key)
                        # print(temp_block)
                        result_blocks.append(temp_block)
                        
                        # print(block)
                        # sys.exit()
                        # result_blocks.append(block)
                        added_keys.add(key)
                        break
    
    return result_blocks

def split_markdown_to_blocks(md_content):
    """
    将Markdown内容按标题分解为块，返回包含内容和字符偏移量的块信息
    参考split_markdown.py的实现逻辑
    """
    original_content = md_content
    target_flag = '# <div class="page"></div>'
    content_start_offset = 0
    
    # 如果存在目标标志，从标志后开始处理
    if target_flag in md_content:
        parts = md_content.split(target_flag, 1)
        if len(parts) > 1:
            content_start_offset = len(parts[0]) + len(target_flag)
            md_content = parts[1]
    
    # 匹配所有标题
    heading_pattern = re.compile(r'^(#{1,}) (.*)$', re.M)
    headings = [(match.start(), len(match.group(1)), match.group(0))
                for match in heading_pattern.finditer(md_content)]
    
    blocks = []
    n = len(headings)
    
    # 处理每个标题间的内容，筛选叶子标题
    for i in range(n):
        cur_pos, cur_level, cur_heading = headings[i]
        # 确定当前标题的结束位置
        next_pos = headings[i+1][0] if (i+1 < n) else len(md_content)
        # 提取当前标题到下一个标题之间的内容
        content = md_content[cur_pos:next_pos].strip()
        
        if '\n' not in content:  # 只有标题没有内容，不保存
            continue
            
        # 计算在原始文档中的字符偏移量
        actual_start = content_start_offset + cur_pos
        actual_end = content_start_offset + cur_pos + len(content)
        
        blocks.append({
            'content': content,
            'start': actual_start,
            'end': actual_end
        })
    
    return blocks

class DocxNativeParser:
    """
    【通用兼容版解析器】
    保留这个强大的解析器，因为它能把 VML/文本框 里的代码“挖”出来变成普通的 para 段落。
    这样后续的 parse_programming_rules 才能像处理普通文字一样处理代码。
    """
    def __init__(self, filepath, debug=False):
        self.filepath = filepath
        self.debug = debug
        self.elements = [] 
        if self.debug:
            print(f"\n[Parser] 🚀 开始解析文件: {filepath}")
        self._parse()

    def _get_tag_name(self, element):
        return element.tag.split('}')[-1]

    def _extract_text_from_node_recursive(self, node):
        text_parts = []
        tag = self._get_tag_name(node)

        # 核心：遇到文本框 (txbxContent) -> 强制提取为独立代码块
        if tag == 'txbxContent':
            code_lines = []
            for child in node:
                if self._get_tag_name(child) == 'p':
                    line_text = self._get_pure_text(child)
                    if line_text.strip():
                        code_lines.append(line_text)
            if code_lines:
                # 前后加换行，确保独立
                return ["\n" + "\n".join(code_lines) + "\n"]
            return []

        if tag == 't' and node.text:
            text_parts.append(node.text)
        
        for child in node:
            text_parts.extend(self._extract_text_from_node_recursive(child))
        return text_parts

    def _get_pure_text(self, node):
        text = ""
        tag = self._get_tag_name(node)
        if tag == 't' and node.text:
            text += node.text
        for child in node:
            text += self._get_pure_text(child)
        return text

    def _process_paragraph_node(self, p_node):
        parts = self._extract_text_from_node_recursive(p_node)
        return "".join(parts)

    def _parse(self):
        try:
            with zipfile.ZipFile(self.filepath, 'r') as z:
                xml_content = z.read('word/document.xml')
            
            tree = ET.fromstring(xml_content)
            body = None
            for elem in tree.iter():
                if self._get_tag_name(elem) == 'body':
                    body = elem
                    break
            
            if body is None:
                return

            para_count = 0
            table_count = 0

            for child in body:
                tag = self._get_tag_name(child)
                
                # 处理段落
                if tag == 'p': 
                    text = self._process_paragraph_node(child)
                    if text.strip(): 
                        self.elements.append({'type': 'para', 'text': text})
                        para_count += 1
                
                # 处理表格 (问题单需要这个)
                elif tag == 'tbl':
                    table_rows = []
                    for row in child:
                        if self._get_tag_name(row) != 'tr': continue
                        row_cells = []
                        for cell in row:
                            if self._get_tag_name(cell) != 'tc': continue
                            cell_text_parts = []
                            for p in cell:
                                if self._get_tag_name(p) == 'p':
                                    p_text = self._process_paragraph_node(p)
                                    if p_text: cell_text_parts.append(p_text)
                            full_cell_text = "\n".join(cell_text_parts)
                            row_cells.append(full_cell_text.strip())
                        table_rows.append(row_cells)
                    
                    if table_rows:
                        self.elements.append({'type': 'table', 'rows': table_rows})
                        table_count += 1
            
            if self.debug:
                print(f"[Parser] ✅ 解析完成. 段落: {para_count}, 表格: {table_count}")

        except Exception as e:
            print(f"[Parser] ❌ 解析 XML 出错: {e}")

    def get_full_text(self):
        lines = []
        for el in self.elements:
            if el['type'] == 'para':
                lines.append(el['text'])
            elif el['type'] == 'table':
                for row in el['rows']:
                    lines.append(" | ".join(row))
        return "\n".join(lines)


def read_docx_text(path):
    parser = DocxNativeParser(path)
    return parser.get_full_text()


# ==========================================
# 1. 编程规则解析 (参考你提供的版本逻辑)
# ==========================================
def parse_programming_rules(docx_path, debug=True):
    print("="*60)
    print(f"🛠️  正在解析编程规则: {docx_path}")
    
    # 使用增强版 Parser，这样文本框里的代码会被提取为 text
    parser = DocxNativeParser(docx_path, debug=debug)
    rules = []
    
    current_rule = {}
    capturing_code = None 
    
    # 使用你提供的正则：匹配 R-1-1-1
    rule_id_pattern = re.compile(r'(R-\d+-\d+-\d+([A-Z]?))') 
    
    # 关键词
    violation_keys = ["违背示例", "错误示例", "违背", "不符合", "违背 1", "违背 2", "提示 1", "提示 2"]
    compliance_keys = ["遵循示例", "正确示例", "遵循", "符合"]

    for i, el in enumerate(parser.elements):
        # 按照你的要求，规则解析只看段落
        if el['type'] != 'para': continue
            
        text = el['text'].strip()
        if not text: continue
        
        # 1. 尝试匹配规则 ID
        match = rule_id_pattern.search(text)
        
        if match:
            if current_rule:
                rules.append(current_rule)
                if debug: print(f"   💾 [保存上一条] ID: {current_rule['id']}")
            
            rule_id = match.group(1)
            #description = text
            next_el = (parser.elements)[i+1]
            description = next_el['text'].strip()
            # 取最后一行，防止出现多余的代码
            description = description.splitlines()
            description = description[-1]
            # 过滤掉异常字符
            description = description.replace("违背示例：","") 
            #print(description)
            
            #if debug: print(f"🟢 [发现新规则] ID: {rule_id} | 描述: {description[:20]}...")
            if debug: print(f"🟢 [发现新规则] ID: {rule_id} | 描述: {description}.")

            current_rule = {
                "id": rule_id,
                "description": description, 
                "violation_code": "",
                "compliance_code": ""
            }
            capturing_code = None
            continue
            
        if not current_rule: continue

        # 2. 识别示例标记
        # 注意：Parser 可能会把代码提取在“违背示例”同一行的后面
        # 所以我们得检查这一行除去关键词后，是否还有残留内容（代码）
        
        is_mode_switch = False
        
        # 检查违背
        for k in violation_keys:
            if k in text:
                capturing_code = 'violation'
                if debug: print(f"   ⚠️  [进入模式] 违背示例")
                # 【重要修改】检查同行的残留代码
                code_part = text.replace(k, "", 1).replace(":", "").replace("：", "").strip()
                if len(code_part) > 1: # 如果剩下的内容够长，说明代码跟在后面了
                    current_rule['violation_code'] += code_part + "\n"
                is_mode_switch = True
                break
        
        if is_mode_switch: continue

        # 检查遵循
        for k in compliance_keys:
            if k in text:
                capturing_code = 'compliance'
                if debug: print(f"   ✅ [进入模式] 遵循示例")
                # 【重要修改】检查同行的残留代码
                code_part = text.replace(k, "", 1).replace(":", "").replace("：", "").strip()
                if len(code_part) > 1:
                    current_rule['compliance_code'] += code_part + "\n"
                is_mode_switch = True
                break
        
        if is_mode_switch: continue
            
        # 3. 提取代码 (只有处于模式中才提取)
        if capturing_code == 'violation':
            current_rule['violation_code'] += text + "\n"
        elif capturing_code == 'compliance':
            current_rule['compliance_code'] += text + "\n"
            
    if current_rule:
        rules.append(current_rule)
        
    print(f"🏁 规则解析结束. 共提取到 {len(rules)} 条规则.")
    return rules


# ==========================================
# 2. 问题单解析 (保持当前版本，依赖表格)
# ==========================================
def parse_issue_reports(docx_path, debug=True):
    if debug:
        print("="*60)
        print(f"🛠️  正在解析问题单: {docx_path}")

    # 问题单依赖表格结构
    parser = DocxNativeParser(docx_path, debug=debug)
    
    all_issues = []     
    current_issue = {}  
    
    key_map = {
        "问题描述": "desc", "问题内容": "desc",
        "处理意见": "opinion", "改正措施": "opinion", "修改建议": "opinion",
        "问题追踪": "trace_id", "用例标识": "trace_id",
        "问题单标识": "id", "问题标识": "id", "问题单号": "id"
    }

    for el in parser.elements:
        # 只看表格
        if el['type'] != 'table': continue
            
        table_rows = el['rows']
        
        for row in table_rows:
            for i in range(len(row)):
                cell_text = row[i].replace(" ", "").replace(":", "").replace("：", "").strip()
                
                # 检查 Key
                found_key = None
                for k_word, k_field in key_map.items():
                    if k_word in cell_text and len(cell_text) < 20: 
                        found_key = k_field
                        break
                
                if found_key:
                    if found_key == "id":
                        if current_issue and ("id" in current_issue or "desc" in current_issue):
                            all_issues.append(current_issue)
                            current_issue = {} 

                    # 提取 Value (优先取右侧单元格)
                    value = ""
                    if i + 1 < len(row):
                        value = row[i+1].strip()
                    
                    # 简单的防错位检查
                    is_next_cell_key = False
                    clean_val = value.replace(" ", "").replace(":", "")
                    for k in key_map.keys():
                        if k in clean_val and len(clean_val) < 20:
                            is_next_cell_key = True
                            break
                    
                    if value and not is_next_cell_key:
                        # 清理 Value 中的 Key 前缀
                        for k_word in key_map.keys():
                            if value.startswith(k_word):
                                value = value.replace(k_word, "", 1).lstrip("：: ")
                        
                        if found_key in current_issue:
                            current_issue[found_key] += "\n" + value
                        else:
                            current_issue[found_key] = value

    if current_issue.get("desc") or current_issue.get("opinion") or current_issue.get("id"):
        if "id" not in current_issue:
            current_issue["id"] = f"issue_autogen_{len(all_issues)+1}"
        all_issues.append(current_issue)

    return all_issues

# 格式化函数 (保持不变)
def format_rules_for_rag(rules):
    formatted = []
    for idx, r in enumerate(rules):
        combined_code = ""
        if r['violation_code'].strip():
            combined_code += f"// [违背示例]\n{r['violation_code']}\n"
        if r['compliance_code'].strip():
            combined_code += f"// [遵循示例]\n{r['compliance_code']}"
        if not combined_code.strip():
            combined_code = "// 文档中未提取到明确示例代码"

        formatted.append({
            "id": r.get('id', f"rule_{idx}"),
            "category": "编程规则",
            "docRanges": [{"content": r['description'], "documentId": "rules_doc"}],
            "codeRanges": [{"content": combined_code, "documentId": "rules_code"}]
        })
    return {"annotations": formatted}

def format_issues_for_rag(issues):
    formatted = []
    for idx, i in enumerate(issues):
        search_text = f"【问题描述】\n{i.get('desc', '')}\n\n【处理意见】\n{i.get('opinion', '')}"
        func_name = i.get('trace_id', 'Unknown_Trace_ID')
        code_text = f"// 相关追踪标识/用例ID: {func_name}\n// (此处暂存标识，后续可扩展为提取具体函数代码)"
        
        formatted.append({
            "id": i.get('id', f"issue_{idx}"),
            "category": "问题单",
            "docRanges": [{"content": search_text, "documentId": "issue_doc"}],
            "codeRanges": [{"content": code_text, "documentId": func_name}]
        })
    return {"annotations": formatted}