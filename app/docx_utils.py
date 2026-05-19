from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from collections import defaultdict


CHINESE_NUMFMTS = {
    "chineseCounting",
    "chineseCountingThousand",
    "ideographDigital",
    "taiwaneseCounting"
}


def num_to_chinese(n):
    """阿拉伯数字转简单中文数字: 一、二、三...十...九十九"""
    if n <= 0:
        return str(n)
    nums = "零一二三四五六七八九"
    if n < 10:
        return nums[n]
    if n < 20:
        if n == 10:
            return "十"
        return "十" + nums[n % 10]
    if n < 100:
        shi = n // 10
        ge = n % 10
        if ge == 0:
            return nums[shi] + "十"
        return nums[shi] + "十" + nums[ge]
    if n < 1000:
        bai = n // 100
        rest = n % 100
        if rest == 0:
            return nums[bai] + '百'
        if rest < 10:
            return nums[bai] + "百零" + nums[rest]
        return nums[bai] + "百" + num_to_chinese(rest)
    return str(n)


def freeze_numbering(input_path):
    """
    把docx里的数字型和简单中文数字型的自动编号转成静态文本.
    """
    doc = Document(input_path)
    try:
        numbering_part = doc.part.numbering_part
    except Exception:
        numbering_part = None
    if numbering_part is None:
        doc.save(input_path)
        return

    ct_numbering = numbering_part._element

    # ===== 用lxml 原生遍历，兼容所有python-docx版本 =====
    abstract_nums = ct_numbering.findall(qn('w:abstractNum'))
    nums = ct_numbering.findall(qn('w:num'))

    # 1. 读取编号定义
    num_id_to_abstract = {}
    for num in nums:
        num_id = num.get(qn('w:numId'))
        abstract_num_id_el = num.find(qn('w:abstractNumId'))
        if num_id and abstract_num_id_el is not None:
            abstract_num_id = abstract_num_id_el.get(qn('w:val'))
            if abstract_num_id:
                num_id_to_abstract[num_id] = abstract_num_id

    abstract_formats = {}
    for abstract_num in abstract_nums:
        aid = abstract_num.get(qn('w:abstractNumId'))
        if aid is None:
            continue

        levels = {}
        for lvl in abstract_num.findall(qn('w:lvl')):
            ilvl = lvl.get(qn('w:ilvl'))
            if ilvl is None:
                continue

            num_fmt_el = lvl.find(qn('w:numFmt'))
            num_fmt = num_fmt_el.get(qn('w:val')) if num_fmt_el is not None else "decimal"

            lvl_text_el = lvl.find(qn('w:lvlText'))
            lvl_text = lvl_text_el.get(qn('w:val')) if lvl_text_el is not None else "%1."

            start_el = lvl.find(qn('w:start'))
            start_val = int(start_el.get(qn('w:val'))) if start_el is not None else 1

            levels[int(ilvl)] = {
                "numFmt": num_fmt,
                "lvlText": lvl_text,
                "start": start_val
            }
        abstract_formats[aid] = levels

    # 2. 遍历段落
    counters = defaultdict(lambda: defaultdict(int))
    last_num_id = None

    for para in doc.paragraphs:
        p = para._p
        pPr = p.pPr
        if pPr is None:
            continue

        num_pr = pPr.find(qn('w:numPr'))
        if num_pr is None:
            continue

        num_id_el = num_pr.find(qn('w:numId'))
        num_id = num_id_el.get(qn('w:val')) if num_id_el is not None else None

        ilvl_el = num_pr.find(qn('w:ilvl'))
        ilvl = int(ilvl_el.get(qn('w:val'))) if ilvl_el is not None else 0

        if num_id is None or num_id == "0" or num_id not in num_id_to_abstract:
            continue

        abstract_id = num_id_to_abstract[num_id]
        fmt = abstract_formats.get(abstract_id, {}).get(ilvl)
        if fmt is None:
            continue

        current_numFmt = fmt.get("numFmt")
        # ===== 只处理数字和简单中文数字 =====
        if current_numFmt != 'decimal':
            continue

        # --- 计数器逻辑 ---
        if num_id != last_num_id:
            counters[num_id] = defaultdict(int)

        counters[num_id][ilvl] += 1
        for l in list(counters[num_id].keys()):
            if l > ilvl:
                counters[num_id][l] = 0
        last_num_id = num_id

        # ---算前缀，各级按自己的 numFmt 格式化 ---
        nums = []
        for l in range(0, ilvl + 1):
            val = counters[num_id].get(l, 0)
            if val == 0:
                l_fmt = abstract_formats.get(abstract_id, {}).get(l, {})
                l_start = l_fmt.get("start", 1) if l == ilvl else 1
                val = l_start
                counters[num_id][l] = val

            nums.append(str(val))

        prefix = fmt["lvlText"]
        for idx, n in enumerate(nums, 1):
            prefix = prefix.replace(f"%{idx}", n)
        if not prefix.endswith(" "):
            prefix += " "

        # --- 插入静态文本，并移除自动编号属性 ---
        new_run = OxmlElement('w:r')
        new_t = OxmlElement('w:t')
        new_t.text = prefix
        new_run.append(new_t)
        pPr.addnext(new_run)

        pPr.remove(num_pr)

        # try:
        #     if para.style and 'List' in para.style.name:
        #         para.style = doc.styles['Normal']
        # except Exception:
        #     pass

    # try:
    #     numbering_part = doc.part.numbering_part
    #     ct_numbering = numbering_part._element
    #     for child in list(ct_numbering):
    #         ct_numbering.remove(child)
    # except Exception:
    #     pass

    doc.save(input_path)


if __name__ == '__main__':
    freeze_numbering(r"C:\Users\Administrator\Desktop\sun\测试问题项目0507\doc_repo\小电项目加密及过期时间配置操作手册.docx")




















