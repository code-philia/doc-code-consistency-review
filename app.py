from flask import Flask, render_template, request, jsonify
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
    # print("Received Requirements:", requirements)
    # print("Received Code Files:")
    # for file in code_files:
    #     print(f"File Name: {file['name']}, Content: {file['content']}")
    
    requirement_point_list = parse_markdown(requirements)
    for point in requirement_point_list:
        print(f"Requirement Point: {point['id']}, Content: {point['content']}, Context: {point['context']}")
    
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
