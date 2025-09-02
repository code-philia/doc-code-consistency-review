import base64
import os
import re
import shutil
import zipfile
from .mtef import MTEF
from lxml import etree
import xml.etree.ElementTree as ET

# def extract_embedded_files(docx_path, output_dir):
#     # 确保输出目录存在
#     if not os.path.exists(output_dir):
#         os.makedirs(output_dir)
#
#     # 打开 Word 文档
#     with zipfile.ZipFile(docx_path, 'r') as docx:
#         # 创建一个字典来存储文件内容
#         file_dict = {file_info.filename: docx.read(file_info) for file_info in docx.infolist()}
#
#     # 遍历文件字典，处理嵌入文件
#     for filename, content in file_dict.items():
#         # 检查文件是否是嵌入的文件
#         if filename.startswith('word/embeddings/'):
#             # 解析嵌入文件
#             mtef, err = MTEF.OpenBytes(content)
#             if mtef:
#                 latex_str = mtef.Translate()
#                 # 替换嵌入文件为 LaTeX 字符串
#                 file_dict[filename] = latex_str.encode('utf-8')
#
#                 # 修改文档的 XML 结构，将嵌入文件替换为 LaTeX 字符串
#                 document_xml = file_dict['word/document.xml']
#                 document_tree = etree.fromstring(document_xml)
#                 for element in document_tree.xpath('.//w:object', namespaces={'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}):
#                     # 找到嵌入文件的引用
#                     for child in element:
#                         # '{urn:schemas-microsoft-com:office:office}OLEObject'
#                         if child.tag.endswith('OLEObject'):
#                             # 替换为 LaTeX 字符串
#                             child.text = latex_str
#
#                 # 将修改后的 XML 写回文件字典
#                 file_dict['word/document.xml'] = etree.tostring(document_tree, encoding='utf-8')
#
#     # 保存修改后的文档
#     output_path = os.path.join(output_dir, os.path.basename(docx_path))
#     with zipfile.ZipFile(output_path, 'w') as docx_out:
#         for filename, content in file_dict.items():
#             docx_out.writestr(filename, content)
#
# # 示例用法
# if __name__ == '__main__':
#     test_docx_path = "./resources/test.docx"
#     extract_embedded_files(test_docx_path, './resources')

import os
import zipfile
from mtef import MTEF
from lxml import etree

def extract_embedded_files(docx_path):
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

        file_name,file_extension = os.path.splitext(docx_path)
        # 首先判断是否为 docx文件
        if file_extension.lower() in ['.docx']:
            target_file_path = file_name + "_原版" + file_extension
            # 存储原始文件，但是只存储一次，便于多次生成
            if not os.path.exists(target_file_path):
                shutil.copy(docx_path, target_file_path)
                # 打开 Word 文档
            with zipfile.ZipFile(docx_path, 'r') as docx:
                # 创建一个字典来存储文件内容
                file_dict = {file_info.filename: docx.read(file_info) for file_info in docx.infolist()}

            rels_object_map = {}
            # '{http://schemas.openxmlformats.org/package/2006/relationships}Relationships'
            rels_file = 'word/_rels/document.xml.rels'
            if rels_file in file_dict:
                rels_content = file_dict[rels_file]
                rels_tree = ET.fromstring(rels_content)
                for rel in rels_tree.findall('.//rel:Relationship',namespaces):
                    rel_id = rel.get('Id')
                    rel_type = rel.get('Type')
                    rel_target = rel.get('Target')
                    if rel_type == 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject':
                        rels_object_map[rel_id] = rel_target

            # 定义一个list存储string
            latex_list = []
            object_latex_map = {}

            # 遍历文件字典，处理嵌入文件
            for filename, content in file_dict.items():
                # 检查文件是否是嵌入的文件
                if filename.startswith('word/embeddings/') and filename.endswith(('.bin')):
                    # 解析嵌入文件
                    mtef, err = MTEF.OpenBytes(content)
                    if mtef:
                        try:
                            latex_str = mtef.Translate()
                        except Exception as e:
                            print('错误')
                        # 替换嵌入文件为 LaTeX 字符串
                        file_dict[filename] = latex_str.encode('utf-8')
                        latex_list.append(latex_str.encode('utf-8'))
                        filename = filename.replace('word/','')
                        object_latex_map[filename] = latex_str.encode('utf-8')

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
                            findText = object_latex_map.get(findName,'')
                            new_text.text = findText
                            parent.append(new_text)

            # 将修改后的 XML 写回文件字典
            file_dict['word/document.xml'] = etree.tostring(document_tree, encoding='utf-8')

            # 保存修改后的文档
            with zipfile.ZipFile(docx_path, 'w') as docx_out:
                for filename, content in file_dict.items():
                    docx_out.writestr(filename, content)
    except Exception as e:
        print(f"word文档 mathtype提取失败！，错误原因是：{str(e)}")


from lxml import etree

def extract_embedded_files_test(docx_path):
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

        file_name,file_extension = os.path.splitext(docx_path)
        file_dict = {}
        # 首先判断是否为 docx文件
        if file_extension.lower() in ['.docx']:
            target_file_path = file_name + "_原版" + file_extension
            # 存储原始文件，但是只存储一次，便于多次生成
            if not os.path.exists(target_file_path):
                shutil.copy(docx_path, target_file_path)
                # 打开 Word 文档
            other_dict = {}
            with zipfile.ZipFile(docx_path, 'r') as docx:
                # 创建一个字典来存储文件内容
                for info in docx.infolist():
                    if info.filename == 'word/_rels/document.xml.rels':
                        file_dict[info.filename] = docx.read(info)
                    elif info.filename == 'word/document.xml':
                        file_dict[info.filename] = docx.read(info)

                    other_dict[info.filename] = docx.read(info)

            # 获取 bin的id，只要公式的bin
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
                        rels_object_map[rel_id] = 'word/' + rel_target

            document_xml = file_dict['word/document.xml']
            if document_xml:
                document_tree = etree.fromstring(document_xml)
                # 查找 mathtype和oleobject.bin的关系
                for element in document_tree.xpath('.//w:object', namespaces=namespaces):
                    # 检查是否为公式嵌入对象
                    ole_object = element.find('.//o:OLEObject', namespaces=namespaces)
                    if ole_object is not None:
                        # 提取 o:OLEObject 的属性
                        ole_progid = ole_object.get('ProgID')
                        ole_id = ole_object.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                                # 判断获取的属性是否为公式
                        if "Equation.DSMT4" in ole_progid or "Equation" in ole_progid:
                            filename = rels_object_map[ole_id]
                            file_dict[filename] = ''
                file_dict['word/document.xml'] = etree.tostring(document_tree, encoding='utf-8')

            with zipfile.ZipFile(docx_path, 'r') as docx:
                # 创建一个字典来存储文件内容
                for info in docx.infolist():
                    if info.filename in file_dict and info.filename.startswith("word/embeddings/"):
                        file_dict[info.filename] = docx.read(info)

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
                            print(latex_str)
                            # 替换嵌入文件为 LaTeX 字符串
                            # file_dict[filename] = latex_str.encode('utf-8')
                            # latex_list.append(latex_str.encode('utf-8'))
                            # object_latex_map[filename] = latex_str.encode('utf-8')
                            file_dict[filename] = latex_str.encode('utf-8')
                            object_latex_map[filename] = latex_str
                        except Exception as e:
                            print('错误')


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
                    ole_id = ole_object.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                    # 判断获取的属性是否为公式
                    if "Equation.DSMT4" in ole_progid or "Equation" in ole_progid:
                        parent = element.getparent()
                        parent.remove(element)
                        # 插入解析好的 LaTeX 字符串
                        new_text = etree.Element('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')
                        findName = rels_object_map.get(ole_id,'')
                        if findName:
                            findText = object_latex_map.get(findName)
                            # print(findText) #.decode('utf-8')

                            if findText:
                                new_text.text = findText
                                parent.append(new_text)

            # 将修改后的 XML 写回文件字典
            file_dict['word/document.xml'] = etree.tostring(document_tree, encoding='utf-8')

            # 保存修改后的文档
            with zipfile.ZipFile(docx_path, 'w') as docx_out:
                for filename, content in file_dict.items():
                    docx_out.writestr(filename, content)

            with zipfile.ZipFile(docx_path, 'w') as docx_out:
                for filename,content in other_dict.items():
                    docx_out.writestr(filename,content)
    except Exception as e:
        print(f"word文档 mathtype提取失败！，错误原因是：{str(e)}")


def extract_embedded_files_test2(docx_path):
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

        file_name,file_extension = os.path.splitext(docx_path)
        # 首先判断是否为 docx文件
        if file_extension.lower() in ['.docx']:
            target_file_path = file_name + "_原版" + file_extension
            # 存储原始文件，但是只存储一次，便于多次生成
            if not os.path.exists(target_file_path):
                shutil.copy(docx_path, target_file_path)
                # 打开 Word 文档
            with zipfile.ZipFile(docx_path, 'r') as docx:
                # 创建一个字典来存储文件内容
                file_dict = {file_info.filename: docx.read(file_info) for file_info in docx.infolist()}

            rels_object_map = {}
            # '{http://schemas.openxmlformats.org/package/2006/relationships}Relationships'
            rels_file = 'word/_rels/document.xml.rels'
            if rels_file in file_dict:
                rels_content = file_dict[rels_file]
                rels_tree = ET.fromstring(rels_content)
                for rel in rels_tree.findall('.//rel:Relationship',namespaces):
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
                            # 替换嵌入文件为 LaTeX 字符串
                            file_dict[filename] = latex_str.encode('utf-8')
                            filename = filename.replace('word/', '')
                            object_latex_map[filename] = latex_str
                        except Exception as e:
                            print('错误')


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
            with zipfile.ZipFile(docx_path, 'w') as docx_out:
                for filename, content in file_dict.items():
                    docx_out.writestr(filename, content)
    except Exception as e:
        print(f"word文档 mathtype提取失败！，错误原因是：{str(e)}")
# 示例用法
if __name__ == '__main__':
    # test_docx_path = "./resources/测试文档_copy.docx"
        # , './resources'
    # test_docx_path = './resources/（问题 - 副本.docx'
    test_docx_path = './resources/demo.docx'
    # 定义正确的命名空间
    # namespaces = {
    #     'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    #     'o': 'urn:schemas-microsoft-com:office:office',
    #     'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    # }
    #
    # with zipfile.ZipFile(test_docx_path, 'r') as docx:
    #     # 读取 document.xml 文件
    #     document_xml = docx.read('word/document.xml')
    # # 假设 document_xml 是从 docx 文件中读取的 document.xml 内容
    # document_tree = etree.fromstring(document_xml)

    # for element in document_tree.xpath('.//w:object', namespaces=namespaces):
    #     # 检查是否存在 o:OLEObject 子元素
    #     ole_object = element.find('.//o:OLEObject', namespaces=namespaces)
    #     if ole_object is not None:
    #         # 提取 o:OLEObject 的属性
    #         ole_progid = ole_object.get('ProgID')
    #         if "Equation.DSMT4" in ole_progid or "Equation" in ole_progid:
    #             print('找到 o:OLEObject 类型的对象')
    #     else:
    #         print("未找到 o:OLEObject 类型的对象")

    extract_embedded_files(test_docx_path)