from flask import Flask, json, render_template, request, jsonify
import socket
from utils import parse_markdown, split_code
from agent import query_related_code, query_review_result
import random
import string

app = Flask(__name__)

@app.route('/')
def index():
    """渲染包含Vue的页面"""
    return render_template('index.html')

@app.route('/api/parse-requirement', methods=['POST'])
def parse_requirement():
    data = request.json
    requirements = data.get('requirements', '')
    
    # 解析需求文档成为需求点列表
    requirement_point_list = parse_markdown(requirements)
    
    for point in requirement_point_list:
        point["associated_code"] = []

    return jsonify({"requirementPoints": requirement_point_list})

@app.route('/api/auto-align', methods=['POST'])
def auto_align():
    data = request.json
    requirements = data.get('requirements', '')
    code_files = data.get('codeFiles', [])
    
    # 解析需求文档成为需求点列表
    requirement_point_list = parse_markdown(requirements)
    
    # 解析代码文件
    code_blocks = []
    for file in code_files:
        code_block = split_code(file['name'], file['content'])
        code_blocks.extend(code_block)

    for point in requirement_point_list:
        related_code = query_related_code(point, code_blocks)
        point["associated_code"] = related_code # [{"filename":, "content":, "start_line":, "end_line":}]
        
    return jsonify({"requirementPoints": requirement_point_list})

@app.route('/api/align-single-requirement', methods=['POST'])
def align_single_requirement():
    data = request.json
    requirement = data.get('requirement')
    code_files = data.get('codeFiles', [])
    
    requirement_point_list = [requirement]
    
    # 解析代码文件
    code_blocks = []
    for file in code_files:
        code_block = split_code(file['name'], file['content'])
        code_blocks.extend(code_block)

    # for point in requirement_point_list:
    #     def generate_random_string(length=10):
    #         return ''.join(random.choices(string.ascii_letters + string.digits, k=length))
    #     random_string = generate_random_string()
        
    #     point["associated_code"] = [{"filename": "mock.cpp", "content": random_string, "start_line": 1, "end_line": 5}]

    for point in requirement_point_list:
        related_code = query_related_code(point, code_blocks)
        point["associated_code"] = related_code # [{"filename":, "content":, "start_line":, "end_line":}]
        
    return jsonify({"requirementPoint": requirement_point_list[0]})

@app.route('/api/import-alignment', methods=['POST'])
def import_alignment():
    """临时接口：导入对齐"""
    return jsonify({"message": "导入对齐已完成"})

@app.route('/api/export-alignment', methods=['POST'])
def export_alignment():
    """临时接口：导出对齐"""
    return jsonify({"message": "导出对齐已完成"})


@app.route('/api/review-single-requirement', methods=['POST'])
def review_single_requirement():
    data = request.json
    requirement_point = data.get('requirement')
    
    requirement_point_reviewed = query_review_result(requirement_point)
    
    return jsonify({"requirementPoint": requirement_point_reviewed})


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
