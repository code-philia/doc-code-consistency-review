// 当前活动视图
let activeView = 'statsView';

// 初始化视图
function initViews() {
    console.log('Initializing views...');
    document.getElementById('statsView').style.display = 'block';
}

// 切换视图
function switchView(viewName) {
    // Hide all views
    document.getElementById('statsView').style.display = 'none';
    document.getElementById('alignmentView').style.display = 'none';

    // Show the selected view
    const viewElement = document.getElementById(viewName + 'View');
    if (viewName === 'stats') {
        viewElement.style.display = 'block'; // 项目视图 uses block
    } else {
        viewElement.style.display = 'flex'; // Other views use flex
    }
    activeView = viewName + 'View';

    // Update button active state
    document.getElementById('statsButton').classList.remove('active');
    document.getElementById('alignmentButton').classList.remove('active');
    document.getElementById(viewName + 'Button').classList.add('active');
}

// 预览和导出功能（占位实现）
function previewPanel() {
    alert('预览功能将在后续实现');
}

function exportPanel() {
    alert('导出功能将在后续实现');
}

// 初始化
window.addEventListener('DOMContentLoaded', initViews);

// 初始化 markdown-it
const md = window.markdownit({
  html: true,
  linkify: true,
  typographer: true
});

// 挂载 texmath
md.use(window.texmath, {
  delimiters: 'dollars',
  katexOptions: {}
});

const { createApp, ref, watch, nextTick, onMounted } = Vue; 
const { ElButton, ElMessage } = ElementPlus;
const app = createApp({
  delimiters: ['${', '}'],
    setup() {
        const urlParams = new URLSearchParams(window.location.search);
        const projectName = ref('');
        const projectPath = ref('');
        projectName.value = urlParams.get('name') || '未命名项目';
        projectPath.value = urlParams.get('path') || '未知路径';

        const projectFiles = ref({
            code_files: [],
            doc_files: [],
            meta_files: ['metadata.json'] // 假设这些是固定的元数据文件
        });

        const fetchProjectMetadata = async () => {
            if (!projectPath.value) {
                ElMessage.error("项目路径不存在，无法加载文件列表。");
                return;
            }
            try {
                const response = await axios.get(`/project/metadata?path=${encodeURIComponent(projectPath.value)}`);
                if (response.data.status === 'success') {
                    const metadata = response.data.metadata;
                    // 更新文件列表数据
                    projectFiles.value.code_files = metadata.code_files || [];
                    projectFiles.value.doc_files = metadata.doc_files || [];

                    // 你也可以在这里更新 projectName, projectLocation 等
                    projectName.value = metadata.project_name || projectName.value;
                } else {
                    ElMessage.error(`加载项目元数据失败: ${response.data.message}`);
                }
            } catch (error) {
                console.error("Error fetching project metadata:", error);
                ElMessage.error(`加载项目元数据失败: ${error.message}`);
            }
        };

        onMounted(() => {
            fetchProjectMetadata();
        });
        
        const selectedDocFile = ref(''); // 当前选中的需求文档文件名
        const selectedCodeFile = ref(''); // 当前选中的代码文件名
        const selectedDocContent = ref(''); // 当前选中的需求文档内容
        const selectedCodeContent = ref(''); // 当前选中的代码文件内容

        // 渲染 Markdown -> HTML
        const renderMarkdown = (markdownContent) => {
            return md.render(markdownContent);
        };

        // 格式化代码内容，添加行号
        const formatCodeWithLineNumbers = (codeContent) => {
            if (!codeContent) return '';
            codeContent = codeContent.replace(/\r\n/g, '\n');
            const lines = codeContent.split('\n');
            let numberedCode = '';
            lines.forEach((line, index) => {
                // 使用新的结构：一个容器 div，内部包含行号和代码内容
                numberedCode += `
                    <div class="code-line">
                        <span class="line-number">${`${index + 1}`.padStart(3, ' ')}</span>
                        <span class="code-content">${line}</span>
                    </div>
                `;
            });
            return numberedCode;
        };

        // 获取文件内容并更新视图
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
            } catch (error) {
                console.error("Error fetching file content:", error);
                ElMessage.error(`加载文件内容失败: ${error.message}`);
            }
        };

        return {
            projectName,
            projectFiles,
            selectedDocFile,
            selectedCodeFile,
            selectedDocContent,
            selectedCodeContent,
            fetchFileContent
        };
  }
});

app.use(ElementPlus);
app.mount('#app');