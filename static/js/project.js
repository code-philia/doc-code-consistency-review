/****************************
 * 全局状态与配置
 ****************************/

let activeView = 'statsView'; // 当前活动视图

// 初始化 markdown-it + texmath
const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true
}).use(window.texmath, {
    delimiters: 'dollars',
    katexOptions: {}
});

const { createApp, ref, onMounted } = Vue;
const { ElButton, ElMessage } = ElementPlus;


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

/** 占位功能：预览 */
function previewPanel() {
    alert('预览功能将在后续实现');
}

/** 占位功能：导出 */
function exportPanel() {
    alert('导出功能将在后续实现');
}

/**
 * 渲染 Markdown -> HTML
 */
function renderMarkdown(content) {
    return md.render(content);
}

/**
 * 格式化代码并添加行号
 */
function formatCodeWithLineNumbers(codeContent) {
    if (!codeContent) return '';
    codeContent = codeContent.replace(/\r\n/g, '\n');
    return codeContent.split('\n').map((line, idx) => `
        <div class="code-line">
            <span class="line-number">${String(idx + 1).padStart(3, ' ')}</span>
            <span class="code-content">${line}</span>
        </div>
    `).join('');
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
                    if (fileType === 'doc') {
                        selectedDocFile.value = fileName;
                        selectedDocContent.value = renderMarkdown(response.data.content);
                    } else if (fileType === 'code') {
                        selectedCodeFile.value = fileName;
                        selectedCodeContent.value = formatCodeWithLineNumbers(response.data.content);
                    }
                } else {
                    ElMessage.error(`加载文件内容失败: ${response.data.message}`);
                }
            } catch (err) {
                console.error("Error fetching file content:", err);
                ElMessage.error(`加载文件内容失败: ${err.message}`);
            }
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
            issues,
            selectedIssue,
            selectIssue,
            confirmIssue,
            ignoreIssue
        };
    }
});


/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
app.mount('#app');
