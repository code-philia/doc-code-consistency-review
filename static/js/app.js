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
        const alignAllReqLoading = ref(false); // 控制加载状态
        const alignSingleReqLoading = ref(false); // 控制单个需求点对齐的加载状态
        const aligningPoints = ref([]); // 当前正在对齐的需求点 ID
        const reviewSingleReqLoading = ref(false); // 用于存储单个需求点的审查结果
        const reviewingPoints = ref([]); // 当前正在审查的需求点 ID
        const currentPage = ref(1); // 当前页码
        const selectedText = ref(""); // Store selected text
        const showConfirm = ref(false); // Control visibility of confirmation dialog
        const confirmBoxPosition = ref({ x: 0, y: 0 }); // Store position of the confirmation box

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

        // 添加需求点
        const handleTextSelection = () => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim()) {
                selectedText.value = selection.toString().trim();
                const range = selection.getRangeAt(0).getBoundingClientRect();
                confirmBoxPosition.value = { x: range.left + window.scrollX, y: range.top + window.scrollY };
                showConfirm.value = true; // Show confirmation box
            }
            console.log('Selected text:', selectedText.value);
        };

        const addRequirementPoint = () => {
            requirementPoints.value.push({
                type: "描述文本",
                id: `text_${requirementPoints.value.length}`,
                content: selectedText.value,
                context: ""
            });
            showConfirm.value = false; // Hide confirmation box
            ElMessage({
                message: '需求点已添加',
                type: 'success',
                duration: 2000
            });
        };

        const cancelRequirementPoint = () => {
            showConfirm.value = false; // Hide confirmation box
            selectedText.value = ""; // Clear selected text
            confirmBoxPosition.value = { x: 0, y: 0 }; // Reset position
        };

        // 上传代码文件
        const handleUploadChange = (file, fileList) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // 尝试解码 ANSI 编码文件为 UTF-8
                let content;
                try {
                    content = new TextDecoder("utf-8").decode(new Uint8Array(e.target.result));
                } catch (error) {
                    // 如果 UTF-8 解码失败，尝试使用 GBK 编码（常见于 ANSI 中文文件）
                    content = new TextDecoder("gbk").decode(new Uint8Array(e.target.result));
                }
                codeFiles.value.push({
                    name: file.name,
                    content: content
                });
                setTimeout(() => {
                    document.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                }, 0);
            };
            reader.readAsArrayBuffer(file.raw); // 使用 ArrayBuffer 读取文件内容
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
        const parseRequirement = async () => {
            alignAllReqLoading.value = true; // 设置加载状态为 true
            try {
                const response = await axios.post('/api/parse-requirement', {
                    requirements: requirements.value
                });
                requirementPoints.value = response.data.requirementPoints; // 存储解析后的需求点
                ElMessage({
                    message: '需求解析完成',
                    type: 'success',
                    duration: 2000
                });
            } catch (error) {
                ElMessage({
                    message: '需求解析失败: ' + error.response.data.error,
                    type: 'error',
                    duration: 4000
                });
            } finally {
                alignAllReqLoading.value = false; // 无论成功或失败都重置加载状态
            }
        }

        const autoAlign = async () => {
            alignAllReqLoading.value = true; // 设置加载状态为 true
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
                    duration: 2000
                });
            } catch (error) {
                ElMessage({
                    message: '自动对齐失败: ' + error.response.data.error,
                    type: 'error',
                    duration: 4000
                });
            } finally {
                alignAllReqLoading.value = false; // 无论成功或失败都重置加载状态
            }
        };


        const alignSingleRequirement = async (point) => {
            aligningPoints.value.push(point.id); // 添加到正在对齐的需求点列表
            alignSingleReqLoading.value = true; // 设置单个对齐加载状态为 true
            try {
                const response = await axios.post('/api/align-single-requirement', {
                    requirement: point,
                    codeFiles: codeFiles.value.map(file => ({
                        name: file.name,
                        content: file.content
                    }))
                });
                for (let i = 0; i < requirementPoints.value.length; i++) { 
                    if (requirementPoints.value[i].id === point.id) {
                        requirementPoints.value[i] = response.data.requirementPoint; // 更新对应的需求点
                        break;
                    }
                }
                ElMessage({
                    message: '单个需求点对齐完成',
                    type: 'success',
                    duration: 1000
                });
            } catch (error) {
                ElMessage({
                    message: '自动对齐失败: ' + error.response.data.error,
                    type: 'error',
                    duration: 4000
                });
            } finally {
                aligningPoints.value = aligningPoints.value.filter(id => id !== point.id); // 从正在对齐的列表中移除
                alignSingleReqLoading.value = aligningPoints.value.length > 0; // 如果还有正在对齐的需求点，则保持加载状态
            }
        };

        const removeSingleRequirement = (point) => {
            for (let i = 0; i < requirementPoints.value.length; i++) { 
                if (requirementPoints.value[i].id === point.id) {
                    requirementPoints.value.splice(i, 1); // 删除对应的需求点
                    aligningPoints.value = aligningPoints.value.filter(id => id !== point.id); // 从正在对齐的列表中移除
                    reviewingPoints.value = reviewingPoints.value.filter(id => id !== point.id); // 从正在
                    break;
                }
            }
            ElMessage({
                message: '删除需求点成功',
                type: 'success',
                duration: 1000
            });
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


        // 审查选项卡
        const reviewSingleRequirement = async (point) => {
            reviewingPoints.value.push(point.id); // 添加到正在审查的需求点列表
            reviewSingleReqLoading.value = true;
            try {
                const response = await axios.post('/api/review-single-requirement', {
                    requirement: point
                });
                for (let i = 0; i < requirementPoints.value.length; i++) { 
                    if (requirementPoints.value[i].id === point.id) {
                        requirementPoints.value[i] = response.data.requirementPoint; // 更新对应的需求点
                        break;
                    }
                }
                ElMessage({
                    message: '审查完成',
                    type: 'success',
                    duration: 1000
                });
            }
            catch (error) {
                ElMessage({
                    message: '审查失败: ' + error.response.data.error,
                    type: 'error',
                    duration: 4000
                });
            } finally {
                reviewingPoints.value = reviewingPoints.value.filter(id => id !== point.id); // 从正在审查的列表中移除
                reviewSingleReqLoading.value = reviewingPoints.value.length > 0; // 如果还有正在审查的需求点，则保持加载状态
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
            alignAllReqLoading,
            alignSingleReqLoading,
            reviewSingleReqLoading,
            aligningPoints,
            reviewingPoints,
            currentPage,
            handleRequirementUploadChange,
            handleRequirementRemove,
            handleRequirementExceed,
            handleUploadChange,
            handleRemove,
            handleChange,
            renderMarkdownTableLine,
            renderMarkdown,
            parseRequirement,
            autoAlign,
            alignSingleRequirement,
            removeSingleRequirement,
            importAlignment,
            exportAlignment,
            handleRequirementClick,
            reviewSingleRequirement,
            selectedText,
            showConfirm,
            confirmBoxPosition,
            handleTextSelection,
            addRequirementPoint,
            cancelRequirementPoint,
        };
    }
});

app.use(ElementPlus);
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
app.mount('#app');

