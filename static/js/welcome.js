// ========================
// Vue & ElementPlus 初始化
// ========================
const { createApp, ref, reactive, watch, nextTick, computed } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;

// ========================
// 工具函数
// ========================
const parseLocalDateTime = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = String(value).trim();
    const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
    if (localMatch) {
        const [, year, month, day, hour, minute, second = '0'] = localMatch;
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second)
        );
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatRelativeTime = (isoString) => {
    if (!isoString) return '未知时间';
    const now = new Date();
    const past = parseLocalDateTime(isoString);
    if (!past) return '未知时间';
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) return '刚刚';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}分钟前`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}小时前`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return '昨天';
    if (diffInDays < 30) return `${diffInDays}天前`;

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths}个月前`;

    return `${Math.floor(diffInMonths / 12)}年前`;
};

// ========================
// Vue 应用
// ========================
const app = createApp({

    delimiters: ['${', '}'],
    setup() {
        // ====== 状态 ======
        const showNewProjForm = ref(false);
        const creationType = ref('blank');
        const isCreating = ref(false);

        const projectForm = reactive({
            projectName: '',
            projectLocation: '',
            parseDocMethod: 'default',
            secretLevel: ''
        });
        
        const recentProjects = ref([]);
        const showImportDialog = ref(false);
        const isImporting = ref(false);
        const folderUpload = ref(null);
        const selectedFolderFiles = ref([]);
        const selectedFolderName = ref('');
        const projectFolders = ref([]); // 存储从从后端获取数据库加载的文件夹列表
        const importProject = ref(''); // 当前选中的项目
        const importPath = ref(''); // 当前选中的项目路径
        const loading = ref(false); // 加载状态
        
        // ============================================================
        // 知识库管理逻辑
        // ============================================================
        const showImportReviewDialog = ref(false);
        const importStep = ref(0);
        const importDocType = ref('issue');
        
        // 文件源相关
        const fileSourceMode = ref('server'); // 'server' or 'local'
        const serverFileList = ref([]);
        const selectedServerFile = ref('');
        const importFileList = ref([]); // 本地上传文件列表

        // 审查相关
        const previewTableData = ref([]);
        const selectedReviewItems = ref([]);
        
        // 状态
        const isUploading = ref(false);
        const isCommitting = ref(false);
        const reviewTableRef = ref(null);

        // 详情弹窗
        const showDetailDialog = ref(false);
        const currentDetailItem = ref(null);
        
        const selectedExistingKb = ref('');

        // 获取服务器 testdata 文件列表
        const fetchServerFiles = async () => {
            try {
                const res = await axios.get('/api/list-testdata');
                if (res.data.status === 'success') {
                    serverFileList.value = res.data.files;
                }
            } catch (e) { console.error(e); }
        };

        const loadInitData = async () => {
            importStep.value = 0;
            importFileList.value = [];
            previewTableData.value = [];
            selectedReviewItems.value = [];
            if (importLockedKbName.value) {
                selectedExistingKb.value = importLockedKbName.value;
            } else {
                selectedExistingKb.value = '';
            }
            await fetchServerFiles();
        };

        const openImportReviewDialog = (lockedKbName = '') => {
            importLockedKbName.value = lockedKbName;
            showImportReviewDialog.value = true;
        };

        // 本地文件选择回调
        const handleImportFileChange = (_file, fileList) => {
            if (fileList.length > 1) fileList.splice(0, 1);
            importFileList.value = fileList;
            
        };
        
        const resolveTargetKb = () => {
            const targetName = importLockedKbName.value || selectedExistingKb.value;
            if (!targetName) return null;
            return kbList.value.find(kb => kb.name === targetName) || null;
        };

        // 开始解析
        const startPreview = async () => {
            const targetKb = resolveTargetKb();
            if (!targetKb) {
                ElMessage.warning('请先选择目标知识库');
                return;
            }
            importDocType.value = mapKbTypeToPreviewDocType(targetKb.type);

            const formData = new FormData();
            formData.append('doc_type', importDocType.value);
            
            if (fileSourceMode.value === 'server') {
                if (!selectedServerFile.value) {
                    ElMessage.warning('请选择一个服务器文件');
                    return;
                }
                formData.append('use_server_file', 'true');
                formData.append('filename', selectedServerFile.value);
            } else {
                if (importFileList.value.length === 0) {
                    ElMessage.warning('请先选择本地文件');
                    return;
                }
                formData.append('use_server_file', 'false');
                formData.append('file', importFileList.value[0].raw);
            }
            
            isUploading.value = true;
            try {
                const response = await axios.post('/preview', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (response.data.status === 'success') {
                    previewTableData.value = response.data.data;
                    
                    if (previewTableData.value.length === 0) {
                        ElMessage.warning("未解析到有效数据，请检查文档格式");
                    } else {
                        importStep.value = 1; 
                        // 自动全选
                        await nextTick();
                        if (reviewTableRef.value) {
                            reviewTableRef.value.toggleAllSelection();
                        }
                    }
                } else {
                    ElMessage.error(`解析失败: ${response.data.message}`);
                }
            } catch (error) {
                console.error(error);
                ElMessage.error('请求发生错误');
            } finally {
                isUploading.value = false;
            }
        };

        // 查看详情
        const viewDetail = (row) => {
            // Check if it's a KB item (has meta field) or a raw preview item
            let displayItem = {};
            
            // Key translation map
            const keyMap = {
                'id': '编号',
                'content': '内容',
                'desc': '描述',
                'description': '描述',
                'compliance_code': '遵循代码',
                'violation_code': '违背代码',
                'opinion': '意见',
                'trace_id': '跟踪ID',
                'source': '来源文件',
                'source_type': '来源类型',
                'category': '类别',
                'updateTime': '更新时间',
                'create_time': '创建时间',
                'code_text': '代码片段',
                'original_text': '原始内容',
                'pair_id': '配对编号',
                'code_index': '代码索引',
                'code_count': '代码总数',
                'orig_ann_id': '原始标注ID',
                'meta': '元数据',
                'GenReq': '生成需求',
                'GenMermaid': '生成流程图',
            };

            const translate = (key) => keyMap[key] || key;

            // 如果包含 meta 字段且是对象，说明是知识库条目
            if (row.meta && typeof row.meta === 'object') {
                displayItem['编号 (ID)'] = row.id;
                displayItem['内容 (Content)'] = row.content;
                
                for (const [k, v] of Object.entries(row.meta)) {
                    displayItem[translate(k)] = v;
                }
            } else {
                // 否则是导入预览条目
                for (const [k, v] of Object.entries(row)) {
                    displayItem[translate(k)] = v;
                }
            }

            currentDetailItem.value = displayItem;
            showDetailDialog.value = true;
        };

        // 提交入库
        const handleReviewSelectionChange = (val) => {
            selectedReviewItems.value = val;
        };

        const submitToKb = async () => {
            const targetKb = resolveTargetKb();
            if (!targetKb) {
                ElMessage.warning('请选择要追加的知识库');
                return;
            }

            isCommitting.value = true;
            try {
                const payload = {
                    kbType: targetKb.type,
                    kbName: targetKb.name,
                    append: true
                };
                
                if (fileSourceMode.value === 'server') {
                    payload.annotationFile = selectedServerFile.value;
                    payload.sourceFileName = selectedServerFile.value;
                } else {
                    if (importFileList.value.length > 0) {
                        payload.annotationFile = importFileList.value[0].name;
                        payload.sourceFileName = importFileList.value[0].name;
                    }
                }

                const response = await axios.post('/api/rag/build', payload);

                if (response.data.status === 'success') {
                    ElMessage.success('入库成功！');
                    showImportReviewDialog.value = false;
                    importLockedKbName.value = '';
                    selectedExistingKb.value = '';
                    await fetchKBs(); // 刷新列表，更新统计数据
                    if (currentKb.value && currentKb.value.name === targetKb.name) {
                        await fetchKbItems(currentKb.value);
                    }
                } else {
                    ElMessage.error(`入库失败: ${response.data.message}`);
                }
            } catch (error) {
                console.error(error);
                ElMessage.error('提交失败');
            } finally {
                isCommitting.value = false;
            }
        };

        // ========================
        // Project Management
        // ========================
        const fetchRecentProjects = async () => {
            try {
                const res = await axios.get('/project/recent-projects');
                if (res.data.status === 'success') {
                    recentProjects.value = res.data.recentProjects;
                }
            } catch (e) { console.error(e); }
        };

        const openNewProjectDialog = () => {
            projectForm.projectName = '';
            projectForm.projectLocation = '',
            projectForm.parseDocMethod = 'default'; // 或 'enhanced'
            selectedFolderFiles.value = [];
            selectedFolderName.value = '';
            showNewProjForm.value = true;
            
        };

        const handleNewProject = async () => {
            const projectLocation = 'testdata'//(projectForm.projectLocation || '').trim();
            let projectName = (projectForm.projectName || '').trim();
            let parseDocMethod = (projectForm.parseDocMethod || '').trim();
            let projectSecretLevel = projectForm.secretLevel || ''
            if (!projectSecretLevel) {
                ElMessage.error('请选择密级');
                return;
            }

            isCreating.value = true;
            //console.log(projectForm)
            try {
                if (selectedFolderFiles.value.length > 0) {
                    const formData = new FormData();
                    formData.append('projectName', projectName);
                    formData.append('projectLocation', projectLocation);
                    formData.append('folderName', selectedFolderName.value || projectName);
                    formData.append('parseDocMethod', parseDocMethod);
                    formData.append('projectSecretLevel', projectSecretLevel);

                    selectedFolderFiles.value.forEach(file => {
                        formData.append('files', file);
                        formData.append('paths', file.webkitRelativePath || file.name);
                    });
                                     
                    const resu = await axios.post('/project/upload-folder', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });

                    const res = await axios.post('/project/create', {
                        projectName: resu.data.projectName || projectName,
                        projectLocation: resu.data.serverPath || projectLocation,
                        parseDocMethod: parseDocMethod,
                        projectSecretLevel: projectSecretLevel,
                        creationType: 'folder',
                        project_id: resu.data.new_id
                    });
                    if (res.data.status === 'success') {
                        showNewProjForm.value = false;
                        ElMessage.success('创建成功');
                        window.projectId = res.data.new_id;
                        //console.log('resu.data.new_id:',resu.data.new_id)
                        openProject({
                            name: res.data.project_name || resu.data.projectName || projectName,
                            path: res.data.project_path || projectLocation,
                            project_id: resu.data.new_id
                        });
                    } 
                    
                    else {
                        ElMessage.error(res.data.message || '创建失败');
                    }
                } else {
                    const res = await axios.post('/project/create', {
                        projectName: projectName,
                        projectLocation: projectLocation,
                        projectSecretLevel: projectSecretLevel,
                        creationType: 'blank',
                        project_id: window.projectId
                    });
                    if (res.data.status === 'success') {
                        showNewProjForm.value = false;
                        ElMessage.success('创建成功');
                        window.projectId = res.data.new_id;
                        openProject({
                            name: res.data.project_name || projectName,
                            path: res.data.project_path || projectLocation,
                            project_id: res.data.new_id
                        });
                    } else {
                        ElMessage.error(res.data.message || '创建失败');
                    }
                }
            } catch (err) {
                ElMessage.error(err.response?.data?.message || '创建失败');
            } finally {
                isCreating.value = false;
            }
        };
        function getProjectId(project) {
            if (project && project.project_id !== undefined && project.project_id !== null){
                return project.project_id;
            }
            if (window.projectId !== null) {
                return window.projectId
            }
            return null
        }

        const openProject = (project) => {
            console.log('project:', project)
            const project_id = getProjectId(project);
            console.log('project_id:', project_id)
            let secretLevel = projectForm.secretLevel || project.secret_level
            axios.post('/project/open', {
                name: project.name,
                path: project.path,
                project_id: project_id
            }).then((res) => {
                if (res.data.status === 'success') {
                    // Pass the verified path to the next page via URL query parameters
                    const verifiedPath = res.data.project_path || project.path;
                    const encodedPath = encodeURIComponent(verifiedPath);
                    const encodedName = encodeURIComponent(project.name);
                    const project_id = res.data.project_id
                    window.location.href = `/project?name=${encodedName}&path=${encodedPath}&project_id=${project_id}&secretLevel=${secretLevel}`;
                } else {
                    ElMessage.error(res.data.message);
                }
            }).catch(err => {
                const msg = err.response?.data?.message || '打开项目失败';
                ElMessage.error(msg);
            });
        };

        const openImportDialog = () => {
            showImportDialog.value = true;
            importPath.value = '';
        };

        const handleImportProject = async() => {
            
            if (!importPath.value) {
                ElMessage.error('项目文件夹路径不能为空！');
                return;
            }
            isImporting.value = true; 

            axios.post('/project/import', { path: importPath.value })
                .then(res => {
                    if (res.data.status === 'success') {
                        showImportDialog.value = false;
                        openProject(res.data.project);
                    }
                })
                .catch(err => {
                    ElMessage.error(`导入失败: ${err.response?.data?.message || err.message}`);
                })
                .finally(() => {
                    isImporting.value = false;
                }); 
        };
        

        // 新增：加载项目列表
        const loadProjectFolders = async () => {
            loading.value = true;
            try {
                const res = await axios.get('/welcome/get_user_projects');
                if (res.data.status === 'success') {
                    const names = res.data.name || [];
                    const paths = res.data.path || [];
                    projectFolders.value = names.map((name, index) => ({
                        id: index,
                        label: name.trim(),
                        value: name.trim(),
                        path: paths[index].trim() || ''
                    }));

                    await nextTick();
                    //console.log(projectFoldersList)
                    // 默认选中第一个项目
                    if (projectFolders.value.length > 0) {
                        importPath.value = projectFolders.value[0].path;
                        importProject.value = projectFolders.value[0].value;
                        //console.log(importPath.value)
                        //console.log(importProject.value)
                }
                } else{
                    ElMessage.error('加载项目列表失败');
                    throw new Error('Failed to load projects');
                }
                
            } catch (error) {
                ElMessage.error('加载项目列表失败，请重试');
            } finally {
                loading.value = false;
            }
        };
 
        // 监听下拉框展开/收起
        const handleVisibleChange = (visible) => {
            if (visible && projectFolders.value.length === 0) {
                loadProjectFolders();
            } 
        };
        
        const handleSelectChange = (value) => {
            console.log('选中项目:', value);
            // 可选：触发其他逻辑
        };

        const triggerFolderUpload = () => {
            folderUpload.value.click();
        };

        const handleFolderUpload = async (event) => {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            try {
                const firstFile = files[0];
                const pathParts = firstFile.webkitRelativePath.split('/');
                const folderName = pathParts[0];
                selectedFolderFiles.value = files;
                selectedFolderName.value = folderName;

                // 密级映射
                const secretLevelMap = {
                    '公开': 'public',
                    '内部': 'internal',
                    '秘密': 'secret',
                    '机密': 'confidential'
                }

                // 自动识别密级 (兼容中英混用括号)
                const match = folderName.match(/[（(](公开|内部|秘密|机密)[）)]/);
                if (match) {
                    const detected = secretLevelMap[match[1]];
                    if (detected) {
                        projectForm.secretLevel = detected;
                    }
                }

                if (!projectForm.projectName) {
                    projectForm.projectName = folderName;
                }

                ElMessage.success(`已选择源文件夹：${folderName}（${files.length} 个文件）密级: ${projectForm.secretLevel}`);
            } catch (error) {
                console.error('文件夹选择失败:', error);
                ElMessage.error(`选择失败: ${error.message}`);
            }

            // 清空文件选择
            event.target.value = '';
        };
       

        const refreshHistory = async () => {
            await fetchRecentProjects();
        };

        const isAllSelected = computed({
            get() {
                if (recentProjects.value.length === 0) return false;
                return recentProjects.value.every(p => p.selected);
            },
            set(value) {
                recentProjects.value.forEach(p => p.selected = value);
            }
        });

        const handleDelete = async () => {
            const selectedList = recentProjects.value.filter(p => p.selected);

            if (selectedList.length === 0) {
                alert('请先选择要删除的项目');
                return;
            }

            if (!confirm(`确定要删除选中的${selectedList.length}个项目吗?`)){
                return;
            }

            try {
                const ids = selectedList.map(p => p.id);
                const paths = selectedList.map(p => p.path);
                // 调用删除接口
                await axios.delete('/project/delete', {
                    data: { paths: paths, ids: ids }
                });
                await fetchRecentProjects(); // 刷新列表
            } catch (error) {
                ElMessage.error(`删除失败: ${error.response?.data?.message || error.message}`);
            }
        }

        // 上下文菜单方法
        const showContextMenu = (event, project) => {
            event.preventDefault();
            contextMenu.show = true;
            contextMenu.x = event.clientX;
            contextMenu.y = event.clientY;
            contextMenu.project = project;
        };

        const hideContextMenu = () => {
            contextMenu.show = false;
            contextMenu.project = null;
        };

        const deleteHistoryItem = async () => {
            if (!contextMenu.project) return;
            
            try {
                const project_id = getProjectId(contextMenu.project);
                await axios.delete('/project/delete', {
                    data: { path: contextMenu.project.path, project_id: project_id }
                });
                await fetchRecentProjects(); // 刷新列表
            } catch (err) {
                console.error('删除历史记录失败:', err);
                ElMessage.error(`删除失败: ${err.response?.data?.message || err.message}`);
            } finally {
                hideContextMenu();
            }
        };
        
        const contextMenu = reactive({
            show: false,
            x: 0,
            y: 0,
            project: null
        });

        // ====== 监听 ======
        watch(() => projectForm.projectLocation, (newPath) => {
            if (newPath) {
                const pathParts = newPath.replace(/\\/g, '/').split('/');
                const folderName = pathParts.pop() || pathParts.pop();
                if (folderName) {
                    projectForm.projectName = folderName;
                }
            }
        });

        // ========================
        // KB Management
        // ========================
        const kbList = ref([]);
        const kbFilter = ref('all');
        const kbSort = ref('time_desc');
        const showCreateKbDialog = ref(false);
        const isCreatingKb = ref(false);
        const createKbForm = reactive({
            name: '',
            description: '',
            security_level: '内部',
            type: 'coding_rule',
            language: '中文',
            parse_method: '通用解析方法',
            editors: '',
            viewers: ''
        });
        const currentKb = ref(null);
        const kbItems = ref([]);
        const currentKbDocument = ref(null);
        const importLockedKbName = ref('');

        const fetchKBs = async () => {
            try {
                const res = await axios.get('/api/list-kbs');
                if (res.data.status === 'success') {
                    kbList.value = res.data.kbs;
                }
            } catch (e) { console.error("Fetch KBs failed", e); }
        };

        const filteredKBs = computed(() => {
            let list = kbList.value.slice();
            
            if (kbFilter.value !== 'all') {
                if (kbFilter.value === 'align') {
                    list = list.filter(kb => ['align', 'history_align'].includes(kb.type));
                } else {
                    list = list.filter(kb => kb.type === kbFilter.value);
                }
            }
            
            list.sort((a, b) => {
                const dateA = new Date(a.create_time);
                const dateB = new Date(b.create_time);
                
                if (kbSort.value === 'time_desc') return dateB - dateA;
                if (kbSort.value === 'time_asc') return dateA - dateB;
                if (kbSort.value === 'name_asc') return a.name.localeCompare(b.name);
                return 0;
            });
            
            return list;
        });

        const mapKbTypeToPreviewDocType = (kbType) => {
            const type = (kbType || '').trim();
            if (['coding_rule', 'checklist', 'rule'].includes(type)) return 'rule';
            if (['history_issue', 'issue'].includes(type)) return 'issue';
            if (['history_align', 'align'].includes(type)) return 'history_align';
            return 'rule';
        };

        const parseUserList = (value) => {
            if (!value) return [];
            return value
                .split(/[，,;；\s]+/)
                .map(v => v.trim())
                .filter(Boolean);
        };

        const openCreateKbDialog = () => {
            createKbForm.name = '';
            createKbForm.description = '';
            createKbForm.security_level = '内部';
            createKbForm.type = 'coding_rule';
            createKbForm.language = '中文';
            createKbForm.parse_method = '通用解析方法';
            createKbForm.editors = '';
            createKbForm.viewers = '';
            showCreateKbDialog.value = true;
        };

        const openImportDialogForKb = (kb) => {
            if (!kb) return;
            selectedExistingKb.value = kb.name;
            importDocType.value = mapKbTypeToPreviewDocType(kb.type);
            openImportReviewDialog(kb.name);
        };

        const createKbAndContinueUpload = async () => {
            const kbName = (createKbForm.name || '').trim();
            if (!kbName) {
                ElMessage.warning('请输入知识库名称');
                return;
            }
            if (kbName.includes(' ')) {
                ElMessage.warning('知识库名称不能包含空格');
                return;
            }

            isCreatingKb.value = true;
            try {
                const payload = {
                    name: kbName,
                    description: createKbForm.description,
                    security_level: createKbForm.security_level,
                    type: createKbForm.type,
                    language: createKbForm.language,
                    parse_method: createKbForm.parse_method,
                    editors: parseUserList(createKbForm.editors),
                    viewers: parseUserList(createKbForm.viewers)
                };
                const res = await axios.post('/api/kb/create', payload);
                if (res.data.status === 'success') {
                    showCreateKbDialog.value = false;
                    ElMessage.success('知识库创建成功，请继续上传文件');
                    await fetchKBs();
                    openImportDialogForKb(res.data.kb || payload);
                } else {
                    ElMessage.error(res.data.message || '创建失败');
                }
            } catch (e) {
                ElMessage.error(`创建失败: ${e.response?.data?.message || e.message}`);
            } finally {
                isCreatingKb.value = false;
            }
        };

        const kbDocuments = computed(() => {
            const groups = new Map();
            (kbItems.value || []).forEach((item) => {
                const meta = item.meta || {};
                const fallbackDocName = (currentKb.value && currentKb.value.source_file)
                    ? String(currentKb.value.source_file).trim()
                    : '未标注文档';
                const sourceName = (
                    meta.source_file ||
                    meta.source ||
                    meta.filename ||
                    meta.file ||
                    meta.document ||
                    meta.doc_name ||
                    ''
                ).toString().trim() || fallbackDocName;
                if (!groups.has(sourceName)) {
                    groups.set(sourceName, {
                        id: sourceName,
                        name: sourceName,
                        itemCount: 0,
                        updateTime: meta.updateTime || '',
                        items: []
                    });
                }
                const group = groups.get(sourceName);
                group.items.push(item);
                group.itemCount += 1;
                if (!group.updateTime && meta.updateTime) {
                    group.updateTime = meta.updateTime;
                }
            });
            return Array.from(groups.values()).sort((a, b) => b.itemCount - a.itemCount);
        });

        const openKbDocumentDetail = (doc) => {
            currentKbDocument.value = doc;
        };

        const DeleteKbsFile = async (file_name) => {
            if (!currentKb.value) return;
            try {
                const res = await axios.post('/api/kb/file/delete', {
                    kbName: currentKb.value.name,
                    kbType: currentKb.value.type,
                    file_name: file_name
                });
                if (res.data.status === 'success') {
                    fetchKbItems(currentKb.value)
                } else {
                    ElMessage.error(res.data.message);
                }
            } catch (e) {
                ElMessage.error("获取知识库文件失败");
            }
        };

        const openAddFileInKb = () => {
            if (!currentKb.value) return;
            openImportDialogForKb(currentKb.value);
        };

        const backToKbList = () => {
            currentKb.value = null;
            currentKbDocument.value = null;
            kbItems.value = [];
        };

        const backToKbDocuments = () => {
            currentKbDocument.value = null;
        };

        const getKbTypeName = (type) => {
            const map = {
                'coding_rule': '编码规则',
                'history_issue': '历史问题',
                'align': '对齐知识库',
                'typical_case': '典型案例',
                'checklist': '必查清单',
                'other': '其他',
                // 兼容旧类型
                'rule': '编码规则',
                'issue': '历史问题',
                'history_align': '对齐知识库'
            };
            return map[type] || type || '未知';
        };

        const handleKbAction = (cmd, kb) => {
            if (cmd === 'view') {
                currentKb.value = kb;
                currentKbDocument.value = null;
                fetchKbItems(kb);
            } else if (cmd === 'rename') {
                ElMessageBox.prompt('请输入新的知识库名称', '重命名', {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                    inputValue: kb.name,
                    inputPattern: /\S+/,
                    inputErrorMessage: '名称不能为空'
                }).then(({ value }) => {
                    renameKb(kb, value);
                }).catch(() => {});
            } else if (cmd === 'delete') {
                ElMessageBox.confirm(
                    `确定要永久删除知识库 "${kb.name}" 吗？此操作不可恢复。`,
                    '警告',
                    {
                        confirmButtonText: '删除',
                        cancelButtonText: '取消',
                        type: 'warning',
                    }
                ).then(() => {
                    deleteKb(kb);
                }).catch(() => {});
            }
        };

        const fetchKbItems = async (kb) => {
            try {
                const res = await axios.get('/api/kb/items', {
                    params: { name: kb.name, type: kb.type, limit: 99999999 }
                });
                if (res.data.status === 'success') {
                    kbItems.value = res.data.items;
                } else {
                    ElMessage.error(res.data.message);
                }
            } catch (e) {
                ElMessage.error("获取条目失败");
            }
        };

        const deleteKbItem = async (item) => {
            if (!currentKb.value) return;
            try {
                const res = await axios.post('/api/kb/item/delete', {
                    kbName: currentKb.value.name,
                    kbType: currentKb.value.type,
                    itemId: item.id
                });
                if (res.data.status === 'success') {
                    ElMessage.success("条目已删除");
                    // Remove from list
                    kbItems.value = kbItems.value.filter(i => i.id !== item.id);
                    if (currentKbDocument.value) {
                        currentKbDocument.value = {
                            ...currentKbDocument.value,
                            items: currentKbDocument.value.items.filter(i => i.id !== item.id),
                            itemCount: Math.max((currentKbDocument.value.itemCount || 1) - 1, 0)
                        };
                    }
                    // Refresh KB list to update count
                    fetchKBs();
                } else {
                    ElMessage.error(res.data.message);
                }
            } catch (e) {
                ElMessage.error("删除失败");
            }
        };

        const renameKb = async (kb, newName) => {
            try {
                const res = await axios.post('/api/kb/rename', {
                    oldName: kb.name,
                    newName: newName,
                    type: kb.type
                });
                if (res.data.status === 'success') {
                    ElMessage.success("重命名成功");
                    fetchKBs();
                } else {
                    ElMessage.error(res.data.message);
                }
            } catch (e) {
                ElMessage.error("请求失败");
            }
        };

        const deleteKb = async (kb) => {
            try {
                const res = await axios.post('/api/kb/delete', {
                    name: kb.name,
                    type: kb.type
                });
                if (res.data.status === 'success') {
                    ElMessage.success("删除成功");
                    fetchKBs();
                } else {
                    ElMessage.error(res.data.message);
                }
            } catch (e) {
                ElMessage.error("请求失败");
            }
        };

        // 过滤出与当前选中类型相同的、可追加的知识库列表
        const existingKbsForAppend = computed(() => {
            return kbList.value.slice();
        });

        // ====== 初始化 ======
        fetchRecentProjects();
        fetchKBs();

        // ====== 暴露到模板 ======
        return {
            showNewProjForm,
            creationType,
            projectForm,
            isCreating,
            recentProjects,
            isAllSelected,
            handleDelete, 
            handleVisibleChange,// 新增
            loadProjectFolders,// 新增
            handleSelectChange,// 新增
            projectFolders,// 新增
            handleNewProject,
            openNewProjectDialog,
            formatRelativeTime,
            openProject,
            showImportDialog,
            importPath,
            importProject,
            isImporting,
            openImportDialog,
            handleImportProject,
            folderUpload,
            selectedFolderName,
            triggerFolderUpload,
            handleFolderUpload,
            refreshHistory,
            contextMenu,
            showContextMenu,
            hideContextMenu,
            deleteHistoryItem,
            
            // 知识库相关
            showImportReviewDialog,
            importStep,
            importDocType,
            fileSourceMode,
            serverFileList,
            selectedServerFile,
            importFileList,
            previewTableData,
            selectedReviewItems,
            isUploading,
            isCommitting,
            reviewTableRef,
            showDetailDialog,
            currentDetailItem,
            
            openImportReviewDialog,
            loadInitData,
            fetchServerFiles,
            handleImportFileChange,
            startPreview,
            viewDetail,
            handleReviewSelectionChange,
            submitToKb,
            
            // KB List
            kbList,
            kbFilter,
            kbSort,
            filteredKBs,
            getKbTypeName,
            fetchKBs,
            showCreateKbDialog,
            openCreateKbDialog,
            createKbForm,
            createKbAndContinueUpload,
            isCreatingKb,
            
            // KB Actions
            handleKbAction,
            backToKbList,
            backToKbDocuments,
            currentKb,
            kbItems,
            kbDocuments,
            openKbDocumentDetail,
            DeleteKbsFile,
            currentKbDocument,
            openAddFileInKb,
            deleteKbItem,
            selectedExistingKb,
            existingKbsForAppend,
            importLockedKbName,
            
            // Formatters
            formatDetailValue: (val) => {
                if (typeof val === 'object') {
                    return JSON.stringify(val, null, 2);
                }
                return val;
            }
        };
    }
});

// 注册 ElementPlus
app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, comp);
}
app.mount('#app');


// ========================
// DOM 相关（导航切换）
// ========================
const navItems = document.querySelectorAll('.nav-item');
const sections = {
    'start': document.getElementById('start-section'),
    'annotation': document.getElementById('annotation-section'),
    'kb': document.getElementById('kb-section'),
};

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const sectionId = item.getAttribute('data-section');
        
        // 更新导航状态
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // 切换内容区
        Object.values(sections).forEach(section => {
            section.style.display = 'none';
        });
        if (sections[sectionId]) {
            sections[sectionId].style.display = 'flex';
        }
    });
});

// 默认点击第一个
document.querySelector('.nav-item')?.click();
