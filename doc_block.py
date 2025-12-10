import re
import os
from typing import List, Dict

def chunk_markdown(filename: str, content: str) -> List[Dict]:
    """
    Split markdown content into granular blocks (Paragraphs, Headers, Code Blocks, Math, Tables).
    Tracks character offsets.
    """
    blocks = []
    lines = content.splitlines(keepends=True)
    total_len = len(content)
    
    current_offset = 0
    
    # State constants
    STATE_NORMAL = 0
    STATE_CODE_BLOCK = 1
    STATE_MATH_BLOCK = 2
    STATE_TABLE = 3
    
    state = STATE_NORMAL
    buffer_lines = []
    buffer_start_offset = 0
    
    # Context variables for block parsing
    code_fence_char = ''
    code_fence_len = 0
    
    i = 0
    while i < len(lines):
        line = lines[i]
        line_len = len(line)
        stripped_line = line.strip()
        
        # Determine next state based on current line and state
        
        if state == STATE_CODE_BLOCK:
            buffer_lines.append(line)
            # Check for closing fence
            # Fence must match the opening fence char and be at least as long
            if stripped_line.startswith(code_fence_char * code_fence_len):
                # End of code block
                block_content = "".join(buffer_lines)
                blocks.append({
                    "type": "code_block",
                    "content": block_content,
                    "start": buffer_start_offset,
                    "end": buffer_start_offset + len(block_content),
                    "filename": filename
                })
                buffer_lines = []
                state = STATE_NORMAL
            
            current_offset += line_len
            i += 1
            continue
            
        if state == STATE_MATH_BLOCK:
            buffer_lines.append(line)
            if stripped_line == '$$':
                # End of math block
                block_content = "".join(buffer_lines)
                blocks.append({
                    "type": "math_block",
                    "content": block_content,
                    "start": buffer_start_offset,
                    "end": buffer_start_offset + len(block_content),
                    "filename": filename
                })
                buffer_lines = []
                state = STATE_NORMAL
            
            current_offset += line_len
            i += 1
            continue
            
        if state == STATE_TABLE:
            # Check if table continues
            # Table lines usually start with |
            if stripped_line.startswith('|'):
                buffer_lines.append(line)
                current_offset += line_len
                i += 1
                continue
            else:
                # End of table
                block_content = "".join(buffer_lines)
                blocks.append({
                    "type": "table",
                    "content": block_content,
                    "start": buffer_start_offset,
                    "end": buffer_start_offset + len(block_content),
                    "filename": filename
                })
                buffer_lines = []
                state = STATE_NORMAL
                # Re-evaluate current line in NORMAL state
                continue

        # STATE_NORMAL
        
        # Check for Code Block Start
        code_match = re.match(r'^(\s*)(`{3,}|~{3,})', line)
        if code_match:
            # Flush current buffer if any
            if buffer_lines:
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename)
                buffer_lines = []
            
            state = STATE_CODE_BLOCK
            buffer_start_offset = current_offset
            buffer_lines.append(line)
            code_fence_char = code_match.group(2)[0]
            code_fence_len = len(code_match.group(2))
            
            current_offset += line_len
            i += 1
            continue

        # Check for Math Block Start
        if stripped_line == '$$':
            if buffer_lines:
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename)
                buffer_lines = []
            
            state = STATE_MATH_BLOCK
            buffer_start_offset = current_offset
            buffer_lines.append(line)
            
            current_offset += line_len
            i += 1
            continue

        # Check for Header
        if re.match(r'^#{1,6}\s', line):
            if buffer_lines:
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename)
                buffer_lines = []
            
            # Header is a block itself
            blocks.append({
                "type": "header",
                "content": line,
                "start": current_offset,
                "end": current_offset + line_len,
                "filename": filename
            })
            current_offset += line_len
            i += 1
            continue

        # Check for Table Start
        # A table must have a header row and a separator row.
        # Simple check: line starts with | and next line starts with | and contains ---
        if stripped_line.startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|.*[-]{3,}', lines[i+1]):
            if buffer_lines:
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename)
                buffer_lines = []
            
            state = STATE_TABLE
            buffer_start_offset = current_offset
            buffer_lines.append(line)
            current_offset += line_len
            i += 1
            continue

        # Check for Blank Line (Paragraph Separator)
        if not stripped_line:
            if buffer_lines:
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename)
                buffer_lines = []
            
            # We don't create blocks for empty lines, just skip
            current_offset += line_len
            i += 1
            continue
            
        # Check for Blockquote
        if stripped_line.startswith('>'):
             # If current buffer is not empty and not a quote, flush it
            if buffer_lines and not buffer_lines[0].strip().startswith('>'):
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename)
                buffer_lines = []
                buffer_start_offset = current_offset
            elif not buffer_lines:
                buffer_start_offset = current_offset
            
            buffer_lines.append(line)
            current_offset += line_len
            i += 1
            continue

        # Check for List Item
        if re.match(r'^(\s*)([*+-]|\d+\.)\s+', line):
             # If current buffer is not empty and not a list, flush it
             # Note: This is a simple heuristic. It might split lists if they have paragraphs in between.
            if buffer_lines and not re.match(r'^(\s*)([*+-]|\d+\.)\s+', buffer_lines[-1]):
                 # If previous line was text, and this is a list, flush text.
                 # Markdown allows tight lists. But for decomposition, separating text and list is usually good.
                _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename)
                buffer_lines = []
                buffer_start_offset = current_offset
            elif not buffer_lines:
                buffer_start_offset = current_offset
            
            buffer_lines.append(line)
            current_offset += line_len
            i += 1
            continue

        # Normal text line
        if not buffer_lines:
            buffer_start_offset = current_offset
        buffer_lines.append(line)
        current_offset += line_len
        i += 1

    # Flush remaining buffer
    if buffer_lines:
        # Check state to close properly if file ends abruptly
        if state == STATE_CODE_BLOCK:
             # Unclosed code block, treat as code block or text? Treat as code block for robustness
             block_content = "".join(buffer_lines)
             blocks.append({
                "type": "code_block",
                "content": block_content,
                "start": buffer_start_offset,
                "end": buffer_start_offset + len(block_content),
                "filename": filename
            })
        elif state == STATE_MATH_BLOCK:
             block_content = "".join(buffer_lines)
             blocks.append({
                "type": "math_block",
                "content": block_content,
                "start": buffer_start_offset,
                "end": buffer_start_offset + len(block_content),
                "filename": filename
            })
        elif state == STATE_TABLE:
             block_content = "".join(buffer_lines)
             blocks.append({
                "type": "table",
                "content": block_content,
                "start": buffer_start_offset,
                "end": buffer_start_offset + len(block_content),
                "filename": filename
            })
        else:
            _flush_buffer(blocks, buffer_lines, buffer_start_offset, filename)

    return blocks

def _flush_buffer(blocks, lines, start_offset, filename):
    content = "".join(lines)
    # determine type heuristically if needed, currently default to paragraph/text
    # Check if it looks like a list
    if re.match(r'^(\s*)([*+-]|\d+\.)\s+', lines[0]):
        block_type = "list"
    elif lines[0].strip().startswith('>'):
        block_type = "quote"
    else:
        block_type = "paragraph"
        
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
            
        file_blocks = chunk_markdown(rel_path, content)
        all_blocks.extend(file_blocks)
        
    return all_blocks
