# 配置日志
import logging
import os
log_dir = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(log_dir, exist_ok=True)

log_file = os.path.join(log_dir, "test_lsh.log")
file_handler = logging.FileHandler(log_file, encoding="utf-8", mode="a")
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)

logger = logging.getLogger(__name__)
logger.propagate = False
logger.addHandler(file_handler)
logger.setLevel(logging.INFO)


def set_log(info_data):
    logger.info(info_data)


if __name__ == '__main__':
    set_log("test")