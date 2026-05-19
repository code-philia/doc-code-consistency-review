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

                # Post-process LaTeX for tighter formatting and KaTeX friendliness
                def _clean_latex_for_katex(s: str) -> str:
                    # remove Unicode combining underline and other combining low-line marks
                    # normalize and strip all combining marks (category 'Mn') which
                    # includes the combining low line U+0332 that produced things like
                    # "U̲p̲d̲e̲l̲t̲a̲". This yields plain letters which we can then map.
                    try:
                        s = unicodedata.normalize('NFD', s)
                        s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
                    except Exception:
                        # fall back to the original simple replacement
                        s = s.replace('\u0332', '')
                        s = s.replace('\\\u0332', '')

                    # Convert textual min/max inside \text{...} into proper math operators
                    s = re.sub(r"\\text\{\s*\\?(min|max)\s*\}", r"\\\1", s)
                    s = re.sub(r"_\{\s*\\?(min|max)\s*\}", r"_{\\\1}", s)
                    s = re.sub(r"\^\{\s*\\?(min|max)\s*\}", r"^{\\\1}", s)

                    # Unwrap \text{...} when it contains only simple tokens (letters, digits, =, /, ., - and spaces)
                    s = re.sub(r"\\text\{\s*([A-Za-z0-9=\./\s%\-]+?)\s*\}", r"\1", s)

                    # remove spaces between macro and following '(': '\\alpha (k)' -> '\\alpha(k)'
                    s = re.sub(r"\\([A-Za-z]+)\s+\(", r"\\\1(", s)

                    # remove \mathit wrappers used around single punctuation characters
                    s = re.sub(r"\\mathit\{([()\\/\\\\])\}", r"\1", s)

                    # collapse multiple spaces
                    s = re.sub(r"\s{2,}", " ", s)
                    s = s.strip()

                    # Map nonstandard "Up" macros produced by some XSLT mappings
                    # (e.g. \Updelta) to standard LaTeX names KaTeX understands
                    # (\Delta). This covers patterns like \Updelta, \Upalpha, etc.
                    def _map_up_macro(m):
                        name = m.group(1)
                        # capitalize the name: delta -> Delta
                        mapped = name.capitalize()
                        return '\\' + mapped

                    s = re.sub(r"\\Up([A-Za-z]+)", _map_up_macro, s)

                    return s

                try:
                    latex = _clean_latex_for_katex(latex)
                except Exception:
                    pass
                # 清理临时文件
                try:
                    os.remove(temp_mml)
                    os.remove(temp_tex)
                except:
                    pass

            try:
                latex = _clean_latex_for_katex(latex)
            except Exception:
                pass
            # 清理临时文件
            try:
                os.remove(temp_mml)
                os.remove(temp_tex)
            except:
                pass
            return latex

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
        # print(mml_content)
        latex = convert_mathml_to_latex(mml_content)
        # 如果转换出来还是纯文本（如 x1），说明 XSLT 没匹配上
        # 正常应该是 x_{1}
        latex_results.append(latex)
            
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
            latex = latex_formulas[i]
            
            # 创建新的 w:r 节点包含文本
            new_run = etree.Element(f"{{{WORD_NS}}}r")
            new_text = etree.Element(f"{{{WORD_NS}}}t")
            # 包装成 KaTeX 风格 $...$
            new_text.text = f"${latex}$" 
            new_run.append(new_text)
            
            parent = obj.getparent()
            parent.replace(obj, new_run)
            
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
