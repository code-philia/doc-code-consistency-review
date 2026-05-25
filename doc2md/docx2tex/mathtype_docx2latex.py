import os
import subprocess
import shutil
import tempfile
import zipfile
import re
from pathlib import Path
try:
    from lxml import etree
except ImportError:
    from xml.etree import ElementTree as etree
import xml.etree.ElementTree as ET
import unicodedata
import logging
import uuid
from datetime import datetime, timezone
import zipfile
import tempfile
from pathlib import Path
from lxml import etree
import time
import stat


# logging setup
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
stat_logger = logging.getLogger(__name__)

# Configuration: whether to keep per-formula temporary files on successful conversion
# If False, temp .mml/.tex and mml2tex logs will be removed after a successful conversion.
KEEP_TEMPS_ON_SUCCESS = False

# Optional module-level defaults for running without CLI args.
# Set these to paths like r"C:\path\to\in.docx" and r"C:\path\to\out.docx"
INPUT_PATH = None
OUTPUT_PATH = None

def _which(name):
    from shutil import which
    return which(name)

def check_prereqs(repo_root: Path):
    warnings = []
    if _which('java') is None:
        warnings.append('java not found in PATH')
    calabash_sh = repo_root / 'calabash' / 'calabash.sh'
    if not calabash_sh.exists() and _which('calabash') is None:
        warnings.append('calabash not found (place calabash.sh in calabash/ or install calabash)')
    if os.name != 'nt' and _which('bash') is None:
        warnings.append('bash not found in PATH (required on Unix to run shell scripts)')
    return warnings


def _safe_remove(path, attempts=5, delay=0.1):
    """Attempt to remove a file reliably on both Windows and Unix.

    - Tries to make the file writable (clears read-only) then unlink.
    - Retries a few times with a small delay to tolerate transient locks on Windows.
    - Returns True if removed or not present, False otherwise.
    """
    try:
        p = Path(path)
    except Exception:
        return False

    for attempt in range(attempts):
        try:
            if not p.exists():
                return True
            # Ensure writable (helpful on Windows for read-only files)
            try:
                os.chmod(str(p), stat.S_IWRITE)
            except Exception:
                pass
            p.unlink()
            return True
        except PermissionError:
            # Try to relax permissions then retry
            try:
                os.chmod(str(p), stat.S_IWRITE)
            except Exception:
                pass
            time.sleep(delay)
        except FileNotFoundError:
            return True
        except Exception:
            time.sleep(delay)
    return False


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
        # 删除所有未匹配 of \left（从栈中剩余位置）
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

    # ========== 14. 空格规范化（谨慎合并） ==========
    # 删除宏与左括号之间的空格: \alpha (k) → \alpha(k)
    s = re.sub(r"\\([A-Za-z]+)\s+\(", r"\\\1(", s)
    # 删除上下标与花括号之间的空格
    s = re.sub(r'(_|\^)\s*\{', r'\1{', s)
    # 合并多个空格为一个空格，但保留数学模式中的显式空格命令（如 \ , \quad 等）
    # 简单替换连续空白（不包括反斜杠开头的命令）
    s = re.sub(r'(?<!\\)\s{2,}', ' ', s)

    # ========== 15. 清理不完整的 LaTeX 结构 ==========
    # 移除行尾不完整的 \begin 和 \end
    s = re.sub(r'\\begin\{[^}]*$', '', s)
    s = re.sub(r'\\end\{[^}]*$', '', s)
    # 移除孤立的 \begin 或 \end 后没有花括号的
    s = re.sub(r'\\begin(?!\s*\{)', '', s)
    s = re.sub(r'\\end(?!\s*\{)', '', s)

    # 最后，确保没有多余的空白行
    s = s.strip()
    return s

def convert_mathml_to_latex(mml_str, prefix='tempfile', idx=None, run_dir=None):
    try:
        current_dir = Path(__file__).resolve().parent
        # pick platform-specific mml2tex invoker
        if os.name == 'nt':
            mml2tex_invoker = current_dir / "mml2tex.bat"
        else:
            mml2tex_invoker = current_dir / "mml2tex.sh"

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
                for child in node:
                    set_namespace_recursive(child, ns)

            parsed_ns = None
            try:
                parsed_ns = etree.QName(elem.tag).namespace
            except Exception:
                parsed_ns = None

            if parsed_ns != MML_NS:
                set_namespace_recursive(elem, MML_NS)

            xml_fragment = etree.tostring(elem, encoding='unicode', with_tail=False)
        except Exception:
            xml_fragment = mml

        # 写临时文件 — 将所有临时产物统一写入调用方提供的 run_dir（若提供），否则使用 output_workspace/<stem>_<timestamp>_<rand>
        safe_prefix = re.sub(r'[^A-Za-z0-9_.-]', '_', str(prefix))
        repo_root = Path(__file__).resolve().parent
        if run_dir:
            workspace_dir = Path(run_dir)
            workspace_dir.mkdir(parents=True, exist_ok=True)
        else:
            rand = uuid.uuid4().hex[:8]
            dir_name = f"{safe_prefix}_{int(datetime.now(timezone.utc).timestamp())}_{rand}"
            workspace_dir = repo_root / 'output_workspace' / dir_name
            workspace_dir.mkdir(parents=True, exist_ok=True)

        if idx is None:
            temp_mml = workspace_dir / f"{safe_prefix}_temp_{os.getpid()}_{uuid.uuid4().hex[:6]}.mml"
        else:
            temp_mml = workspace_dir / f"{safe_prefix}_temp_{idx}_{uuid.uuid4().hex[:6]}.mml"

        with open(temp_mml, 'w', encoding='utf-8') as f_in:
            f_in.write(xml_fragment)

        temp_tex = temp_mml.with_suffix('.tex')

        if os.name == 'nt':
            cmd = [str(mml2tex_invoker), str(temp_mml), str(temp_tex)]
        else:
            if mml2tex_invoker.exists() and os.access(str(mml2tex_invoker), os.X_OK):
                cmd = [str(mml2tex_invoker), str(temp_mml), str(temp_tex)]
            else:
                cmd = ["bash", str(mml2tex_invoker), str(temp_mml), str(temp_tex)]

        result = subprocess.run(cmd, cwd=str(current_dir), capture_output=True, text=True, encoding='utf-8')

        # log mml2tex stdout/stderr to the central logger instead of writing per-formula files
        try:
            if result.stdout:
                stat_logger.debug('mml2tex stdout for %s: %s', temp_mml.name, result.stdout)
        except Exception:
            pass
        try:
            if result.stderr:
                # log stderr at error level when returncode != 0, else as warning
                if result.returncode != 0:
                    stat_logger.error('mml2tex stderr for %s: %s', temp_mml.name, result.stderr)
                else:
                    stat_logger.warning('mml2tex stderr for %s: %s', temp_mml.name, result.stderr)
        except Exception:
            pass

        if result.returncode != 0:
            stat_logger.error('mml2tex failed; see logs: %s', str(temp_mml) + '.mml2tex.stderr.log')
            return f"Conversion_Error: {result.stderr.strip()} (logs: {str(temp_mml) + '.mml2tex.stderr.log'})"

        if os.path.exists(temp_tex):
            with open(temp_tex, 'r', encoding='utf-8') as f_out:
                out_text = f_out.read()
                m = re.search(r'<\?mml2tex\s+(.*?)\?>', out_text, flags=re.DOTALL)
                if m:
                    full_latex = m.group(1).strip()
                else:
                    full_latex = out_text.strip()

                katex_latex = _clean_latex_for_katex(full_latex)
                #stat_logger.info('KaTeX candidate: %s', katex_latex)

                # 根据配置决定是否删除临时文件（成功时）
                if not KEEP_TEMPS_ON_SUCCESS:
                    try:
                        _safe_remove(temp_tex)
                    except Exception:
                        pass
                    try:
                        _safe_remove(temp_mml)
                    except Exception:
                        pass
                    # remove potential per-formula stderr log referenced in error messages
                    try:
                        stderr_log = str(temp_mml) + '.mml2tex.stderr.log'
                        _safe_remove(stderr_log)
                    except Exception:
                        pass

            return {"full": full_latex, "katex": katex_latex}

        return "Conversion_Error: Output not created"
    except Exception as e:
        return f"Conversion_Error: {str(e)}"
    
    
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NSMAP = {"w": WORD_NS}

def run_docx2tex(input_docx, out_dir):
    """调用平台对应的 d2t 脚本（Windows: .bat, Linux: .sh）生成 Hub XML。"""
    repo_root = Path(__file__).resolve().parent
    # normalize inputs to Path objects so callers may pass str or Path
    input_docx = Path(input_docx)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = input_docx.stem

    if os.name == 'nt':
        # d2t = repo_root / "docx2xml_and_mml2tex.bat"
        d2t = repo_root / "d2t.bat"
    else:
        d2t = repo_root / "docx2xml_and_mml2tex.sh"
        # d2t = repo_root / "d2t"

    # 路径持久化优化 — 为每次运行创建唯一的 run_dir (output_workspace/<stem>_<timestamp>_<rand>/)
    
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '_' + uuid.uuid4().hex[:6]
    dir_name = f"{stem}_{run_id}"
    run_dir = out_dir / dir_name
    run_dir.mkdir(parents=True, exist_ok=True)
    # logs and other artifacts live under run_dir (logs subfolder kept for compatibility)
    log_dir = run_dir / 'logs'
    log_dir.mkdir(parents=True, exist_ok=True)
    out_dir_str = str(run_dir)
    if os.name == 'nt' and not out_dir_str.endswith(os.sep):
        out_dir_str = out_dir_str + os.sep

    if os.name == 'nt':
        cmd = ["cmd", "/c", str(d2t), str(input_docx), "", out_dir_str]
    else:
        cmd = ["bash", str(d2t), str(input_docx), "", out_dir_str]

    stat_logger.info("正在运行: %s", ' '.join(cmd))
    result = subprocess.run(cmd, cwd=str(repo_root), capture_output=True, text=True, encoding='utf-8', errors='replace')
    try:
        with open(log_dir / 'docx2xml.stdout.log', 'w', encoding='utf-8') as lf:
            lf.write(result.stdout or '')
    except Exception:
        pass
    try:
        with open(log_dir / 'docx2xml.stderr.log', 'w', encoding='utf-8') as lf:
            lf.write(result.stderr or '')
    except Exception:
        pass
    if result.returncode != 0:
        stat_logger.error('docx2tex run failed; see %s', log_dir / 'docx2xml.stderr.log')

    # 递归搜索 run_dir 中生成的 XML
    candidates = list(run_dir.rglob(f"{stem}.xml")) if run_dir.exists() else []
    chosen = None
    if candidates:
        chosen = max(candidates, key=lambda p: p.stat().st_mtime)

    # ensure a stable location: copy chosen xml into run_dir root if it's not already there
    xml_path = chosen if chosen is not None else (run_dir / f"{stem}.xml")
    if chosen is not None and chosen.parent != run_dir:
        try:
            shutil.copy2(str(chosen), str(run_dir / f"{stem}.xml"))
            xml_path = run_dir / f"{stem}.xml"
        except Exception:
            pass

    original_copy = run_dir / f"{stem}{Path(input_docx).suffix}"
    #stat_logger.info('Hub XML: %s', xml_path)
    #stat_logger.info('Logs: %s', log_dir)
    return xml_path, original_copy, run_dir

def extract_latex_from_hub(xml_path, run_dir=None):
    if not xml_path.exists():
        stat_logger.warning('Hub XML 文件未找到: %s', xml_path)
        return []

    parser = etree.XMLParser(recover=True)
    tree = etree.parse(str(xml_path), parser)
    math_elements = tree.xpath('//*[local-name()="math"]')

    latex_results = []
    xml_stem = Path(xml_path).stem
    for i, node in enumerate(math_elements):
        mml_content = etree.tostring(node, encoding='unicode', with_tail=False)
        pair = convert_mathml_to_latex(mml_content, prefix=xml_stem, idx=i, run_dir=run_dir)
        latex_results.append(pair)
            
    return latex_results


def patch_docx_with_latex_corrected(input_docx, output_docx, latex_formulas):
    """
    将 DOCX 中的公式（Word 原生 oMath 和 MathType OLE 对象）替换为 LaTeX 文本。
    :param input_docx:  输入 DOCX 路径
    :param output_docx: 输出 DOCX 路径
    :param latex_formulas: LaTeX 字符串列表，按文档中公式出现顺序排列
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)

        # 1. 解压 DOCX
        with zipfile.ZipFile(input_docx, 'r') as zip_ref:
            zip_ref.extractall(tmpdir_path)

        doc_xml_path = tmpdir_path / "word" / "document.xml"
        rels_path = tmpdir_path / "word" / "_rels" / "document.xml.rels"
        if not doc_xml_path.exists():
            return

        # 2. 定义命名空间（URI 与常用前缀）
        NS = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
            'o': 'http://schemas.openxmlformats.org/officeDocument/2006/ole',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
        }

        # 3. 解析关系文件（用于后续清理 MathType 残留）
        if rels_path.exists():
            rels_tree = etree.parse(str(rels_path))
            rels_root = rels_tree.getroot()
            # 建立关系 ID -> Target 映射
            rid_to_target = {}
            for rel in rels_root.findall(f'.//{{{NS["r"]}}}Relationship'):
                rid = rel.get('Id')
                target = rel.get('Target')
                if rid and target:
                    rid_to_target[rid] = target
        else:
            rels_tree = rels_root = None
            rid_to_target = {}
            
        stat_logger.info(f"关系文件中关系总数: {len(rid_to_target)}")
        # 4. 解析主文档 document.xml
        parser = etree.XMLParser(remove_blank_text=False)
        tree = etree.parse(str(doc_xml_path), parser)
        root = tree.getroot()

        # ================= 按文档顺序收集所有公式节点 =================
        formula_nodes = []   # 每个元素: (node, type, rid)

        for node in root.iter():
            qname = etree.QName(node)
            local = qname.localname
            ns = qname.namespace

            # 4.1 Word 原生公式 (m:oMath)
            if ns == NS['m'] and local == 'oMath':
                formula_nodes.append((node, 'oMath', None))
                continue

            # 4.2 MathType OLE 对象 (w:object)
            if ns == NS['w'] and local == 'object':
                # 按照您提供的正确片段：手工遍历后代查找 OLEObject
                for child in node.iter():
                    if etree.QName(child).localname == 'OLEObject':
                        progid = child.get('ProgID', '')
                        # 匹配常见的 ProgID，包括 MathType 5/6 (DSMT4) 和旧版 Equation Editor 3.0 (Equation.3)
                        # 支持 Equation.3, Equation.3.0, Equation.DSMT4, 及 MathType.Equation.x
                        if (progid in ('Equation.DSMT4', 'Equation.3', 'Equation.3.0') or 
                            progid.startswith('MathType.Equation.')):
                            # 提取 r:id 属性 (注意命名空间)
                            rid = child.get(f'{{{NS["r"]}}}id')
                            if rid:
                                formula_nodes.append((node, 'MathType', rid))
                            else:
                                # 没有 r:id 也作为 MathType 记录，但后续不能清理
                                formula_nodes.append((node, 'MathType', None))
                            break  # 找到一个 OLEObject 就结束，避免重复添加

        stat_logger.info(f"找到公式总数: {len(formula_nodes)}")
        stat_logger.info(f"  - oMath 公式: {sum(1 for _, t, _ in formula_nodes if t == 'oMath')}")
        stat_logger.info(f"  - MathType 公式: {sum(1 for _, t, _ in formula_nodes if t == 'MathType')}")

        # ================= 替换公式节点 =================
        rids_to_remove = []
        files_to_remove = []
        num_to_replace = min(len(formula_nodes), len(latex_formulas))

        for i in range(num_to_replace):
            node, node_type, rid = formula_nodes[i]
            latex_entry = latex_formulas[i]

            # 提取 LaTeX 文本（支持 str 或 dict）
            if isinstance(latex_entry, dict):
                katex = latex_entry.get('katex', latex_entry.get('full', ''))
            else:
                katex = str(latex_entry)

            # 替换逻辑：
            # 1. 如果是 oMath，它通常包裹在 <m:oMathPara> 中，或者直接在 <w:p> 中。
            #    它是一个“块级”或“准块级”对象。
            # 2. 如果是 MathType (w:object)，它通常在 <w:r> 内部。
            
            # 创建新 Run：<w:r><w:t>${latex}$</w:t></w:r>
            new_run = etree.Element(f'{{{NS["w"]}}}r')
            new_text = etree.Element(f'{{{NS["w"]}}}t')
            new_text.text = f'${katex}$'
            new_run.append(new_text)

            parent = node.getparent()
            
            if node_type == 'oMath':
                # oMath 往往紧跟在文本后面或独立存在。
                # 如果 parent 是 oMathPara，我们可能需要替换整个 oMathPara 为普通的 w:p 内容
                if etree.QName(parent).localname == 'oMathPara':
                    grandparent = parent.getparent()
                    # 将 oMathPara 替换为包含 new_run 的结构（如果段落只有这一个公式）
                    # 或者简单地在 oMathPara 位置插入 new_run 并删除原来的 oMathPara
                    grandparent.replace(parent, new_run)
                else:
                    parent.replace(node, new_run)
            else:
                # MathType object 替换
                parent.replace(node, new_run)

            # 对于 MathType，记录需要清理的关系 ID 和嵌入文件
            if node_type == 'MathType' and rid:
                rids_to_remove.append(rid)
                if rid in rid_to_target:
                    target = rid_to_target[rid]
                    embed_file = tmpdir_path / "word" / target
                    if embed_file.exists():
                        files_to_remove.append(embed_file)

        # ================= 清理 MathType 遗留内容 =================
        if rels_root and rids_to_remove:
            for rid in rids_to_remove:
                # 查找并删除对应关系节点
                for rel in rels_root.findall(f'.//{{{NS["r"]}}}Relationship[@Id="{rid}"]'):
                    rel.getparent().remove(rel)
            # 写回 document.xml.rels
            with open(rels_path, 'wb') as f:
                rels_tree.write(f, xml_declaration=True, encoding='UTF-8')

        for fpath in files_to_remove:
            fpath.unlink()

        # 5. 保存修改后的 document.xml
        with open(doc_xml_path, 'wb') as f:
            tree.write(f, xml_declaration=True, encoding='UTF-8')

        # 6. 重新打包 DOCX
        with zipfile.ZipFile(output_docx, 'w', zipfile.ZIP_DEFLATED) as zip_out:
            for file_path in tmpdir_path.rglob('*'):
                if file_path.is_file():
                    zip_out.write(file_path, file_path.relative_to(tmpdir_path))

        print(f"成功处理，输出文件: {output_docx}")
         
             
def convert_docx(input_docx, output_docx=None, run_dir=None, keep_temps=None, logger=None):
    """Public API: convert MathType objects in `input_docx` to LaTeX and write `output_docx`.

    Parameters:
    - input_docx: path to source .docx
    - output_docx: path to write converted .docx; when None, uses <stem>_katex.docx
    - run_dir: optional path to place per-run artifacts (overrides default output_workspace)
    - keep_temps: if not None, temporarily override module `KEEP_TEMPS_ON_SUCCESS`
    - logger: optional logging.Logger to use instead of module logger

    Returns a dict with keys: xml_path, original_copy, run_dir, latex_formulas, output_docx
    """
    global KEEP_TEMPS_ON_SUCCESS, stat_logger

    old_keep = KEEP_TEMPS_ON_SUCCESS
    if keep_temps is not None:
        KEEP_TEMPS_ON_SUCCESS = bool(keep_temps)

    if logger is not None:
        stat_logger = logger

    input_docx = Path(input_docx).resolve()
    if output_docx is None:
        output_docx = input_docx.parent / f"{input_docx.stem}_katex{input_docx.suffix}"
    output_docx = Path(output_docx).resolve()

    repo_root = Path(__file__).resolve().parent
    out_workspace = Path(run_dir) if run_dir else repo_root / "output_workspace"
    out_workspace.mkdir(parents=True, exist_ok=True)

    warnings = check_prereqs(repo_root)
    for w in warnings:
        stat_logger.warning(w)

    stat_logger.info('Running docx2tex to extract formulas...')
    xml_path, original_copy, actual_run_dir = run_docx2tex(str(input_docx), str(out_workspace))

    # configure stat_logger to write to the same directory as the Hub XML (so xml and logs colocate)
    xml_parent = Path(xml_path).parent if xml_path is not None else Path(actual_run_dir)
    xml_parent.mkdir(parents=True, exist_ok=True)
    log_file = xml_parent / 'process.log'
    file_handler_exists = False
    for h in stat_logger.handlers:
        try:
            if isinstance(h, logging.FileHandler) and getattr(h, 'baseFilename', '') == str(log_file):
                file_handler_exists = True
                break
        except Exception:
            continue
    if not file_handler_exists:
        fh = logging.FileHandler(str(log_file), encoding='utf-8')
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s'))
        stat_logger.addHandler(fh)

    stat_logger.info('Converting MathML to LaTeX...')
    latex_formulas = extract_latex_from_hub(xml_path, run_dir=actual_run_dir)

    stat_logger.info('Patching DOCX with LaTeX...')
    patch_docx_with_latex_corrected(str(input_docx), str(output_docx), latex_formulas)

    # restore global flag if we overrode it
    if keep_temps is not None:
        KEEP_TEMPS_ON_SUCCESS = old_keep
        
        
    return {
        'xml_path': xml_path,
        'original_copy': original_copy,
        'run_dir': actual_run_dir,
        'latex_formulas': latex_formulas,
        'output_docx': output_docx,
    }

def main(input_docx, output_docx):
    input_docx = Path(input_docx).resolve()
    output_docx = Path(output_docx).resolve()
    
    if not input_docx.exists():
        stat_logger.error('输入文件不存在: %s', input_docx)
        return

    repo_root = Path(__file__).resolve().parent
    out_workspace = repo_root / "output_workspace"
    out_workspace.mkdir(parents=True, exist_ok=True)

    # prereq checks
    warnings = check_prereqs(repo_root)
    for w in warnings:
        stat_logger.warning(w)

    stat_logger.info('步骤 1: 运行 docx2tex 提取公式...')
    xml_path, original_copy, run_dir = run_docx2tex(input_docx, out_workspace)

    # configure stat_logger to write to the same directory as the Hub XML (so xml and logs colocate)
    xml_parent = Path(xml_path).parent if xml_path is not None else run_dir
    xml_parent.mkdir(parents=True, exist_ok=True)
    log_file = xml_parent / 'process.log'
    file_handler_exists = False
    for h in stat_logger.handlers:
        try:
            if isinstance(h, logging.FileHandler) and getattr(h, 'baseFilename', '') == str(log_file):
                file_handler_exists = True
                break
        except Exception:
            continue
    if not file_handler_exists:
        fh = logging.FileHandler(str(log_file), encoding='utf-8')
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s'))
        stat_logger.addHandler(fh)
    
    stat_logger.info('步骤 2: 转换 MathML 为 LaTeX...')
    latex_formulas = extract_latex_from_hub(xml_path, run_dir=run_dir)
    
    stat_logger.info('步骤 3: 替换 DOCX 中的公式...')
    patch_docx_with_latex_corrected(input_docx, output_docx, latex_formulas)
    stat_logger.info('完成: %s', output_docx)
 

if __name__ == "__main__":
    import sys
    # INPUT_PATH = "./测试文档/公式.docx"
    # OUTPUT_PATH = "./测试文档/temp.docx"
    # INPUT_PATH = "./测试文档/测试文档_copy.docx"
    # OUTPUT_PATH = "./测试文档/temp05.docx"
    INPUT_PATH = "模型.docx"
    OUTPUT_PATH = "模型_parsed.docx"
    if INPUT_PATH and OUTPUT_PATH:
        res = convert_docx(INPUT_PATH, OUTPUT_PATH)
        try:
            print('Run dir:', res.get('run_dir'))
            print('Hub XML:', res.get('xml_path'))
            print('Output:', res.get('output_docx'))
            print('Formulas converted:', len(res.get('latex_formulas') or []))
        except Exception:
            pass

    
