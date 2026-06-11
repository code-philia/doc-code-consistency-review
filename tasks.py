import json
import os
import time
from collections import defaultdict

import pandas as pd
from celery import Celery
from app import create_app
from app.agent import query_review_result, query_review_result_by_feedback, query_codefile_from_abstract, \
    query_related_code, query_generated_requirement, query_flow_chart, query_related_requirement
from app.code_block import get_codefile_blocks
from app.db import get_db_celery
from app.rag_chroma import rag_engine
from app.utils import get_all_files_with_relative_paths, include_related_blocks
from app.views import logger, get_abstracts_from_sqlite, generate_abstract, save_abstract_to_db, filter_non_abstract_files

celery = Celery(
    'app',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0'
)

celery.conf.update(
    send_events=False,
    worker_send_task_events=False,
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Shanghai',
    enable_utc=True
)

app = create_app()


class ContextTask(celery.Task):
    def __call__(self, *args, **kwargs):
        with app.app_context():
            return self.run(*args, **kwargs)


celery.Task = ContextTask

def _normalize_kb_type_for_use(raw_type):
    kb_type = (raw_type or "other").strip()
    if kb_type in ("rule", "coding_rule", "checklist"):
        return "rule"
    if kb_type in ("issue", "history_issue"):
        return "issue"
    if kb_type in ("align", "history_align"):
        return "align"
    return "other"

def _safe_first_range_field(ranges, field, default=''):
    if isinstance(ranges, list) and ranges:
        first = ranges[0] or {}
        if isinstance(first, dict):
            return first.get(field, default) or default
    return default	
	
@celery.task(name="user_bp.task.add")
def add(x, y):
    time.sleep(10)
    return x + y


@celery.task(bind=True)
def abstract_code_from_project_task(self, params, code_file_path, user_id):
    #print('*********1111111*******')
    try:
        project_id = params.get('project_id')
        project_path = params.get('projectPath', '')
        # 从SQLite读取数据
        # print('从SQLite读取数据!!!!!!!!!!!!!!!')
        df = get_abstracts_from_sqlite(project_id)
        # print(df.head())
        # 排除无关文件夹/目录
        exclude_folders = ['.git', '.idea']
        # 基于文件名后缀，指定文件类型
        include_files = ['.py', '.c', '.cpp', '.h', '.hpp', '.java', '.html', '.vhd', '.v', '.sv']
        # 遍历文件夹
        file_abstract = {}
        for root, dirs, files in os.walk(code_file_path):
            dirs[:] = [d for d in dirs if d not in exclude_folders]
            total = len(files)
            for i, file in enumerate(files, 1):
                self.update_state(
                    state="PROGRESS",
                    meta={
                        'current': i,
                        'total': total,
                        'name': f'正在摘要:{file}',
                        'status': f'任务进行中{i}/{total}...'
                    }
                )
                if os.path.splitext(file)[1] in include_files:
                    file_path = os.path.join(root, file)
                    # 文件不能是0KB的空文件
                    if os.path.getsize(file_path) == 0:
                        continue
                    # 构建相对路径    
                    rel_path = os.path.relpath(file_path, code_file_path)

                    if not df.empty:
                        # 先看数据库里有没有已经生成好的代码摘要
                        row_data = df[df['filename'] == rel_path]

                        # 数据库有该代码文件的摘要
                        if not row_data.empty:
                            logger.info('数据库有该代码文件的摘要')
                            abstract_data = row_data['abstract'].values[0]
                            file_abstract[rel_path] = abstract_data
                        # 数据库没有该代码文件的摘要
                        else:
                            logger.info('数据库没有该代码文件的摘要')
                            file_path = os.path.join(root, file)
                            codefile_abstract = generate_abstract(file_path)
                            file_abstract[rel_path] = codefile_abstract

                            # save_abstract_to_db(project_path, file, codefile_abstract, project_id)
                            save_abstract_to_db(project_path, rel_path, codefile_abstract, project_id, user_id)

                    # 数据库里代码摘要这张表是空的，需要新生成
                    else:
                        logger.info('数据库里代码摘要这张表是空的')
                        file_path = os.path.join(root, file)
                        codefile_abstract = generate_abstract(file_path)
                        file_abstract[rel_path] = codefile_abstract
                        # save_abstract_to_db(project_path, file, codefile_abstract, project_id)
                        save_abstract_to_db(project_path, rel_path, codefile_abstract, project_id, user_id)

        self.update_state(
            state="SUCCESS",
            meta={
                'status': f'摘要生成完毕'
            }
        )
        logger.info('代码文件的摘要已生成')
        return {'status': True, 'message': '任务执行成功', 'data': file_abstract}

    except Exception as e:
        self.update_state(
            state="FAILURE",
            message=f"摘要过程中出错{e}"
        )
        logger.error(f"生成代码摘要出错: {str(e)}", exc_info=True)
        return {'status': False, 'message': str(e)}


@celery.task(bind=True)
def review_alignment_task(self, project_path, project_id, user_id, files, prompt_type=None, reviewed_count=None):
    try:
        result = []
        if isinstance(files, dict):
            result.extend(
                {"doc_file": doc_file, "alignment": item}
                for doc_file, alignments in files.items()
                for item in (alignments or [])
            )

        if not result:
            raise ValueError("缺少可审查的数据：既没有需求-代码对齐，也没有代码块列表")

        # print('result===============', result)
        total = len(result)
        # print('reviewed_count===============',reviewed_count)
        if not reviewed_count or not isinstance(reviewed_count, int):
            reviewed_count = 0
        for i, item in enumerate(result, reviewed_count):
            alignment = item['alignment']
            self.update_state(
                state="PROGRESS",
                meta={
                    'current': i,
                    'total': total,
                    'name': alignment['name'],
                    'status': f'任务进行中{i}/{total}...'
                }
            )
            # 获取选定的 knowledge base
            selected_rule_kbs = []
            selected_issue_kbs = []

            try:
                metadata_file = os.path.join(project_path, 'metadata.json')
                if os.path.exists(metadata_file):
                    with open(metadata_file, 'r', encoding='utf-8') as f:
                        metadata = json.load(f)
                        selected_kbs = metadata.get('selected_kbs', [])
                        selected_rule_kbs = [kb['name'] for kb in selected_kbs if _normalize_kb_type_for_use(kb.get('type')) == 'rule']
                        selected_issue_kbs = [kb['name'] for kb in selected_kbs if _normalize_kb_type_for_use(kb.get('type')) == 'issue']
            except Exception as e:
                logger.error(str(e), exc_info=True)
            # 检索上下文
            retrieved_rules = []
            retrieved_issues = []

            doc_ranges = alignment.get('docRanges', [])
            code_ranges = alignment.get('codeRanges', [])

            # 构造查询文本
            query_text = ""
            if doc_ranges:
                query_text += doc_ranges[0].get('content', '') + "\n"
            if code_ranges:
                query_text += code_ranges[0].get('content', '')

            # 检索规则
            for kb_name in selected_rule_kbs:
                collection = rag_engine.get_collection('rule', kb_name)
                if collection:
                    results = collection.query(query_texts=[query_text], n_results=3)
                    if results and results['documents']:
                        for doc in results['documents'][0]:
                            retrieved_rules.append(doc)

            # 检索问题单
            for kb_name in selected_issue_kbs:
                collection = rag_engine.get_collection('issue', kb_name)
                if collection:
                    results = collection.query(query_texts=[query_text], n_results=3)
                    if results and results['documents']:
                        for doc in results['documents'][0]:
                            retrieved_issues.append(doc)

            # 1. 调用 agent 获取审查结果
            review_process, issue = query_review_result(
                doc_ranges,
                code_ranges,
                rules=retrieved_rules,
                issues=retrieved_issues,
                user_id=user_id,
                project_path=project_path,
                prompt_type=prompt_type
            )

            # 2. 更新对齐关系
            alignment['isReviewed'] = True
            alignment['reviewThoughts'] = review_process

            if isinstance(issue, list):
                issues_list = [x for x in issue if isinstance(x, dict)]
            elif isinstance(issue, dict):
                issues_list = [issue]
            else:
                issues_list = []
            
            # 需求反生成
            generated_requirement, mermaid_code = gen_requirement(doc_ranges, code_ranges)
            
            conn = get_db_celery()
            cur = conn.cursor()
            try:

                cur.execute(
                    'INSERT INTO alignments(id,user_id,project_id,name,isReviewed,reviewThoughts,docRanges,codeRanges,'
                    'createdAt,updatedAt,GenReq,GenMermaid,is_code_review) '
                    'VALUES(%s,%s,%s,%s,1,%s,%s,%s,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,%s,%s,%s) '
                    'ON DUPLICATE KEY UPDATE '
                    'isReviewed=1,'
                    'reviewThoughts=VALUES(reviewThoughts),'
                    'GenReq=VALUES(GenReq),'
                    'GenMermaid=VALUES(GenMermaid),'
                    'updatedAt=CURRENT_TIMESTAMP',
                    (
                        alignment.get('id'),
                        user_id,
                        project_id,
                        alignment.get('name') or '',
                        alignment.get('reviewThoughts') or '',
                        json.dumps(doc_ranges or []),
                        json.dumps(code_ranges or []),
                        generated_requirement or '',
                        mermaid_code or '',
                        0 if not prompt_type else 1
                    )
                )

                if issues_list:
                    cur.execute(
                        f"SELECT displayId FROM issues WHERE displayId LIKE 'ISSUE-%' and project_id={project_id}")
                    used = set()
                    for r in cur.fetchall():
                        disp = r['displayId']
                        if disp and disp.startswith('ISSUE-'):
                            try:
                                used.add(int(disp.split('-')[1]))
                            except Exception as e:
                                logger.error(str(e), exc_info=True)

                    next_number = (max(used) + 1) if used else 1

                    doc_ranges = alignment.get('docRanges', [])
                    if doc_ranges:
                        content = doc_ranges[0].get('content', '')
                    else:
                        content = ''
                    brief_req = content or ''
                    brief_code = _safe_first_range_field(alignment.get('codeRanges', []), 'content')
                    related_doc_file = (
                        item.get('doc_file')
                        or _safe_first_range_field(alignment.get('docRanges', []), 'filename')
                        or _safe_first_range_field(alignment.get('codeRanges', []), 'filename')
                    )
                    for one in issues_list:
                        display_id = f"ISSUE-{next_number:03d}"
                        next_number += 1

                        severity = one.get('level') or one.get('severity')
                        title = one.get('summary') or one.get('title') or ''
                        content = one.get('description') or one.get('content') or ''
                        status = one.get('status') or 'unconfirmed'

                        cur.execute(
                            'INSERT INTO issues(user_id,project_id,displayId,alignmentId,severity,title,content,status,'
                            'relatedDocFile,relatedRequirementId,briefRequirement,briefCode,createdAt,updatedAt) '
                            'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
                            (
                                user_id,
                                project_id,
                                display_id,
                                alignment.get('id'),
                                severity,
                                title,
                                content,
                                status,
                                related_doc_file,
                                alignment.get('id'),
                                brief_req,
                                brief_code
                            )
                        )

                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"写入数据库失败: {str(e)}", exc_info=True)
                return {"status": "error", "message": f"写入数据库失败: {str(e)}"}
            finally:
                conn.close()
    except Exception as e:
        self.update_state(
            state="FAILURE",
            message=f"审查出错{e}"
        )
        logger.error(f"审查失败2: {str(e)}", exc_info=True)
        raise RuntimeError(f"Failed to save review result: {str(e)}") from e

    self.update_state(
        state="SUCCESS",
        meta={}
    )


@celery.task
def review_alignment_addprompt_task(project_path, alignment, project_id, user_id, doc_file=None, user_prompt=None):
    # 获取选定的 knowledge base
    selected_rule_kbs = []
    selected_issue_kbs = []
    try:
        metadata_file = os.path.join(project_path, 'metadata.json')
        if os.path.exists(metadata_file):
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
                selected_kbs = metadata.get('selected_kbs', [])
                selected_rule_kbs = [kb['name'] for kb in selected_kbs if _normalize_kb_type_for_use(kb.get('type')) == 'rule']
                selected_issue_kbs = [kb['name'] for kb in selected_kbs if _normalize_kb_type_for_use(kb.get('type')) == 'issue']
    except Exception as e:
        logger.error(str(e), exc_info=True)

    # 检索上下文
    retrieved_rules = []
    retrieved_issues = []

    doc_ranges = alignment.get('docRanges', [])
    code_ranges = alignment.get('codeRanges', [])
    reviewThoughts = alignment.get('reviewThoughts', [])

    # 构造查询文本
    query_text = ""
    if doc_ranges:
        query_text += doc_ranges[0].get('content', '') + "\n"
    if code_ranges:
        query_text += code_ranges[0].get('content', '')

    # 检索规则
    for kb_name in selected_rule_kbs:
        collection = rag_engine.get_collection('rule', kb_name)
        if collection:
            results = collection.query(query_texts=[query_text], n_results=3)
            if results and results['documents']:
                for doc in results['documents'][0]:
                    retrieved_rules.append(doc)

    # 检索问题单
    for kb_name in selected_issue_kbs:
        collection = rag_engine.get_collection('issue', kb_name)
        if collection:
            results = collection.query(query_texts=[query_text], n_results=3)
            if results and results['documents']:
                for doc in results['documents'][0]:
                    retrieved_issues.append(doc)

    # 1. 调用 agent 获取审查结果
    review_process, issue = query_review_result_by_feedback(
        doc_ranges,
        code_ranges,
        reviewThoughts,
        user_prompt,
        rules=retrieved_rules,
        issues=retrieved_issues,
        user_id=user_id,
        project_path=project_path
    )

    # 2. 更新对齐关系
    alignment['isReviewed'] = True
    alignment['reviewThoughts'] = review_process

    if isinstance(issue, list):
        issues_list = [x for x in issue if isinstance(x, dict)]
    elif isinstance(issue, dict):
        issues_list = [issue]
    else:
        issues_list = []
    
    # 需求反生成
    generated_requirement, mermaid_code = gen_requirement(doc_ranges, code_ranges)
    
    conn = get_db_celery()
    cur = conn.cursor()

    try:
        cur.execute(
            'UPDATE alignments SET isReviewed=1, reviewThoughts=%s, GenReq=%s, GenMermaid=%s, updatedAt=CURRENT_TIMESTAMP '
            'WHERE id=%s and project_id=%s',
            (alignment.get('reviewThoughts') or '', generated_requirement or '', mermaid_code or '', alignment.get('id'), project_id)
        )

        if issues_list:
            cur.execute(f"SELECT displayId FROM issues WHERE displayId LIKE 'ISSUE-%' and project_id={project_id}")
            used = set()
            for r in cur.fetchall():
                disp = r['displayId']
                if disp and disp.startswith('ISSUE-'):
                    try:
                        used.add(int(disp.split('-')[1]))
                    except Exception as e:
                        logger.error(str(e), exc_info=True)

            next_number = (max(used) + 1) if used else 1

            brief_req = _safe_first_range_field(alignment.get('docRanges', []), 'content')
            brief_code = _safe_first_range_field(alignment.get('codeRanges', []), 'content')
            related_doc_file = (
                doc_file
                or _safe_first_range_field(alignment.get('docRanges', []), 'filename')
                or _safe_first_range_field(alignment.get('codeRanges', []), 'filename')
            )

            for one in issues_list:
                display_id = f"ISSUE-{next_number:03d}"
                next_number += 1

                severity = one.get('level') or one.get('severity')
                title = one.get('summary') or one.get('title') or ''
                content = one.get('description') or one.get('content') or ''
                status = one.get('status') or 'unconfirmed'

                cur.execute(
                    'INSERT INTO issues(user_id,project_id,displayId,alignmentId,severity,title,content,status,'
                    'relatedDocFile,relatedRequirementId,briefRequirement,briefCode,createdAt,updatedAt) '
                    'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
                    (
                        user_id,
                        project_id,
                        display_id,
                        alignment.get('id'),
                        severity,
                        title,
                        content,
                        status,
                        related_doc_file,
                        alignment.get('id'),
                        brief_req,
                        brief_code
                    )
                )

        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"审查失败 user_prompt2: {str(e)}", exc_info=True)
        return {"status": "error", "message": f"Failed to save review result: {str(e)}"}
    finally:
        conn.close()

    return {"status": "success", "createdIssues": len(issues_list)}


@celery.task(bind=True)
def align_requirement_to_project_task(self, abstract, params, user_id):
    project_path = params.get('projectPath', '')
    project_id = params.get('project_id')
    chunks = params.get('requirements')
    y_align = params.get('y_align')
    total = len(chunks)
    try:

        for i, chunk in enumerate(chunks, y_align):
            self.update_state(
                state="PROGRESS",
                meta={
                    'current': i,
                    'total': total,
                    'name': chunk['name'],
                    'status': f'任务进行中{i}/{total}...'
                }
            )
            print(f"正在执行==文件名{chunk['name']} {i}/{len(chunks)}")
            doc_ranges = chunk['docRanges']
            # 获取项目中所有代码文件
            code_repo_path = os.path.join(project_path, 'code_repo')
            code_block_base_path = os.path.join(project_path, 'code_block_repo')
            all_files = get_all_files_with_relative_paths(code_repo_path, 'code')

            # 拼接所有docRanges的content作为requirement_text
            requirement_text = '\n\n'.join(
                [doc_range.get('content', '') for doc_range in doc_ranges if doc_range.get('content')])
            if not requirement_text or not project_path:
                return {"status": "error", "message": "缺少需求内容或项目路径参数"}

            # 如果有多个代码文件，执行检索代码摘要
            file_abstract = abstract.get('data', abstract) if isinstance(abstract, dict) else abstract
            if len(all_files) > 1:
                # 基于需求，利用大模型检索代码摘要，先定位代码文件
                # 调用llm
                file_name_list = query_codefile_from_abstract(requirement_text, file_abstract)
                
                # 解析异常，返回空列表时
                # 过滤掉含有乱码的代码摘要（作为被定位的代码文件防止遗漏），重新调用大模型定位代码文件
                FILE_MAX_LIMIT = 40
                if not file_name_list:
                    filter_non_file, filter_file_abstract, file_cnt = filter_non_abstract_files(file_abstract)
                    
                    # 代码摘要数量小于阈值时，可以直接调用
                    if file_cnt <=FILE_MAX_LIMIT:
                        # 调用llm
                        file_name_list = query_codefile_from_abstract(requirement_text, filter_file_abstract)
                        #print(file_name_list)
                    
                    # 可能由于代码摘要过多，影响大模型分析理解而报错
                    else:
                        # 对代码摘要分批次处理
                        file_name_list = []
                        file_cnt = 0
                        batch_file_abstract = {}
                        for key, value in filter_file_abstract.items():
                            file_cnt += 1
                            batch_file_abstract[key] = value
                            if file_cnt >= FILE_MAX_LIMIT:
                                file_cnt = 0
                                batch_file_name_list = query_codefile_from_abstract(requirement_text, batch_file_abstract)
                                file_name_list += batch_file_name_list
                    
                    # 谨防遗漏，将有摘要是乱码的代码文件全部放入候选区
                    if not file_name_list:                    
                        file_name_list += filter_non_file
                    #print(file_name_list)
                    
            # 如果只有一个代码文件，就不检索代码摘要
            else:
                file_name_list = all_files

            # 尝试初始化RAG引擎，以便在agent中使用
            # try:
            # rag_engine.initialize(project_path)
            # except Exception as e:
            # print(f"[Align] RAG initialize failed: {e}")

            code_ranges = []

            # 遍历经过代码摘要筛选的代码文件
            for file_name in file_name_list:

                # 为代码进行分块或读取分块结果
                if not os.path.exists(os.path.join(code_repo_path, file_name)):
                    continue
                all_code_blocks = get_codefile_blocks(code_repo_path, file_name, code_block_base_path)

                # 调用对齐函数获取相关代码
                related_code = query_related_code(
                    requirement_text,
                    all_code_blocks,
                    block_limit=50,
                    user_id=user_id,
                    project_path=project_path
                )
                
                try:
                    # 检查并添加 related_id 对应的代码块
                    related_code = include_related_blocks(related_code, all_code_blocks)

                    # 转换为codeRanges格式
                    for code_block in related_code:
                        # 获取原始代码内容（不带行号）
                        file_path = os.path.join(code_repo_path, code_block['file'])
                        if os.path.exists(file_path):
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                original_content = f.read()
                                lines = original_content.splitlines(keepends=True)  # 保留换行符

                                # 提取指定行范围的内容
                                start_line = max(1, code_block['range'][0])
                                end_line = min(len(lines), code_block['range'][1])

                                if start_line <= end_line:
                                    # 计算字符偏移量
                                    char_start = sum(len(line) for line in lines[:start_line - 1])
                                    char_end = sum(len(line) for line in lines[:end_line])

                                    # 提取内容（不保留换行符用于显示）
                                    range_content = '\n'.join(
                                        [line.rstrip('\n\r') for line in lines[start_line - 1:end_line]])

                                    code_ranges.append({
                                        'filename': code_block['file'],
                                        'start': char_start,  # 字符偏移量
                                        'end': char_end,  # 字符偏移量
                                        'content': range_content,
                                        'documentId': code_block['file'],
                                        'startLine': start_line,
                                        'endLine': end_line
                                    })
                                    
                except Exception as e:
                    print(f"add related_code failed: {e}") 
                    
            chunk['codeRanges'] = code_ranges
            add_alignment_data(project_path, chunk, project_id, user_id)

        self.update_state(
            state="SUCCESS",
            meta={}
        )

    except Exception as e:
        self.update_state(
            state="FAILURE",
            message=f"对齐过程中出错{e}"
        )
        logger.error(f'对齐过程中出错:{str(e)}', exc_info=True)
        raise RuntimeError(f'对齐过程中出错:{str(e)}') from e


@celery.task(bind=True)
def align_code_to_requirements_task(self, project_path, code_blocks, project_id, user_id, y_align):
    total = len(code_blocks)
    try:
        for i, code_block in enumerate(code_blocks, y_align):
            self.update_state(
                state="PROGRESS",
                meta={
                    'current': i,
                    'total': total,
                    'name': code_block['name'],
                    'status': f'任务进行中{i}/{total}...'
                }
            )
            print(f"正在执行==文件名{code_block['name']} {i}/{total}")
            code_ranges = code_block['codeRanges']
            # 获取选定的 align 类型知识库
            selected_align_kbs = []
            try:
                metadata_file = os.path.join(project_path, 'metadata.json')
                if os.path.exists(metadata_file):
                    with open(metadata_file, 'r', encoding='utf-8') as f:
                        metadata = json.load(f)
                        selected_kbs = metadata.get('selected_kbs', [])
                        selected_align_kbs = [kb['name'] for kb in selected_kbs if _normalize_kb_type_for_use(kb.get('type')) == 'align']
            except Exception:
                pass

            # 如果没有选择任何 align 知识库，使用原来的 LLM 逻辑
            if not selected_align_kbs:
                # 原有的 LLM 逻辑
                # 获取需求块
                doc_block_base_path = os.path.join(project_path, 'doc_block_repo')
                doc_block_file_path = os.path.join(doc_block_base_path, 'doc_blocks.jsonl')

                if not os.path.exists(doc_block_file_path):
                    return {"status": "success", "docRanges": []}  # 没有需求文件，无法对齐

                all_doc_blocks = []
                all_original_doc_blocks = []
                with open(doc_block_file_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip():
                            original_doc_block = json.loads(line.strip())
                            all_doc_blocks.append({
                                "file": original_doc_block.get("filename", ''),
                                "range": [original_doc_block.get("start", 0), original_doc_block.get("end", 0)],
                                "content": original_doc_block.get("content", '')
                            })
                            all_original_doc_blocks.append(original_doc_block)

                code_content = '\n\n'.join(
                    [code_range.get('content', '') for code_range in code_ranges if code_range.get('content')])

                # 调用LLM
                related_reqs = query_related_requirement(
                    code_content,
                    all_doc_blocks,
                    block_limit=50,
                    user_id=user_id,
                    project_path=project_path
                )

                # 转换结果为docRanges
                doc_ranges = []

                # 通过文件名和起止范围匹配
                blocks_by_file = defaultdict(list)
                for block in all_original_doc_blocks:
                    blocks_by_file[block.get("filename", "default")].append(block)

                for req in related_reqs:
                    req_start, req_end = req.get("range", [0, 0])
                    target_file = req.get("file", "default")
                    candidates = blocks_by_file.get(target_file, [])
                    for block in candidates:
                        if block.get("start", 0) <= req_start and block.get("end", 0) >= req_end:
                            doc_ranges.append(block)

                code_block['docRanges'] = doc_ranges
                add_alignment_data(project_path, code_block, project_id, user_id)
                continue

            # 如果选择了 align 知识库，使用 RAG 进行检索
            try:
                rag_engine.initialize()  # 确保初始化
            except Exception as e:
                print(f"[Align] RAG initialize failed: {e}")

            code_content = '\n\n'.join(
                [code_range.get('content', '') for code_range in code_ranges if code_range.get('content')])

            all_retrieved_items = []
            for kb_name in selected_align_kbs:
                # 检索 'align' 类型的知识库
                # 注意：align 知识库里存储的是历史对齐数据
                # 这里的检索策略可以是：用代码去搜相关的历史对齐，然后把历史对齐中的文档部分作为推荐

                # 暂时假设 rag_chroma 提供了 query 接口，如果没有需要添加
                # 这里先模拟直接调用 collection.query
                collection = rag_engine.get_collection('align', kb_name)
                if collection:
                    results = collection.query(
                        query_texts=[code_content],
                        n_results=5  # Top 5 per KB
                    )

                    if results and results['documents']:
                        for i, doc in enumerate(results['documents'][0]):
                            meta = results['metadatas'][0][i]
                            # 历史对齐数据通常包含 code_text 和 doc_text (query_text)
                            # 我们需要提取其中的 doc 部分
                            # 在 build_from_json 中，document 是 doc_text, meta 中有 code_text
                            # 但我们现在是用 code 去搜 doc，所以 doc 正好是 document
                            all_retrieved_items.append({
                                'content': doc,
                                'score': results['distances'][0][i] if results['distances'] else 0,
                                'meta': meta
                            })

            # 对所有结果排序
            all_retrieved_items.sort(key=lambda x: x['score'])  # distance 越小越好
            top_items = all_retrieved_items[:5]

            # 构造返回结果
            # 注意：这里返回的是参考的历史对齐文档内容，而不是当前项目中的具体需求块
            # 前端可能需要展示这些参考内容供用户选择，或者作为提示
            # 但目前的接口契约是返回 docRanges (当前项目的需求块)
            # 这是一个逻辑断层：历史对齐是"参考"，而不是"直接结果"
            # 如果要用历史对齐来辅助定位当前项目的需求，需要两步：
            # 1. 检索历史对齐 -> 得到相关的历史需求描述
            # 2. 用历史需求描述去匹配当前项目的需求块 (类似 query_related_requirement)

            history_doc_contents = [item['content'] for item in top_items]
            combined_history_content = "\n".join(history_doc_contents)

            # 再次读取当前项目的需求块
            doc_block_base_path = os.path.join(project_path, 'doc_block_repo')
            doc_block_file_path = os.path.join(doc_block_base_path, 'doc_blocks.jsonl')

            if not os.path.exists(doc_block_file_path):
                code_block['docRanges'] = []
                add_alignment_data(project_path, code_block, project_id, user_id)
                continue

            all_doc_blocks = []
            all_original_doc_blocks = []
            with open(doc_block_file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip():
                        original_doc_block = json.loads(line.strip())
                        all_doc_blocks.append({
                            "file": original_doc_block.get("filename", ''),
                            "range": [original_doc_block.get("start", 0), original_doc_block.get("end", 0)],
                            "content": original_doc_block.get("content", '')
                        })
                        all_original_doc_blocks.append(original_doc_block)

            # 使用历史需求内容 + 代码内容 共同作为 Query 去查询当前项目需求
            enhanced_query = f"Code:\n{code_content}\n\nRelated History Requirements:\n{combined_history_content}"

            # 调用LLM (使用增强后的 Query)
            related_reqs = query_related_requirement(
                enhanced_query,
                all_doc_blocks,
                block_limit=50,
                project_path=project_path
            )

            doc_ranges = []
            blocks_by_file = defaultdict(list)
            for block in all_original_doc_blocks:
                blocks_by_file[block.get("filename", "default")].append(block)

            for req in related_reqs:
                req_start, req_end = req.get("range", [0, 0])
                target_file = req.get("file", "default")
                candidates = blocks_by_file.get(target_file, [])
                for block in candidates:
                    if block.get("start", 0) <= req_start and block.get("end", 0) >= req_end:
                        doc_ranges.append(block)

            code_block['docRanges'] = doc_ranges
            add_alignment_data(project_path, code_block, project_id, user_id)

        self.update_state(
            state="SUCCESS",
            meta={}
        )

    except Exception as e:
        self.update_state(
            state="FAILURE",
            message=f"对齐过程中出错{e}"
        )
        logger.error(f'对齐 代码=>需求 过程中出错:{str(e)}', exc_info=True)
        raise RuntimeError(f'对齐 代码=>需求 过程中出错:{str(e)}') from e


def add_alignment_data(project_path, new_alignment, project_id, user_id):
    if not project_path or not new_alignment or 'id' not in new_alignment:
        return {"status": "error", "message": "缺少项目路径或无效的对齐数据。"}

    code_ranges = new_alignment['codeRanges']
    # --- 自动创建块的逻辑 ---
    try:
        # 1. 处理需求块
        doc_ranges = new_alignment.get('docRanges', [])
        if doc_ranges:
            doc_block_path = os.path.join(project_path, 'doc_block_repo', 'doc_blocks.jsonl')
            os.makedirs(os.path.dirname(doc_block_path), exist_ok=True)

            # 读取现有块以避免重复
            existing_doc_blocks = set()
            if os.path.exists(doc_block_path):
                with open(doc_block_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            b = json.loads(line.strip())
                            # 使用 tuple 作为 key
                            key = (b.get('filename'), b.get('start'), b.get('end'))
                            existing_doc_blocks.add(key)
                        except Exception as e:
                            logger.error(str(e), exc_info=True)

            blocks_to_add = []
            for dr in doc_ranges:
                # docRange结构通常包含 filename, start, end, content
                key = (dr.get('filename'), dr.get('start'), dr.get('end'))
                if key not in existing_doc_blocks:
                    # 构造标准块数据
                    block_data = {
                        "filename": dr.get('filename'),
                        "start": dr.get('start'),
                        "end": dr.get('end'),
                        "content": dr.get('content', '')
                    }
                    blocks_to_add.append(block_data)
                    existing_doc_blocks.add(key)  # 防止同一次请求中有重复

            '''if blocks_to_add:
                with open(doc_block_path, 'a', encoding='utf-8') as f:
                    for b in blocks_to_add:
                        f.write(json.dumps(b, ensure_ascii=False) + '\n')'''

        # 2. 处理代码块
        # code_ranges = code_ranges if code_ranges else []
        if code_ranges:
            code_block_path = os.path.join(project_path, 'code_block_repo', 'code_blocks.jsonl')
            os.makedirs(os.path.dirname(code_block_path), exist_ok=True)

            # 读取现有块并获取最大ID
            existing_code_blocks = set()
            max_id = 0
            if os.path.exists(code_block_path):
                with open(code_block_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            b = json.loads(line.strip())
                            # 匹配逻辑：file + range
                            b_range = b.get('range', [])
                            if len(b_range) == 2:
                                key = (b.get('file'), b_range[0], b_range[1])
                                existing_code_blocks.add(key)

                            bid = int(b.get('id', 0))
                            if bid > max_id: max_id = bid
                        except Exception as e:
                            logger.error(str(e), exc_info=True)

            blocks_to_add = []
            for cr in code_ranges:
                # codeRange结构通常包含 filename(or documentId), start, end, startLine, endLine, content
                # code_block需要: id, file, range[startLine, endLine], content
                # 注意：这里我们假设 codeRange 中的 startLine/endLine 是可靠的。
                # 如果 codeRange 中只有 start/end (offset)，我们需要转换吗？
                # 前端通常会发送 startLine/endLine。如果缺失，这里可能无法准确创建行级块。
                # 假设前端传了 startLine/endLine

                c_file = cr.get('filename') or cr.get('documentId')
                c_start_line = cr.get('startLine')
                c_end_line = cr.get('endLine')

                if c_file and c_start_line is not None and c_end_line is not None:
                    key = (c_file, c_start_line, c_end_line)
                    if key not in existing_code_blocks:
                        max_id += 1
                        block_data = {
                            "id": max_id,
                            "file": c_file,
                            "range": [c_start_line, c_end_line],
                            "content": cr.get('content', '')
                        }
                        blocks_to_add.append(block_data)
                        existing_code_blocks.add(key)

            if blocks_to_add:
                with open(code_block_path, 'a', encoding='utf-8') as f:
                    for b in blocks_to_add:
                        f.write(json.dumps(b, ensure_ascii=False) + '\n')

    except Exception as e:
        # print(f"Error auto-creating blocks: {e}")
        # 即使块创建失败，也不应该阻止对齐关系的保存，但最好记录日志
        logger.error(f"Error auto-creating blocks: {str(e)}", exc_info=True)


    conn = get_db_celery()
    cur = conn.cursor()
    try:
        # conn = get_db_conn(project_path)
        cur.execute(
            '''
            INSERT INTO alignments(id, user_id, project_id, name, isReviewed, reviewThoughts, docRanges, codeRanges, createdAt, updatedAt, is_code_review, is_alignment) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, %s, 1) 
            ON DUPLICATE KEY UPDATE 
                name = VALUES(name),
                isReviewed = VALUES(isReviewed),
                reviewThoughts = VALUES(reviewThoughts),
                docRanges = VALUES(docRanges),
                codeRanges = VALUES(codeRanges),
                updatedAt = CURRENT_TIMESTAMP,
                is_alignment = 1
            ''',
            (
                new_alignment.get('id'),
                user_id,
                project_id,
                new_alignment.get('name'),
                1 if new_alignment.get('isReviewed') else 0,
                new_alignment.get('reviewThoughts') or '',
                json.dumps(new_alignment.get('docRanges') or []),
                json.dumps(code_ranges or []),
                0
                # generated_requirement or ''
                # mermaid_code or ''
            )
        )
        conn.commit()
        # conn.close()
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        logger.error(f"写入对齐数据失败:{str(e)}", exc_info=True)
        return {"status": "error", "message": f"写入对齐数据失败: {e}"}
    finally:
        conn.close()

def gen_requirement(doc_ranges, code_ranges):
    generated_requirement = ''
    mermaid_code = ''

    # 反生成需求+流程图
    try:
        requirement_content = doc_ranges
        code_content = code_ranges

        # if not code_content:
        #     return jsonify({"status": "error", "message": "Missing code content"}), 400

        # 构建代码块列表，格式与现有函数兼容
        code_blocks = []
        if isinstance(code_content, list):
            for code_block in code_content:
                code_blocks.append({
                    'filename': code_block.get('filename', 'unknown'),
                    'content': code_block.get('content', '')
                })
        else:
            # 如果是字符串，创建单个代码块
            code_blocks.append({
                'filename': 'code',
                'content': code_content
            })

        # 调用LLM生成需求，传入参考需求内容
        generated_requirement = query_generated_requirement(code_blocks, requirement_content or "")

        # 调用LLM生成流程图
        mermaid_code = query_flow_chart(code_content if isinstance(code_content, str) else
                                        '\n\n'.join([block.get('content', '') for block in code_content]))

    except Exception as e:
        # print(f"Error generating reverse requirement: {str(e)}")
        logger.error(f"Error generating reverse requirement: {str(e)}", exc_info=True)
        # return jsonify({"status": "error", "message": f"Failed to generate reverse requirement: {str(e)}"}), 500
    
    return generated_requirement, mermaid_code
