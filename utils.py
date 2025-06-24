import markdown
from bs4 import BeautifulSoup
import re
import json

def parse_markdown(md_text):
    # 转换Markdown为HTML
    html = markdown.markdown(md_text, extensions=['tables'])
    soup = BeautifulSoup(html, 'html.parser')
    
    requirements = []
    
    current_context = []
    grouped_content = ""

    for element in soup.find_all(['h1', 'h2', 'h3', 'p', 'table']):
        if element.name in ['h1', 'h2', 'h3']:
            # 如果有未处理的内容，添加到需求点
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
        elif element.name == 'p':
            # 将段落内容累积到当前上下文
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
            "content": formula.strip(),
            "context": " > ".join(current_context)
        })
    
    return requirements