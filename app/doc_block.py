import re
import os
from typing import List, Dict
import logging

logging.basicConfig(
    level = logging.INFO,
    format='%(message)s'
    )

logger = logging.getLogger(__name__)
target_flag = '# <div class="page"></div>'

def chunk_markdown(filename: str, content: str) -> List[Dict]:
    """
    Split markdown content into granular blocks using Semantic Grouping strategy.
    
    Strategy:
    1. Headers (H1-H6) act as primary delimiters and start new blocks.
    2. Code blocks (```...```) are treated as standalone blocks (critical for code alignment).
    3. Normal text (paragraphs, lists, blockquotes) following a header are grouped with that header 
       or form a block if they appear before any header.
    4. Consecutive text elements are merged to avoid over-fragmentation.
    """
    blocks = []
    
    lines = content.splitlines(keepends=True)
    
    current_offset = 0
    
    # State constants
    STATE_NORMAL = 0
    STATE_CODE_BLOCK = 1
    
    state = STATE_NORMAL
    buffer_lines = []
    buffer_start_offset = 0
    
    # Context variables
    code_fence_char = ''
    code_fence_len = 0
    
    i = 0
    while i < len(lines):
        line = lines[i]
        line_len = len(line)
        stripped_line = line.strip()
        
        
        # --- STATE: CODE BLOCK ---
        if state == STATE_CODE_BLOCK:
            buffer_lines.append(line)
            # Check for closing fence
            if stripped_line.startswith(code_fence_char * code_fence_len):
                # End of code block - Save immediately as a standalone block
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename, "code_block")
                buffer_lines = []
                state = STATE_NORMAL
            
            current_offset += line_len
            i += 1
            continue
            
        # --- STATE: NORMAL ---
        
        # 1. Check for Code Block Start
        code_match = re.match(r'^(\s*)(`{3,}|~{3,})', line)
        if code_match:
            # Flush previous text buffer
            if buffer_lines:
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename, "text")
                buffer_lines = []
            
            state = STATE_CODE_BLOCK
            buffer_start_offset = current_offset
            buffer_lines.append(line)
            code_fence_char = code_match.group(2)[0]
            code_fence_len = len(code_match.group(2))
            
            current_offset += line_len
            i += 1
            continue
            
        # 2. 定位到标题的#标记 或者 无#的数字开头的标题 或者 附录中大写字母开头的标题
        if re.match(r'^#{1,6}\s', line) or re.match(r'^\s*\d+(\.\d+)*\s*.+$', line) or re.match(r'^\s*[A-Z](?:\.\d+)*\s+.*$', line):
        
            # Flush previous text buffer
            if buffer_lines:
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename, "text")
                buffer_lines = []
            
            # Start new buffer with this header
            buffer_start_offset = current_offset
            buffer_lines.append(line)
            
            current_offset += line_len
            i += 1
            continue
            
        # 3. Normal Text (Paragraphs, Lists, Tables, Blockquotes, etc.)
        if not buffer_lines:
            buffer_start_offset = current_offset
        buffer_lines.append(line)
        current_offset += line_len
        i += 1

    # Flush remaining buffer
    if buffer_lines:
        block_type = "code_block" if state == STATE_CODE_BLOCK else "text"
        _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename, block_type)
    #for i in range(0,3):
    #    logger.info(blocks[i])
    
    return blocks
 

def filter_content_by_keywords(content, filter_keywords=None):
    """
    过滤掉包含特定关键词的标题行及其后续内容（或者仅判断是否包含）
    这里演示如何判断 content 中是否包含这些“标题行”
    """
    
    # 如果未提供关键词，使用默认列表
    if filter_keywords is None:
        # 按照438GJB 过滤不需要的章节
        # 定义要过滤的关键词列表
        filter_keywords = ["## 标识", "## 系统概述", "## 文档概述", "### 文档的主要用途", "### 文档的主要内容", "### 保密要求", "# 引用和依据文档", "## 适应性需求", "## 安全性需求", "## 保密性需求", "## CSCI环境需求", "## 计算机资源需求", "### 计算机硬件需求", "### 计算机软件需求", "### 计算机通信需求", "## 软件质量因素", "## 设计和实现约束", "## 人员需求", "### 开发人员需求", "### 测试人员需求", "## 培训需求", "## 设计和实现约束", "## 软件保障需求", "## 其他需求", "## 验收、交付和包装需求", "### 验收准则", "### 交付形式", "### 交付文档", "### 版权保护要求", "## 需求的优先顺序和关键程度", "# 合格性规定", "# 需求可追踪性", "## 软件需求追踪任务书用户需求", "## 任务书用户需求追踪软件需求", "# 注释", "### 系统和软件用途", "### 当前和计划的运行现场", "# 引用文件", "# 运行环境要求", "## 硬件环境", "## 软件环境", "## 关键性要求", "### 可靠性", "### 安全性", "### 保密性", "# 设计约束", "## 环境要求", "## 重用要求", "# 质量控制要求", "## 软件关键性等级", "## 对分承制方的要求", "## 配置管理", "## 测试要求", "# 验收和交付", "## 验收准则", "### 一次验收", "### 二次验收", "## 软件交付形式", "# 版权保护要求", "# 软件保障要求", "# 进度和里程碑", "## 标准", "## 文档", "# 引用文档", "## 交付", "## 评审要求", "## 对分承制方要求", "## 项目里程碑", "## 需方参与的评审活动", "## 项目需方、用户、开发方和保障机构"]

    # 1. 预处理关键词，提取核心文本
    # 例如："## 1.1 标识" -> "标识"
    # 例如："### 保密要求" -> "保密要求"
    cleaned_keywords = []
    for kw in filter_keywords:
        # 去掉开头的 # 和空格，只保留后面的文字
        # 使用 lstrip('# ') 去掉左边的 # 和空格
        core_text = kw.lstrip('# ').strip()
        if core_text:
            cleaned_keywords.append(core_text)

    # 2. 构建正则表达式列表
    # 我们不需要为每个关键词编译一次，可以合并成一个大的正则，或者逐个检查
    # 这里为了清晰，我们构建一个能够匹配“任意级别、任意序号、包含核心词”的正则模式
    
    # 通用标题匹配模式：
    # ^#{1,6}      : 行首，1-6个#
    # \s*          : 可选空格
    # (\d+\.?)*    : 可选的序号部分 (如 1, 1.1, 1.1.2)
    # \s*          : 序号和标题文字之间的可选空格
    # (核心词)     : 必须包含的核心关键词
    # .*           : 标题其余部分
    
    # 为了性能，我们可以将所有核心词合并成一个正则的“或”关系，或者逐个匹配
    # 鉴于关键词数量不多，逐个匹配逻辑更清晰，且易于调试
    
    found_filtered_heading = False
    
    # 编译一个通用的“标题行”结构正则，用于预筛选，提高效率
    # 这个正则匹配所有可能的标题行，不管内容是什么
    heading_structure_pattern = re.compile(r'^#{1,6}\s+(\d+\.?)*\s*(.+)$', re.MULTILINE)
    
    lines = content.splitlines()
    
    for line in lines:
        # 先判断这行是不是标题行
        match = heading_structure_pattern.match(line)
        if not match:
            continue
            
        # match.group(2) 是去掉了 # 和序号后的标题纯文本
        title_text = match.group(2)
        
        # 检查这个标题文本是否包含任何过滤关键词
        # 注意：这里使用 "in" 判断子串，因为标题可能是 "1.1 标识管理"，包含 "标识"
        for core_kw in cleaned_keywords:
            if core_kw in title_text:
                found_filtered_heading = True
                # 如果只需要判断是否存在，可以提前返回
                # return True 
                break
        
        if found_filtered_heading:
            break

    return found_filtered_heading 

# 过滤markdown内容   
def _flush_buffer(blocks, lines, start_offset, filename, block_type):
    content = "".join(lines)
    
    # Ignore purely empty blocks (whitespace only) unless it's a code block (which might be empty)
    if not content.strip() and block_type != "code_block":
        return
    # 过滤特定格式的无关内容
    if "# 引用文件" in content or target_flag in content:
        return
    # 过滤封皮、扉页、签署页等内容
    if "质量会签" in content or "定密批准" in content:
        return
    # 过滤单行标题（无具体内容的），最后一个\n后无内容都算
    if not content.strip('\n').count('\n'):
        return
        
    # 按照438GJB 过滤不需要的章节
    # 检查 content 是否包含列表中的任意一个关键词
    if filter_content_by_keywords(content):
        return

    # For text blocks, if it's extremely short (e.g. just a newline), skip or merge?
    # Here we just skip purely empty ones.
    if "# 引用文件" in content:
        return
    blocks.append({
        "type": block_type,
        "content": content,
        "start": start_offset,
        "end": start_offset + len(content),
        "filename": filename
    })

def get_all_doc_blocks(doc_base_path: str, all_rel_doc_paths: List[str]) -> List[Dict]:
    all_blocks = []
    for rel_path in all_rel_doc_paths:
        abs_path = os.path.join(doc_base_path, rel_path)

        if not os.path.exists(abs_path):
            continue
            
        with open(abs_path, 'r', encoding='utf-8') as f:
            content = f.read()

        if target_flag in content:
            content = content.split(target_flag, 1)[1]
        else:
            logger.info("The flag {target_flag}is not exist.")  
        file_blocks = chunk_markdown(rel_path, content)
        all_blocks.extend(file_blocks)
        
    return all_blocks

if __name__ == '__main__':
    md_path= r'.\doc_repo'
    all_rel_doc_paths = ["..md"]
    output_path = r'..'
    all_json_file = get_all_doc_blocks(md_path, all_rel_doc_paths)