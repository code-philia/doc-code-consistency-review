import pymysql
from flask import g
from pymysql.cursors import DictCursor


DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '123456',
    'database': 'doc_code',
    'charset': 'utf8mb4',
    'cursorclass': DictCursor,
    'autocommit': False
}


def create_connection():
    """直接创建一个新的MYSQL连接"""
    return pymysql.connect(**DB_CONFIG)


def get_db():
    """HTTP请求内使用， 复用连接"""
    if 'db' not in g:
        g.db = create_connection()
    return g.db


def get_db_celery():
    """celery 任务里使用， 用完自己关"""
    return create_connection()
