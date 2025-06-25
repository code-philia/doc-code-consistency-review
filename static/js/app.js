const { createApp, ref } = Vue;
const { ElButton, ElMessage } = ElementPlus;

const app = createApp({
    delimiters: ['${', '}'], // 自定义 Vue 插值语法
    setup() {
        const requirements = ref(marked.parse("#### 未加载需求文档... ####"));
        const requirementFileList = ref([]); // 用于存储上传的需求文档文件列表
        const codeFiles = ref([]);
        const fileList = ref([]); // 用于存储上传的文件列表
        const activeNames = ref([]); // 用于控制展开的 el-collapse-item
        const requirementPoints = ref([]); // 用于存储解析后的需求点
        const showUpload = ref(false); // 控制上传按钮的显示

        // 上传需求文档
        const handleRequirementUploadChange = (file, requirementFileList) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const markdownContent = e.target.result;
                requirements.value = marked.parse(markdownContent); // 使用 marked.js 渲染 Markdown
                setTimeout(() => {
                    renderMathInElement(document.getElementById('requirements'), {
                        delimiters: [
                            { left: "$$", right: "$$", display: true },
                            { left: "$", right: "$", display: false }
                        ]
                    });
                }, 0); // 使用 KaTeX 渲染公式
            };
            reader.readAsText(file.raw);
        };

        const handleRequirementRemove = () => {
            requirements.value = marked.parse("#### 未加载需求文档... ####"); // 清空需求文档内容
        };

        const handleRequirementExceed = () => {
            ElMessage({
                message: '只能上传一个需求文档文件，请删除后再上传新的文件',
                type: 'warning',
                duration:  4000
            });
        };

        // 上传代码文件
        const handleUploadChange = (file, fileList) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                codeFiles.value.push({
                    name: file.name,
                    content: e.target.result
                });
                setTimeout(() => {
                    document.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                }, 0);
            };
            reader.readAsText(file.raw);
        };

        const handleRemove = (file, fileList) => {
            const index = codeFiles.value.findIndex((item) => item.name === file.name);
            if (index !== -1) {
                codeFiles.value.splice(index, 1);
                activeNames.value = activeNames.value.filter(name => name !== index); // 移除展开状态
            }
        };

        const handleChange = (names) => {
            activeNames.value = names;
        };

        // 对齐选项卡
        const autoAlign = async () => {
            try {
                const response = await axios.post('/api/auto-align', {
                    requirements: requirements.value,
                    codeFiles: codeFiles.value.map(file => ({
                        name: file.name,
                        content: file.content
                    }))
                });
                requirementPoints.value = response.data.requirementPoints; // 存储解析后的需求点
                ElMessage({
                    message: '自动对齐完成',
                    type: 'success',
                    duration: 4000
                });
            } catch (error) {
                ElMessage({
                    message: '自动对齐失败: ' + error.response.data.error,
                    type: 'error',
                    duration: 4000
                });
            }
        };

        const importAlignment = async () => {
            try {
                const response = await axios.post('/api/import-alignment', { /* 可传递参数 */ });
                alert('导入完成: ' + response.data.message);
            } catch (error) {
                alert('导入失败: ' + error.response.data.error);
            }
        };

        const exportAlignment = async () => {
            try {
                const response = await axios.post('/api/export-alignment', { /* 可传递参数 */ });
                alert('导出完成: ' + response.data.message);
            } catch (error) {
                alert('导出失败: ' + error.response.data.error);
            }
        };

        // 渲染 Markdown
        const renderMarkdownTableLine = (rowData) => {
            const headers = Object.keys(rowData).join(' | ');
            const separator = Object.keys(rowData).map(() => '---').join(' | ');
            const values = Object.values(rowData).join(' | ');
            return marked.parse(`| ${headers} |\n| ${separator} |\n| ${values} |`);
        };

        const renderMarkdown = (markdownContent) => {
            // Render Markdown
            const renderedContent = marked.parse(markdownContent);
            // Render formulas using KaTeX
            const container = document.createElement('div');
            container.innerHTML = renderedContent;
            renderMathInElement(container, {
                delimiters: [
                    { left: "$$", right: "$$", display: true },
                    { left: "$", right: "$", display: false }
                ]
            });
            return container.innerHTML;
        };

        const handleRequirementClick = (point) => {
            console.log(`Requirement ID: ${point.id}`);
        };

        return {
            requirements,
            requirementFileList,
            codeFiles,
            fileList,
            activeNames,
            requirementPoints,
            showUpload,
            handleRequirementUploadChange,
            handleRequirementRemove,
            handleRequirementExceed,
            handleUploadChange,
            handleRemove,
            handleChange,
            renderMarkdownTableLine,
            renderMarkdown,
            autoAlign,
            importAlignment,
            exportAlignment,
            handleRequirementClick,
        };
    }
});

app.use(ElementPlus);
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
app.mount('#app');

