import re
import json
import os
import sys
from collections import defaultdict
from typing import Dict, List, Optional, Tuple, Set
# from utils import get_filename_without_extension

index = 0 # 代码块编号，待作为全局变量使用

# START---------------------------
# 需求0：遍历文件夹所有代码，实现分块

def cpp_to_jsonl(code_path, json_name, output_path):
    all_json_file = []
    if not os.path.exists(code_path):
        print("文件夹不存在")
        return
    json_file = os.path.join(output_path, json_name)
    if os.path.exists(json_file):
        os.remove(json_file)
    for filename in os.listdir(code_path):
        #if(filename.lower().endswith('.cpp')):
        code_file = os.path.join(code_path, filename)
        #print(code_path)
        output_json = chunk_cpp_code(filename, code_file, json_file)
        all_json_file.append(json_file)
    
    #return all_json_file
    return output_json


def chunk_cpp_code(filename: str, file_path: str, output_json: str = None) -> List[Dict]:
    """
    对C++代码进行完整分块，优化了连续多行变量定义的识别和处理
    确保所有内容（包括连续多行变量定义）都被正确分块
    
    :param file_path: C++源代码文件路径(.cpp或.h)
    :param output_json: 输出JSON文件路径，为None则不输出文件
    :return: 分块结果列表，每个元素包含代码内容和行号范围
    """
    global index
    # print(f'正在处理======================:{filename}')
    if os.path.isdir(file_path):
        return []
    # 读取文件内容，保留原始行（不包括空行）
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = [line.rstrip('\n') for line in f.readlines()]

    ext = os.path.splitext(file_path)[1].lower()
    start = 0
    if ext in ('.v', '.sv', '.vhd'):
        # print(f'正在处理fpga:{filename}')
        # 过滤 fpga文件开头注释
        i, total = 0, len(lines)
        while i < total:
            s = lines[i].strip()
            if not s:  # 空行跳过
                i += 1
                continue
            if s.startswith('//') or s.startswith('--'):
                i += 1
                continue
            if s.startswith('/*'):
                if '*/' in s:  # 单行 /* */
                    i += 1
                    continue
                for j in range(i, total):  # 多行 /* */
                    if '*/' in lines[j]:
                        i = j + 1
                        break
                else:
                    i = total
                continue
            break
        # lines = lines[i:]
        start = i
    # print(f'处理完成fpga:{filename}')
    total_lines = len(lines)

    if total_lines == 0:
        return []
    
    # 标记已处理的行
    processed = [False] * total_lines
    if start > 0:
        processed[:start] = [True] * start
    chunks = []
    
    # 定义分块模式和处理函数，按优先级排序
    patterns = [
        
        # 2. 多行注释 /* ... */
        (re.compile(r'[\s\ufeff]*\/\*', re.DOTALL),
         lambda i, name: find_multiline_comment_end(lines, i),
         "multiline_comment"),
        
         # 1. 多行注释 //
        (re.compile(r'^[\s\ufeff]*/\*\*'),
         lambda i, name: i + 1,
         "multi_comment"),
        
        # 3. 函数定义（包括模板/成员/友元函数等） 
        # (re.compile(r'^\s*([A-Za-z0-9_*&<>]+\s+)+([A-Za-z_][A-Za-z0-9_]*::\s*)?[A-Za-z_][A-Za-z0-9_~]*\s*\(\s*[^)]*\s*$'), 
        #  lambda i, name: find_function_end(lines, i, processed),
        #  "function"),
        
        # 3.5. 函数定义（跨行）
         #(re.compile(r'^\s*([A-Za-z0-9_*&<>]+\s+)+([A-Za-z_][A-Za-z0-9_]*::\s*)?[A-Za-z_][A-Za-z0-9_~]*\s*\([^)]*\)\s*'),
         (re.compile(r'^\s*([A-Za-z0-9_*<>]+(?:\s+[A-Za-z0-9_*<>]+)*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:::[A-Za-z0-9_]+)?\s*(?:\([^)]*\))?\s*'),
         lambda i, name: find_function_end(lines, i, processed),
         "function"),
        
        # 4. 类和结构体定义
         (re.compile(r'^[\s\ufeff]*(?:(?:class|struct|union)\s+)?(?:[\w:]+::)?[\w<>_]+\s*(?:\s*:\s*(?:public|private|protected)\s+[\w:]+)?\s*'), 
          # (re.compile(r'^[\s\ufeff]*(?:\b(?:class|struct|union)\b\s+)(?:[\w:]+::)?[\w<>_]+\s*(?:\s*:\s*(?:public|private|protected)\s+[\w:]+)?\s*'), 
         lambda i, name: find_class_struct_end(lines, i, processed),
         "class/struct"),

        # 5. 命名空间
        (re.compile(r'^\s*namespace\s+\w*\s*\{'), 
         lambda i, name: find_namespace_end(lines, i, processed),
         "namespace"),

        # 6. 枚举
        (re.compile(r'^\s*enum\s+(\w+\s+)?\{'), 
         lambda i, name: find_enum_end(lines, i, processed),
         "enum"),
        
        # 7. 预处理指令块 (#if, #ifdef等多行结构)
        # (re.compile(r'^\s*#\s*(if|ifdef|ifndef|elif)'), 
        #  lambda i, name: find_preprocessor_block_end(lines, i),
        #  "preprocessor_block"),
        
        # 1. 单行注释 //
        (re.compile(r'^[\s\ufeff]*//.*$'),
         lambda i, name: i + 1,
         "single_comment"),
  
        # 8. 头文件
        #(re.compile(r'^\s*#\s*include'), 
        (re.compile(r'^[\s\ufeff]*#\s*include'), 
         lambda i, name: i + 1,
         "include_single"),
        
        # 9. 单行预处理指令
        (re.compile(r'^\s*'), 
         lambda i, name: i + 1,
         "preprocessor_single"),
        
        
    ]
    
    # 单行语句模式（用于识别变量定义等单行代码）
    single_line_patterns = [
        # 变量定义和声明
        re.compile(r'^\s*(\w+\s+)+(\*|&)?\w+(\s*=\s*[^;]+)?\s*;'),
        # 常量定义
        re.compile(r'^\s*const\s+(\w+\s+)+(\*|&)?\w+(\s*=\s*[^;]+)?\s*;'),
        # 类型定义
        re.compile(r'^\s*typedef\s+.+\s*;'),
        # 返回语句
        re.compile(r'^\s*return\s+.+\s*;'),
        # 跳转语句
        re.compile(r'^\s*(break|continue|goto)\s*;?'),
        # 表达式语句
        re.compile(r'^\s*.+\s*;'),
    ]
    
    comment_dict= {} # 存储结构体/函数前的注释
    
    # 处理所有行，确保每一行都被处理
    i = start
    while i < total_lines:
        #print(lines[i])
        if processed[i]:
            i += 1
            continue
        # 尝试匹配已知的多行模式
        matched = False
        #print(i+1)
        for pattern, end_finder, block_type in patterns:
            match = pattern.match(lines[i])
            if match:
                #print(i+1)
                #print(lines[i])
                #print(pattern)
                start_idx = i
                start_line = i + 1  # 行号从1开始
                
                # 提取名称，如果有
                # print(name)
                # sys.exit()
                end_idx = end_finder(i, block_type) - 1  # 转换为索引
                
                # 确保不超出范围
                end_idx = min(end_idx, total_lines - 1)
                
                # 提取代码块内容
                code = '\n'.join(lines[start_idx:end_idx + 1])
                # print(code)
                #print(block_type)
                # sys.exit()
                # 记录注释但先不添加，后续判断是不是结构体/函数前的注释
                if block_type == 'multiline_comment' or block_type == 'single_comment' or block_type == 'multi_comment': 
                    if not comment_dict: #  # 如果本块前面没有注释，且本块是注释
                        comment_dict = {
                                "file":filename,
                                "range": [start_line, end_idx + 1],
                                "type": block_type,
                                "code": code 
                            }
                     
                    else: #  # 如果本块前面有注释，且本块是注释
                        temp_dict = {
                                "file":filename,
                                "range": [comment_dict["range"][0], end_idx + 1],
                                "type": block_type,
                                "code": comment_dict["code"] + code
                            }
                        comment_dict = temp_dict
                    #print(code)
                    #print(block_type)
                
                else: # 添加到结果
                    
                    # 代码文件开头的注释和#include不存储到代码块
                    # 特殊处理#pragma once
                    if block_type == 'include_single':# or code[0:1] == '#':
                        chunks = []
                        comment_dict= {}
                        
                    # 如果本块前面有注释，且本块不是注释
                    elif comment_dict and block_type != 'multiline_comment' and block_type != 'multi_comment': 
                        if (block_type == "function") and ( '\r' in code or '\n' in code):
                            code_next   = "" 
                            
                            #i_temp = end_idx # + 1
                            #print('end_idx======',end_idx)
                            #end_idx = end_finder(i_temp, block_type) - 1  # 转换为索引
                            
                            # 确保不超出范围
                            end_idx = min(end_idx, total_lines - 1)
                            
                            # 提取代码块内容
                            code = '\n'.join(lines[start_idx:end_idx+1])
                            # print('end_idx======',end_idx)
                            #print(code)
                            # sys.exit()
                        
                        chunks.append({
                            "file":filename,
                            "range": [comment_dict['range'][0], end_idx+1],
                            "type": block_type,
                            "code": comment_dict['code'] + '\n' + code 
                        })
                        #print(chunks)
                        comment_dict= {}
                      
                    # 如果本块前面是注释，且本块是注释
                    elif comment_dict and block_type == 'multi_comment': 
                        # print(code)
                        # print(block_type)
                        chunks.append({
                                comment_dict
                            })
                    
                    # 如果本块前面没有注释
                    else:
                        
                        # 函数的参数列表可能会换行，有多行参数，需要特殊处理
                        if (block_type == "function") and ( '\r' in code or '\n' in code):
                            code_next   = "" 
                            
                            #i_temp = end_idx #+ 1
                            #end_idx = end_finder(i_temp, block_type) - 1  # 转换为索引
                            
                            # 确保不超出范围
                            end_idx = min(end_idx, total_lines - 1)
                            # print(end_idx)
                            # sys.exit()
                            # 提取代码块内容
                            code = '\n'.join(lines[start_idx:end_idx + 1])
                            
                            # print(code)
                            # sys.exit()

                        if code != "": # 空行不保存
                            chunks.append({
                                "file":filename,
                                "range": [start_line, end_idx + 1],
                                "type": block_type,
                                "code": code 
                            })
                        
                
                # 标记已处理
                for j in range(start_idx, end_idx + 1):
                    processed[j] = True
                
                i = end_idx + 1
                matched = True
                break
            
            # else:
            #     print(lines[i])
                
        # 如果没有匹配到多行模式，处理单行和连续多行语句
        if not matched:
            # 检查当前行是否是单行语句
            current_line = lines[i]
            is_single_line = is_match_any_pattern(current_line, single_line_patterns) or \
                           current_line.strip().startswith('//') or \
                           not current_line.strip()
            # print(current_line)
            if is_single_line:
                # 检查是否可以合并连续的单行语句（如连续的变量定义）
                start_idx = i
                end_idx = i
                
                # 尝试扩展到连续的单行语句
                while end_idx + 1 < total_lines and not processed[end_idx + 1]:
                    next_line = lines[end_idx + 1]
                    next_is_single = is_match_any_pattern(next_line, single_line_patterns) or \
                                   next_line.strip().startswith('//') or \
                                   not next_line.strip()
                    
                    # 只有相同类型的连续单行语句才合并
                    if next_is_single:
                        end_idx += 1
                    else:
                        break
                
                # 提取连续单行语句块内容
                code = '\n'.join(lines[start_idx:end_idx + 1])
                start_line = start_idx + 1
                end_line = end_idx + 1
                
                # 添加到结果
                if len(code) > 1 and code[1] != '#':
                    if code != "" and code != " " and code != '\n': # 空行不保存
                        chunks.append({
                            "file":filename,
                            "range": [start_line, end_line],
                            "type": block_type,
                            "code": code
                        })
                
                # 标记已处理
                for j in range(start_idx, end_idx + 1):
                    processed[j] = True
                
                i = end_idx + 1
            else:
                # 作为普通单行处理
                if len(current_line) > 1 and current_line[1] != '#':
                    if current_line != "" and current_line != " " and current_line != '\n': # 空行不保存
                        chunks.append({
                            "file":filename,
                            "range": [i + 1, i + 1],
                            "type": block_type,
                            "code": current_line
                        })
                processed[i] = True
                i += 1
    
    # 验证所有行都已处理
    unprocessed = [i for i in range(total_lines) if not processed[i]]
    if unprocessed:
        print(f"警告: 发现未处理的行 - 行号: {[i+1 for i in unprocessed]}")
        # 强制处理未处理的行
        for idx in unprocessed:
            if current_line != "": # 空行不保存
                chunks.append({
                    "file":filename,
                    "range": [idx + 1, idx + 1],
                    "type": block_type,
                    "code": lines[idx]      
                })
        # 按行号排序
        chunks.sort(key=lambda x: x["range"][0])
    
    if chunks:
        # 输出JSON文件
        if output_json:
            with open(output_json, "a", encoding="utf-8") as f:
                for item in chunks:
                    item['id'] = index
                    item['related_id'] = []
                    item['related_range'] = {}
                    index = 1+index
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")
            #with open(output_json, 'a', encoding='utf-8') as f:
            #    json.dump(chunks, f, ensure_ascii=False, indent=2)
            
        # 打印统计信息
        print(f"成功处理文件: {os.path.basename(file_path)}")
        print(f"总代码行数: {total_lines}")
        print(f"生成块数量: {len(chunks)}")
    
    # print(f'处理完成======================:{filename}')
    # return output_json # main调试用
    return chunks # 集成到前端时，返回代码块

def is_match_any_pattern(line: str, patterns: List[re.Pattern]) -> bool:
    """检查行是否匹配任何模式"""
    for pattern in patterns:
        if pattern.match(line):
            return True
    return False

def find_class_struct_end(lines: List[str], start_idx: int, processed: List[bool]) -> int:
    """确保完整包含整个class/struct块"""
    return find_block_end(lines, start_idx, processed, block_type='class/struct')

def find_namespace_end(lines: List[str], start_idx: int, processed: List[bool]) -> int:
    """确保完整包含整个namespace块"""
    return find_block_end(lines, start_idx, processed, block_type='namespace')

def find_enum_end(lines: List[str], start_idx: int, processed: List[bool]) -> int:
    """确保完整包含整个enum块"""
    return find_block_end(lines, start_idx, processed, block_type='enum')

def find_function_end(lines: List[str], start_idx: int, processed: List[bool]) -> int:
    """确保完整包含整个函数块"""
    return find_function_block_end(lines, start_idx, processed, block_type='function')

def find_block_end(lines: List[str], start_idx: int, processed: List[bool], block_type: str) -> int:
    """
    通用块结束位置查找函数，处理各种带有{}的块
    正确识别嵌套结构，找到最外层的闭合}
    """
    brace_cnt = 0
    i = start_idx
    total_lines = len(lines)
    
    # 处理起始行的{
    first_line= lines[i]
    line_clean = remove_strings_comments(lines[i])
    brace_cnt += line_clean.count('{')
    
    i += 1 # 从下一行开始查找
    
    while i<total_lines:
        if processed[i]:
            i += 1
            continue
        
        line_clean = remove_strings_comments(lines[i])
        brace_cnt += line_clean.count('{')
        brace_cnt -= line_clean.count('}')
        
        # 找到最外层的闭合}
        if brace_cnt ==0:
            # 对于函数，可能需要包含最后的分号
            if block_type == 'function'  and ';' in lines[i]:
                return i + 1
            
            # 对于类/结构体，可能需要包含最后的分号
            if block_type in ['class/struct'] and i+1 < total_lines and lines[i+1].strip()==';':
                return i + 2
            return i + 1
        i += 1
        
    return total_lines


def find_function_block_end(lines: List[str], start_idx: int, processed: List[bool], block_type: str) -> int:
    """
    通用块结束位置查找函数，处理各种带有{}的块
    正确识别嵌套结构，找到最外层的闭合}
    """
    brace_cnt = 0
    paren_cnt = 0 # 跟踪圆括号的计数
    i = start_idx
    total_lines = len(lines)
    
    
    while i < total_lines:
        if processed[i]:
            i += 1
            continue
        line_clean = remove_strings_comments(lines[i])
        paren_cnt += line_clean.count('(')
        paren_cnt -= line_clean.count(')')
        brace_cnt += line_clean.count('{')
        brace_cnt -= line_clean.count('}')
        
        if paren_cnt == 0 and brace_cnt>0:
            break
        
        i += 1
    else:
        return total_lines
    i += 1    

    while i<total_lines:
        if processed[i]:
            i += 1
            continue
        
        line_clean = remove_strings_comments(lines[i])
        brace_cnt += line_clean.count('{')
        brace_cnt -= line_clean.count('}')

        # 找到最外层的闭合}
        if brace_cnt ==0:
            # 对于函数，可能需要包含最后的分号
            if block_type == 'function'  and ';' in lines[i]:
                return i + 1
            
            # 对于类/结构体，可能需要包含最后的分号
            if block_type in ['class/struct'] and i+1 < total_lines and lines[i+1].strip()==';':
                return i + 2

            return i + 1
        i += 1

    return total_lines
     
def remove_strings_comments(line: str) -> str:
    """移除字符串、字符常量、注释等，避免干扰花括号的匹配"""
    # 移除双引号字符串
    line = re.sub(r'"(\\.|[^"])*"', '', line)
    # 移除单引号字符
    line = re.sub(r"'(\\.|[^'])*'", '', line)
    # 移除单行注释
    line = re.sub(r'//.*$', '', line)
    # 移除多行注释
    line = re.sub(r'/\*.*?\*/', '', line)
    
    return line

def find_single_comment_end(lines: List[str], start_idx: int) -> int:
    """找到单行注释的结束位置"""
    i = start_idx
    return start_idx

# def find_multiline_comment_end(lines: List[str], start_idx: int) -> int:
#     """找到多行注释的结束位置"""
#     i = start_idx
#     total_lines = len(lines)
#     #pattern = re.compile(r'\s*\*/')
#     pattern = re.compile(r'(?:\s*(.*?)\s*\*+/)')
#     while i < total_lines:
#         if pattern.match(lines[i]) is not None :
#             return i + 1
#         i += 1
#     return total_lines

def find_multiline_comment_end(lines: List[str], start_idx: int) -> int:
    """找到多行注释的结束位置"""
    i = start_idx
    total_lines = len(lines)
    while i < total_lines:
        if re.match(r'[\s\ufeff]*\/\*.*', lines[i]):
            while i < total_lines:
                if re.match(r'.*\*\/', lines[i]):
                    return i + 1
                i += 1
        i += 1
    return total_lines


def find_preprocessor_block_end(lines: List[str], start_idx: int) -> int:
    """找到预处理指令块的结束位置（如#if ... #endif）"""
    i = start_idx + 1
    total_lines = len(lines)
    nested_level = 1  # 用于处理嵌套的#if
    
    while i < total_lines:
        line = lines[i].strip()
        if line.startswith(('#if', '#ifdef', '#ifndef')):
            nested_level += 1
        elif line.startswith('#endif'):
            nested_level -= 1
            if nested_level == 0:
                return i + 1
        i += 1
    
    return total_lines


# 需求0：遍历文件夹所有代码，实现分块
# END----------------------------


# START--------------------------
# 需求1：全场景合并函数块


# 正则表达式：匹配类/结构体定义（提取名称和范围）
CLASS_STRUCT_REGEX = re.compile(r'(class|struct)\s+(\w+)\s*\{')

# 正则表达式：匹配函数声明/定义（提取返回值、函数名、参数列表）
FUNC_DECL_DEF_REGEX = re.compile(
    r'\s*([\w*&]+\s+)\s*(\w+)\s*\(([^)]*)\)\s*[;{]'  # 分组：返回值(1)、函数名(2)、参数列表(3)
)
# 正则表达式：匹配类/结构体成员函数实现（如 MAP::DOC(...)）
MEMBER_FUNC_IMPL_REGEX = re.compile(
    r'\s*([\w*&]+\s+)\s*(\w+)::(\w+)\s*\(([^)]*)\)\s*{'  # 分组：载体名(2)、函数名(3)、参数列表(4)
)
# 正则表达式：匹配函数调用（提取函数名和参数列表，如 DOC(1, "a")）
FUNC_CALL_REGEX = re.compile(
    r'\s*(\w+)\s*\(([^)]*)\)'  # 分组：函数名(1)、参数列表(2)
)

class BlockProcessor:
    def __init__(self):
        # 存储所有原始分块（按id映射，保留原始id）：{原始id: block_dict}
        self.all_blocks: Dict[int, dict] = {}
        # 存储载体（类/结构体）的范围：{载体名: (类型, 起始行, 结束行)}
        self.carrier_ranges: Dict[str, Tuple[str, int, int]] = {}
        # 函数唯一标识映射：{func_key: 主块id}（func_key格式：载体名.函数名(简化参数)）
        self.func_key_to_main_id: Dict[str, int] = {}

    def _simplify_params(self, params: str) -> str:
        """简化参数列表（去除变量名，仅保留类型，用于区分重载）"""
        if not params.strip():
            return ""
        param_list = [p.strip() for p in params.split(',') if p.strip()]
        simplified = []
        for param in param_list:
            param = re.sub(r'=.*', '', param).strip()  # 去除默认值（如"int a=5"→"int a"）
            param_type = re.sub(r'\s+\w+$', '', param)  # 去除变量名（如"int a"→"int"）
            simplified.append(param_type)
        return ','.join(simplified)

    def _get_func_key(self, func_name: str, params: str, carrier_name: Optional[str] = None) -> str:
        """生成函数唯一标识（用于匹配关联）"""
        simplified_params = self._simplify_params(params)
        params_str = f"({simplified_params})" if simplified_params else "()"
        carrier_part = f"{carrier_name}." if carrier_name else "全局."
        return f"{carrier_part}{func_name}{params_str}"

    def _get_carrier_by_line(self, line: int) -> Optional[str]:
        """根据行号判断所在载体（类/结构体）"""
        for carrier_name, (_, start, end) in self.carrier_ranges.items():
            if start <= line <= end:
                return carrier_name
        return None

    def _get_call_line_in_block(self, call_block: dict, func_name: str) -> int:
        """获取调用块中函数调用的具体行数（相对于代码全文的行号）"""
        content = call_block["code"]
        start_line = call_block["range"][0]
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if func_name in line and '(' in line:  # 匹配调用语句
                return start_line + i  # 返回全文行号
        return start_line  # 未找到则返回块起始行
    
    def _get_main_line_in_block(self, main_block: dict, func_name: str) -> int:
        """获取主块中函数调用的具体行数（相对于代码全文的行号）"""
        content = main_block["code"]
        start_line = main_block["range"][0]
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if func_name in line and '(' in line:  # 匹配调用语句
                return start_line + i  # 返回全文行号
        return start_line  # 未找到则返回块起始行

    def load_blocks(self, raw_blocks: List[dict]):
        """加载原始分块，初始化related_id和related_range（若不存在）"""
        for block in raw_blocks:
            block_id = block["id"]  # 保留原始id
            self.all_blocks[block_id] = block

    def extract_carrier_ranges(self):
        """提取类/结构体的行号范围（用于判断函数所属载体）"""
        for block in self.all_blocks.values():
            if block["type"] not in ["class/struct"]:
                continue
            content = block["code"]
            start_line = block["range"][0]
            end_line = block["range"][1]
            match = CLASS_STRUCT_REGEX.search(content)
            if not match:
                continue
            carrier_type, carrier_name = match.group(1), match.group(2)
            self.carrier_ranges[carrier_name] = (carrier_type, start_line, end_line)

    def extract_func_relations(self):
        """提取函数声明/实现/调用的关联关系，填充related_id和related_range"""
        related_cnt = 0
        # 第一步：处理函数声明/实现块，记录func_key与原始id的映射
        for block_id, block in self.all_blocks.items():
            block_type = block["type"]
            content = block["code"]

            # 处理函数实现块（类外/全局）
            if block_type == "function" or block_type == "class/struct":
                # 先匹配类/结构体成员函数实现（如MAP::DOC()）
                impl_match = MEMBER_FUNC_IMPL_REGEX.search(content)
                
                if impl_match:
                    carrier_name = impl_match.group(2)
                    func_name = impl_match.group(3)
                    params = impl_match.group(4)
                    func_key = self._get_func_key(func_name, params, carrier_name)
                    self.func_key_to_main_id[func_key] = block_id
                # 再匹配全局函数实现
                else:
                    decl_match = FUNC_DECL_DEF_REGEX.search(content)
                    if decl_match:
                        func_name = decl_match.group(2)
                        params = decl_match.group(3)
                        func_key = self._get_func_key(func_name, params)
                        self.func_key_to_main_id[func_key] = block_id

        # 第二步：处理调用块，关联到对应的声明/实现块（填充related_id和related_range）
        for call_block_id, call_block in self.all_blocks.items():
            
            content = call_block["code"]
            call_start_line = call_block["range"][0]
            # 推断调用所在载体（类/结构体/全局）
            carrier_name = self._get_carrier_by_line(call_start_line)
            
            # 提取调用的函数名和参数
            call_matches = FUNC_CALL_REGEX.findall(content)
            for func_name, call_params in call_matches:
                # 生成调用的func_key（与声明/实现块的func_key匹配）
                simplified_call_params = self._simplify_params(call_params)
                
                # 这里注意根据实际需求增减关键字列表，目前包括：控制流关键字、文件读取等特定成员函数、std命名空间、内存操作
                if func_name in ['if', 'for', 'while', 'switch', 'catch', 'throw', 'new', 'delete', 'memset', 'sizeof', 'return', 'std', 'file', 'x', 'y']:
                    continue
                func_key = self._get_func_key(func_name, simplified_call_params, carrier_name)
                
                # 找到对应的主块id（声明/实现块的原始id）
                main_block_id = self.func_key_to_main_id.get(func_key)    
                if not main_block_id:
                    continue  # 未找到关联的声明/实现块，跳过
                
                # 1. 给主块（声明/实现块）填充related_id和related_range
                main_block = self.all_blocks[main_block_id]
                # 关联调用块id（若未已存在则添加）
                if call_block_id not in main_block["related_id"]:
                    # 去除自己关联自己的情况
                    if call_block_id != main_block["id"]:
                        related_cnt += 1
                        main_block["related_id"].append(call_block_id)
                        # 记录调用块中具体的调用行数（全文行号）
                        call_line = self._get_call_line_in_block(call_block, func_name)
                        main_block["related_range"][call_block_id] = call_line

                # 2. 给调用块填充related_id（关联主块id）
                if main_block_id not in call_block["related_id"]:
                    # 去除自己关联自己的情况
                    if main_block_id != call_block["id"]:
                        related_cnt += 1
                        call_block["related_id"].append(main_block_id)
                        # 判断该字段为空时，初始化
                        if main_block_id not in call_block["related_range"]:
                            call_block["related_range"][main_block_id] = []
                        #main_line = self._get_main_line_in_block(main_block, func_name)
                        main_line = main_block['range']
                        call_block["related_range"][main_block_id] = main_line
                        
        # 按id块号排序代码块
        all_blocks = sorted(self.all_blocks.values(), key=lambda x: x["id"])
        print(f"处理完成，发现{int(related_cnt/2)}个函数关联代码块")
        return all_blocks


def merge_function_chunks(input_jsonl: str, output_jsonl: str):
    """主函数：读取原始分块→提取关联→聚合输出"""
    
    # 读取原始分块（含原始id，无related_id/related_range）
    raw_blocks = []
    with open(input_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            raw_blocks.append(json.loads(line.strip()))
    
    processor = BlockProcessor()
    # 1. 加载原始分块（保留原始id）
    processor.load_blocks(raw_blocks)
    # 2. 提取类/结构体范围（用于判断函数所属载体）
    processor.extract_carrier_ranges()
    # 3. 提取关联关系，填充related_id和related_range
    result_blocks = processor.extract_func_relations()

    # 输出结果（含原始id、填充后的related_id/related_range）
    with open(output_jsonl, "w", encoding="utf-8") as f:
        for block in result_blocks:
            f.write(json.dumps(block, ensure_ascii=False) + "\n")
            
    return result_blocks
    
# 需求1：全场景合并函数块
# --------------------------END
    
def chunk_codes(name, cpp_file, output_json_path): #读入存放代码的工程文件夹code_repo、分块后jsonl文件的存储位置
    
    # 遍历一个工程文件夹下所有代码文件，执行分块操作，结果存到一个同jsonl文件中
    json_name = name + '_codeblock' + '.jsonl'
    output_file = cpp_to_jsonl(cpp_file, json_name, output_json_path) # 返回保存的文件地址
    #print(f"分块结果已保存到: {output_file}")
    
    # 执行函数相关联的代码块合并，指的是函数定义实现、调用之间的关联
    merged_file = os.path.join(output_json_path, json_name)
    code_data = merge_function_chunks(output_file, merged_file)
    #print(f"函数关联结果已保存到: {merged_file}")
    print(f"分块结果已保存到: {output_file}")
    return code_data # output_file


def get_codefile_blocks(code_base_path, file_name):
    # 获取原始块
    if not os.path.exists(os.path.join(code_base_path, file_name)):
        print(file_name)
        print(os.path.join(code_base_path, file_name))
        print(code_base_path)
        print('====================================')
    
    code_blocks = chunk_cpp_code(file_name, os.path.join(code_base_path, file_name))
    global index
    for item in code_blocks:
        item['id'] = index
        item['related_id'] = []
        item['related_range'] = {}
        index = 1+index


    # 关联块
    processor = BlockProcessor()
    processor.load_blocks(code_blocks)
    processor.extract_carrier_ranges()
    all_code_blocks = processor.extract_func_relations()

    return all_code_blocks
    
    
def get_all_code_blocks(code_base_path, all_rel_code_paths):
    all_code_blocks = []

    all_code_blocks_raw = []
    for rel_code_path in all_rel_code_paths:
        # 获取原始块
        code_blocks = chunk_cpp_code(rel_code_path, os.path.join(code_base_path, rel_code_path))
        global index
        for item in code_blocks:
            item['id'] = index
            item['related_id'] = []
            item['related_range'] = {}
            index = 1+index

        all_code_blocks_raw.extend(code_blocks)

    # 关联块
    processor = BlockProcessor()
    processor.load_blocks(all_code_blocks_raw)
    processor.extract_carrier_ranges()
    all_code_blocks = processor.extract_func_relations()

    return all_code_blocks
    
if __name__ == "__main__":
    
    # 读入存放代码的工程文件夹
    # cpp_file = r'.\data\数学模型_弹目相对运动及安控等项目\code_repo'
    cpp_file =r'D:\课题项目申请\2025年\八院质量工艺技术基础项目\工程文件\llm-align\data\AN4660\code_repo'
    #cpp_file= r'.\data\测试用文件夹\code_repo'
    # cpp_file= r'.\data\code_repo'
    
    name = 'AN4660'
    
    # 分块后jsonl文件的存储位置
    #output_json_path = './test/' 
    output_json_path = r'./data'
    
    # 执行分块
    code_data = chunk_codes(name, cpp_file, output_json_path)
    
    
