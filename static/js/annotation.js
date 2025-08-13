/****************************
 * 全局状态与配置
 ****************************/
const { createApp, ref, onMounted } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus; // 添加 ElMessageBox 用于确认删除

// 初始化 markdown-it + texmath
const md = window.markdownit({
    html: true,         // 允许输出原始 HTML
    linkify: true,      // 自动将链接文本转换为链接
    typographer: true,  // 启用一些排版替换（例如引号）
    highlight: function (str, lang) {
        if (lang && window.hljs && window.hljs.getLanguage(lang)) {
            try {
                return '<pre class="hljs"><code>' +
                       window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                       '</code></pre>';
            } catch (__) {}
        }
        return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
    }
}).use(window.texmath, {
    engine: window.katex,
    delimiters: 'dollars',
    katexOptions: {
        strict: false,
        macros: {
            "\\RR": "\\mathbb{R}",
            "\\C": "\\mathbb{C}",
            "\\N": "\\mathbb{N}",
            "\\Z": "\\mathbb{Z}",
            "\\Q": "\\mathbb{Q}"
        }
    }
});

/****************************
 * 工具函数
 ****************************/

/**
 * 渲染 Markdown -> HTML
 */
function renderMarkdown(content) {
    try {
        // 使用 markdown-it 渲染 Markdown
        const renderedHtml = md.render(content);
        
        // 返回渲染后的 HTML 字符串
        return renderedHtml;
    } catch (error) {
        console.error("Markdown渲染错误:", error);
        return `<div class="render-error">${error.message}</div>`;
    }
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
        const docFiles = ref([]); // 存储需求文档
        const codeFiles = ref([]); // 存储代码文件
        
        const selectedDocFile = ref('');
        const selectedCodeFile = ref('');
        const selectedDocContent = ref('');
        const selectedCodeContent = ref('');
        const renderError = ref('');
        
        // 获取文件上传DOM引用
        const docUpload = ref(null);
        const codeUpload = ref(null);

        /***********************
         * 文件上传相关方法
         ***********************/
        
        // 触发需求文档上传
        const triggerDocUpload = () => {
            docUpload.value.click();
        };
        
        // 触发代码文件上传
        const triggerCodeUpload = () => {
            codeUpload.value.click();
        };
        
        // 处理需求文档上传
        const handleDocUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const newFile = {
                    name: file.name,
                    content: content,
                    lastModified: new Date(file.lastModified)
                };
                
                // 添加到需求文档列表
                docFiles.value.push(newFile);
                
                // 清空文件输入
                event.target.value = '';
                
                ElMessage.success(`需求文档 "${file.name}" 上传成功`);
                
                // 自动选择新上传的文档
                selectDocFile(newFile);
            };
            reader.readAsText(file);
        };
        
        // 处理代码文件上传
        const handleCodeUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const newFile = {
                    name: file.name,
                    content: content,
                    lastModified: new Date(file.lastModified)
                };
                
                // 添加到代码文件列表
                codeFiles.value.push(newFile);
                
                // 清空文件输入
                event.target.value = '';
                
                ElMessage.success(`代码文件 "${file.name}" 上传成功`);
                
                // 自动选择新上传的文件
                selectCodeFile(newFile);
            };
            reader.readAsText(file);
        };
        
        // 选择需求文档
        const selectDocFile = (file) => {
            selectedDocFile.value = file.name;
            renderError.value = '';
            selectedDocContent.value = renderMarkdown(file.content);
            
            // 手动触发KaTeX渲染
            setTimeout(() => {
                if (window.renderMathInElement) {
                    window.renderMathInElement(document.querySelector('.content-card-doc'), {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false}
                        ]
                    });
                }
            }, 100);
        };
        
        // 选择代码文件
        const selectCodeFile = (file) => {
            selectedCodeFile.value = file.name;
            selectedCodeContent.value = formatCodeWithLineNumbers(file.content);
        };
        
        /***********************
         * 文件删除方法
         ***********************/
        const removeDocFile = (index) => {
            const fileName = docFiles.value[index].name;
            ElMessageBox.confirm(`确定要删除需求文档 "${fileName}" 吗?`, '确认删除', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                // 如果正在显示要删除的文件，先清空显示
                if (selectedDocFile.value === fileName) {
                    selectedDocFile.value = '';
                    selectedDocContent.value = '';
                }
                docFiles.value.splice(index, 1);
                ElMessage.success(`需求文档 "${fileName}" 已删除`);
            }).catch(() => {
                // 用户取消删除
            });
        };
        
        const removeCodeFile = (index) => {
            const fileName = codeFiles.value[index].name;
            ElMessageBox.confirm(`确定要删除代码文件 "${fileName}" 吗?`, '确认删除', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                // 如果正在显示要删除的文件，先清空显示
                if (selectedCodeFile.value === fileName) {
                    selectedCodeFile.value = '';
                    selectedCodeContent.value = '';
                }
                codeFiles.value.splice(index, 1);
                ElMessage.success(`代码文件 "${fileName}" 已删除`);
            }).catch(() => {
                // 用户取消删除
            });
        };

        /***********************
         * 暴露到模板
         ***********************/
        return {
            docFiles,
            codeFiles,
            selectedDocFile,
            selectedCodeFile,
            selectedDocContent,
            selectedCodeContent,
            renderError,
            docUpload,
            codeUpload,
            triggerDocUpload,
            triggerCodeUpload,
            handleDocUpload,
            handleCodeUpload,
            selectDocFile,
            selectCodeFile,
            removeDocFile,
            removeCodeFile
        };
    }
});

/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
app.mount('#app');