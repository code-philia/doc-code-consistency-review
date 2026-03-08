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
    
    
def _flush_buffer(blocks, lines, start_offset, filename, block_type):
    content = "".join(lines)
    # 过滤markdown内容
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
    output_path = r'.'
    all_json_file = get_all_doc_blocks(md_path, all_rel_doc_paths)