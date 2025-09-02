from .docx2md import do_convert

import zipfile
from .mtef import MTEF
from lxml import etree
import shutil
import os
import xml.etree.ElementTree as ET

def convertDocToMarkdown(filePath, targetFolder):
    fileName = os.path.basename(filePath)
    fileNamePrefix = fileName.split('.')[0]
    savedDir = os.path.join(targetFolder, fileNamePrefix)
    if not os.path.exists(savedDir):
        os.makedirs(savedDir, exist_ok=True)
        
    # Step 1: parse math formulas in the docx file
    parseMathtype(filePath, savedDir)
    
    # Step 2: convert the docx file to markdown
    savedName = f"{fileNamePrefix}.md"
    savedFilePath = os.path.join(savedDir, savedName)
    do_convert(filePath, target_dir=savedDir, use_md_table=True, savedMdName=savedFilePath)


def parseMathtype(file_path, saved_dir):
    # 确保输出目录存在
    # 判断导入的文件是否为docx
    # 将输入的文件复制一份副本
    try:
        # 找到嵌入文件的引用
        namespaces = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'o': 'urn:schemas-microsoft-com:office:office',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'rel': 'http://schemas.openxmlformats.org/package/2006/relationships'
        }

        # file_name, file_extension = os.path.splitext(docx_path)
        file_name = os.path.basename(file_path)
        file_name_prefix = file_name.split('.')[0]
        file_extension = file_name.split('.')[-1]
        
        # 首先判断是否为 docx文件
        if file_extension.lower() in ['docx']:
            target_file_path = os.path.join(saved_dir, file_name_prefix+"_备份."+file_extension)
            # 存储原始文件，但是只存储一次，便于多次生成
            if not os.path.exists(target_file_path):
                shutil.copy(file_path, target_file_path)
                # 打开 Word 文档
            with zipfile.ZipFile(file_path, 'r') as docx:
                # 创建一个字典来存储文件内容
                file_dict = {file_info.filename: docx.read(file_info) for file_info in docx.infolist()}

            rels_object_map = {}
            # '{http://schemas.openxmlformats.org/package/2006/relationships}Relationships'
            rels_file = 'word/_rels/document.xml.rels'
            if rels_file in file_dict:
                rels_content = file_dict[rels_file]
                rels_tree = ET.fromstring(rels_content)
                for rel in rels_tree.findall('.//rel:Relationship', namespaces):
                    rel_id = rel.get('Id')
                    rel_type = rel.get('Type')
                    rel_target = rel.get('Target')
                    if rel_type == 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject':
                        rels_object_map[rel_id] = rel_target

            # 定义一个list存储string
            object_latex_map = {}

            # 遍历文件字典，处理嵌入文件
            for filename, content in file_dict.items():
                # 检查文件是否是嵌入的文件
                if filename.startswith('word/embeddings/') and filename.endswith(('.bin')):
                    # 解析嵌入文件
                    object_latex_map[filename] = ''
                    mtef, err = MTEF.OpenBytes(content)
                    if mtef:
                        try:
                            latex_str = mtef.Translate()
                            tostr = latex_str
                            # print(latex_str)
                            # tostr = tostr.replace('\\begin{align}','\\begin{aligned}').\
                            #     replace('\\end{align}','\\end{aligned}').\
                            #     replace('>','\\gt').replace('<','\\lt')
                            # print(tostr)
                            # 替换嵌入文件为 LaTeX 字符串
                            file_dict[filename] = tostr.encode('utf-8')
                            filename = filename.replace('word/', '')
                            object_latex_map[filename] = latex_str
                        except Exception as e:
                            print(f'错误，原因是：{str(e)}')

            # 修改 document.xml 文件
            document_xml = file_dict['word/document.xml']
            document_tree = etree.fromstring(document_xml)

            # 查找 mathtype和oleobject.bin的关系

            for element in document_tree.xpath('.//w:object', namespaces=namespaces):
                # 检查是否为公式嵌入对象
                ole_object = element.find('.//o:OLEObject', namespaces=namespaces)
                if ole_object is not None:
                    # 提取 o:OLEObject 的属性
                    ole_progid = ole_object.get('ProgID')
                    # {'Type': 'Embed', 'ProgID': 'Equation.DSMT4', 'ShapeID': '_x0000_i1025', 'DrawAspect': 'Content', 'ObjectID': '_1814282474',
                    # '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id': 'rId7'}
                    ole_id = ole_object.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                    # 判断获取的属性是否为公式
                    if "Equation.DSMT4" in ole_progid or "Equation" in ole_progid:
                        parent = element.getparent()
                        parent.remove(element)
                        # 插入解析好的 LaTeX 字符串
                        new_text = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')
                        findName = rels_object_map.get(ole_id)
                        if findName:
                            findText = object_latex_map.get(findName)
                            if findText:
                                new_text.text = findText
                                parent.append(new_text)

            # 将修改后的 XML 写回文件字典
            file_dict['word/document.xml'] = etree.tostring(document_tree, encoding='utf-8')

            # 保存修改后的文档
            with zipfile.ZipFile(file_path, 'w') as docx_out:
                for filename, content in file_dict.items():
                    docx_out.writestr(filename, content)
    except Exception as e:
        print(f"word文档 mathtype提取失败！，错误原因是：{str(e)}")

