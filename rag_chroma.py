import os
import json
import chromadb
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel
from typing import List, Dict, Any

# === 配置部分 ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 本地模型路径
LOCAL_MODEL_REL_PATH = os.path.join("models", "m3e-base")
LOCAL_MODEL_ABS_PATH = os.path.join(BASE_DIR, LOCAL_MODEL_REL_PATH)

COLLECTION_NAME = "rag_pairs"

class LocalM3EFunction(chromadb.EmbeddingFunction):
    """
    Embedding 函数保持不变
    """
    def __init__(self, model_path):
        print(f"[RAG] 正在加载本地模型 (Transformers 原生版): {model_path} ...")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"未找到模型文件夹: {model_path}")

        self.tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
        self.model = AutoModel.from_pretrained(model_path, trust_remote_code=True)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[RAG] 运行设备: {self.device}")
        
        self.model.to(self.device)
        self.model.eval()

    def _mean_pooling(self, model_output, attention_mask):
        token_embeddings = model_output[0] 
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        return sum_embeddings / sum_mask

    def __call__(self, input: List[str]) -> List[List[float]]:
        if not input: return []
        encoded_input = self.tokenizer(input, padding=True, truncation=True, max_length=512, return_tensors='pt')
        encoded_input = {k: v.to(self.device) for k, v in encoded_input.items()}
        with torch.no_grad():
            model_output = self.model(**encoded_input)
        sentence_embeddings = self._mean_pooling(model_output, encoded_input['attention_mask'])
        sentence_embeddings = F.normalize(sentence_embeddings, p=2, dim=1)
        return sentence_embeddings.cpu().tolist()

class RAGEngine:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RAGEngine, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        # 只初始化模型，不初始化 client，因为还不知道项目路径在哪
        if not hasattr(self, 'emb_fn'):
            self.emb_fn = LocalM3EFunction(LOCAL_MODEL_ABS_PATH)
        
        self.client = None
        self.collection = None

    # 【核心修改】必须传入 project_path
    def initialize(self, project_path: str, db_name="default_rag"):
        if not project_path:
            raise ValueError("[RAG] 初始化失败：未提供 project_path")

        print(f"[RAG] 正在初始化知识库: {db_name} (项目: {project_path})")
        
        # 1. 动态构建路径：放在项目根目录下的 rag_database 文件夹里
        # 结构: /Users/.../MyProject/rag_database/default_rag
        project_kb_root = os.path.join(project_path, "rag_database")
        current_db_path = os.path.join(project_kb_root, db_name)
        
        abs_path = os.path.abspath(current_db_path)
        print(f"[DEBUG] 数据库存储路径: {abs_path}")

        # 2. 确保目录存在
        if not os.path.exists(current_db_path):
            os.makedirs(current_db_path)
        
        # 3. 初始化 Client
        self.client = chromadb.PersistentClient(path=current_db_path)
        
        # 4. 获取 Collection
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self.emb_fn,
            metadata={"hnsw:space": "cosine"}
        )
        print(f"[RAG] 知识库 '{db_name}' 加载完成。")


    def _doc_id_to_content(self, doc_files: List[Dict[str, Any]]) -> Dict[str, str]:
        m: Dict[str, str] = {}
        for d in doc_files:
            m[d["id"]] = d.get("content", "")
        return m

    def _code_id_to_content(self, code_files: List[Dict[str, Any]]) -> Dict[str, str]:
        m: Dict[str, str] = {}
        for c in code_files:
            m[c["id"]] = c.get("content", "")
        return m

    def build_from_json(self, json_path: str):
        print(f"[RAG] 正在解析并构建索引: {json_path}")
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                js = json.load(f)
        except Exception as e:
            return {"status": "error", "message": f"读取标注文件失败: {str(e)}"}

        ids = []
        documents = []  # 这里存 query_text (文档部分) 用于搜索匹配
        metadatas = []  # 这里存 code_text (代码部分) 和其他信息

        annotations = js.get("annotations", [])
        doc_files = js.get("docFiles", [])
        code_files = js.get("codeFiles", [])

        doc_map = self._doc_id_to_content(doc_files)
        code_map = self._code_id_to_content(code_files)

        count = 0

        # === 逻辑复刻开始 ===
        if annotations:
            for ann_idx, ann in enumerate(annotations):
                if not isinstance(ann, dict): continue

                # 1. 确定 Base ID
                raw_id = ann.get("id") or ""
                raw_id = raw_id.strip() if isinstance(raw_id, str) else str(raw_id)
                base_pair_id = raw_id if raw_id else f"ann_{ann_idx}"

                # 2. 汇总 docRanges -> 作为一个 query_text
                doc_text_parts: List[str] = []
                for dr in ann.get("docRanges", []) or []:
                    if not isinstance(dr, dict): continue
                    
                    # 优先用 content
                    content = dr.get("content")
                    if isinstance(content, str) and content.strip():
                        doc_text_parts.append(content.strip())
                        continue

                    # 兼容 id + start/end 引用
                    did = dr.get("documentId")
                    if did and did in doc_map:
                        full = doc_map[did]
                        s = dr.get("start", 0) or 0
                        e = dr.get("end", len(full)) or len(full)
                        seg = full[s:e]
                        if seg.strip():
                            doc_text_parts.append(seg.strip())

                query_text = "\n".join(doc_text_parts).strip()

                # 3. 按 codeRange 拆分 -> 每一个 codeRange 是一个 code_text
                code_segments: List[str] = []
                for cr in ann.get("codeRanges", []) or []:
                    if not isinstance(cr, dict): continue
                    
                    seg_content = None
                    content = cr.get("content")
                    if isinstance(content, str) and content.strip():
                        seg_content = content.strip()
                    else:
                        cid = cr.get("documentId")
                        if cid and cid in code_map:
                            full = code_map[cid]
                            s = cr.get("start", 0) or 0
                            e = cr.get("end", len(full)) or len(full)
                            seg = full[s:e]
                            if seg.strip():
                                seg_content = seg.strip()
                    
                    if seg_content:
                        code_segments.append(seg_content)

                if not code_segments:
                    code_segments = [""]

                # 如果全空则跳过
                if not query_text and all(not c for c in code_segments):
                    continue

                # 4. 产出 Pair (One Query -> Multiple Codes)
                for code_idx, code_text in enumerate(code_segments):
                    # 生成唯一 ID
                    if len(code_segments) == 1:
                        pair_id = base_pair_id
                    else:
                        pair_id = f"{base_pair_id}_c{code_idx}"
                    
                    # 准备 metadata (直接用字典，不需要 json dumps)
                    meta = {
                        "category": str(ann.get("category", "")),
                        "updateTime": str(ann.get("updateTime", "")),
                        "pair_id": pair_id,
                        "orig_ann_id": base_pair_id,
                        "code_index": code_idx,
                        "code_count": len(code_segments),
                        "code_text": code_text,  # 【关键】代码存在 metadata 里
                        "source_type": "annotation"
                    }

                    ids.append(pair_id)
                    documents.append(query_text) # 【关键】用文档描述来做向量化
                    metadatas.append(meta)
                    count += 1
        else:
            # 兜底逻辑：无 annotations 时
            print("[RAG] 未发现 annotations，启用兜底模式 (Doc only)")
            for i, d in enumerate(doc_files):
                pair_id = f"doc_{i}"
                query_text = d.get("content", "") or ""
                if not query_text.strip(): continue
                
                ids.append(pair_id)
                documents.append(query_text)
                metadatas.append({
                    "pair_id": pair_id, 
                    "source": d.get("name", ""),
                    "code_text": "",
                    "source_type": "raw_doc"
                })
                count += 1
        # === 逻辑复刻结束 ===

        if not ids:
            return {"status": "warning", "message": "未解析到有效数据"}

        print(f"[RAG] 解析完成，正在入库 {len(ids)} 条数据...")
        
        # 批量 Upsert
        # 为了防止数据量过大，这里可以做一个简单的 batch 处理
        batch_size = 500
        total = len(ids)
        for i in range(0, total, batch_size):
            end = min(i + batch_size, total)
            self.collection.upsert(
                ids=ids[i:end],
                documents=documents[i:end],
                metadatas=metadatas[i:end]
            )
            print(f"[RAG] 已写入批次 {i} - {end}")
        
        total_count = self.collection.count()
        return {"status": "success", "message": f"构建完成！生成了 {count} 个数据对，库内总数: {total_count}"}

    def search(self, query: str, top_k: int = 1):
        if self.collection.count() == 0:
            return []
            
        # 根据 query 搜索（匹配 documents 字段，即上面的 query_text）
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k
        )
        
        hits = []
        if results['ids'] and len(results['ids']) > 0:
            for i in range(len(results['ids'][0])):
                meta = results['metadatas'][0][i]
                doc_content = results['documents'][0][i]
                
                hits.append({
                    "score": 1 - results['distances'][0][i],
                    "pair_id": results['ids'][0][i],
                    "query_text": doc_content,       # 匹配到的需求文档
                    "code_text": meta.get("code_text", ""), # 对应的代码
                    "meta": meta
                })
        return hits

rag_engine = RAGEngine()