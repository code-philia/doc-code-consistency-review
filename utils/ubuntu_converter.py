from flask import Flask, request, send_file
import subprocess
import os
import tempfile
import logging

# 日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route("/convert", methods=["POST"])
def convert():
    logger.info("开始---------------")
    if "file" not in request.files:
        # logger.info("no file---------------")
        return {"error": "no file"}, 400
    # logger.info("0---------------")
    file = request.files["file"]
    ext = os.path.splitext(file.filename)[1].lower()
    # logger.info("1---------------")
    if ext not in [".doc", ".docx"]:
        return {"error": "only doc/docx"}, 400 
    
    tmp_dir = tempfile.mkdtemp()
    # logger.info("2---------------")
    input_path = os.path.join(tmp_dir, file.filename)
    file.save(input_path)
    # logger.info("3---------------")
    
    # LibreOffice 转换
    output_name = os.path.splitext(file.filename)[0] + ".docx"
    output_path = os.path.join(tmp_dir, output_name)
    try:
        # logger.info("try--------------")
        subprocess.run(["soffice", "--headless", "--convert-to", "docx", "--outdir", tmp_dir, input_path], check=True, capture_output=True, timeout=600)
        
        if not os.path.exists(output_path):
            logger.info("soffice 执行成功但文件未生成")
            return jsonify({"error": "soffice 执行成功但文件未生成"})
    
        logger.info(f"output_path:{output_path}")
        return send_file(output_path, as_attachment=True, download_name=output_name)
    except subprocess.CalledProcessError as e:
        logger.error(f"报错:{str(e)}")
        error_msg = e.stderr.decode("utf-8", errors="ignore") if e.stderr else "未知错误"
        return jsonify({
            "error": "soffice 转换失败",
            "returncode": e.returncode,
            "detail": error_msg
        }), 500
    except Exception as e:
        logger.error(f"报错:{str(e)}")
        return jsonify({"error": str(e)}), 500
    

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5009)