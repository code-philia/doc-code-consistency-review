
import os
import json
import re
import chromadb
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel
from typing import List, Dict, Any
from chromadb.config import Settings
from datetime import datetime

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
        #self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
		# Celery 默认使用 fork worker；为避免子进程里重新初始化 CUDA，RAG 检索暂时固定走 CPU。
        self.device = torch.device("cpu")
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
    RULE_KB_TYPES = {"rule", "coding_rule", "checklist"}
    RULE_MARKDOWN_FILE = "rules.md"
    RULE_METADATA_FILE = "rules.meta.json"
    
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

    def is_rule_kb(self, kb_type: str) -> bool:
        return (kb_type or "").strip() in self.RULE_KB_TYPES

    def _get_rules_markdown_path(self, kb_name: str) -> str:
        return os.path.join(self._get_kb_path("rule", kb_name), self.RULE_MARKDOWN_FILE)

    def _get_rules_metadata_path(self, kb_name: str) -> str:
        return os.path.join(self._get_kb_path("rule", kb_name), self.RULE_METADATA_FILE)

    @staticmethod
    def _normalize_rule_source(source_file: str) -> str:
        source = str(source_file or "").strip().replace("\\", "/")
        return source.split("/")[-1].strip() if source else ""

    @staticmethod
    def _rule_text(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def _description_only_text(value: Any) -> str:
        """从旧规则数据中仅保留规则说明，过滤所有示例。"""
        text = RAGEngine._rule_text(value)
        if not text:
            return ""
        marker = re.search(r"(?://\s*)?\[?(?:违背|遵循)示例\]?\s*:?", text)
        return text[:marker.start()].strip() if marker else text

    def _rule_record_from_item(self, item: Any, source_file: str = "", index: int = 0) -> Dict[str, Any]:
        """将解析结果、标注 JSON 或手工条目统一为 Markdown 记录。"""
        meta: Dict[str, Any] = {}
        description = ""
        rule_id = ""

        if isinstance(item, str):
            description = item
        elif isinstance(item, dict):
            full_data = item.get("full_data")
            if isinstance(full_data, dict):
                meta.update(full_data)

            rule_id = str(item.get("id") or meta.get("id") or "").strip()
            rule_id = rule_id or str(meta.get("rule_id") or "").strip()

            if item.get("description") is not None:
                description = self._rule_text(item.get("description"))
            elif item.get("docRanges") is not None:
                doc_ranges = item.get("docRanges") or []
                description = "\n".join(
                    self._rule_text(r.get("content"))
                    for r in doc_ranges
                    if isinstance(r, dict) and self._rule_text(r.get("content"))
                ).strip()
            else:
                description = self._rule_text(
                    item.get("content")
                    or item.get("rule")
                    or item.get("detail")
                    or meta.get("description")
                )

            if not rule_id:
                rule_id = str(meta.get("rule_id") or "").strip()

        if not rule_id:
            rule_id = f"rule_{index + 1}"

        source = self._normalize_rule_source(
            source_file or (meta.get("source_file") if isinstance(meta, dict) else "")
        )
        record_meta = {
            "id": rule_id,
            "category": str(meta.get("category") or "编程规则"),
            "source_file": source,
        }
        return {
            "id": rule_id,
            "description": description.strip(),
            "meta": record_meta,
        }

    def _serialize_rules_markdown(self, records: List[Dict[str, Any]]) -> str:
        parts = ["# 编码规则"]
        for record in records:
            rule_id = str(record.get("id") or "rule").strip().replace("\n", " ")
            description = str(record.get("description") or "").strip()
            if not description:
                continue
            parts.append(f"## {rule_id}\n{description}")

            meta = record.get("meta") or {}
            compact_meta = {
                "id": rule_id,
                "category": str(meta.get("category") or "编程规则"),
                "source_file": str(meta.get("source_file") or ""),
            }
            parts.append(f"<!-- rule-meta:{json.dumps(compact_meta, ensure_ascii=False, separators=(',', ':'))} -->")
        return "\n\n".join(parts).rstrip() + "\n"

    def _parse_rules_markdown(self, text: str) -> List[Dict[str, Any]]:
        matches = list(re.finditer(r"(?m)^##[ \t]+(.+?)\s*$", text or ""))
        records: List[Dict[str, Any]] = []
        for idx, match in enumerate(matches):
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            block = text[match.end():end].strip()
            heading_id = match.group(1).strip()

            meta_match = re.search(r"<!--\s*rule-meta:(.*?)\s*-->", block, re.DOTALL)
            meta: Dict[str, Any] = {}
            if meta_match:
                try:
                    parsed_meta = json.loads(meta_match.group(1))
                    if isinstance(parsed_meta, dict):
                        meta = parsed_meta
                except (TypeError, json.JSONDecodeError):
                    pass
                block = block[:meta_match.start()].rstrip()

            description_end = len(block)
            for marker in ("违背示例:", "遵循示例:"):
                marker_pos = block.find(marker)
                if marker_pos >= 0:
                    description_end = min(description_end, marker_pos)
            description = block[:description_end].strip()

            record_id = str(meta.get("id") or heading_id).strip()
            records.append({
                "id": record_id,
                "description": description,
                "meta": {
                    "id": record_id,
                    "category": str(meta.get("category") or "编程规则"),
                    "source_file": self._normalize_rule_source(meta.get("source_file", "")),
                },
            })
        return records

    def _read_rules_markdown(self, kb_name: str) -> List[Dict[str, Any]]:
        path = self._get_rules_markdown_path(kb_name)
        if not os.path.isfile(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                records = self._parse_rules_markdown(f.read())

            metadata_path = self._get_rules_metadata_path(kb_name)
            metadata = {}
            if os.path.isfile(metadata_path):
                with open(metadata_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    metadata = loaded if isinstance(loaded, dict) else {}
            default_meta = metadata.get("__default__", {})
            for record in records:
                extra_meta = metadata.get(str(record.get("id")), {})
                if not isinstance(extra_meta, dict):
                    extra_meta = {}
                if not isinstance(default_meta, dict):
                    default_meta = {}
                record["meta"] = {
                    **default_meta,
                    **(record.get("meta") or {}),
                    **extra_meta,
                }
            return records
        except (OSError, UnicodeError) as e:
            print(f"[RAG] 读取规则 Markdown 失败: {e}")
            return []
        except (TypeError, json.JSONDecodeError) as e:
            print(f"[RAG] 读取规则元数据失败: {e}")
            return []

    def _write_rules_markdown(self, kb_name: str, records: List[Dict[str, Any]]) -> None:
        path = self._get_rules_markdown_path(kb_name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        temp_path = f"{path}.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(self._serialize_rules_markdown(records))
        os.replace(temp_path, path)

        metadata = {}
        for record in records:
            record_id = str(record.get("id") or "").strip()
            if not record_id:
                continue
            meta = record.get("meta") or {}
            metadata[record_id] = {
                "category": str(meta.get("category") or "编程规则"),
                "source_file": self._normalize_rule_source(meta.get("source_file", "")),
            }
        metadata_path = self._get_rules_metadata_path(kb_name)
        metadata_temp_path = f"{metadata_path}.tmp"
        with open(metadata_temp_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(metadata_temp_path, metadata_path)

    def add_rules_markdown(
        self,
        rules: Any,
        kb_type: str,
        kb_name: str,
        append: bool = False,
        source_file: str = "",
    ) -> Dict[str, Any]:
        """将编码规则保存为 Markdown，不创建或修改 Chroma 向量集合。"""
        if isinstance(rules, dict):
            raw_items = rules.get("annotations", rules.get("rules", []))
            if not isinstance(raw_items, list):
                raw_items = [rules]
        elif isinstance(rules, list):
            raw_items = rules
        else:
            raw_items = []

        existing = self._read_rules_markdown(kb_name) if append else []
        records = list(existing)
        existing_ids = {str(item.get("id")) for item in records}
        added = 0

        for idx, item in enumerate(raw_items):
            record = self._rule_record_from_item(item, source_file=source_file, index=idx)
            if not record["description"]:
                continue

            base_id = record["id"]
            candidate_id = base_id
            suffix = 2
            while candidate_id in existing_ids:
                candidate_id = f"{base_id}_{suffix}"
                suffix += 1
            record["id"] = candidate_id
            record["meta"]["id"] = candidate_id
            records.append(record)
            existing_ids.add(candidate_id)
            added += 1

        self._write_rules_markdown(kb_name, records)
        return {
            "status": "success",
            "message": f"成功保存 {added} 条规则到 Markdown",
            "count": added,
            "total_count": len(records),
        }

    def _get_rule_items_from_markdown(self, kb_name: str, limit: int = None) -> List[Dict[str, Any]]:
        records = self._read_rules_markdown(kb_name)
        if limit is not None:
            records = records[:max(limit, 0)]
        items = []
        for record in records:
            meta = dict(record.get("meta") or {})
            meta.update({
                "source_type": "markdown_rule",
                "source_file": meta.get("source_file", ""),
                "category": meta.get("category", "编程规则"),
            })
            items.append({
                "id": record.get("id"),
                "content": record.get("description", "").strip(),
                "meta": meta,
            })
        return items

    def get_all_rule_items(self, kb_type: str, kb_name: str, limit: int = None) -> List[Dict[str, Any]]:
        """读取全部规则；新库读 Markdown，旧库无 rules.md 时回退 Chroma。"""
        if os.path.isfile(self._get_rules_markdown_path(kb_name)):
            return self._get_rule_items_from_markdown(kb_name, limit)

        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
            return []
        collection = col_info["collection"]
        try:
            kwargs = {"include": ["metadatas", "documents"]}
            if limit is not None:
                kwargs["limit"] = limit
            results = collection.get(**kwargs)
            items = []
            for i in range(len(results.get("ids") or [])):
                meta = results["metadatas"][i] if results.get("metadatas") else {}
                content = self._description_only_text(results["documents"][i])
                items.append({
                    "id": results["ids"][i],
                    "content": content,
                    "meta": meta,
                })
            return items
        except Exception as e:
            print(f"[RAG] 读取规则回退数据失败: {e}")
            return []

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
        if self.is_rule_kb(kb_type):
            return self.add_rules_markdown(rules, kb_type, kb_name, append=False)

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
        
    def add_cases(self, cases: List[Any], kb_type: str, kb_name: str, mode: str = 'append', source_file: str = ''):
        """
        把 docx 解析出的案例数据写入知识库
        mode: 'append'    追加（不动已有数据）
              'overwrite' 覆盖（清空重建，同 add_rules）
        """
        if mode not in ('append', 'overwrite'):
            return {"status": "error", "message": f"不支持的模式: {mode}，只能是 append 或 overwrite"}

        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
            return {"status": "error", "message": f"知识库 {kb_name} 初始化失败"}
        client = col_info['client']

        # 覆盖模式：清空重建（沿用 add_rules 的逻辑）
        if mode == 'overwrite':
            try:
                client.delete_collection(COLLECTION_NAME)
                col_info['collection'] = client.create_collection(
                    name=COLLECTION_NAME,
                    embedding_function=self.emb_fn,
                    metadata={"hnsw:space": "cosine"}
                )
            except Exception as e:
                return {"status": "error", "message": f"重置知识库失败: {e}"}
        collection = col_info['collection']

        if not cases:
            if mode == 'overwrite':
                return {"status": "success", "message": "案例列表为空，已清空知识库"}
            return {"status": "success", "message": "案例列表为空，无数据导入"}

        ids = []
        documents = []
        metadatas = []
        # 追加模式下 id 加时间戳，防止和已有数据 id 冲突（upsert 同 id 会覆盖旧数据）
        ts = datetime.now().strftime('%Y%m%d%H%M%S')

        print(f"[RAG] 正在以 {mode} 模式导入 {len(cases)} 条案例到 {kb_name}...")
        for idx, item in enumerate(cases):
            if isinstance(item, str):
                title = ""
                doc_content = item
                meta = {"source_type": "imported_case"}
            elif isinstance(item, dict):
                title = item.get("title", "")
                content = item.get("content", "")
                # title 拼进正文头部：embedding 检索时标题是关键语义，召回更准
                doc_content = f"{title}\n{content}" if title else content
                meta = {
                    "source_type": "imported_case",
                    "source_file": source_file,  # ← 新增：来源文件名，delete_file 靠它删
                    "title": title,
                }
                # visio_files 是 list，Chroma metadata 只收标量，转逗号字符串
                visio_files = item.get("visio_files", [])
                if visio_files:
                    meta["visio_files"] = ",".join(visio_files)
            else:
                continue

            if not doc_content.strip():
                continue

            # 确保 metadata 值都是标量（同 add_rules）
            for k, v in meta.items():
                if not isinstance(v, (str, int, float, bool)):
                    meta[k] = str(v)

            doc_id = f"case_{idx}" if mode == 'overwrite' else f"case_{ts}_{idx}"
            ids.append(doc_id)
            documents.append(doc_content)
            metadatas.append(meta)

        if ids:
            try:
                collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
                count = len(ids)
                return {"status": "success", "message": f"成功导入 {count} 条案例", 'count': count}
            except Exception as e:
                print(f"[RAG] 写入失败: {e}")
                return {"status": "error", "message": str(e)}
        return {"status": "success", "message": "无有效案例导入"}

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
        if self.is_rule_kb(kb_type) and os.path.isfile(self._get_rules_markdown_path(kb_name)):
            items = self._get_rule_items_from_markdown(kb_name, limit)
            return {"status": "success", "items": items, "total": len(self._read_rules_markdown(kb_name))}

        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
            return {"status": "error", "message": "知识库不存在"}
        
        collection = col_info['collection']
        try:
            # 获取前 N 条
            results = collection.get(limit=limit, include=["metadatas", "documents"])
            # print("results['metadatas']=======================", results['metadatas'])
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
        if self.is_rule_kb(kb_type) and os.path.isfile(self._get_rules_markdown_path(kb_name)):
            records = self._read_rules_markdown(kb_name)
            remaining_records = [record for record in records if str(record.get("id")) != str(item_id)]
            if len(remaining_records) == len(records):
                return {"status": "error", "message": "条目不存在"}
            self._write_rules_markdown(kb_name, remaining_records)
            return {
                "status": "success",
                "message": "删除成功",
                "remaining": len(remaining_records),
            }

        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
            return {"status": "error", "message": "知识库不存在"}
        
        collection = col_info['collection']
        try:
            collection.delete(ids=[item_id])
            return {"status": "success", "message": "删除成功", "remaining": collection.count()}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_file(self, kb_type: str, kb_name: str, source_file: str):
        if self.is_rule_kb(kb_type) and os.path.isfile(self._get_rules_markdown_path(kb_name)):
            records = self._read_rules_markdown(kb_name)
            normalized_source = self._normalize_rule_source(source_file)
            remaining_records = [
                record for record in records
                if self._normalize_rule_source(
                    (record.get("meta") or {}).get("source_file", "")
                ) != normalized_source
            ]
            deleted = len(records) - len(remaining_records)
            if deleted:
                self._write_rules_markdown(kb_name, remaining_records)
            return {
                "status": "success",
                "message": "删除成功",
                "remaining": len(remaining_records),
                "deleted": deleted,
            }

        col_info = self._get_or_create_collection(kb_type, kb_name)
        if not col_info:
            return {"status": "error", "message": "知识库不存在"}
        collection = col_info['collection']
        try:
            collection.delete(where={"source_file": source_file})
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

        if self.is_rule_kb(kb_type):
            return self.add_rules_markdown(
                js,
                kb_type=kb_type,
                kb_name=kb_name,
                append=append,
                source_file=source_file
            )
        
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
                base_pair_id = f"{raw_id}_{run_id}_{ann_idx}" if raw_id else f"ann_{run_id}_{ann_idx}"
                
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
