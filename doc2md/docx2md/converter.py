import collections
import io
import re

from lxml import etree

from . import utils
from ..dwml import omml
import traceback

class Converter:
    def __init__(self, xml_text, styles_xml ,numbering_xml, media, use_md_table, parseDocMethod):
        self.tree = etree.fromstring(xml_text)
        utils.strip_ns_prefix(self.tree)
        self.parseDocMethod = parseDocMethod

        # 深度解析样式表，构建样式映射
        self.styles_tree = None
        self.styles_map = {}
        if styles_xml:
            self.styles_tree = etree.fromstring(styles_xml)
            utils.strip_ns_prefix(self.styles_tree)
            self._build_styles_map()

        # 深度解析编号表，构建编号映射
        self.numbering_tree = None
        self.numbering_map = {}
        if numbering_xml:
            self.numbering_tree = etree.fromstring(numbering_xml)
            utils.strip_ns_prefix(self.numbering_tree)
            self._build_numbering_map()

        # (numId, ilvl)
        self.list_counters = {}

        self.media = media
        self.image_counter = self.counter()
        self.table_counter = self.counter()

        self.use_md_table = use_md_table
        # 记录公式集
        self.mathText = []
        self.isMathText = False

    def _build_styles_map(self):
        # 建立以outline数值为key的样式字典
        self.styles_map = {}
        for style in self.styles_tree.xpath("//style"):
            style_id = style.attrib.get("styleId")
            if not style_id:
                continue

            based_on = self.get_first_element(style, "./basedOn")
            outline_lvl = self.get_first_element(style, "./pPr/outlineLvl")

            numId_el = self.get_first_element(style, "./pPr/numPr/numId")
            ilvl_el = self.get_first_element(style, "./pPr/numPr/ilvl")

            self.styles_map[style_id] = {
                "basedOn": based_on.attrib.get("val") if based_on is not None else None,
                "outlineLvl": int(outline_lvl.attrib.get("val")) if outline_lvl is not None and outline_lvl.attrib.get(
                    "val", "").isdigit() else None,
                "type": style.attrib.get("type"),
                "hasNumPr": numId_el is not None or ilvl_el is not None,
                "numId": numId_el.attrib.get("val") if numId_el is not None else None,
                "ilvl": int(ilvl_el.attrib.get("val")) if ilvl_el is not None and ilvl_el.attrib.get("val",
                                                                                                     "").isdigit() else None,
            }

    def _build_numbering_map(self):
        # 建立编号映射：numId -> (ilvl -> numFmt)
        abstract_map = {}
        for abstract in self.numbering_tree.xpath("//abstractNum"):
            abs_id = abstract.attrib.get("abstractNumId")
            levels = {}
            for lvl in abstract.xpath("./lvl"):
                ilvl = lvl.attrib.get("ilvl")
                try:
                    ilvl_i = int(ilvl) if ilvl is not None else 0
                except:
                    ilvl_i = 0
                numFmt_el = self.get_first_element(lvl, "./numFmt")
                numFmt = numFmt_el.attrib.get("val") if numFmt_el is not None else "bullet"
                levels[ilvl_i] = numFmt
            abstract_map[abs_id] = levels

        # map numId -> abstractNum levels
        for num in self.numbering_tree.xpath("//num"):
            numId = num.attrib.get("numId")
            abs_ref = self.get_first_element(num, "./abstractNumId")
            abs_val = abs_ref.attrib.get("val") if abs_ref is not None else None
            if abs_val and abs_val in abstract_map:
                self.numbering_map[numId] = abstract_map[abs_val]
            else:
                self.numbering_map[numId] = {}

    def _get_para_num_info(self, node, style_id=None):
        # 建立缩进的映射
        numId_el = self.get_first_element(node, "./pPr/numPr/numId")
        ilvl_el = self.get_first_element(node, "./pPr/numPr/ilvl")
        if numId_el is not None:
            numId = numId_el.attrib.get("val")
            try:
                ilvl = int(ilvl_el.attrib.get("val")) if ilvl_el is not None and ilvl_el.attrib.get("val",
                                                                                                    "").isdigit() else 0
            except:
                ilvl = 0
            return (numId, ilvl)

        if style_id:
            style_info = self.styles_map.get(style_id)
            if style_info and style_info.get("hasNumPr"):
                return (style_info.get("numId"), style_info.get("ilvl") or 0)

        return (None, None)

    def _is_ordered_numfmt(self, fmt):
        if not fmt:
            return False
        return fmt.lower() in {"decimal", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman"}

    def _inc_counter(self, numId, ilvl):
        key = (numId, ilvl)
        self.list_counters[key] = self.list_counters.get(key, 0) + 1
        return self.list_counters[key]

    def resolve_heading_level(self, style_id, visited=None):
        if not style_id:
            return None
        if visited is None:
            visited = set()
        if style_id in visited:
            return None
        visited.add(style_id)

        style_info = self.styles_map.get(style_id)
        if not style_info:
            return None

        outline_lvl = style_info.get("outlineLvl")
        if outline_lvl is not None:
            return outline_lvl + 1

        based_on = style_info.get("basedOn")
        if based_on:
            return self.resolve_heading_level(based_on, visited)

        return None

    def resolve_list_level(self, node):
        ilvl = self.get_first_element(node, ".//ilvl")
        if ilvl is None:
            return None
        val = ilvl.attrib.get("val")
        return int(val) if val and val.isdigit() else None

    def counter(self, start=1):
        count = start - 1

        def inc():
            nonlocal count
            count += 1
            return count

        return inc

    def convert(self):
        self.in_list = False

        of = io.StringIO()
        body = self.get_first_element(self.tree, ".//*[local-name()='body']")
        if body is not None:
            self.parse_node(of, body)
        else:
            self.parse_node(of,self.tree)
        # self.parse_node(of, body)

        return re.sub(r"\n{2,}", "\n\n", of.getvalue()).strip()

    def get_first_element(self, node, xpath):
        tags = node.xpath(xpath)
        return tags[0] if len(tags) > 0 else None

    def get_sub_text(self, node):
        of = io.StringIO()
        self.parse_node(of, node)
        return of.getvalue().strip()

    # {'sectPr', 'tbl', 'bookmarkEnd', 'moveToRangeEnd', 'bookmarkStart', 'commentRangeStart', 'moveFromRangeEnd', 'sdt', 'p'}
    BODY_IGNORE = [
        "sectPr",
        # "tbl",
        # "p"}
        "bookmarkStart",
        "bookmarkEnd",
        "moveToRangeEnd",
        "commentRangeStart",
        "moveFromRangeEnd",
        "sdt",
    ]

    def parse_node(self, of, node):
        for child in node.getchildren():
            tag_name = child.tag
            if tag_name in self.BODY_IGNORE:
                continue
            elif tag_name == "p":
                self.parse_p(of, child)
            elif tag_name == "tbl":
                self.parse_tbl(of, child)
            else:
                self.parse_node(of,child)
            if child.tail:
                print(child.tail, end="", file = of)
        if node.tail:
            print(node.tail, end="", file = of)
            # else:
            #     # if self.is_formula(r):
            #     #     formula = self.extract_formula(r)
            #     #     if formula:
            #     #         text = f"$$ {formula} $$"
            #     print("# ** skip", tag_name)
            #
            # elif tag_name == "br":
            #     if child.attrib.get("type") == "page":
            #         print('\n<div class="break"></div>\n', file=of)
            #
            #     else:
            #         print("<br>", end="", file=of)
            # elif tag_name == "t":
            #     print(child.text or " ", end="", file=of)
            # elif tag_name == "drawing":
            #     self.parse_drawing(of, child)
            # else:
            #     self.parse_node(of, child)


    P_IGNORE = [
        # "ins", "r",
        "pPr",
        "sdt",
        "moveFrom",
        "moveTo",
        "hyperlink",
        "del",
        "proofErr",
        "moveToRangeStart",
        "commentRangeStart",
        "commentRangeEnd",
        "bookmarkStart",
        "bookmarkEnd",
        "moveFromRangeStart",
        "moveFromRangeEnd",
    ]

    #记录公式集
    # mathText = []
    # isMathText = False
    starRe = r'\{array\}{\*\{(\d+)\}\{([clr])\}'
    def parse_p(self, of, node):
        def out_p(text):
            print("", file=of)
            print(text, file=of)
            print("", file=of)
        
        if self.parseDocMethod == 'enhanced':
            sub_text = self.parse_p_text_new(node).lstrip()
        else: 
            sub_text = self.parse_p_text(node).lstrip()
        
        #sub_text = self.parse_p_text(node).lstrip()
        subtextsum = str(sub_text).count('$')
        if subtextsum and subtextsum % 2 != 0 and self.isMathText == False:
            self.mathText.clear()
            self.mathText.append(sub_text.strip())
            self.isMathText = True
            return

        if self.isMathText == True:
            self.mathText.append(sub_text.strip())
            if subtextsum and subtextsum % 2 != 0:
                sub_text = ''
                for info in self.mathText:
                    sub_text += info
                self.isMathText = False
            else:
                return
        # # if "$" in sub_text and sub_text.count('$') < 1:

        #
        # if sub_text.startswith("$") and subtextsum == 1:
        #     self.mathText.clear()
        #     self.mathText.append(sub_text.strip())
        #     return
        #
        # if ("$") in sub_text and self.mathText:
        #     endInfo = sub_text.strip()
        #     sub_text = ''
        #     for info in self.mathText:
        #         sub_text += info
        #     self.mathText.clear()
        #latex -> katex  如果是公式  成对出现 $$  并且 存在下述格式的内容，则更改
        subtextsum = str(sub_text).count('$')
        if subtextsum and subtextsum % 2 == 0:
            sub_text = sub_text.replace('\\kern-\\nulldelimiterspace','kern{2pt}')
            isMath = re.findall(self.starRe,sub_text)
            if isMath:
                isAgain = []
                for col,num in isMath:
                    if (col,num) in isAgain:
                        continue
                    else:
                        isAgain.append((col,num))
                        beforinfo = "{array}{*{" + col + "}{" + num + "}}"
                        tempstr = int(col)*str(num)
                        afterinfo = "{array}{" + tempstr +"}"
                        sub_text = sub_text.replace(beforinfo,afterinfo)

        pOutlinelevel = self.get_first_element(node,'./pPr/outlineLvl')
        if pOutlinelevel is not None:
            heading_str = pOutlinelevel.attrib.get("val","0")
            try:
                heading_level = int(heading_str)
                md_tag = "#"*(heading_level + 1)
            except ValueError:
                md_tag = ""
            if md_tag:
                sub_text = f"{md_tag} {sub_text}"

        pStyle = self.get_first_element(node, "./pPr/pStyle")
        if pStyle is None:
            if self.in_list:
                self.in_list = False
            out_p(sub_text)
            return

        xml_string = etree.tostring(node, encoding="unicode", pretty_print=True)
        # print(xml_string)
        # 將<oMathPara> 转换成 <m:oMathPara>
        # 解析并转换
        # xml_string = self.convert_omml_namespaces(xml_string)
        # style = pStyle.attrib["val"]
        # if style.isdigit():
        #     if int(style) > 8:
        #         print("",sub_text, file=of)
        #     else:
        #         print("#" * (int(style)), sub_text, file=of)
        # elif style[0] == "a":
        #     ilvl = self.get_first_element(node, ".//ilvl")
        #     if ilvl is None:
        #         out_p(sub_text)
        #         return
        #     level = int(ilvl.attrib["val"])
        #     print("    " * level + "*", sub_text, file=of)
        # else:
        #     out_p(sub_text)
        style_id = pStyle.attrib.get("val")
        heading_level = self.resolve_heading_level(style_id)

        if heading_level is not None:
            # of.write(("#" * heading_level) + " " + sub_text.rstrip() + "\n\n")
            print("#" * (int(heading_level)), sub_text, file=of)
            return

        numId, ilvl = self._get_para_num_info(node, style_id)
        if numId:
            if ilvl is None:
                ilvl = 0
            num_levels = self.numbering_map.get(numId, {})
            numFmt = num_levels.get(ilvl)
            indent = "    " * ilvl
            if self._is_ordered_numfmt(numFmt):
                cnt = self._inc_counter(numId, ilvl)
                marker = f"{cnt}."
            else:
                marker = "*"
            # of.write(f"{indent}{marker} {sub_text}")
            print(f"{indent}{marker} ", sub_text, file=of)
            return

        out_p(sub_text)

    def parse_p_text(self, node):
        of = io.StringIO()
        xml_string = etree.tostring(node, encoding="unicode", pretty_print=True)
        #支持数学公式过滤
        runs = node.xpath(".//r|.//ins/r|.//oMathPara|.//oMath")
        for r in runs:
            if r.tag == 'oMath':
                # 保证段落里面的公式只会被处理一次
                OMML_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
                xml_string = etree.tostring(r, encoding="unicode", pretty_print=True)
                xml_string =f'''
                <root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                {xml_string}
                </root>
                '''
                # 解析并转换
                xml_string = self.convert_omml_namespaces(xml_string)
                # print(xml_string)
                xml_string = xml_string.lstrip('')
                # tmpInfo = omml.load_string(xml_string)
                try:
                    for omath in omml.load_string(xml_string):
                        if omath and omath.latex:
                            text = omath.latex
                    print('$' + text + '$', end="", file=of)
                except:
                    continue
                # ss = 0
            else:
                self.parse_r(of, r)

        return of.getvalue()
    
    def parse_p_text_new(self, node):
        of = io.StringIO()
        xml_string = etree.tostring(node, encoding="unicode", pretty_print=True)
        #支持数学公式过滤
        runs = node.xpath(".//r|.//ins/r|.//oMathPara|.//oMath")
        for r in runs:
            if r.tag == 'oMath':
                # 保证段落里面的公式只会被处理一次
                OMML_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
                xml_string = etree.tostring(r, encoding="unicode", pretty_print=True)
                xml_string =f'''
                <root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                {xml_string}
                </root>
                '''
                # 解析并转换
                xml_string = self.convert_omml_namespaces(xml_string)
                # print(xml_string)
                from dwml import omml
                xml_string = xml_string.lstrip('')
                # tmpInfo = omml.load_string(xml_string)
                try:
                    for omath in omml.load_string(xml_string):
                        if omath and omath.latex:
                            text = omath.latex
                    print('$' + text + '$', end="", file=of)
                except:
                    continue
                # ss = 0
            else:
                self.parse_r(of, r)
        return of.getvalue()
    
    R_IGNORE = [
        # "pict", "t", "br", "drawing",
        "tab",
        "lastRenderedPageBreak",
        "rPr",
        "instrText",
        "delText",
        "fldChar",
    ]

    from lxml import etree
    def convert_omml_namespaces(self,xml_str):
        # 定义OMML命名空间常量
        MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
        NS_MAP = {'m': MATH_NS}

        # 创建解析器并加载XML
        parser = etree.XMLParser(remove_blank_text=True)
        root = etree.fromstring(xml_str, parser)

        # 预注册命名空间（避免重复声明）
        etree.register_namespace('m', MATH_NS)

        # 递归转换函数
        def convert_element(elem):
            new_tag = f"{{{MATH_NS}}}{elem.tag.split('}')[-1]}"
            new_elem = etree.Element(new_tag, nsmap={'m': MATH_NS})

            # 复制属性
            for key, value in elem.attrib.items():
                new_elem.set(key, value)

            # 处理文本内容
            if elem.text:
                new_elem.text = elem.text

            # 递归处理子元素
            for child in elem:
                new_child = convert_element(child)
                new_elem.append(new_child)

            return new_elem

        # 执行转换
        new_root = convert_element(root)

        # 确保根元素声明命名空间
        if 'm' not in new_root.nsmap:
            new_root.set(f"xmlns:m", MATH_NS)

        # 生成最终XML
        return etree.tostring(new_root, encoding='unicode', pretty_print=True)

    def parse_r(self, of, node):
        for child in node.getchildren():
            tag_name = child.tag
            if tag_name == "t":
                text = child.text or " "
                text = text.replace("\u00a0", "&nbsp;")
                print(text, end="", file=of)
            elif tag_name == "br":
                if child.attrib.get("type") == "page":
                    print('<div class="page"></div>', file=of)
                else:
                    print("<br>", end="", file=of)
            elif tag_name == "drawing":
                blip = self.get_first_element(child, ".//blip")
                if blip is None:
                    print("[parse_r]", tag_name)
                    continue
                id = blip.attrib.get("embed")
                if id is None:
                    print("[parse_r]", tag_name)
                    continue
                self.emit_image(of, id)
            elif tag_name == "object":
                xml_string = etree.tostring(node, encoding="unicode", pretty_print=True)
                imagedata = self.get_first_element(child, ".//imagedata")
                if imagedata is None:
                    print("[parse_r]", tag_name)
                    continue
                id = imagedata.attrib.get("id")
                if id is None:
                    print("[parse_r]", tag_name)
                    continue
                self.emit_image(of, id)
            elif tag_name == "pict":
                print("<{tag_name}>", end="", file=of)
            elif tag_name == "oMath":
                ss = 0
                #如果是公式，该如何处理
                text = "$ " +  " $"
                OMML_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
                xml_string = etree.tostring(node, encoding="unicode", pretty_print=True)
                # print(xml_string)
                #將<oMathPara> 转换成 <m:oMathPara>
                # 解析并转换
                xml_string = self.convert_omml_namespaces(xml_string)
                # print(xml_string)
                from dwml import omml
                xml_string = xml_string.lstrip('')
                # tmpInfo = omml.load_string(xml_string)
                try:
                    for omath in omml.load_string(xml_string):
                        text = omath.latex
                    print('$' + text + '$', end="", file=of)
                except:
                    continue
            elif tag_name in self.R_IGNORE:
                # print("[parse_r]", tag_name)
                continue


    def parse_tbl(self, of, node):
        properties = self.get_table_properties(node)
        if self.use_md_table:
            self.emit_md_table(of, node, len(properties[0]))
        else:
            self.emit_html_table(of, node, properties)

    def emit_md_table(self, of, node, col_size):
        print("", file=of)
        print("| # " * (col_size) + "|", file=of)
        print("|---" * col_size + "|", file=of)
        for tag_tr in node.xpath(".//tr"):
            print("|", end="", file=of)
            for tag_tc in tag_tr.xpath(".//tc"):
                span = 1
                gridSpan = self.get_first_element(tag_tc, ".//gridSpan")
                if gridSpan is not None:
                    span = int(gridSpan.attrib["val"])
                sub_text = self.get_sub_text(tag_tc)
                text = re.sub(r"\n+", "<br>", sub_text)
                print(text, end="", file=of)
                print("|" * span, end="", file=of)
            gridAfter = self.get_first_element(tag_tr, ".//gridAfter")
            if gridAfter is not None:
                val = int(gridAfter.attrib["val"])
                print("|" * val, end="", file=of)
            print("", file=of)
        print("", file=of)

    def emit_html_table(self, of, node, properties):
        id = f"table{self.table_counter()}"
        print(f'\n<table id="{id}">', file=of)
        for y, tr in enumerate(node.xpath(".//tr")):
            print("<tr>", file=of)
            x = 0
            for tc in tr.xpath(".//tc"):
                prop = properties[y][x]
                colspan = prop.span
                attr = "" if colspan <= 1 else f' colspan="{colspan}"'
                rowspan = prop.merge_count
                attr += "" if rowspan == 0 else f' rowspan="{rowspan}"'

                sub_text = self.get_sub_text(tc)
                text = re.sub(r"\n+", "<br>", sub_text)
                if not prop.merged or prop.merge_count != 0:
                    print(f"<td{attr}>{text}</td>", file=of)
                x += colspan
            gridAfter = self.get_first_element(tr, ".//gridAfter")
            if gridAfter is not None:
                val = int(gridAfter.attrib["val"])
                for _ in range(val):
                    print("<td></td>", file=of)
            print("</tr>", file=of)
        print("</table>", file=of)

    #注意表格信息的提取 需要确保[x][y]能够正常读取
    def get_table_properties(self, node):
        CellProperty = collections.namedtuple(
            "CellProperty", ["span", "merged", "merge_count"]
        )
        properties = []
        for tr in node.xpath(".//tr"):
            row_properties = []
            for tc in tr.xpath(".//tc"):
                span = 1
                gridSpan = self.get_first_element(tc, ".//gridSpan")
                if gridSpan is not None:
                    span = int(gridSpan.attrib["val"])
                merged = False
                merge_count = 0
                vMerge = self.get_first_element(tc, ".//vMerge")
                if vMerge is not None:
                    merged = True
                    val = vMerge.attrib.get("val")
                    merge_count = 1 if val == "restart" else 0
                prop = CellProperty(span, merged, merge_count)
                row_properties.append(prop)
                for _ in range(span - 1):
                    row_properties.append(
                        CellProperty(0, prop.merged, prop.merge_count)
                    )
            gridAfter = self.get_first_element(tr, ".//gridAfter")
            if gridAfter is not None:
                val = int(gridAfter.attrib["val"])
                for _ in range(val):
                    row_properties.append(CellProperty(1, False, 0))
            properties.append(row_properties)

        for y in range(len(properties) - 1):
            for x in range(len(properties[0])):
                if x < len(properties[y]):
                    prop = properties[y][x]
                    if prop.merge_count > 0:
                        count = 0
                        for ynext in range(y + 1, len(properties)):
                            if x < len(properties[ynext]):
                                cell = properties[ynext][x]
                                if cell.merged and cell.merge_count == 0:
                                    count += 1
                                elif not cell.merged or cell.merge_count > 0:
                                    break
                        properties[y][x] = CellProperty(
                            prop.span, prop.merged, prop.merge_count + count
                        )
        return properties

    def parse_drawing(self, of, node):
        """pictures"""
        blip = self.get_first_element(node, ".//blip")
        if blip is None:
            return

        embed_id = blip.attrib.get("embed")
        if embed_id is None or embed_id not in self.media:
            return

        tag_id = f"image{self.image_counter()}"
        print(
            f'<img src="{self.media[embed_id].alt_path}" id="{tag_id}">',
            end="",
            file=of,
        )

    def emit_image(self, of, id):
        tag_id = f"image{self.image_counter()}"
        print(f'<img src="{self.media[id].alt_path}" id="{tag_id}">', end="", file=of)

    namespace = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math'}

    #数值
    def extrateE(self,node):
        base = node.xpath('./e', namespaces=self.namespace)
        a = ''
        for onelevel in base:
            twolevel = onelevel.xpath('./r', namespaces=self.namespace)
            for threelevel in twolevel:
                fourlevel = threelevel.xpath('./t', namespaces=self.namespace)
                for t in fourlevel:
                    if t.text:
                        a += t.text
        return a

    #下标
    def extrateSub(self,node):
        base = node.xpath('./sub', namespaces=self.namespace)
        b = ''
        for onelevel in base:
            twolevel = onelevel.xpath('./r', namespaces=self.namespace)
            for threelevel in twolevel:
                fourlevel = threelevel.xpath('./t', namespaces=self.namespace)
                for t in fourlevel:
                    if t.text:
                        b += t.text
        return b
    #上标
    def extrateSup(self,node):
        base = node.xpath('./sup', namespaces=self.namespace)
        b = ''
        for onelevel in base:
            twolevel = onelevel.xpath('./r', namespaces=self.namespace)
            for threelevel in twolevel:
                fourlevel = threelevel.xpath('./t', namespaces=self.namespace)
                for t in fourlevel:
                    if t.text:
                        b += t.text
        return b
    #分子
    def extrateNum(self, node):
        base = node.xpath('./num', namespaces=self.namespace)
        b = ''
        for onelevel in base:
            twolevel = onelevel.xpath('./r', namespaces=self.namespace)
            for threelevel in twolevel:
                fourlevel = threelevel.xpath('./t', namespaces=self.namespace)
                for t in fourlevel:
                    if t.text:
                        b += t.text
        return b

    #分母
    def extrateDen(self, node):
        base = node.xpath('./den', namespaces=self.namespace)
        b = ''
        for onelevel in base:
            twolevel = onelevel.xpath('./r', namespaces=self.namespace)
            for threelevel in twolevel:
                fourlevel = threelevel.xpath('./t', namespaces=self.namespace)
                for t in fourlevel:
                    if t.text:
                        b += t.text
        return b

    def parse_latex(self, of, node):
        # namespaces = {
        #     "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
        #     "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        # }
        # formulas = node.xpath("//m:oMath/m:r/m:t/text()", namespaces=namespaces)
        # for formula in formulas:
        #     print("公式文本:", formula)
        namespace = {'m': 'http://schemas.openxmlformats.org/officeDocument/2006/math'}

        # 递归解析公式节点
        parts = []
        for child in node.xpath('./*'):
            if child.tag.endswith('r'):  # 常规文本元素
                text = child.xpath('./t', namespaces=namespace)
                for info in text:
                    parts.append(info.text)
            elif child.tag.endswith('sSup'):  # 上标
                a = self.extrateE(child)
                b = self.extrateSup(child)
                parts.append(f"{a}^{{{b}}}")
            elif child.tag.endswith('sSub'):# 下标
                a = self.extrateE(child)
                b = self.extrateSub(child)
                parts.append(f"{a}_{{{b}}}")
            elif child.tag.endswith('f'):  # 分数
                a = self.extrateNum(child)
                b = self.extrateDen(child)
                parts.append(r"\frac{" + a + "}{" + b + "}")
            elif child.tag.endswith('sSubSup'):
                print(0)
            # 添加更多元素处理...
        return ''.join(parts)

        # return _parse(omath_node)


