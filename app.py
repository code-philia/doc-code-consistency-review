from flask import Flask, json, render_template, request, jsonify
import os
from openai import OpenAI
import socket
from utils import *

app = Flask(__name__)

@app.route('/')
def index():
    """渲染包含Vue的页面"""
    return render_template('index.html')

@app.route('/api/auto-align', methods=['POST'])
def auto_align():
    """临时接口：自动对齐"""
    data = request.json
    requirements = data.get('requirements', '')
    code_files = data.get('codeFiles', [])
    
    # 解析需求文档成为需求点列表
    requirement_point_list = parse_markdown(requirements)
    
    # 解析代码文件
    code_blocks = []
    for file in code_files:
        code_block = parse_code(file['name'], file['content'])
        print(f"Parsed {len(code_block)} code blocks from {file['name']}")
        print(f"Code blocks: {code_block}")
        code_blocks.extend(code_block)

    with open('code_blocks.json', 'w', encoding='utf-8') as f:
        json.dump(code_blocks, f, ensure_ascii=False, indent=4)

    return jsonify({"requirementPoints": requirement_point_list})

@app.route('/api/import-alignment', methods=['POST'])
def import_alignment():
    """临时接口：导入对齐"""
    return jsonify({"message": "导入对齐已完成"})

@app.route('/api/export-alignment', methods=['POST'])
def export_alignment():
    """临时接口：导出对齐"""
    return jsonify({"message": "导出对齐已完成"})


def find_available_port(start_port):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('0.0.0.0', port)) != 0:
                return port
            port += 1

if __name__ == '__main__':
    start_port = 5055
    available_port = find_available_port(start_port)
    app.run(host='0.0.0.0', port=available_port, debug=True)
