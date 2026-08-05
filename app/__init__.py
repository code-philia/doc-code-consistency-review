import os
from flask import g, Flask
from flask_login import LoginManager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE = os.path.join(BASE_DIR, 'doc_code_sql.db')


def create_app():
    app = Flask(__name__, template_folder='../templates', static_folder='../static')
    app.config['SECRET_KEY'] = '0GWEjZKPQXpu3vaviTpLJ9nTohOYD29299Vg_jD1h73tI4ceyBocFiPnFskVvJdCdh8'
    app.config['MAX_CONTENT_LENGTH'] = 1024*1024*1024  # 1GB
    #
    app.config['MAX_FORM_PARTS'] = 2000
    #
    app.config['MAX_FORM_MEMORY_SIZE'] = 10 * 1024 * 1024
    
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'user.login'
    from .user import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.get(int(user_id))

    from .views import bp
    app.register_blueprint(bp)

    from .user import user_bp
    app.register_blueprint(user_bp)

    from .project import project_bp
    app.register_blueprint(project_bp)

    from .task_view import task_bp
    app.register_blueprint(task_bp)

    from .kbs_view import kbs_bp
    app.register_blueprint(kbs_bp)

    from .feedback import feedback_bp
    app.register_blueprint(feedback_bp)

    @app.teardown_appcontext
    def close_db(exception):
        db = g.pop('db', None)
        if db is not None:
            if exception is None:
                db.commit()
            else:
                db.rollback()
            db.close()

    return app
