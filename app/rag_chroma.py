
import os
import json
import chromadb
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel
from typing import List, Dict, Any
from chromadb.config import Settings

# === 配置部分 ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 本地模型路径
LOCAL_MODEL_REL_PATH = os.path.join("../models", "m3e-base")
LOCAL_MODEL_ABS_PATH = os.path.join(BASE_DIR, LOCAL_MODEL_REL_PATH)

COLLECTION_NAME = "rag_pairs"

class LocalM3EFunction(chromadb.EmbeddingFunction):
    """
    Embedding 函数保持不变
    """
    def __init__(self, model_path):
        print(f"[RAG] 正在加载本地模型 (Transformers 原生版): {model_path} ...")
        if not os.path.exists(model_path):
            # Fallback for dev environment if model not present, just to avoid crash on import
            # In production this should raise error
            print(f"[Warning] Model path not found: {model_path}")
            self.model = None
            self.tokenizer = None
            return

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
        if not self.model: return [[0.0]*768 for _ in input] # Dummy embedding

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
        # 只初始化模型，不初始化 client
        if not hasattr(self, 'emb_fn'):
            self.emb_fn = LocalM3EFunction(LOCAL_MODEL_ABS_PATH)
        
        self.collections = {} # Cache for open collections
        self.project_kb_root = os.path.join(BASE_DIR, "../rag_database")

    def initialize(self, project_path: str = None, *args, **kwargs):
        self.project_kb_root = os.path.join(BASE_DIR, "../rag_database")
        os.makedirs(self.project_kb_root, exist_ok=True)
        print(f"[RAG] 知识库根目录: {self.project_kb_root}")

    def _get_kb_path(self, kb_type: str, kb_name: str):
        # 展平结构：直接存放在 rag_database 下的同名目录
        return os.path.join(self.project_kb_root, kb_name)

    def _get_or_create_collection(self, kb_type: str, kb_name: str):
        cache_key = f"{kb_type}|{kb_name}"
        if cache_key in self.collections:
            return self.collections[cache_key]

        db_path = self._get_kb_path(kb_type, kb_name)
        os.makedirs(db_path, exist_ok=True)
        
        try:
            client = chromadb.PersistentClient(
                path=db_path,
                settings=Settings(anonymized_telemetry=False)
            )
            collection = client.get_or_create_collection(
                name=COLLECTION_NAME, 
                embedding_function=self.emb_fn,
                metadata={"hnsw:space": "cosine"}
            )
            self.collections[cache_key] = {
                'client': client,
                'collection': collection
            }
            return self.collections[cache_key]
        except Exception as e:
            print(f"[RAG] 知识库 '{kb_name}' ({kb_type}) 加载/创建失败: {e}")
            return None

    def get_collection(self, kb_type: str, kb_name: str):
        col_info = self._get_or_create_collection(kb_type, kb_name)
        return col_info['collection'] if col_info else None

    def add_rules(self, rules: List[Any], kb_type: str, kb_name: str):
        """
        清空并重建指定知识库
        """
        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
             return {"status": "error", "message": f"知识库 {kb_name} 初始化失败"}
        
        client = col_info['client']
        
        # Clear existing collection
        try:
            client.delete_collection(COLLECTION_NAME)
            # Recreate
            col_info['collection'] = client.create_collection(
                name=COLLECTION_NAME,
                embedding_function=self.emb_fn,
                metadata={"hnsw:space": "cosine"}
            )
            collection = col_info['collection']
        except Exception as e:
            return {"status": "error", "message": f"重置知识库失败: {e}"}

        if not rules:
             return {"status": "success", "message": "规则列表为空，已清空知识库"}

        ids = []
        documents = []
        metadatas = []

        print(f"[RAG] 正在导入 {len(rules)} 条数据到 {kb_name}...")

        for idx, item in enumerate(rules):
            doc_content = ""
            meta = {"source_type": "imported_rule"}
            
            if isinstance(item, str):
                doc_content = item
                meta["original_text"] = item
            elif isinstance(item, dict):
                doc_content = item.get("content", "") or item.get("rule", "") or json.dumps(item, ensure_ascii=False)
                meta.update(item)
                # Ensure metadata values are primitives
                for k, v in meta.items():
                    if not isinstance(v, (str, int, float, bool)):
                        meta[k] = str(v)
            
            if not doc_content.strip():
                continue

            ids.append(f"rule_{idx}")
            documents.append(doc_content)
            metadatas.append(meta)

        if ids:
            try:
                collection.upsert(
                    ids=ids,
                    documents=documents,
                    metadatas=metadatas
                )
                count = len(ids)
                return {"status": "success", "message": f"成功导入 {count} 条规则"}
            except Exception as e:
                print(f"[RAG] 写入失败: {e}")
                return {"status": "error", "message": str(e)}
        
        return {"status": "success", "message": "无有效规则导入"}

    def add_issues(self, issues: List[Any], kb_type: str, kb_name: str):
        return self.add_rules(issues, kb_type, kb_name)

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

    def get_all_items(self, kb_type: str, kb_name: str, limit: int = 100):
        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
            return {"status": "error", "message": "知识库不存在"}
        
        collection = col_info['collection']
        try:
            # 获取前 N 条
            results = collection.get(limit=limit, include=["metadatas", "documents"])
            items = []
            if results and results['ids']:
                for i in range(len(results['ids'])):
                    items.append({
                        "id": results['ids'][i],
                        "content": results['documents'][i],
                        "meta": results['metadatas'][i] if results['metadatas'] else {}
                    })
            return {"status": "success", "items": items, "total": collection.count()}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_item(self, kb_type: str, kb_name: str, item_id: str):
        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
            return {"status": "error", "message": "知识库不存在"}
        
        collection = col_info['collection']
        try:
            collection.delete(ids=[item_id])
            return {"status": "success", "message": "删除成功", "remaining": collection.count()}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def build_from_json(self, json_path: str, kb_type: str, kb_name: str, append: bool = False, source_file: str = ""):
        print(f"[RAG] 正在解析并构建索引: {json_path} (追加模式: {append})")        
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                js = json.load(f)
        except Exception as e:
            return {"status": "error", "message": f"读取标注文件失败: {str(e)}"}
        
        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
            return {"status": "error", "message": f"知识库 {kb_name} 初始化失败"}
        
        client = col_info['client']
        
        if not append:
            try:
                try:
                    client.delete_collection(COLLECTION_NAME)
                except:
                    pass
                col_info['collection'] = client.create_collection(
                    name=COLLECTION_NAME,
                    embedding_function=self.emb_fn,
                    metadata={"hnsw:space": "cosine"}
                )
                collection = col_info['collection']
            except Exception as e:
                # 这里可以放入上次我们讨论过的 readonly 修复逻辑
                return {"status": "error", "message": f"重置知识库失败: {e}"}
        else:
            collection = col_info['collection']
            print(f"[RAG] 正在向知识库 {kb_name} 最佳新条目...")

        ids = []
        documents = [] 
        metadatas = []

        def _normalize_source_name(name: str) -> str:
            s = str(name or "").strip()
            if not s:
                return ""
            # 统一为仅文件名，避免完整路径导致同一上传被分裂成多个“文档”
            s = s.replace("\\", "/")
            s = s.split("/")[-1].strip()
            return s

        normalized_upload_source = _normalize_source_name(source_file)

        annotations = js.get("annotations", [])
        doc_files = js.get("docFiles", [])
        code_files = js.get("codeFiles", [])

        import uuid
        run_id = uuid.uuid4().hex[:6]

        doc_map = self._doc_id_to_content(doc_files)
        code_map = self._code_id_to_content(code_files)

        count = 0

        if annotations:
            for ann_idx, ann in enumerate(annotations):
                if not isinstance(ann, dict): continue

                raw_id = ann.get("id") or ""
                raw_id = raw_id.strip() if isinstance(raw_id, str) else str(raw_id)
                base_pair_id = raw_id if raw_id else f"ann_{run_id}_{ann_idx}"
                
                doc_text_parts: List[str] = []
                for dr in ann.get("docRanges", []) or []:
                    if not isinstance(dr, dict): continue
                    content = dr.get("content")
                    if isinstance(content, str) and content.strip():
                        doc_text_parts.append(content.strip())
                        continue
                    did = dr.get("documentId")
                    if did and did in doc_map:
                        full = doc_map[did]
                        s = dr.get("start", 0) or 0
                        e = dr.get("end", len(full)) or len(full)
                        seg = full[s:e]
                        if seg.strip():
                            doc_text_parts.append(seg.strip())

                query_text = "\n".join(doc_text_parts).strip()

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

                if not code_segments: code_segments = [""]
                if not query_text and all(not c for c in code_segments): continue

                source_name = normalized_upload_source
                if not source_name:
                    for dr in ann.get("docRanges", []) or []:
                        if not isinstance(dr, dict):
                            continue
                        source_name = (
                            dr.get("source_file")
                            or dr.get("source")
                            or dr.get("filename")
                            or dr.get("file")
                            or dr.get("document")
                            or dr.get("doc_name")
                            or ""
                        )
                        # 仅当 documentId 看起来像文件名时才使用，避免 rules_doc / issue_doc 之类占位符污染分组
                        if not source_name:
                            did = dr.get("documentId")
                            if isinstance(did, str) and ('.' in did or '/' in did or '\\' in did):
                                source_name = did
                        if source_name:
                            break
                source_name = _normalize_source_name(source_name)

                for code_idx, code_text in enumerate(code_segments):
                    if len(code_segments) == 1:
                        pair_id = base_pair_id
                    else:
                        pair_id = f"{base_pair_id}_c{code_idx}"
                    
                    meta = {
                        "category": str(ann.get("category", "")),
                        "updateTime": str(ann.get("updateTime", "")),
                        "pair_id": pair_id,
                        "orig_ann_id": base_pair_id,
                        "code_index": code_idx,
                        "code_count": len(code_segments),
                        "code_text": code_text,  
                        "source_type": "annotation",
                        "source_file": source_name
                    }

                    ids.append(pair_id)
                    documents.append(query_text) 
                    metadatas.append(meta)
                    count += 1
        else:
            print("[RAG] 未发现 annotations，启用兜底模式 (Doc only)")
            for i, d in enumerate(doc_files):
                pair_id = f"doc_{run_id}_{i}"
                query_text = d.get("content", "") or ""
                if not query_text.strip(): continue
                
                ids.append(pair_id)
                documents.append(query_text)
                metadatas.append({
                    "pair_id": pair_id, 
                    "source": d.get("name", ""),
                    "code_text": "",
                    "source_type": "raw_doc",
                    "source_file": normalized_upload_source or _normalize_source_name(d.get("name", ""))
                })
                count += 1

        if not ids:
            return {"status": "warning", "message": "未解析到有效数据"}

        print(f"[RAG] 解析完成，正在入库 {len(ids)} 条数据...")
        
        batch_size = 500
        total = len(ids)
        for i in range(0, total, batch_size):
            end = min(i + batch_size, total)
            collection.upsert(
                ids=ids[i:end],
                documents=documents[i:end],
                metadatas=metadatas[i:end]
            )
        print(f"[RAG] 已写入批次 {i} - {end}")
        
        total_count = collection.count()
        return {"status": "success", "message": f"构建完成！新增了 {count} 个数据对，库内总数: {total_count}", "total_count": total_count}

rag_engine = RAGEngine()
