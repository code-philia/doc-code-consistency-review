import os
import sqlite3

from flask import g, Flask
from flask_login import LoginManager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE = os.path.join(BASE_DIR, 'doc_code_sql.db')


def get_db():
    """获取当前请求的数据库连接，若不存在则创建"""
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(e=None):
    """关闭数据库连接(如果存在)"""
    db = g.pop('db', None)
    if db is not None:
        db.commit()
        db.close()


def create_app():
    app = Flask(__name__, template_folder='../templates', static_folder='../static')
    app.config['SECRET_KEY'] = '0GWEjZKPQXpu3vaviTpLJ9nTohOYD29299Vg_jD1h73tI4ceyBocFiPnFskVvJdCdh8'

    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'user.login'
    from .user import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.get(int(user_id))

    # 注册关闭数据库连接的函数，在应用上下文销毁时调用
    app.teardown_appcontext(close_db)

    from .views import bp
    app.register_blueprint(bp)

    from .user import user_bp
    app.register_blueprint(user_bp)

    from .project import project_bp
    app.register_blueprint(project_bp)
    return app
