const { createApp, ref } = Vue;
const { ElButton, ElMessage } = ElementPlus;

const app = createApp({
    delimiters: ['${', '}'], // 自定义 Vue 插值语法
    setup() {
        const requirementFilename = ref(""); // 需求文档文件名
        const requirementMarkdown = ref("#### 未加载需求文档... ####"); // 需求文档原始 Markdown 内容
        const codeFiles = ref([]); // {name: 'file1.cpp', content: '...', numberedContent: '1. ...\n2. ...\n3. ...'} 代码文件列表

        const showUpload = ref(false); // 控制上传界面显示

        const activeNames = ref([]); // 用于控制展开的 el-collapse-item

        const selectedText = ref(""); // 选中文本

        // 渲染 Markdown -> Html
        const renderMarkdownWithLatex = (markdownContent) => {
            // 正则表达式匹配公式：单行公式 $...$ 或多行公式 $$...$$
            const latexRegex = /\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$/g;

            // 替换公式并使用 KaTeX 渲染
            let renderedContent = markdownContent.replace(latexRegex, (match, displayFormula, inlineFormula) => {
                try {
                    if (displayFormula) {
                        return katex.renderToString(displayFormula, { displayMode: true });
                    }
                    if (inlineFormula) {
                        return katex.renderToString(inlineFormula, { displayMode: false });
                    }
                } catch (error) {
                    console.error("KaTeX render error:", error.message);
                    return match; // 如果渲染失败，保留原公式
                }
            });

            // 使用 marked 渲染剩余 Markdown
            const container = document.createElement('div');
            container.innerHTML = marked.parse(renderedContent);

            return container.innerHTML;
        };

        // 上传需求文档
        const handleRequirementUploadChange = (file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                requirementFilename.value = file.name; // 存储需求文件名
                requirementMarkdown.value = e.target.result; // 直接存储 Markdown 内容
            };
            reader.readAsText(file.raw);
        };

        const handleRequirementRemove = () => {
            requirementFilename.value = "";
            requirementMarkdown.value = "#### 未加载需求文档... ####";
        };

        const handleRequirementExceed = () => {
            ElMessage({
                message: '只能上传一个需求文档文件，请删除后再上传新的文件',
                type: 'warning',
                duration:  4000
            });
        };

        // 选中需求文本
        const handleTextSelection = () => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim()) {
                selectedText.value = selection.toString().trim();
            }
            console.log('Selected text:', selectedText.value);
        };

        // 上传代码文件
        const handleUploadChange = (file) => {
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
                
                let numberedContent = "";
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    const lineNumber = `${index + 1}:`.padEnd(5, ' ');
                    numberedContent += `${lineNumber}${line}\n`;
                });

                codeFiles.value.push({
                    name: file.name,
                    content: content,
                    numberedContent: numberedContent
                });
                setTimeout(() => {
                    document.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                }, 0);
            };
            reader.readAsArrayBuffer(file.raw); // 使用 ArrayBuffer 读取文件内容
        };

        const handleCodeFileRemove = (file, fileList) => {
            const index = codeFiles.value.findIndex((item) => item.name === file.name);
            if (index !== -1) {
                codeFiles.value.splice(index, 1);
                activeNames.value = activeNames.value.filter(name => name !== index); // 移除展开状态
            }
        };

        const handleCodeSpanChange = (names) => {
            activeNames.value = names;
        };

        // 对齐选中需求
        const alignSingleRequirement = async (point) => {

        };


        return {
            requirementFilename,
            requirementMarkdown,
            codeFiles,
            showUpload,
            activeNames,
            selectedText,
            renderMarkdownWithLatex,
            handleRequirementUploadChange,
            handleRequirementRemove,
            handleRequirementExceed,
            handleTextSelection,
            handleUploadChange,
            handleCodeFileRemove,
            handleCodeSpanChange,
            alignSingleRequirement
        };
    }
});

app.use(ElementPlus);
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
app.mount('#app');

