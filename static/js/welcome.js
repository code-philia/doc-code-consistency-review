// ========================
// Vue & ElementPlus 初始化
// ========================
const { createApp, ref, reactive, watch, nextTick, computed } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;

// ========================
// 工具函数
// ========================
const formatRelativeTime = (isoString) => {
    if (!isoString) return '未知时间';
    const now = new Date();
    const past = new Date(isoString);
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
        });

        const recentProjects = ref([]);
        const showImportDialog = ref(false);
        const importPath = ref('');
        const isImporting = ref(false);
        const folderUpload = ref(null);

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
        const targetKbName = ref('');
        
        // 状态
        const isUploading = ref(false);
        const isCommitting = ref(false);
        const reviewTableRef = ref(null);

        // 详情弹窗
        const showDetailDialog = ref(false);
        const currentDetailItem = ref(null);
        
        // 监听文档类型变化
        // 注意：不再强制重置 targetKbName，以免覆盖用户输入
        // watch(importDocType, (newVal) => {
        //     // Optionally hint user?
        // });

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
            targetKbName.value = ''; // Reset name
            await fetchServerFiles();
        };

        const openImportReviewDialog = () => {
            showImportReviewDialog.value = true;
        };

        // 本地文件选择回调
        const handleImportFileChange = (file, fileList) => {
            if (fileList.length > 1) fileList.splice(0, 1);
            importFileList.value = fileList;
            
            // Auto fill name from filename
            if (file && file.name) {
                const name = file.name.substring(0, file.name.lastIndexOf('.'));
                targetKbName.value = name;
            }
        };
        
        // Server file selection change
        watch(selectedServerFile, (newVal) => {
            if (newVal) {
                const name = newVal.substring(0, newVal.lastIndexOf('.'));
                targetKbName.value = name;
            }
        });

        // 开始解析
        const startPreview = async () => {
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
                        ElMessage.warning("未解析到有效数据，请检查文档格式或选择正确的文档类型");
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
                'GenMermaid': '生成流程图'
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
            if (!targetKbName.value) {
                 ElMessage.warning('请输入知识库名称');
                 return;
            }

            isCommitting.value = true;
            try {
                // Prepare payload for /api/rag/build
                const payload = {
                    kbType: importDocType.value,
                    kbName: targetKbName.value,
                    // Pass the file identifier
                };
                
                if (fileSourceMode.value === 'server') {
                    payload.annotationFile = selectedServerFile.value;
                } else {
                    // For local file, we use the filename, assuming it was saved to temp_uploads during preview
                    // CAUTION: 'preview' API saved it. 'build' API checks temp_uploads.
                    if (importFileList.value.length > 0) {
                        payload.annotationFile = importFileList.value[0].name;
                    }
                }

                const response = await axios.post('/api/rag/build', payload);

                if (response.data.status === 'success') {
                    ElMessage.success('入库成功！');
                    showImportReviewDialog.value = false;
                    // 刷新列表
                    await fetchKBs();
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
            showNewProjForm.value = true;
        };

        const handleNewProject = () => {
            if (!projectForm.projectName || !projectForm.projectLocation) {
                ElMessage.error('请填写完整信息');
                return;
            }
            isCreating.value = true;
            
            axios.post('/project/create', {
                ...projectForm,
                creationType: creationType.value
            })
            .then(res => {
                if (res.data.status === 'success') {
                    showNewProjForm.value = false;
                    ElMessage.success('创建成功');
                    openProject({ name: projectForm.projectName, path: res.data.project_path });
                } else {
                    ElMessage.error(res.data.message);
                }
            })
            .catch(err => {
                ElMessage.error(err.response?.data?.message || '创建失败');
            })
            .finally(() => {
                isCreating.value = false;
            });
        };

        const openProject = (project) => {
            axios.post('/project/open', {
                name: project.name,
                path: project.path
            }).then((res) => {
                if (res.data.status === 'success') {
                    // Pass the verified path to the next page via URL query parameters
                    const verifiedPath = res.data.project_path || project.path;
                    const encodedPath = encodeURIComponent(verifiedPath);
                    const encodedName = encodeURIComponent(project.name);
                    
                    window.location.href = `/project?name=${encodedName}&path=${encodedPath}`;
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

        const handleImportProject = () => {
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

        const triggerFolderUpload = () => {
            folderUpload.value.click();
        };

        const handleFolderUpload = async (event) => {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            try {
                // 创建FormData对象
                const formData = new FormData();
                
                // 获取文件夹名称（从第一个文件的路径中提取）
                const firstFile = files[0];
                const pathParts = firstFile.webkitRelativePath.split('/');
                const folderName = pathParts[0];
                
                // 添加所有文件到FormData
                files.forEach(file => {
                    formData.append('files', file);
                    formData.append('paths', file.webkitRelativePath);
                });
                
                formData.append('folderName', folderName);
                
                ElMessage.info('正在上传文件夹，请稍候...');
                
                // 发送到后端
                const response = await axios.post('/project/upload-folder', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                });
                
                if (response.data.status === 'success') {
                    // 自动填充项目信息
                    projectForm.projectName = folderName;
                    projectForm.projectLocation = response.data.serverPath;
                } else {
                    ElMessage.error(response.data.message || '上传失败');
                }
                
            } catch (error) {
                console.error('文件夹上传失败:', error);
                ElMessage.error(`上传失败: ${error.response?.data?.message || error.message}`);
            }
            
            // 清空文件选择
            event.target.value = '';
        };

        const refreshHistory = async () => {
            await fetchRecentProjects();
        };

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
                await axios.delete('/project/history', {
                    data: { path: contextMenu.project.path }
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
            if (creationType.value === 'folder' && newPath) {
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
        const showKbViewDialog = ref(false);
        const currentKb = ref(null);
        const kbItems = ref([]);

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
                list = list.filter(kb => kb.type === kbFilter.value);
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

        const getKbTypeName = (type) => {
            const map = { 'rule': '编程规则', 'issue': '问题单', 'align': '历史对齐', 'other': '其他' };
            return map[type] || type || '未知';
        };

        const handleKbAction = (cmd, kb) => {
            if (cmd === 'view') {
                currentKb.value = kb;
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
                    params: { name: kb.name, type: kb.type, limit: 100 }
                });
                if (res.data.status === 'success') {
                    kbItems.value = res.data.items;
                    showKbViewDialog.value = true;
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
            handleNewProject,
            openNewProjectDialog,
            formatRelativeTime,
            openProject,
            showImportDialog,
            importPath,
            isImporting,
            openImportDialog,
            handleImportProject,
            folderUpload,
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
            targetKbName,
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
            
            // KB Actions
            handleKbAction,
            showKbViewDialog,
            currentKb,
            kbItems,
            deleteKbItem
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
