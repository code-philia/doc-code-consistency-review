// Import libraries as ES Modules
import {unified} from 'https://esm.sh/unified@11.0.4';
import remarkParse from 'https://esm.sh/remark-parse@11.0.0';
import remarkGfm from 'https://esm.sh/remark-gfm@4.0.0';
import remarkMath from 'https://esm.sh/remark-math@6.0.0';
import remarkRehype from 'https://esm.sh/remark-rehype@11.1.0';
import rehypeKatex from 'https://esm.sh/rehype-katex@7.0.0';
import rehypeStringify from 'https://esm.sh/rehype-stringify@10.0.0';
import {trimLines} from 'https://esm.sh/trim-lines@3.0.1';

/****************************
 * 全局状态与配置
 ****************************/
const { createApp, ref } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;

/****************************
 * 工具函数 (Utils)
 ****************************/
function regularizeFileContent(content) {
  // Use Unix line break
  content = content.replace(/\r?\n|\r/g, '\n');

  // Remove gremlin zero-width whitespaces (U+200b)
  content = content.replace(/\u200b/g, '');

  // Split contiguous inline math `$math1$$math2$`
  content = content.replace(/(?<=\S)\$\$(?=\S)/g, '$ $');

  return content;
}

function splitLines(text, emptyLastLine = false) {
  text += '\n';
  const result = text.match(/.*?(\r|\r?\n)/g);

  if (result === null) {
    return [];
  }

  const lastLine = result.pop();
  if (lastLine && (emptyLastLine || lastLine !== '\n')) {
    result.push(lastLine.slice(0, -1));
  }

  return result;
}

/****************************
 * Markdown Rendering with Position Attributes
 ****************************/
/**
 * A factory to create a rehype handler that wraps the element
 * and adds parse-start and parse-end attributes.
 * @param {string | function} tag - The HTML tag name or a function that returns it.
 */
function wrapHandler(tag) {
  return (state, node) => {
    const tagName = typeof tag === 'function' ? tag(node) : tag;
    const element = {
      type: 'element',
      tagName,
      properties: {},
      children: state.all(node)
    };

    if (node.position) {
      element.properties['parse-start'] = node.position.start.offset;
      element.properties['parse-end'] = node.position.end.offset;
    }

    state.patch(node, element);
    return state.applyData(node, element);
  };
}

/**
 * Custom handler for text nodes. Wraps text in a <span> to hold position attributes.
 */
function textHandler(state, node) {
    const result = {
        type: 'element',
        tagName: 'span',
        properties: {
            className: ['parse-text-wrapper'],
            'parse-start': node.position.start.offset,
            'parse-end': node.position.end.offset
        },
        children: [{
            type: 'text',
            value: trimLines(String(node.value)),
        }]
    };
    state.patch(node, result);
    return state.applyData(node, result);
}

/**
 * Custom handler for `<code>` blocks.
 */
function codeHandler(state, node) {
    const value = node.value ? node.value + '\n' : '';
    const lang = node.lang ? node.lang.split(' ')[0] : ''; // Simple language detection

    // Create a <span> to wrap the actual text content
    const textSpan = {
        type: 'element',
        tagName: 'span',
        properties: {
             'parse-start': node.position.start.offset + 3 + (node.lang || '').length,
             'parse-end': node.position.end.offset - 3
        },
        children: [{ type: 'text', value }]
    };
    state.patch(node, textSpan);

    const properties = {
        'parse-start': node.position.start.offset,
        'parse-end': node.position.end.offset
    };
    if (lang && window.hljs.getLanguage(lang)) {
        properties.className = ['language-' + lang];
    }
    
    const codeElement = {
        type: 'element',
        tagName: 'code',
        properties,
        children: [textSpan]
    };

    if (node.meta) {
        codeElement.data = { meta: node.meta };
    }
    state.patch(node, codeElement);
    
    // Wrap in <pre>
    const preElement = {
        type: 'element',
        tagName: 'pre',
        properties: {
            className: ['hljs'], // For highlight.js styling
            'parse-start': node.position.start.offset,
            'parse-end': node.position.end.offset
        },
        children: [codeElement]
    };
    state.patch(node, preElement);
    return preElement;
}

/**
 * Custom handler for inline `code`.
 */
function inlineCodeHandler(state, node) {
    const textSpan = {
        type: 'element',
        tagName: 'span',
        properties: {
            'parse-start': node.position.start.offset + 1,
            'parse-end': node.position.end.offset - 1
        },
        children: [{ type: 'text', value: node.value.replace(/\r?\n|\r/g, ' ') }]
    };
    state.patch(node, textSpan);

    const codeElement = {
        type: 'element',
        tagName: 'code',
        properties: {
            'parse-start': node.position.start.offset,
            'parse-end': node.position.end.offset
        },
        children: [textSpan]
    };
    state.patch(node, codeElement);
    return state.applyData(node, codeElement);
}

/**
 * Custom handler for math and other unknown nodes, ensuring they get position attributes.
 */
function defaultUnknownHandler(state, node) {
    const data = node.data || {};
    const result =
        'value' in node && !(data.hProperties || data.hChildren) ?
        { type: 'text', value: node.value } :
        {
            type: 'element',
            tagName: 'div',
            properties: {
                'parse-start': node.position.start.offset,
                'parse-end': node.position.end.offset
            },
            children: state.all(node)
        };
    state.patch(node, result);
    return state.applyData(node, result);
}

// Collection of all handlers
const customHandlers = {
    paragraph: wrapHandler('p'),
    heading: wrapHandler(node => `h${node.depth}`),
    list: wrapHandler(node => node.ordered ? 'ol' : 'ul'),
    listItem: wrapHandler('li'),
    blockquote: wrapHandler('blockquote'),
    link: wrapHandler('a'),
    emphasis: wrapHandler('em'),
    strong: wrapHandler('strong'),
    delete: wrapHandler('del'),
    thematicBreak: wrapHandler('hr'),
    text: textHandler,
    code: codeHandler,
    inlineCode: inlineCodeHandler
};

/**
 * Renders Markdown to HTML using unified/remark, adding position attributes.
 * @param {string} content The Markdown content.
 * @returns {Promise<string>} A promise that resolves to the rendered HTML string.
 */
async function renderMarkdown(content) {
    try {
        const file = await unified()
            .use(remarkParse)
            .use(remarkGfm)
            .use(remarkMath)
            .use(remarkRehype, {
                allowDangerousHtml: true,
                handlers: customHandlers,
                unknownHandler: defaultUnknownHandler
            })
            .use(rehypeKatex)
            .use(rehypeStringify)
            .process(content);

        return String(file);
    } catch (error) {
        console.error("Markdown rendering error:", error);
        throw error; // Re-throw to be caught by the caller
    }
}


/****************************
 * Code Rendering with Position Attributes
 ****************************/
function calculateCodeLineOffsets(codeContent) {
    const lineOffsets = [];
    if (!codeContent) return lineOffsets;
    
    let start = 0;
    let end = 0;
    const lines = codeContent.split(/\r?\n/);
    
    for (let i = 0; i < lines.length; i++) {
        // 当前行的长度（包括换行符）
        const lineLength = lines[i].length + 1;
        end = start + lineLength;
        
        // 记录当前行的起始和结束位置
        lineOffsets.push({
            start: start,
            end: i === lines.length - 1 ? end - 1 : end // 最后一行不包含换行符
        });
        
        start = end;
    }
    
    return lineOffsets;
}

function formatCodeWithLineNumbers(codeContent) {
    if (!codeContent) return '';
    
    // 计算每行的偏移量
    const lineOffsets = calculateCodeLineOffsets(codeContent);
    const textLines = codeContent.split(/\r?\n/);
    
    return textLines.map((line, idx) => {
        // 获取当前行的偏移量
        const offset = lineOffsets[idx] || { start: 0, end: 0 };
        
        return `
            <div class="code-line" parse-start="${offset.start}" parse-end="${offset.end}">
                <span class="line-number">${String(idx + 1).padStart(3, ' ')}</span>
                <span class="code-content">${line}</span>
            </div>
        `;
    }).join('');
}

/****************************
 * Vue 应用
 ****************************/

const app = createApp({
    delimiters: ['${', '}'],
    setup() {
        const docFiles = ref([]);
        const codeFiles = ref([]);

        const selectedDocFile = ref('');
        const selectedCodeFile = ref('');
        const selectedDocContent = ref('');
        const selectedCodeContent = ref('');
        const renderError = ref('');

        const docUpload = ref(null);
        const codeUpload = ref(null);

        const triggerDocUpload = () => docUpload.value.click();
        const triggerCodeUpload = () => codeUpload.value.click();

        const handleFileUpload = (event, fileList, fileType) => {
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
                fileList.value.push(newFile);
                event.target.value = '';
                ElMessage.success(`${fileType} "${file.name}" 上传成功`);

                if (fileType === '需求文档') {
                    selectDocFile(newFile);
                } else {
                    selectCodeFile(newFile);
                }
            };
            reader.readAsText(file);
        };
        
        const handleDocUpload = (event) => handleFileUpload(event, docFiles, '需求文档');
        const handleCodeUpload = (event) => handleFileUpload(event, codeFiles, '代码文件');
        
        // Select Doc File (now async)
        const selectDocFile = async (file) => {
            selectedDocFile.value = file.name;
            renderError.value = '';
            try {
                selectedDocContent.value = await renderMarkdown(file.content);
                console.log('需求文档：', selectedDocContent.value);
            } catch (e) {
                renderError.value = e.message;
                selectedDocContent.value = '<div class="render-error">渲染失败，请检查Markdown格式。</div>';
                console.error(e);
            }
        };
        
        const selectCodeFile = (file) => {
            selectedCodeFile.value = file.name;
            try {
                selectedCodeContent.value = formatCodeWithLineNumbers(file.content);
                console.log('代码文件：', selectedCodeContent.value);
            } catch (e) {
                 selectedCodeContent.value = `<div class="render-error">代码高亮失败: ${e.message}</div>`
            }
        };

        const removeFile = (index, fileList, selectedFileName, selectedFileContent, fileType) => {
            const fileName = fileList.value[index].name;
            ElMessageBox.confirm(`确定要删除${fileType} "${fileName}" 吗?`, '确认删除', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                if (selectedFileName.value === fileName) {
                    selectedFileName.value = '';
                    selectedFileContent.value = '';
                }
                fileList.value.splice(index, 1);
                ElMessage.success(`${fileType} "${fileName}" 已删除`);
            }).catch(() => {});
        };
        
        const removeDocFile = (index) => removeFile(index, docFiles, selectedDocFile, selectedDocContent, '需求文档');
        const removeCodeFile = (index) => removeFile(index, codeFiles, selectedCodeFile, selectedCodeContent, '代码文件');

        return {
            docFiles, codeFiles,
            selectedDocFile, selectedCodeFile,
            selectedDocContent, selectedCodeContent,
            renderError,
            docUpload, codeUpload,
            triggerDocUpload, triggerCodeUpload,
            handleDocUpload, handleCodeUpload,
            selectDocFile, selectCodeFile,
            removeDocFile, removeCodeFile
        };
    }
});

/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}
app.mount('#app');