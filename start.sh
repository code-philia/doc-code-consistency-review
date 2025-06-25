# 使用 LlamaFactory CLI 启动 API 服务，指定模型和模板
CUDA_VISIBLE_DEVICES=0,2,3 API_PORT=8000 llamafactory-cli api \
    --model_name_or_path /home/kwy/project/models/deepseek-coder-6.7b-instruct \
    --template deepseek \
    --finetuning_type lora