"""
@Description: 向大模型请求数据
@Author:cf
@Date:2025-09-10
"""
import os
import re
import json
import dashscope
from dashscope import Generation
from http import HTTPStatus
# 相似化度量相关的函数
# from rank_bm25 import BM25Okapi
# import jieba
# from sklearn.metrics.pairwise import cosine_similarity
# import numpy as np
import requests
# from openai import OpenAI
# import ollama
# api
# dashscope.api_key = "sk-1af6203059f042888ff734fcc5884f67"
from openai import OpenAI


class RequestLLM:
    def __init__(self, request_type):
        self.request_type = request_type
        self.api_key = "EMPTY"
        self.default_model = "deepseek-r1:14b"
        self.url_generate = "http://192.168.0.223:11434/v1"
        self.url_embedding = "http://192.168.0.223:11434/api/embeddings"

    # # 分词
    # def tokenize(self, text):
    #     return list(jieba.cut(text))

    # # 向量化
    # EMBEDDING_MODEL_URL = "http://192.168.0.226:7010/v1/embeddings"
    #
    # def get_embedding(self, text):
    #
    #     payload = {
    #         "model": "nomic-embed-text:latest",
    #         "prompt": text
    #     }
    #     try:
    #         # resp = requests.post(self.url_embedding, json=payload, timeout=30)
    #         # resp.raise_for_status()
    #         client = ollama.Client(host='http://192.168.0.1:11434')
    #         result = client.embed(
    #             model='nomic-embed-text:latest',
    #             input=text
    #         )
    #         if result.embeddings:
    #             return np.array(result.embeddings)
    #         return np.array([])
    #
    #     except Exception as e:
    #         print("[ollama] error :", e)
    #         return np.array([])

    # # 通过向量相似度矩阵，获取历史相关的信息
    # def request_history_desc_by_similarity(self, code_desc, result):
    #     # 具体的 数据表格的名称还需同数据库统一
    #     # 例如表示激励需求字段的 request
    #     # 激励代码字段的 code
    #     try:
    #         if not code_desc or not result:
    #             return "", ""
    #
    #         tokenize_document = []
    #         valid_docs = []
    #
    #         for idx, info in enumerate(result):
    #             code_func = info.get("codeFunction", "").strip()
    #             if code_func:
    #                 tokenize_doc = self.tokenize(code_func)
    #                 if tokenize_doc:
    #                     tokenize_document.append(tokenize_doc)
    #                     valid_docs.append(idx)
    #
    #         if not tokenize_document:
    #             return "", ""
    #
    #         try:
    #             tokenize_query = self.tokenize(code_desc)
    #             if not tokenize_query:
    #                 return "", ""
    #             bm25 = BM25Okapi(tokenize_document)
    #             bm25_scores = bm25.get_scores(tokenize_query)
    #         except Exception as e:
    #             return "", ""
    #
    #         query_embedding = self.get_embedding(code_desc)
    #         if not isinstance(query_embedding, np.ndarray) or query_embedding.size == 0:
    #             print("查询嵌入向量获取失败或无效，仅使用BM25评分")
    #             # 仅使用BM25分数
    #             most_relevant_doc_index = bm25_scores.argmax()
    #             if len(valid_docs) > most_relevant_doc_index:
    #                 fit_key = result[valid_docs[most_relevant_doc_index]]
    #                 return fit_key.get("codeFunction", ""), fit_key.get("apiCode", "")
    #             return "", ""
    #
    #             # 确保query_embedding有正确的shape属性
    #         if not hasattr(query_embedding, 'shape') or len(query_embedding.shape) == 0:
    #             print("查询嵌入向量格式不正确，仅使用BM25评分")
    #             most_relevant_doc_index = bm25_scores.argmax()
    #             if len(valid_docs) > most_relevant_doc_index:
    #                 fit_key = result[valid_docs[most_relevant_doc_index]]
    #                 return fit_key.get("codeFunction", ""), fit_key.get("apiCode", "")
    #             return "", ""
    #
    #         document_embeddings = []
    #         valid_embeddings_indices = []
    #         for idx in valid_docs:
    #             info = result[idx]
    #             doc_embedding = self.get_embedding(info.get("codeFunction", ""))
    #             if isinstance(doc_embedding, np.ndarray) and doc_embedding.size > 0:
    #                 document_embeddings.append(doc_embedding)
    #                 valid_embeddings_indices.append(idx)
    #
    #         if len(document_embeddings) == 0:
    #             print("文档嵌入向量获取失败，仅使用BM25评分")
    #             most_relevant_doc_index = bm25_scores.argmax()
    #             if len(valid_docs) > most_relevant_doc_index:
    #                 fit_key = result[valid_docs[most_relevant_doc_index]]
    #                 return fit_key.get("codeFunction", ""), fit_key.get("apiCode", "")
    #             return "", ""
    #
    #         embedding_dim = query_embedding.shape[0]
    #         filtered_document_embeddings = []
    #         filtered_indices = []
    #
    #         for i, emb in enumerate(document_embeddings):
    #             if hasattr(emb, 'shape') and len(emb.shape) > 0 and emb.shape[0] == embedding_dim:
    #                 filtered_document_embeddings.append(emb)
    #                 filtered_indices.append(valid_embeddings_indices[i])
    #
    #         if len(filtered_document_embeddings) == 0:
    #             print("向量维度不匹配，仅使用BM25评分")
    #             most_relevant_doc_index = bm25_scores.argmax()
    #             if len(valid_docs) > most_relevant_doc_index:
    #                 fit_key = result[valid_docs[most_relevant_doc_index]]
    #                 return fit_key.get("codeFunction", ""), fit_key.get("apiCode", "")
    #             return "", ""
    #
    #         try:
    #             vector_scores = cosine_similarity([query_embedding], filtered_document_embeddings)[0]
    #
    #             # 归一化分数
    #             bm25_scores_normalized = (bm25_scores - np.min(bm25_scores)) / (
    #                     np.max(bm25_scores) - np.min(bm25_scores) + 1e-8)
    #             vector_scores_normalized = (vector_scores - np.min(vector_scores)) / (
    #                     np.max(vector_scores) - np.min(vector_scores) + 1e-8)
    #
    #             # 合并分数
    #             alpha = 0.5
    #             combined_scores = np.zeros_like(bm25_scores)
    #
    #             for i, idx in enumerate(filtered_indices):
    #                 combined_scores[idx] = alpha * bm25_scores_normalized[idx] + (1 - alpha) * \
    #                                        vector_scores_normalized[i]
    #
    #             # 对于没有嵌入向量的文档，只使用BM25分数
    #             for i in range(len(bm25_scores)):
    #                 if i not in filtered_indices:
    #                     combined_scores[i] = bm25_scores_normalized[i]
    #
    #             most_relevant_doc_index = combined_scores.argmax()
    #             if len(result) > most_relevant_doc_index:
    #                 fit_key = result[most_relevant_doc_index]
    #                 return fit_key.get("codeFunction", ""), fit_key.get("apiCode", "")
    #
    #         except Exception as e:
    #             print(f"相似度计算失败: {e}，仅使用BM25评分")
    #             most_relevant_doc_index = bm25_scores.argmax()
    #             if len(valid_docs) > most_relevant_doc_index:
    #                 fit_key = result[valid_docs[most_relevant_doc_index]]
    #                 return fit_key.get("codeFunction", ""), fit_key.get("apiCode", "")
    #
    #         return "", ""
    #     except Exception as e:
    #         print(str(e))
    #         return "", ""

    # 调用大模型，获取大模型输出内容
    def request_llm_output(self, messages):
        responses = Generation.call(
            model=Generation.Models.qwen_turbo,
            messages=messages,
            result_format='message',
            stream=True,
            incremental_output=True
        )
        full_content = ''
        # 采取流式输出
        for response in responses:
            if response.status_code == HTTPStatus.OK:
                full_content += response.output.choices[0]['message']['content']
            else:
                print('Request id: %s, Status code: %s, error code: %s, error message: %s' % (
                    response.request_id, response.status_code,
                    response.code, response.message
                ))
        return {"content": full_content}

    # 调用本地大模型
    def request_qwen_14b_llm_output(self, messages):
        try:
            client = OpenAI(base_url=self.url_generate, api_key= self.api_key)
            chat_completion = client.chat.completions.create(
                messages=messages,
                model=self.default_model,
                temperature=0,
                top_p=0.95,
                max_tokens=6000,
            )

            # print("################")
            if chat_completion and chat_completion.choices[0].message.content:
                data = chat_completion.choices[0].message.content.split('</think>')[1]
                return data
            return ""
        except requests.exceptions.RequestException as e:
            print('[ollama异常]', str(e))
            return {"content": ""}
        return ""


if __name__ == '__main__':
    req = RequestLLM('')
    messages = [
        {'role': 'user', 'content': '天空为什么是蓝色'}
    ]
    res = req.request_qwen_14b_llm_output(messages)

    print(res)