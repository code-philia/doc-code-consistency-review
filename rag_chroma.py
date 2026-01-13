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
        self.collections = {} # Stores collections by name: 'align_rules', 'user_manuals', 'code'

    def initialize(self, project_path: str):
        if not project_path:
            raise ValueError("[RAG] 初始化失败：未提供 project_path")

        print(f"[RAG] 正在初始化知识库 (项目: {project_path})")
        
        # 1. 动态构建路径：放在项目根目录下的 rag_database 文件夹里
        project_kb_root = os.path.join(project_path, "rag_database")
        
        # Define the 3 required KBs
        kb_types = ['align_knowledge_base', 'issue_knowledge_base', 'rule_knowledge_base']
        
        for kb_name in kb_types:
            current_db_path = os.path.join(project_kb_root, kb_name)
            os.makedirs(current_db_path, exist_ok=True)
            
            # Initialize Client for each KB (since they are in different dirs, we might need different clients 
            # OR we can use one client with different collections if they were in the same DB. 
            # But the requirement says "Split into 3 parts", often implying separation. 
            # ChromaDB PersistentClient binds to a directory. 
            # If we want 3 separate dirs, we need 3 clients or just use 1 client in 'rag_database' and 3 collections?
            # Existing code used `rag_database/{db_name}` as path. 
            # To minimize disruption and follow "Split into 3 parts", I will use 3 subdirectories.
            # Thus, 3 clients.
            
            try:
                client = chromadb.PersistentClient(path=current_db_path)
                collection = client.get_or_create_collection(
                    name=COLLECTION_NAME, # Use same collection name internally, or separate? 'rag_pairs' is fine.
                    embedding_function=self.emb_fn,
                    metadata={"hnsw:space": "cosine"}
                )
                self.collections[kb_name] = {
                    'client': client,
                    'collection': collection
                }
                print(f"[RAG] 知识库 '{kb_name}' 加载完成。")
            except Exception as e:
                print(f"[RAG] 知识库 '{kb_name}' 加载失败: {e}")

    def get_collection(self, kb_type='rule_knowledge_base'):
        if kb_type not in self.collections:
            return None
        return self.collections[kb_type]['collection']

    def add_rules(self, rules: List[Any]):
        """
        清空并重建 'rule_knowledge_base' 知识库
        :param rules: 规则列表，可以是字符串列表或包含 content 的字典列表
        """
        kb_type = 'rule_knowledge_base'
        if kb_type not in self.collections:
             return {"status": "error", "message": f"知识库 {kb_type} 未初始化"}
        
        col_info = self.collections[kb_type]
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

        print(f"[RAG] 正在导入 {len(rules)} 条规则...")

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

    def add_manual_data(self, data_items: List[Dict[str, Any]], kb_type='align_knowledge_base'):
        """
        接收人工审查后的数据列表并入库
        :param data_items: 列表，每一项包含 {'id':..., 'content':..., 'meta':...}
        """
        collection = self.get_collection(kb_type)
        if not collection:
            return {"status": "error", "message": f"知识库 {kb_type} 未初始化，请先调用 initialize"}
        
        if not data_items:
            return {"status": "warning", "message": "没有数据需要入库"}

        ids = []
        documents = []  # 用于向量检索的文本 (如: 问题描述)
        metadatas = []  # 附带信息 (如: 原始JSON、处理意见、代码等)

        print(f"[RAG] 正在处理人工提交的 {len(data_items)} 条数据...")

        for item in data_items:
            # 1. ID 处理
            doc_id = str(item.get("id"))
            
            # 2. 检索内容 (content)
            # 前端传来的 'content' 是我们拼接好的用于搜索的文本
            search_text = item.get("content", "")
            
            # [Refinement] 如果是 History Align 数据 (含有 docRanges)，
            # 优先仅使用 docRanges 作为向量检索内容，以保持与 build_from_json 逻辑一致 (Doc -> Code)
            raw_meta = item.get("meta", {})
            if "docRanges" in raw_meta and isinstance(raw_meta["docRanges"], list):
                doc_parts = []
                for dr in raw_meta["docRanges"]:
                    if isinstance(dr, dict) and "content" in dr:
                        doc_parts.append(dr["content"])
                    elif isinstance(dr, str):
                        doc_parts.append(dr)
                if doc_parts:
                    search_text = "\n".join(doc_parts)

            if not search_text:
                continue

            # 3. Metadata 处理
            # ChromaDB 的 metadata 值只能是 str, int, float, bool
            # 我们把前端传来的完整字典 (full_data) 转成字符串存进去，方便取出
            raw_meta = item.get("meta", {})
            
            # 尝试从 codeRanges 提取代码文本 (适配 History Align)
            code_text = ""
            if "codeRanges" in raw_meta and isinstance(raw_meta["codeRanges"], list):
                codes = []
                for cr in raw_meta["codeRanges"]:
                    if isinstance(cr, dict) and "content" in cr:
                        codes.append(cr["content"])
                    elif isinstance(cr, str):
                        codes.append(cr)
                code_text = "\n".join(codes)
            
            # 兜底：尝试从其他字段提取
            if not code_text:
                code_text = raw_meta.get("compliance_code") or raw_meta.get("opinion") or ""

            # 构造符合你现有 schema 的 metadata
            # 尽量保持和你 build_from_json 里的 metadata 结构类似，方便统一读取
            clean_meta = {
                "pair_id": doc_id,
                "source_type": "manual_review", # 标记来源
                "code_text": code_text,
                "original_json": json.dumps(raw_meta, ensure_ascii=False) # 把原始结构存起来以防万一
            }

            ids.append(doc_id)
            documents.append(search_text)
            metadatas.append(clean_meta)

        # 4. 批量写入
        if ids:
            try:
                collection.upsert(
                    ids=ids,
                    documents=documents,
                    metadatas=metadatas
                )
                count = len(ids)
                total = collection.count()
                return {"status": "success", "message": f"成功入库 {count} 条数据，当前库总数: {total}"}
            except Exception as e:
                print(f"[RAG] 写入失败: {e}")
                return {"status": "error", "message": str(e)}
        else:
            return {"status": "warning", "message": "有效数据为0，未写入"}

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
                        "code_text": code_text,  
                        "source_type": "annotation"
                    }

                    ids.append(pair_id)
                    documents.append(query_text) 
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
            collection.upsert(
                ids=ids[i:end],
                documents=documents[i:end],
                metadatas=metadatas[i:end]
            )
            print(f"[RAG] 已写入批次 {i} - {end}")
        
        total_count = collection.count()
        return {"status": "success", "message": f"构建完成！生成了 {count} 个数据对，库内总数: {total_count}"}

    def search(self, query: str, top_k: int = 1, kb_type='align_rules'):
        collection = self.get_collection(kb_type)
        if not collection or collection.count() == 0:
            return []
            
        # 根据 query 搜索（匹配 documents 字段，即上面的 query_text）
        results = collection.query(
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