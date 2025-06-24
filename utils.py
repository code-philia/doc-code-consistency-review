import markdown
from bs4 import BeautifulSoup
import re

def parse_markdown(md_text):
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
    formula_pattern = r'\$\$(.*?)\$\$'
    formulas = re.findall(formula_pattern, md_text, re.DOTALL)
    for k, formula in enumerate(formulas):
        requirements.append({
            "type": "公式",
            "id": f"formula_{k}",
            "content": "$$ "+formula.strip()+" $$",
            "context": " > ".join(current_context)
        })
    
    return requirements


def parse_code(filename, content):
    code_blocks = []
    
    # 预处理：移除单行和多行注释
    cleaned_content = re.sub(r'//.*?$|/\*.*?\*/', '', content, flags=re.MULTILINE|re.DOTALL)
    
    # 1. 解析函数定义（支持多行参数、模板、属性等）
    function_pattern = r'''(?x)
        (?P<prefix>
            (?:template\s*<[^>]+>\s*)?          # 模板声明
            (?:inline\s+|static\s+|virtual\s+)*  # 函数修饰符
            (?:constexpr\s+)?                    # C++11 constexpr
            (?:explicit\s+)?                     # 显式构造函数
        )
        (?P<return_type>
            (?:[\w:]|<[^>]+>|\s)+               # 返回类型（含命名空间和模板）
        )\s*
        (?P<name>
            \w+                                 # 函数名
            (?:\s*::\s*\w+)*                    # 支持操作符重载和成员函数
        )\s*
        \(
            (?P<params>[^)]*)                   # 参数列表
        \)\s*
        (?P<suffix>
            (?:const\s*)*                       # const限定符
            (?:\s*=\s*0\s*)?                    # 纯虚函数
            (?:\s*noexcept\s*)?                 # noexcept
            (?:\s*override\s*)?                # override
            (?:\s*=\s*(?:default|delete)\s*)?  # 特殊函数
        )\s*
        (?P<body>\{[^}]*\})                     # 函数体
    '''
    
    for match in re.finditer(function_pattern, cleaned_content, re.DOTALL):
        code_blocks.append({
            "file": filename,
            "type": "function",
            "name": match.group("name").strip(),
            "content": match.group(0).strip(),
            "line": content[:match.start()].count('\n') + 1
        })
    
    # 2. 解析类/结构体定义
    class_pattern = r'''(?x)
        (?:template\s*<[^>]+>\s*)?      # 模板声明
        (class|struct)\s+               # 类型关键字
        (?P<name>\w+)\s*                # 类名
        (?::\s*[^\{]+)?                 # 继承列表
        \s*\{[^}]*\}                    # 类体
        (?:\s*;\s*)?                    # 可选的分号
    '''
    
    for match in re.finditer(class_pattern, cleaned_content, re.DOTALL):
        code_blocks.append({
            "file": filename,
            "type": match.group(1),
            "name": match.group("name"),
            "content": match.group(0).strip(),
            "line": content[:match.start()].count('\n') + 1
        })
    
    # 3. 解析变量声明（含初始化）
    variable_pattern = r'''(?x)
        (?P<const>const\s+)?           # const修饰符
        (?P<type>
            (?:[\w:]|<[^>]+>|\s)+       # 类型（含命名空间和模板）
        )\s*
        (?P<name>\w+)                   # 变量名
        \s*
        (?:=\s*(?P<value>[^;]+))?       # 初始化值
        \s*;
    '''
    
    for match in re.finditer(variable_pattern, cleaned_content):
        code_blocks.append({
            "file": filename,
            "type": "variable",
            "name": match.group("name"),
            "content": match.group(0).strip(),
            "line": content[:match.start()].count('\n') + 1
        })
    
    # 4. 解析宏定义
    macro_pattern = r'''(?x)
        \#define\s+                     # 宏指令
        (?P<name>\w+)                   # 宏名称
        (?:\((?P<params>[^)]*)\))?      # 参数列表（可选）
        \s*
        (?P<value>[^\n]*)               # 宏值
    '''
    
    for match in re.finditer(macro_pattern, cleaned_content):
        code_blocks.append({
            "file": filename,
            "type": "macro",
            "name": match.group("name"),
            "content": match.group(0).strip(),
            "line": content[:match.start()].count('\n') + 1
        })
    
    # 5. 解析枚举定义
    enum_pattern = r'enum\s+(?:class\s+)?(\w+)?\s*\{[^}]*\}(?:\s*;\s*)?'
    
    for match in re.finditer(enum_pattern, cleaned_content):
        code_blocks.append({
            "file": filename,
            "type": "enum",
            "name": match.group(1) or f"anonymous_enum_{len(code_blocks)}",
            "content": match.group(0).strip(),
            "line": content[:match.start()].count('\n') + 1
        })
    
    # 6. 解析类型定义（typedef/using）
    typedef_pattern = r'''(?x)
        (?:typedef\s+|using\s+)        # 类型定义关键字
        (?P<type>.+?)                  # 原始类型
        \s+(?P<name>\w+)               # 类型别名
        \s*;                           # 结束分号
    '''
    
    for match in re.finditer(typedef_pattern, cleaned_content):
        code_blocks.append({
            "file": filename,
            "type": "typedef",
            "name": match.group("name"),
            "content": match.group(0).strip(),
            "line": content[:match.start()].count('\n') + 1
        })
    
    # 按行号排序所有代码块
    code_blocks.sort(key=lambda x: x["line"])
    
    # 添加文件名信息
    for block in code_blocks:
        block["file"] = filename
    
    return code_blocks