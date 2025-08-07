import os
import time
from flask import Flask, json, render_template, request, jsonify
import socket
from utils import parse_markdown, split_code, count_lines_of_code
from agent import query_generated_requirement, query_related_code, query_review_result
import random
import string
from datetime import datetime, timedelta

# 定义全局历史文件路径
HISTORY_FILE = 'history.json'
MAX_HISTORY_ITEMS = 15 # 最多记录15条历史

app = Flask(__name__)

# templates
@app.route('/')
def index():
    """Render the welcome page"""
    return render_template('welcome.html')

@app.route('/welcome')
def welcome():
    """Render the welcome page"""
    return render_template('welcome.html')

@app.route('/semi-automatic')
def semi_automatic():
    """Render the semi-automatic mode page"""
    return render_template('semi-automatic.html')

@app.route('/project')
def project():
    """Render the project page"""
    return render_template('project.html')

# project
@app.route('/project/create', methods=['POST'])
def create_project():
    data = request.json
    creation_type = data.get('creationType', 'blank')
    project_name = data.get('projectName')
    project_location = data.get('projectLocation')

    if not project_name or not project_location:
        return jsonify({"status": "error", "message": "项目名称和路径不能为空。"}), 400

    if creation_type == 'blank':
        return create_blank_project(project_name, project_location)
    elif creation_type == 'folder':
        return create_project_from_folder(project_name, project_location)
    else:
        return jsonify({"status": "error", "message": "无效的创建类型。"}), 400

def create_blank_project(project_name, project_location):
    """处理创建空白项目的逻辑"""
    project_path = os.path.join(project_location, project_name)
    if os.path.exists(project_path):
        return jsonify({"status": "error", "message": f"项目文件夹 '{project_name}' 已存在于目标位置。"}), 400

    try:
        code_repo_path = os.path.join(project_path, 'code_repo')
        doc_repo_path = os.path.join(project_path, 'doc_repo')
        os.makedirs(code_repo_path, exist_ok=True)
        os.makedirs(doc_repo_path, exist_ok=True)

        metadata = {
            "project_name": project_name,
            "project_location": project_location,
            "create_time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
            "code_repo": code_repo_path,
            "doc_repo": doc_repo_path,
            "code_files": [],
            "doc_files": [],
            "code_scale": 0,
        }
        
        metadata_file = os.path.join(project_path, 'metadata.json')
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=4, ensure_ascii=False)
        
        update_history(project_name, project_path)
        
        return jsonify({"status": "success", "project_path": project_path}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": f"创建目录或文件时出错: {e}"}), 500


def create_project_from_folder(project_name, folder_path):
    """处理从现有文件夹创建项目的逻辑"""
    project_path = folder_path # 项目路径就是用户选择的文件夹
    if not os.path.isdir(project_path):
        return jsonify({"status": "error", "message": "提供的路径不是一个有效的文件夹。"}), 400

    code_repo_path = os.path.join(project_path, 'code_repo')
    doc_repo_path = os.path.join(project_path, 'doc_repo')

    if not os.path.isdir(code_repo_path) or not os.path.isdir(doc_repo_path):
        return jsonify({"status": "error", "message": "文件夹结构不符合要求，必须包含 'code_repo' 和 'doc_repo' 子目录。"}), 400

    if os.path.exists(os.path.join(project_path, 'metadata.json')):
        return jsonify({"status": "error", "message": "该文件夹已包含 'metadata.json'，似乎已是一个项目。"}), 400

    try:
        # 统计元数据
        code_files = [f for f in os.listdir(code_repo_path) if os.path.isfile(os.path.join(code_repo_path, f))]
        doc_files = [f for f in os.listdir(doc_repo_path) if os.path.isfile(os.path.join(doc_repo_path, f))]
        
        total_loc = 0
        for file in code_files:
            total_loc += count_lines_of_code(os.path.join(code_repo_path, file))

        metadata = {
            "project_name": project_name,
            "project_location": os.path.dirname(project_path), # 存储其父目录
            "create_time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
            "code_repo": code_repo_path,
            "doc_repo": doc_repo_path,
            "code_files": code_files,
            "doc_files": doc_files,
            "code_scale": total_loc,
        }
        
        metadata_file = os.path.join(project_path, 'metadata.json')
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=4, ensure_ascii=False)

        update_history(project_name, project_path)
        
        return jsonify({"status": "success", "project_path": project_path}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": f"扫描文件夹或生成元数据时出错: {e}"}), 500
    

def update_history(project_name, project_path):
    """读取、更新并写回项目历史记录"""
    history = []
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            try:
                history = json.load(f)
            except json.JSONDecodeError:
                history = [] # 如果文件内容损坏，则重置

    # 检查项目是否已在历史中，如果在则移除旧条目
    history = [item for item in history if item.get('path') != project_path]

    # 添加新条目到列表顶部
    new_entry = {
        "name": project_name,
        "path": project_path,
        "last_opened": datetime.now().isoformat() # 使用ISO 8601格式的时间戳
    }
    history.insert(0, new_entry)

    # 限制历史记录的长度
    history = history[:MAX_HISTORY_ITEMS]

    # 写回文件
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=4, ensure_ascii=False)


@app.route('/project/history', methods=['GET'])
def get_project_history():
    """获取最近打开的项目列表"""
    if not os.path.exists(HISTORY_FILE):
        return jsonify([])
    
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        try:
            history = json.load(f)
            return jsonify(history)
        except json.JSONDecodeError:
            return jsonify([])

@app.route('/project/open', methods=['POST'])
def open_project():
    """当用户打开一个项目时，更新其历史记录"""
    data = request.json
    project_name = data.get('name')
    project_path = data.get('path')
    if not project_name or not project_path:
        return jsonify({"status": "error", "message": "项目信息不完整"}), 400
    
    # 可以在此添加校验，确保项目路径真实存在
    if not os.path.exists(project_path):
         return jsonify({"status": "error", "message": "项目路径不存在，可能已被移动或删除"}), 404

    update_history(project_name, project_path)
    return jsonify({"status": "success"})


# alignment and review
@app.route('/api/query-related-code', methods=['POST'])
def query_related_code_endpoint():
    data = request.json
    requirement = data.get('requirement', '')
    code_files = data.get('codeFiles', [])

    related_code = query_related_code(requirement, code_files, split_code=True)
    # related_code = [{'filename': 'acme.c', 'content': 'int main() { return 0; }', 'start': 1, 'end': 5},
    #                 {'filename': 'acme.c', 'content': 'int main() { return 0; }', 'start': 10, 'end': 15},
    #                 {'filename': 'acme.c', 'content': 'int main() { return 0; }', 'start': 90, 'end': 95}]
    # related_code.append({"filename": "apputils.c", "content": "int main() { return 0; }", "start": 6, "end": 10})
    return jsonify({"relatedCode": related_code})


@app.route('/api/review-consistency',  methods=['POST'])
def review_consistency_endpoint():
    data = request.json
    requirement = data.get('requirement')
    related_code = data.get('relatedCode', [])
    
    review_process, issues = query_review_result(requirement, related_code)
    # review_process = "This is a mock review process. The code implementation matches the requirement."
    # issues = "This is a mock issue list. No issues found."
    
    return jsonify({"reviewProcess":review_process, "issues": issues})


@app.route('/api/generate-requirement', methods=['POST'])
def generate_requirement_endpoint():
    data = request.json
    related_code = data.get('relatedCode', [])
    
    generate_requirement = query_generated_requirement(related_code)
    # generate_requirement = "This is a mock generated requirement based on the provided code blocks."
    
    return jsonify({"generatedRequirement":generate_requirement})


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


@app.route('/api/review', methods=['POST'])
def review_single_requirement():
    data = request.json
    requirement_point = data.get('requirement')
    print("Received requirement point for review:", requirement_point)
    
    # requirement_point_reviewed = query_review_result(requirement_point)
    
    return jsonify({"result": 0})


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
