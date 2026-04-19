from flask import Blueprint, request, jsonify, flash, redirect, url_for, render_template
from flask_login import UserMixin, login_user, login_required, logout_user

from . import get_db

user_bp = Blueprint('user', __name__)


class User(UserMixin):
    def __init__(self, user_id, username, password, ip, name, role):
        self.user_id = user_id
        self.username = username
        self.password = password
        self.ip = ip
        self.name = name
        self.role = role

    def get_id(self):
        """重写get_id方法，返回用户标识符"""
        return str(self.user_id)

    @staticmethod
    def get(user_id):
        """根据用户id从数据库获取用户实例"""
        db = get_db()
        c = db.cursor()
        c.execute(f'select user_id, username, password, ip, name, role from user where user_id={user_id}')
        row = c.fetchone()
        if row:
            return User(row[0], row[1], row[2], row[3], row[4], row[5])
        return None

    @staticmethod
    def get_by_username(username):
        """根据用户名获取用户实例"""
        db = get_db()
        c = db.cursor()
        c.execute(f'select user_id, username, password, ip, name, role from user where username="{username}"')
        row = c.fetchone()
        print('row', row)
        if row:
            return User(row[0], row[1], row[2], row[3], row[4], row[5])
        return None

    @staticmethod
    def get_by_ip(ip):
        """根据用户ip获取用户实例"""
        db = get_db()
        c = db.cursor()
        c.execute(f'select user_id, username, password, ip, name, role from user where ip="{ip}"')
        row = c.fetchone()
        print('row', row)
        if row:
            return User(row[0], row[1], row[2], row[3], row[4], row[5])
        return None


@user_bp.route('/login')
def login():
    """Render the login page"""
    return render_template('login.html')


# 用户密码登录
@user_bp.route('/login/password', methods=['POST'])
def login_password():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.get_by_username(username)

    if user and user.password == password:
        login_user(user)
        next_page = request.args.get('next')
        redirect_url = redirect(next_page) if next_page else url_for('main.welcome')
        print({"success": True, "message": "登录成功", "redirect_url": redirect_url})
        return jsonify({"success": True, "message": "登录成功", "redirect_url": redirect_url})

    else:
        return jsonify({"success": False, "message": "用户名或密码错误"})


# ip登录
@user_bp.route('/login/ip', methods=['POST'])
def login_ip():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr).split(',')[0].strip()
    print('ip:', ip)

    user = User.get_by_ip(ip)

    if user:
        login_user(user)
        return jsonify({"success": True, "message": "IP 登录成功", "redirect_url": url_for("main.welcome")})
    else:
        return jsonify({"success": False, "message": "IP 未授权，请联系管理员"})


@user_bp.route('/logout')
@login_required
def logout():
    """用户登出"""
    logout_user()
    flash('已退出登录', 'success')
    return redirect(url_for('user.login'))


@user_bp.route('/add/<int:x>/<int:y>')
def add_task(x, y):
    from tasks import add
    result = add.delay(x, y)
    return jsonify({"success": True, "task_id": result.id})


@user_bp.route("/result/<task_id>")
def task_result(task_id):
    from tasks import celery
    from celery.result import AsyncResult
    task = AsyncResult(task_id, app=celery)
    return jsonify({"status": task.state, "result": task.result if task.ready() else None})
