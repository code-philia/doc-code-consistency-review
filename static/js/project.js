/****************************
 * 全局状态与配置
 ****************************/
let activeView = 'statsView'; // 当前活动视图

const { createApp, ref, onMounted, computed } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;
import {
    regularizeFileContent, renderMarkdown, formatCodeWithLineNumbers
} from './utils.js';

/****************************
 * 工具函数
 ****************************/
/**
 * 切换视图
 * @param {string} viewName - 'stats' 或 'alignment'
 */
function switchView(viewName) {
    // 隐藏所有视图
    document.getElementById('statsView').style.display = 'none';
    document.getElementById('alignmentView').style.display = 'none';

    // 显示当前视图
    const viewElement = document.getElementById(viewName + 'View');
    viewElement.style.display = (viewName === 'stats') ? 'block' : 'flex';
    activeView = viewName + 'View';

    // 更新按钮状态
    document.getElementById('statsButton').classList.remove('active');
    document.getElementById('alignmentButton').classList.remove('active');
    document.getElementById(viewName + 'Button').classList.add('active');
}
window.switchView = switchView;

/** 占位功能：预览 */
function previewPanel() {
    alert('预览功能将在后续实现');
}

/** 占位功能：导出 */
function exportPanel() {
    alert('导出功能将在后续实现');
}

/****************************
 * Vue 应用
 ****************************/

const app = createApp({
    delimiters: ['${', '}'],
    setup() {
        /***********************
         * 基础状态
         ***********************/
        const urlParams = new URLSearchParams(window.location.search);
        const projectName = ref(urlParams.get('name') || '未命名项目');
        const projectPath = ref(urlParams.get('path') || '未知路径');

        const projectFiles = ref({
            code_files: [],
            doc_files: [],
            meta_files: ['metadata.json']
        });

        const selectedDocFile = ref('');
        const selectedCodeFile = ref('');
        const selectedDocContent = ref('');
        const selectedCodeContent = ref('');

        /***********************
         * 文件加载相关方法
         ***********************/
        const fetchProjectMetadata = async () => {
            if (!projectPath.value) {
                ElMessage.error("项目路径不存在，无法加载文件列表。");
                return;
            }
            try {
                const response = await axios.get(`/project/metadata?path=${encodeURIComponent(projectPath.value)}`);
                if (response.data.status === 'success') {
                    const metadata = response.data.metadata;
                    projectFiles.value.code_files = metadata.code_files || [];
                    projectFiles.value.doc_files = metadata.doc_files || [];
                    projectName.value = metadata.project_name || projectName.value;
                } else {
                    ElMessage.error(`加载项目元数据失败: ${response.data.message}`);
                }
            } catch (err) {
                console.error("Error fetching project metadata:", err);
                ElMessage.error(`加载项目元数据失败: ${err.message}`);
            }
        };

        const fetchFileContent = async (fileName, fileType) => {
            if (!projectPath.value) {
                ElMessage.error("项目路径不存在，无法加载文件内容。");
                return;
            }
            try {
                // 确保对齐视图被激活
                if (activeView !== 'alignmentView') {
                    switchView('alignment');
                }

                const response = await axios.get(`/project/file-content?path=${encodeURIComponent(projectPath.value)}&filename=${encodeURIComponent(fileName)}&type=${fileType}`);
                if (response.data.status === 'success') {
                    const content = regularizeFileContent(response.data.content, fileType);
                    try {
                        if (fileType === 'doc') {
                            selectedDocFile.value = fileName;
                            selectedDocContent.value = await renderMarkdown(content);
                        } else if (fileType === 'code') {
                            selectedCodeFile.value = fileName;
                            selectedCodeContent.value = formatCodeWithLineNumbers(content);
                        }
                    } catch (e) {
                        renderError.value = e.message;
                        renderedDocument = '<div class="render-error">渲染失败，请检查源文件格式。</div>';
                        console.error(e);
                    }
                } else {
                    ElMessage.error(`加载文件内容失败: ${response.data.message}`);
                }
            } catch (err) {
                console.error("Error fetching file content:", err);
                ElMessage.error(`加载文件内容失败: ${err.message}`);
            }
        };

        const buildFileTree = (files, fileType) => {
            const tree = [];
            const root = {};

            files.forEach(path => {
                // 兼容'\'和'/'两种路径分隔符
                const parts = path.replace(/\\/g, '/').split('/');
                let currentLevel = root;

                parts.forEach((part, index) => {
                    if (!currentLevel[part]) {
                        currentLevel[part] = {};
                    }

                    if (index === parts.length - 1) {
                        // 这是文件节点
                        currentLevel[part].__isFile = true;
                        currentLevel[part].__path = path;
                        currentLevel[part].__fileType = fileType;
                    }
                    currentLevel = currentLevel[part];
                });
            });

            const convertToTreeNodes = (node, pathPrefix = '') => {
                return Object.keys(node).map(key => {
                    const currentPath = pathPrefix ? `${pathPrefix}/${key}` : key;
                    if (key.startsWith('__')) return null;

                    const childNode = node[key];
                    if (childNode.__isFile) {
                        return {
                            label: key,
                            path: childNode.__path,
                            type: 'file',
                            fileType: childNode.__fileType,
                            icon: childNode.__fileType === 'doc' ? 'fas fa-file-word' : 'fas fa-file-code'
                        };
                    } else {
                        return {
                            label: key,
                            path: currentPath,
                            type: 'directory',
                            icon: 'fas fa-folder',
                            children: convertToTreeNodes(childNode, currentPath).filter(n => n)
                        };
                    }
                }).filter(n => n);
            };

            return convertToTreeNodes(root);
        };

        const docFileTree = computed(() => buildFileTree(projectFiles.value.doc_files, 'doc'));
        const codeFileTree = computed(() => buildFileTree(projectFiles.value.code_files, 'code'));

        const handleNodeClick = (data) => {
            if (data.type === 'file') {
                fetchFileContent(data.path, data.fileType);
            }
        };

        /***********************
         * 文件上传
         ***********************/
        const addFile = (fileType, selectionMode) => {
            const input = document.createElement('input');
            input.type = 'file';

            // 'file'模式下允许选择多个文件
            input.multiple = selectionMode === 'file';

            if (selectionMode === 'folder') {
                input.webkitdirectory = true;
            }

            // 对文档类型进行文件格式过滤
            if (fileType === 'doc') {
                input.accept = '.md,.docx';
            }

            input.onchange = async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) {
                    return; // 用户取消了选择
                }

                const formData = new FormData();
                formData.append('path', projectPath.value);
                formData.append('fileType', fileType);

                for (let i = 0; i < files.length; i++) {
                    // 如果是文件夹上传，浏览器会提供 webkitRelativePath
                    const path = files[i].webkitRelativePath || files[i].name;
                    formData.append('files', files[i], path);
                }

                ElMessage.info('文件正在上传，请稍候...');

                try {
                    const response = await axios.post('/project/upload-files', formData, {
                        headers: {
                            'Content-Type': 'multipart/form-data'
                        }
                    });

                    if (response.data.status === 'success') {
                        ElMessage.success('文件上传成功！');
                        await fetchProjectMetadata(); // 刷新文件列表
                    } else {
                        ElMessage.error(`上传失败: ${response.data.message}`);
                    }
                } catch (err) {
                    console.error("Error uploading files:", err);
                    ElMessage.error(`上传文件时发生网络错误: ${err.message}`);
                }
            };

            input.click();
        };


        /***********************
         * 问题单管理
         ***********************/
        const issues = ref([
            {
                level: 'high',
                description: '需求“用户登录功能”未在代码中实现。',
                relatedReq: '用户登录功能.md:L5-L10',
                relatedCode: 'auth.js:L20-L45',
                status: 'unconfirmed'
            },
            {
                level: 'medium',
                description: '函数`calculate_tax`的计算逻辑与需求文档不一致。',
                relatedReq: '税务计算需求.md:L15-L20',
                relatedCode: 'tax_calculator.py:L100',
                status: 'unconfirmed'
            },
            {
                level: 'low',
                description: '代码注释不完整，不符合规范。',
                relatedReq: '无',
                relatedCode: 'main.c:L30-L35',
                status: 'unconfirmed'
            },
            {
                level: 'high',
                description: 'SQL注入漏洞风险，参数未正确清理。',
                relatedReq: '安全规范.md:L25',
                relatedCode: 'database.php:L50',
                status: 'unconfirmed'
            },
            {
                level: 'high',
                description: 'SQL注入漏洞风险，参数未正确清理。',
                relatedReq: '安全规范.md:L25',
                relatedCode: 'database.php:L50',
                status: 'confirmed'
            }
        ]);
        const selectedIssue = ref(null);

        const selectIssue = (issue) => {
            selectedIssue.value = issue;
        };

        const confirmIssue = () => {
            if (!selectedIssue.value) {
                ElMessage.warning('请先选择一个问题单。');
                return;
            }
            selectedIssue.value.status = 'confirmed';
            ElMessage.success('问题单已确认。');
        };

        const ignoreIssue = () => {
            if (!selectedIssue.value) {
                ElMessage.warning('请先选择一个问题单。');
                return;
            }
            const index = issues.value.indexOf(selectedIssue.value);
            if (index > -1) {
                issues.value.splice(index, 1);
                selectedIssue.value = null;
                ElMessage.info('问题单已忽略。');
            }
        };

        /***********************
         * 对齐结果与右键菜单管理
         ***********************/
        const alignmentResults = ref([
            {
                id: 1,
                name: '用户登录功能实现',
                hasReview: true,
                docRanges: [{ documentId: '需求文档A.md', content: '用户应能通过输入用户名和密码登录系统...' }],
                codeRanges: [{ documentId: 'auth.js', content: 'function login(username, password) { ... }' }]
            },
            {
                id: 2,
                name: '密码加密存储',
                hasReview: false,
                docRanges: [{ documentId: '需求文档A.md', content: '系统需对用户密码进行哈希加密处理...' }],
                codeRanges: [{ documentId: 'utils.js', content: 'const hash = bcrypt.hashSync(password, salt);' }]
            },
            {
                id: 3,
                name: '税务计算逻辑',
                hasReview: true,
                docRanges: [{ documentId: '税务计算需求.md', content: '税率根据收入分级计算，具体标准如下...' }],
                codeRanges: []
            },
        ]);

        const contextMenu = ref({
            visible: false,
            top: 0,
            left: 0,
            selectedAlignment: null,
        });

        const showContextMenu = (event, alignment) => {
            contextMenu.value.visible = true;
            contextMenu.value.top = event.clientY;
            contextMenu.value.left = event.clientX;
            contextMenu.value.selectedAlignment = alignment;

            // 添加一个全局点击事件监听器来隐藏菜单
            document.addEventListener('click', hideContextMenu);
        };

        const hideContextMenu = () => {
            contextMenu.value.visible = false;
            // 移除监听器，避免内存泄漏
            document.removeEventListener('click', hideContextMenu);
        };

        const renameAlignment = () => {
            if (!contextMenu.value.selectedAlignment) return;
            const newName = prompt('请输入新的名称：', contextMenu.value.selectedAlignment.name);
            if (newName && newName.trim() !== '') {
                const alignment = alignmentResults.value.find(a => a.id === contextMenu.value.selectedAlignment.id);
                if (alignment) {
                    alignment.name = newName.trim();
                    ElMessage.success('重命名成功！');
                }
            }
        };

        const deleteAlignment = () => {
            if (!contextMenu.value.selectedAlignment) return;
            ElMessageBox.confirm('确定要删除此对齐项吗？', '确认删除', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                const index = alignmentResults.value.findIndex(a => a.id === contextMenu.value.selectedAlignment.id);
                if (index > -1) {
                    alignmentResults.value.splice(index, 1);
                    ElMessage.info('对齐项已删除。');
                }
            }).catch(() => { });
        };

        /***********************
         * 生命周期
         ***********************/
        onMounted(fetchProjectMetadata);

        /***********************
         * 暴露到模板
         ***********************/
        return {
            projectName,
            projectFiles,
            selectedDocFile,
            selectedCodeFile,
            selectedDocContent,
            selectedCodeContent,
            fetchFileContent,
            addFile,
            issues,
            selectedIssue,
            selectIssue,
            confirmIssue,
            ignoreIssue,
            docFileTree,
            codeFileTree,
            handleNodeClick,
            alignmentResults,
            contextMenu,
            showContextMenu,
            renameAlignment,
            deleteAlignment
        };
    }
});


/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
app.mount('#app');
