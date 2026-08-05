from waitress import serve
from app import create_app
import os


print(f"[ENV] WORD_CONVERT_API = {os.getenv('WORD_CONVERT_API', '未设置')}")

app = create_app()


if __name__ == '__main__':
    serve(app, host='0.0.0.0', port=5000, threads=10)
