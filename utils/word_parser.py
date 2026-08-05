import os
import shutil
import subprocess
import tempfile
from io import BytesIO

import requests
from werkzeug.datastructures import FileStorage


class DocConverter:
    """
    跨平台 .doc 转 .docx 转换器
    - Windows: 调用本地 LibreOffice (soffice)
    - Linux: 调用远程 Ubuntu 转换接口
    """

    def __init__(self, remote_api=None):
        """
        remote_api: 远程转换接口地址
        """
        self.system = os.name  # 'nt'=Windows 'posix'=Linux
        self.remote_api = remote_api or os.getenv("WORD_CONVERT_API", "")

    def convert(self, doc_path, output_dir=None):
        """
        将 .doc 转换为 .docx
        : param doc_path: 输入的 .doc 文件路径
        : param output_dir: 输出目录, 默认与输入文件同目录
        : return: 转换后的 .docx 绝对路径
        """
        ext = os.path.splitext(doc_path)[1].lower()
        if ext != '.doc':
            raise ValueError(f'只支持 .doc 格式, 当前: {ext}')

        if self.system == "nt":
            return self._convert_local(doc_path, output_dir)
        else:  # Linux
            return self._convert_remote(doc_path, output_dir)

    @staticmethod
    def _convert_local(doc_path, output_dir):
        """Windows 本地 LibreOffice 转换"""
        doc_path = os.path.abspath(doc_path)
        output_dir = output_dir or os.path.dirname(doc_path)

        cmd = ["soffice", "--headless", "--convert-to", "docx", "--outdir", output_dir, doc_path]
        subprocess.run(cmd, check=True, capture_output=True)

        return os.path.join(output_dir, os.path.basename(doc_path).replace(".doc", ".docx"))

    def _convert_remote(self, doc_path, output_dir):
        """Linux 调用远程 Ubuntu 接口转换"""
        # print(self.remote_api)
        if not self.remote_api:
            raise RuntimeError("Linux 环境需要配置 WORD_CONVERT_API 环境变量")

        doc_path = os.path.abspath(doc_path)
        output_dir = output_dir or os.path.dirname(doc_path)

        with open(doc_path, "rb") as f:
            files = {"file": (os.path.basename(doc_path), f, "application/msword")}
            resp = requests.post(self.remote_api, files=files, timeout=600)

        if resp.status_code != 200:
            raise RuntimeError(f"远程转换失败: {resp.status_code} - {resp.text}")

        docx_name = os.path.basename(doc_path).replace(".doc", ".docx")
        output_path = os.path.join(output_dir, docx_name)

        with open(output_path, "wb") as f:
            f.write(resp.content)

        return output_path


def preprocess_files(files, converter=None):
    """
    预处理上传文件: 把.doc 转成 .docx, 其他格式保持不变

    :param files: FileStorage 列表(request.files.getlist('files')) 或单个 FileStorage
    :param converter: DocConverter实例 (可选，默认新建)
    :return: 处理后的 FileStorage 列表
    """
    if not isinstance(files, list):
        files = [files]  # 单个文件也转成列表

    converter = converter or DocConverter()
    result = []

    for f in files:
        # 提取纯文件名，去掉前端传来的路径
        original_name = os.path.basename(f.filename)
        ext = os.path.splitext(original_name)[1].lower()

        if ext == '.doc':
            tmp_dir = tempfile.mkdtemp()
            try:
                # 保存原始 doc
                doc_path = os.path.join(tmp_dir, original_name)
                f.save(doc_path)

                # 转换
                docx_path = converter.convert(doc_path, output_dir=tmp_dir)

                # 读入内存，包装成 FileStorage
                with open(docx_path, 'rb') as docx_f:
                    stream = BytesIO(docx_f.read())

                result.append(FileStorage(
                    stream=stream,
                    filename=os.path.basename(docx_path),
                    content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                ))
            finally:
                # 立即清理临时目录
                shutil.rmtree(tmp_dir, ignore_errors=True)

        else:
            # .docx 或其他格式原样保留
            result.append(FileStorage(
                stream=f.stream,
                filename=original_name,
                content_type=f.content_type
            ))

    return result


if __name__ == '__main__':
    dc = DocConverter()

    # Windows 开发: 自动走本地 soffice
    # docx_path = converter.convert(r"C:\Users\Administrator\Desktop\sun\外设编程手册-更新（公开）.doc")
    # print(docx_path)

    # Linux 生产: 先设置环境变量 export WORD_CONVERT_API=""
    # converter = DocConverter(remote_api="http://10.123.0.230:5009/convert")
    dp = dc.convert("/data03/doc-code-consistency-review-v3.0/utils/test.doc")
