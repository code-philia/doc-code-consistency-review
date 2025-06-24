import os
from openai import OpenAI
from transformers.utils.versions import require_version

require_version("openai>=1.5.0", "To fix: pip install openai>=1.5.0")

if __name__ == '__main__':
    # change to your custom port
    port = 8000
    client = OpenAI(
        api_key="0",
        base_url="http://localhost:{}/v1".format(os.environ.get("API_PORT", 8000)),
    )
    messages = []
    messages.append({"role": "user", "content": "hello, where is USA"})
    result = client.chat.completions.create(messages=messages, model="deepseek-coder-6.7b-instruct")
    print(result.choices[0].message)
    
# from langchain_openai import ChatOpenAI
# client = ChatOpenAI(
#     model="deepseek-coder-6.7b-instruct", 
#     api_key="{}".format(os.environ.get("API_KEY", "0")),
#     base_url="http://localhost:{}/v1".format(os.environ.get("API_PORT", 8000)),
# )

# res = client.invoke("你是谁？用一句话简单回答，不要包含后续的对话。")
# print(res.content)