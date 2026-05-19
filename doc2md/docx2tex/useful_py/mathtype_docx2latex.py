import os
import subprocess
import shutil
import tempfile
import zipfile
import re
from pathlib import Path
from lxml import etree
import xml.etree.ElementTree as ET
import unicodedata


# def _clean_latex_for_katex(s: str) -> str:
#     """Top-level cleaner to produce KaTeX-compatible LaTeX.
#     Removes combining marks, zero-width chars, maps common MathType macros,
#     balances brackets, fixes common KaTeX incompatibilities, and performs
#     comprehensive repairs to avoid parse errors.
#     """
#     import re

#     if not s or not s.strip():
#         return ""

#     # ========== 1. 清理不可见控制字符 & 组合下划线 ==========
#     try:
#         s = unicodedata.normalize('NFD', s)
#         s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
#     except Exception:
#         s = s.replace('\u0332', '').replace('\\\u0332', '')

#     # 零宽空格和其他不可见字符
#     s = s.replace('\u200b', '').replace('\u200e', '').replace('\u200f', '')
#     s = s.replace('\ufeff', '')  # BOM

#     # ========== 2. 修正 MathType 特有的大写希腊字母别名 ==========
#     s = s.replace(r'\Updelta', r'\Delta').replace(r'\updelta', r'\delta')
#     s = s.replace(r'\Upgamma', r'\Gamma').replace(r'\upgamma', r'\gamma')
#     s = s.replace(r'\Upomega', r'\Omega').replace(r'\upomega', r'\omega')
#     s = s.replace(r'\Uppsi', r'\Psi').replace(r'\uppsi', r'\psi')
#     s = s.replace(r'\Upphi', r'\Phi').replace(r'\upphi', r'\phi')
#     # 通用映射 \Up<name> → \<name>.capitalize()
#     s = re.sub(r'\\Up([A-Za-z]+)', lambda m: '\\' + m.group(1).capitalize(), s)

#     # ========== 3. 移除/替换不兼容的环境 ==========
#     # 完全移除顶层环境（保留内容）
#     for env in ['align', 'eqnarray', 'equation', 'gather', 'displaymath']:
#         s = re.sub(rf'\\begin{{{env}\*?}}', '', s)
#         s = re.sub(rf'\\end{{{env}\*?}}', '', s)
#     # 将 displaymath 替换为 \[ \]（KaTeX 支持）
#     s = re.sub(r'\\begin\{displaymath\}(.*?)\\end\{displaymath\}', r'\\[\1\\]', s, flags=re.DOTALL)

#     # ========== 4. 移除 \notag 和 \nonumber ==========
#     s = re.sub(r'\\notag\s*', '', s)
#     s = re.sub(r'\\nonumber\s*', '', s)

#     # ========== 5. 转换根式 \root...\of 为 \sqrt ==========
#     s = re.sub(r'\\root\s*(\d+)\s*\\of\s*\{([^{}]*)\}', r'\\sqrt[\1]{\2}', s)
#     s = re.sub(r'\\root\s*(\d+)\s*\\of\s*([^{])(?![^{]*})', r'\\sqrt[\1]{\2}', s)

#     # ========== 6. 转换 \stackrel 为 \overset ==========
#     s = re.sub(r'\\stackrel\{([^{}]*)\}\{([^{}]*)\}', r'\\overset{\1}{\2}', s)

#     # ========== 7. 替换 \newline 为 \\ ==========
#     s = s.replace(r'\newline', r'\\')

#     # ========== 8. 处理 \text{} 内的特殊字符 ==========
#     # 将 \text{min} / \text{max} 转为 \min / \max
#     s = re.sub(r"\\text\{\s*\\?(min|max)\s*\}", r"\\\1", s)
#     s = re.sub(r"_\{\s*\\?(min|max)\s*\}", r"_{\\\1}", s)
#     s = re.sub(r"\^\{\s*\\?(min|max)\s*\}", r"^{\\\1}", s)
#     # 对于纯字母数字的 \text{...} 直接去掉包装，保留内部内容
#     s = re.sub(r"\\text\{\s*([A-Za-z0-9=\./\s%\-]+?)\s*\}", r"\1", s)
#     # 对其他 \text 内的 _ 和 ^ 进行转义，避免被误解为上下标
#     def _escape_text_inner(m):
#         inner = m.group(1)
#         inner = inner.replace('_', r'\_').replace('^', r'\^')
#         return f'\\text{{{inner}}}'
#     s = re.sub(r'\\text\{([^{}]*)\}', _escape_text_inner, s)

#     # ========== 9. 处理颜色命令 ==========
#     # \color{red} text → \color{red}{text}
#     s = re.sub(r'\\color\{([^{}]+)\}\s*([a-zA-Z0-9])', r'\\color{\1}{\2}', s)
#     s = re.sub(r'\\color\{([^{}]+)\}\s*([^{}\\&][^{}\\&]*)',
#                lambda m: r'\\color{' + m.group(1) + r'}{' + m.group(2).strip() + r'}', s)

#     # ========== 10. 处理孤立的 & ==========
#     if '&' in s and not re.search(r'\\begin\{(?:array|matrix|aligned|smallmatrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)', s):
#         s = s.replace('&', '')

#     # ========== 11. 修正 \tag 位置 ==========
#     s = re.sub(r'\\tag\{([^}]*)\}\s*\\\\', r'\\\\ \\tag{\1}', s)
#     s = re.sub(r'\\\\\s*\\tag\{([^}]*)\}', r'\\tag{\1} \\\\', s)

#     # ========== 12. 规范化字体/排版命令 ==========
#     s = re.sub(r'\\bm\{([^{}]*)\}', r'\\boldsymbol{\1}', s)      # \bm → \boldsymbol
#     s = re.sub(r'\\mathbf\{([^{}]*)\}', r'\\boldsymbol{\1}', s)  # 简单粗体处理
#     s = re.sub(r'\\mathit\{([()\\/\\\\\\])\}', r'\1', s)           # 移除标点周围的 \mathit
#     s = re.sub(r'\\limits|\\nolimits', '', s)                   # KaTeX 自动处理上下限
#     s = re.sub(r'\\displaystyle|\\textstyle', '', s)           # 前端控制

#     # ========== 13. 空格清理与格式化 ==========
#     # 删除宏与左括号之间的空格: \alpha (k) → \alpha(k)
#     s = re.sub(r"\\([A-Za-z]+)\s+\(", r"\\\1(", s)
#     # 删除上下标与花括号之间的空格
#     s = re.sub(r'_\s*\{', '_{', s)
#     s = re.sub(r'\^\s*\{', '^{', s)
#     # 合并多余空格
#     s = re.sub(r'\s{2,}', ' ', s)

#     # ========== 14. 平衡 \left 和 \right 括号 ==========
#     # 使用栈来正确匹配和修复 \left 和 \right
#     def balance_left_right(latex_str):
#         # 简单的栈匹配
#         stack = []
#         result = []
#         i = 0
#         while i < len(latex_str):
#             if latex_str[i:i+5] == r'\left':
#                 stack.append(i)
#                 result.append(r'\left')
#                 i += 5
#             elif latex_str[i:i+6] == r'\right':
#                 if stack:
#                     stack.pop()
#                     result.append(r'\right')
#                 else:
#                     # 多余的 \right，移除
#                     pass
#                 i += 6
#             else:
#                 result.append(latex_str[i])
#                 i += 1
#         # 如果栈不空，移除未匹配的 \left
#         while stack:
#             pos = stack.pop()
#             # 移除 result 中的 \left
#             result = result[:pos] + result[pos+5:]
#         return ''.join(result)
    
#     s = balance_left_right(s)

#     # ========== 15. 清理不完整的 LaTeX 结构 ==========
#     # 移除不完整的 \begin{} 和 \end{} 标签
#     s = re.sub(r'\\begin\{[^}]*$', '', s)  # 移除行尾不完整的 \begin
#     s = re.sub(r'\\end\{[^}]*$', '', s)    # 移除行尾不完整的 \end
    
#     # 移除孤立的 \begin 或 \end 片段
#     s = re.sub(r'\\begin(?!\s*\{)', '', s)
#     s = re.sub(r'\\end(?!\s*\{)', '', s)
    
#     # 清理不匹配的花括号（简单版本）
#     # 计算花括号平衡
#     brace_count = 0
#     cleaned = []
#     for char in s:
#         if char == '{':
#             brace_count += 1
#             cleaned.append(char)
#         elif char == '}':
#             if brace_count > 0:
#                 brace_count -= 1
#                 cleaned.append(char)
#             # 忽略多余的右花括号
#         else:
#             cleaned.append(char)
    
#     # 如果左花括号多余，移除末尾的多余左花括号
#     while brace_count > 0 and cleaned and cleaned[-1] == '{':
#         cleaned.pop()
#         brace_count -= 1
    
#     s = ''.join(cleaned)

#     # ========== 16. 最终清理 ==========
#     s = s.strip()
#     # 修复因删除环境而产生的连续双反斜杠
#     s = re.sub(r'\\\\\s*\\\\', r'\\\\', s)
#     s = re.sub(r'\\\\$', '', s)  # 移除尾部的无用 \\

#     # 确保没有残留的组合字符
#     s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')

#     return s

def _clean_latex_for_katex(s: str) -> str:
    """Top-level cleaner to produce KaTeX-compatible LaTeX.
    
    Improved version that handles environments, \text, font commands,
    bracket balancing, and many KaTeX incompatibilities more carefully.
    """
    import re
    import unicodedata

    if not s or not s.strip():
        return ""

    # ========== 1. 清理不可见控制字符 & 组合标记 ==========
    try:
        s = unicodedata.normalize('NFD', s)
        s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    except Exception:
        s = s.replace('\u0332', '').replace('\\\u0332', '')

    # 零宽空格、BOM 等
    for ch in ('\u200b', '\u200e', '\u200f', '\ufeff'):
        s = s.replace(ch, '')

    # ========== 2. 修正 MathType 希腊字母别名 ==========
    math_type_map = {
        r'\Updelta': r'\Delta', r'\updelta': r'\delta',
        r'\Upgamma': r'\Gamma', r'\upgamma': r'\gamma',
        r'\Upomega': r'\Omega', r'\upomega': r'\omega',
        r'\Uppsi': r'\Psi', r'\uppsi': r'\psi',
        r'\Upphi': r'\Phi', r'\upphi': r'\phi',
    }
    for old, new in math_type_map.items():
        s = s.replace(old, new)
    s = re.sub(r'\\Up([A-Za-z]+)', lambda m: '\\' + m.group(1).capitalize(), s)

    # ========== 3. 环境转换（关键改进） ==========
    # 将 displaymath 替换为 \[ \]
    s = re.sub(r'\\begin\{displaymath\}(.*?)\\end\{displaymath\}', r'\\[\1\\]', s, flags=re.DOTALL)

    # 处理带星号的环境：align*, gather*, equation* 等
    # 转换对齐环境为 aligned 包裹在 \[ \] 中
    def _convert_env(match):
        env_name = match.group(1)  # 例如 align, align*, equation, gather
        content = match.group(2)
        # 移除环境内的 \notag, \nonumber
        content = re.sub(r'\\notag\s*', '', content)
        content = re.sub(r'\\nonumber\s*', '', content)
        # 如果内容中不含 & 和 \\，简单的单行公式可以不加 aligned
        if '&' not in content and '\\\\' not in content:
            return f'\\[{content}\\]'
        else:
            # 使用 aligned 环境
            if env_name.endswith('*'):
                # 带星号的环境本身不带编号，aligned 也不带编号
                return f'\\[\\begin{{aligned}}{content}\\end{{aligned}}\\]'
            else:
                # 不带星号的 equation/align 等原本有编号，但 KaTeX 的 aligned 无编号，
                # 如果想保留编号可以加 \tag，但为了简单，先不处理编号。
                return f'\\[\\begin{{aligned}}{content}\\end{{aligned}}\\]'

    # 匹配 \begin{environment} ... \end{environment}，支持嵌套？不支持复杂的嵌套，但通常顶层环境不嵌套
    env_pattern = r'\\begin\{((?:align|equation|gather|eqnarray)\*?)\}(.*?)\\end\{\1\}'
    s = re.sub(env_pattern, _convert_env, s, flags=re.DOTALL)

    # 单独处理 cases 环境（KaTeX 支持，但需要保证内部 & 正确）
    # cases 无需转换，但要确保内部没有多余的 \left \right 问题

    # ========== 4. 移除 \notag 和 \nonumber (已在上一步处理过，但全局再清一遍) ==========
    s = re.sub(r'\\notag\s*', '', s)
    s = re.sub(r'\\nonumber\s*', '', s)

    # ========== 5. 根式转换 \root...\of ==========
    s = re.sub(r'\\root\s*(\d+)\s*\\of\s*\{([^{}]*)\}', r'\\sqrt[\1]{\2}', s)
    s = re.sub(r'\\root\s*(\d+)\s*\\of\s*([^{])(?![^{]*})', r'\\sqrt[\1]{\2}', s)

    # ========== 6. \stackrel → \overset ==========
    s = re.sub(r'\\stackrel\{([^{}]*)\}\{([^{}]*)\}', r'\\overset{\1}{\2}', s)

    # ========== 7. \newline → \\ ==========
    s = s.replace(r'\newline', r'\\')

    # ========== 8. 处理 \text{}：保留命令，仅转义内部 _ 和 ^ ==========
    def _escape_text_inner(m):
        inner = m.group(1)
        inner = inner.replace('_', r'\_').replace('^', r'\^')
        # 避免 \text{ } 内的空格被数学模式忽略？KaTeX 的 \text 会保留空格，所以没问题。
        return f'\\text{{{inner}}}'
    s = re.sub(r'\\text\{([^{}]*)\}', _escape_text_inner, s)

    # 特殊处理 \text{min/max} 转为 \min/\max 虽然已经可以，但为了简洁可以保留
    s = re.sub(r"\\text\{\s*\\?(min|max)\s*\}", r"\\\1", s)

    # ========== 9. 颜色命令修复 ==========
    s = re.sub(r'\\color\{([^{}]+)\}\s*([a-zA-Z0-9])', r'\\color{\1}{\2}', s)
    s = re.sub(r'\\color\{([^{}]+)\}\s*([^{}\\&][^{}\\&]*)',
               lambda m: r'\\color{' + m.group(1) + r'}{' + m.group(2).strip() + r'}', s)

    # ========== 10. 字体/排版命令规范化 ==========
    s = re.sub(r'\\bm\{([^{}]*)\}', r'\\boldsymbol{\1}', s)      # \bm → \boldsymbol
    # 注意：不再将 \mathbf 转为 \boldsymbol，保留原样
    # \mathit 只移除孤立的标点包装（如果有问题的用法，简单清理）
    s = re.sub(r'\\mathit\{([()])\}', r'\1', s)                 # 移除 \mathit 包裹的单标点
    s = re.sub(r'\\limits|\\nolimits', '', s)                   # 删除上下限声明
    # 删除 \displaystyle 和 \textstyle（前端控制）
    s = re.sub(r'\\displaystyle|\\textstyle', '', s)

    # ========== 11. 处理不兼容的宏 ==========
    # \substack 和 \subarray KaTeX 支持，保留
    # \cancel 不支持，将其内容提取出来（简单移除命令，保留参数）
    s = re.sub(r'\\cancel\{([^{}]*)\}', r'\1', s)
    # \boxed 支持，保留
    # \label 和 \ref 移除
    s = re.sub(r'\\label\{[^{}]*\}', '', s)
    s = re.sub(r'\\ref\{[^{}]*\}', '', s)
    # \intertext 和 \shortintertext 移除（可能破坏结构，直接删除）
    s = re.sub(r'\\intertext\{[^{}]*\}', '', s)
    s = re.sub(r'\\shortintertext\{[^{}]*\}', '', s)
    # \phantom 保留（KaTeX 支持有限但通常没问题）
    # \over 和 \choose 转换为 \frac 和 \binom
    s = re.sub(r'([^{])\s*\\over\s*([^}])', r'\\frac{\1}{\2}', s)  # 简单情况
    s = re.sub(r'([^{])\s*\\choose\s*([^}])', r'\\binom{\1}{\2}', s)

    # ========== 12. 处理 \tag 位置 ==========
    s = re.sub(r'\\tag\{([^}]*)\}\s*\\\\', r'\\\\ \\tag{\1}', s)
    s = re.sub(r'\\\\\s*\\tag\{([^}]*)\}', r'\\tag{\1} \\\\', s)

    # ========== 13. 括号平衡：增强版 ==========
    # a) 平衡 \left 和 \right，包括处理 \left. 和 \right.
    def balance_left_right(latex_str):
        # 使用栈记录每个 \left 的位置和定界符类型（简单忽略类型，只做数量匹配）
        stack = []  # 每个元素为 (position, delimiter) – 这里只记录位置用于删除，不检查类型
        result = list(latex_str)
        i = 0
        n = len(latex_str)
        while i < n:
            if latex_str.startswith(r'\left', i):
                # 提取定界符
                delim_start = i + 5
                if delim_start < n and latex_str[delim_start] in '([{|.<>])':
                    delim = latex_str[delim_start]
                    stack.append(i)
                    i += 6 if delim != '.' else 6  # \left. 也是5+1
                else:
                    # 不是有效的 \left，当作普通字符
                    i += 1
            elif latex_str.startswith(r'\right', i):
                if stack:
                    stack.pop()
                    i += 6
                else:
                    # 多余的 \right，删除它
                    # 删除从 i 开始的 6 个字符
                    result[i:i+6] = [''] * 6
                    i += 6
            else:
                i += 1
        # 删除所有未匹配的 \left（从栈中剩余位置）
        for pos in reversed(stack):
            result[pos:pos+6] = [''] * 6
        return ''.join(result)

    s = balance_left_right(s)

    # b) 花括号平衡：补全缺失的右花括号，移除多余的右花括号
    def balance_braces(latex_str):
        balanced = []
        brace_count = 0
        # 先正向扫描，遇到 } 如果 brace_count==0 则跳过（多余）
        for ch in latex_str:
            if ch == '{':
                brace_count += 1
                balanced.append(ch)
            elif ch == '}':
                if brace_count > 0:
                    brace_count -= 1
                    balanced.append(ch)
                # else 忽略多余的 }
            else:
                balanced.append(ch)
        # 如果 brace_count > 0，补全相应数量的 }
        if brace_count > 0:
            balanced.append('}' * brace_count)
        return ''.join(balanced)

    s = balance_braces(s)

    # ========== 14. 清理孤立的 &（不放肆删除，只做警告式清理）==========
    # 检查 & 是否出现在不支持的环境中（如不在 matrix/cases/aligned 等）
    # 简单起见：如果整个字符串没有 \begin{matrix} 等环境，但出现了 &，我们将每个 & 替换为空格或保留
    # 但为了安全，保留原样，因为 KaTeX 会报错，不自动破坏内容。或者更智能地检测：
    # 只要前面没有 \begin{aligned} 等环境，就将 & 转义为 \& 显示为文本？不，数学模式中 & 只能用于表格。
    # 我们选择保留原样，不对 & 做任何处理，让错误暴露出来。
    # 删除了原来的 s = s.replace('&', '') 逻辑。

    # ========== 15. 空格规范化（谨慎合并） ==========
    # 删除宏与左括号之间的空格: \alpha (k) → \alpha(k)
    s = re.sub(r"\\([A-Za-z]+)\s+\(", r"\\\1(", s)
    # 删除上下标与花括号之间的空格
    s = re.sub(r'_\s*\{', '_{', s)
    s = re.sub(r'\^\s*\{', '^{', s)
    # 合并多个空格为一个空格，但保留数学模式中的显式空格命令（如 \ , \quad 等）
    # 简单替换连续空白（不包括反斜杠开头的命令）
    s = re.sub(r'(?<!\\)\s{2,}', ' ', s)

    # ========== 16. 清理不完整的 LaTeX 结构 ==========
    # 移除行尾不完整的 \begin 和 \end
    s = re.sub(r'\\begin\{[^}]*$', '', s)
    s = re.sub(r'\\end\{[^}]*$', '', s)
    # 移除孤立的 \begin 或 \end 后没有花括号的
    s = re.sub(r'\\begin(?!\s*\{)', '', s)
    s = re.sub(r'\\end(?!\s*\{)', '', s)

    # 最后，确保没有多余的空白行
    s = s.strip()
    return s

def convert_mathml_to_latex(mml_str):
    try:
        current_dir = Path(__file__).resolve().parent
        mml2tex_bat = current_dir / "mml2tex.bat"

        MML_NS = "http://www.w3.org/1998/Math/MathML"

        # 1) 移除 processing instructions（例如 <?latex ...?>）以免其中的未转义字符导致解析失败
        mml = re.sub(r'<\?.*?\?>', '', mml_str, flags=re.DOTALL)

        # 2) 转义孤立的 &（但保留已正确的实体如 &amp; 或 &#x...;）
        mml = re.sub(r'&(?!#?\w+;)', '&amp;', mml)

        # 3) 去掉 mml: 前缀（把 <mml:mi> -> <mi>），便于 XSL 使用默认命名空间匹配
        mml = re.sub(r'<(/?)mml:', r'<\1', mml)
        # 同时移除可能残留的 xmlns:mml 声明
        mml = re.sub(r'\sxmlns:mml="[^"]+"', '', mml)

        # 4) 强制根 <math> 使用默认 MathML 命名空间（替换或添加，保留其它属性）
        def _fix_math_root(match):
            attrs = match.group(1) or ''
            # remove any existing default xmlns attribute
            attrs = re.sub(r'\sxmlns="[^"]+"', '', attrs)
            return f'<math xmlns="{MML_NS}"{attrs}>'

        mml = re.sub(r'<math\b([^>]*)>', _fix_math_root, mml, count=1)

        # 5) 添加 XML 声明（若不存在）
        if not mml.lstrip().startswith('<?xml'):
            mml = '<?xml version="1.0" encoding="UTF-8"?>\n' + mml
        
        # print(mml)

        # 6) 用 lxml recover 模式尝试解析并规范化字符串
        parser = etree.XMLParser(recover=True, ns_clean=True, remove_blank_text=True)
        try:
            elem = etree.fromstring(mml.encode('utf-8'), parser=parser)
            # 如果根元素存在但不是标准 MathML 命名空间，统一替换为 MathML 命名空间
            def set_namespace_recursive(node, ns):
                q = etree.QName(node.tag)
                local = q.localname
                # map mtext -> mi for identifiers inside mtext
                if local == 'mtext':
                    local = 'mi'
                node.tag = f"{{{ns}}}{local}"
                # remove any xmlns:* attributes referring to old prefixes
                for k in list(node.attrib.keys()):
                    if k.startswith('{'):
                        # keep attributes as-is
                        continue
                for child in node:
                    set_namespace_recursive(child, ns)

            # if the parsed element has a namespace different from MathML, normalize
            parsed_ns = None
            try:
                parsed_ns = etree.QName(elem.tag).namespace
            except Exception:
                parsed_ns = None

            if parsed_ns != MML_NS:
                # normalize entire subtree to MathML namespace and convert mtext->mi
                set_namespace_recursive(elem, MML_NS)

            xml_fragment = etree.tostring(elem, encoding='unicode', with_tail=False)
        except Exception:
            xml_fragment = mml

        # 写临时文件，保留以便在发生错误时调试
        with tempfile.NamedTemporaryFile(mode='w', suffix='.mml', delete=False, encoding='utf-8') as f_in:
            f_in.write(xml_fragment)
            temp_mml = f_in.name

        temp_tex = temp_mml + ".tex"

        # 调用 mml2tex.bat，并捕获 stderr 以便调试
        cmd = [str(mml2tex_bat), temp_mml, temp_tex]
        result = subprocess.run(cmd, cwd=str(current_dir), capture_output=True, text=True, encoding='utf-8')

        if result.returncode != 0:
            # 返回包含 stderr 的调试信息并保留 temp 文件
            return f"Conversion_Error: Saxon failed: {result.stderr.strip()} (temp: {temp_mml})"

        if os.path.exists(temp_tex):
            with open(temp_tex, 'r', encoding='utf-8') as f_out:
                out_text = f_out.read()
                # If the stylesheet wrapped output in a processing-instruction <?mml2tex ...?>,
                # extract the PI content (the LaTeX) inside it.
                m = re.search(r'<\?mml2tex\s+(.*?)\?>', out_text, flags=re.DOTALL)
                if m:
                    latex = m.group(1).strip()
                else:
                    latex = out_text.strip()
                
                # extract full LaTeX and produce a KaTeX-safe variant
                full_latex = ''
                m = re.search(r'<\?mml2tex\s+(.*?)\?>', out_text, flags=re.DOTALL)
                if m:
                    full_latex = m.group(1).strip()
                else:
                    full_latex = out_text.strip()

                try:
                    katex_latex = _clean_latex_for_katex(full_latex)
                    print(f"KaTeX: {katex_latex}")
                except Exception:
                    katex_latex = full_latex
                    print(f"KaTeX cleaning failed, using full LaTeX as fallback: {full_latex}")

                # 清理临时文件
                try:
                    os.remove(temp_mml)
                    os.remove(temp_tex)
                except:
                    pass

            return {"full": full_latex, "katex": katex_latex}

        return f"Conversion_Error: Output not created (temp: {temp_mml})"
    except Exception as e:
        return f"Conversion_Error: {str(e)}"
    
    
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NSMAP = {"w": WORD_NS}

def run_docx2tex(input_docx, out_dir):
    """调用 d2t.bat 生成 Hub XML"""
    repo_root = Path(__file__).resolve().parent
    d2t = repo_root / "d2t.bat"
    
    if not d2t.exists():
        raise FileNotFoundError(f"找不到 d2t.bat: {d2t}")

    # 使用 cmd /c 运行批处理文件
    cmd = [
        "cmd", "/c", str(d2t),
        str(input_docx),
        "",  # 使用默认配置
        str(out_dir)
    ]
    
    print(f"正在运行: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(repo_root), capture_output=True, text=True, encoding="utf-8", errors="replace")
    
    if result.returncode != 0:
        print(f"docx2tex 运行失败:\n{result.stderr}")
    
    # docx2tex 生成的文件默认是 {basename}.xml (Hub XML)
    xml_path = Path(out_dir) / f"{Path(input_docx).stem}.xml"
    if not xml_path.exists():
        # 有时可能直接在输出目录生成
        xml_path = Path(out_dir) / f"{Path(input_docx).stem}.xml"
        
    return xml_path

def extract_latex_from_hub(xml_path):
    if not xml_path.exists():
        return []

    # 使用 lxml 以获得更好的命名空间支持
    parser = etree.XMLParser(recover=True)
    tree = etree.parse(str(xml_path), parser)
    
    # 精确查找所有 MathML 根节点
    # 注意：Hub XML 里的标签可能带 mml 前缀，也可能不带
    math_elements = tree.xpath('//*[local-name()="math"]')

    latex_results = []
    for node in math_elements:
        # 序列化时保留内部所有子节点结构
        mml_content = etree.tostring(node, encoding='unicode', with_tail=False)
        pair = convert_mathml_to_latex(mml_content)
        latex_results.append(pair)
            
    return latex_results

def patch_docx_with_latex(input_docx, output_docx, latex_formulas):
    """解压 DOCX，替换 OLE 对象为 LaTeX 文本，重新打包"""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # 解压
        with zipfile.ZipFile(input_docx, 'r') as zip_ref:
            zip_ref.extractall(tmpdir_path)
            
        doc_xml_path = tmpdir_path / "word" / "document.xml"
        if not doc_xml_path.exists():
            raise FileNotFoundError("找不到 document.xml")
            
        parser = etree.XMLParser(remove_blank_text=False)
        tree = etree.parse(str(doc_xml_path), parser)
        root = tree.getroot()
        
        # 查找 Word 中的 MathType 对象 (OLEObject)
        # 通常在 w:object 标签内
        objects = root.xpath("//w:object", namespaces=NSMAP)
        
        print(f"找到 {len(objects)} 个 MathType 对象，提取到 {len(latex_formulas)} 个公式")
        
        num_to_replace = min(len(objects), len(latex_formulas))
        
        for i in range(num_to_replace):
            obj = objects[i]
            latex_entry = latex_formulas[i]

            if isinstance(latex_entry, dict):
                full = latex_entry.get('full', '')
                katex = latex_entry.get('katex', full)
            else:
                full = latex_entry
                katex = latex_entry

            # 创建新的 w:r 节点包含文本
            new_run = etree.Element(f"{{{WORD_NS}}}r")
            new_text = etree.Element(f"{{{WORD_NS}}}t")
            # 包装成 KaTeX 风格 $...$（用于文档内显示）
            new_text.text = f"${katex}$"
            new_run.append(new_text)

            parent = obj.getparent()
            parent.replace(obj, new_run)

            # 以 processing-instruction 保存完整 LaTeX 便于导出/调试
            try:
                idx = list(parent).index(new_run)
                pi = etree.ProcessingInstruction('latex', full)
                parent.insert(idx+1, pi)
            except Exception:
                pass
            
        # 写回 XML
        tree.write(str(doc_xml_path), xml_declaration=True, encoding="UTF-8", standalone='yes')
        
        # 重新打包成 DOCX
        with zipfile.ZipFile(output_docx, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            for file_path in tmpdir_path.rglob('*'):
                if file_path.is_file():
                    zip_out.write(file_path, file_path.relative_to(tmpdir_path))

def main(input_docx, output_docx):
    input_docx = Path(input_docx).resolve()
    output_docx = Path(output_docx).resolve()
    
    if not input_docx.exists():
        print(f"输入文件不存在: {input_docx}")
        return

    with tempfile.TemporaryDirectory() as working_dir:
        working_dir_path = Path(working_dir)
        
        # 1. 运行 d2t.bat 提取公式到 XML
        print("步骤 1: 运行 docx2tex 提取公式...")
        xml_path = run_docx2tex(input_docx, working_dir_path)
        
        # 2. 从 XML 提取 LaTeX
        print("步骤 2: 转换 MathML 为 LaTeX...")
        latex_formulas = extract_latex_from_hub(xml_path)
        
        # 3. 替换并生成新文档
        print("步骤 3: 替换 DOCX 中的公式...")
        patch_docx_with_latex(input_docx, output_docx, latex_formulas)
        
    print(f"处理完成！输出文件: {output_docx}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("用法: python mathtype_docx2latex.py <输入.docx> <输出.docx>")
    else:
        main(sys.argv[1], sys.argv[2])
