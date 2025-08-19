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
const { createApp, ref , onMounted, nextTick} = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;

/****************************
 * 工具函数 (Utils)
 ****************************/
function regularizeFileContent(content, type) {
    // Use Unix line break
    content = content.replace(/\r?\n|\r/g, '\n');

    // Remove gremlin zero-width whitespaces (U+200b)
    content = content.replace(/\u200b/g, '');

    if (type === 'doc') {
      // Split contiguous inline math `$math1$$math2$`
      content = content.replace(/(?<=\S)\$\$(?=\S)/g, '$ $');
    }
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

function normalizePath(path) {
    if (!path) return '';
    
    // 检测路径中的分隔符
    const isWindowsPath = path.includes('\\');
    const separator = isWindowsPath ? '\\' : '/';
    
    // 规范化路径
    return path
        .replace(/[\\/]+/g, separator)  // 替换多个连续分隔符
        .replace(/[\\/]$/, '') + separator; // 确保以分隔符结尾
}

function getPathSeparator() {
    if (settingsForm.value.workDirectory && 
        settingsForm.value.workDirectory.includes('\\')) {
        return '\\'; // Windows
    }
    return '/'; // Unix/Mac (默认)
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
 * 标注数据结构
 ****************************/
class Annotation {
    constructor() {
        this.id = crypto.randomUUID();
        this.category = "新标注";
        this.docRanges = [];
        this.codeRanges = [];
        this.updateTime = new Date().toISOString();
    }
}

class DocumentRange {
    constructor(documentId, start, end, content) {
        this.documentId = documentId;
        this.start = start;
        this.end = end;
        this.content = content;
    }
}

class CodeRange {
    constructor(documentId, start, end, content) {
        this.documentId = documentId;
        this.start = start;
        this.end = end;
        this.content = content;
    }
}

class File {
    constructor(name, content, renderedDocument, type, localPath, lastModified = new Date().toISOString()) {
        this.id = crypto.randomUUID();
        this.name = name;
        this.content = content;
        this.renderedDocument = renderedDocument || '';
        this.type = type; // doc or code
        this.lastModified = lastModified;
        this.localPath = localPath;
    }
}

/****************************
 * 标注工具函数
 ****************************/

// 查找带有位置属性的祖先元素
function findPositionElement(node, rootElement) {
    while (node && node !== rootElement) {
        if (node.nodeType === 1 && 
            node.hasAttribute('parse-start') && 
            node.hasAttribute('parse-end')) {
            return node;
        }
        node = node.parentNode;
    }
    return null;
}

// 计算在元素内的文本偏移量
function getCaretCharacterOffsetWithin(container, offset, element) {
    if (container === element) {
        return offset;
    }
    
    let totalOffset = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let currentNode;
    
    while ((currentNode = walker.nextNode())) {
        if (currentNode === container) {
            return totalOffset + offset;
        }
        totalOffset += currentNode.textContent.length;
    }
    return totalOffset;
}

// 计算在原始文档中的偏移量
function findOffsetFromPosition(container, offset, rootElement, reduce) {
    let node = container;
    
    // 向上查找带有位置属性的元素
    while (node && node !== rootElement) {
        if (node.nodeType === 1 && 
            node.hasAttribute('parse-start') && 
            node.hasAttribute('parse-end')) {
            
            const parseStart = parseInt(node.getAttribute('parse-start'));
            const parseEnd = parseInt(node.getAttribute('parse-end'));
            
            if (!isNaN(parseStart) && !isNaN(parseEnd)) {
                // 特殊处理数学公式
                if (node.classList.contains('math-inline') || node.classList.contains('math-block')) {
                    if (reduce === 'start') return parseStart;
                    if (reduce === 'end') return parseEnd;
                }
                
                // 计算在元素内的偏移量
                const elementOffset = getCaretCharacterOffsetWithin(container, offset, node);
                return parseStart + elementOffset;
            }
        }
        node = node.parentNode;
    }
    
    return null;
}

// 获取原始文档中的范围
function getSourceDocumentRange(rootElement, range) {
    const limitedRange = document.createRange();
    limitedRange.setStartBefore(rootElement);
    limitedRange.setEndAfter(rootElement);
    
    const comp = (i) => range.compareBoundaryPoints(i, limitedRange);
    
    if (
        comp(Range.END_TO_START) >= 0 ||  // range start is behind element's end
        comp(Range.START_TO_END) <= 0     // range end is before element's start
    ) {
        return [0, 0];
    }
    
    if (comp(Range.START_TO_START) > 0) {
        limitedRange.setStart(range.startContainer, range.startOffset);
    }
    
    if (comp(Range.END_TO_END) < 0) {
        limitedRange.setEnd(range.endContainer, range.endOffset);
    }
    
    const startOffset = findOffsetFromPosition(
        limitedRange.startContainer, 
        limitedRange.startOffset, 
        rootElement, 
        'start'
    );
    
    const endOffset = findOffsetFromPosition(
        limitedRange.endContainer, 
        limitedRange.endOffset, 
        rootElement, 
        'end'
    );
    
    if (startOffset === null || endOffset === null) {
        return [0, 0];
    }
    
    return [startOffset, endOffset];
}

// 获取原始文档内容
function getSourceDocumentContent(start, end, rawContent) {
    if (start < 0 || end < 0 || start >= rawContent.length || end >= rawContent.length || start > end) {
        return '';
    }
    
    // 获取原始内容的子字符串
    return rawContent.substring(start, end + 1);
}

/****************************
 * 滚动定位工具函数
 ****************************/

// 滚动到文档中的指定偏移量
function scrollDocToOffset(offset) {
    const docPanel = document.querySelector('.content-text-doc');
    if (!docPanel) return;
    
    // 查找包含偏移量的元素
    const elements = docPanel.querySelectorAll('[parse-start][parse-end]');
    for (const el of elements) {
        const start = parseInt(el.getAttribute('parse-start'));
        const end = parseInt(el.getAttribute('parse-end'));
        
        if (offset >= start && offset <= end) {
            // 滚动到元素位置
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 高亮显示
            const originalBg = el.style.backgroundColor;
            el.style.backgroundColor = 'rgba(255,255,0,0.3)';
            setTimeout(() => {
                el.style.backgroundColor = originalBg;
            }, 2000);
            break;
        }
    }
}

// 滚动到代码中的指定偏移量
function scrollCodeToOffset(offset) {
    const codePanel = document.querySelector('.content-text-code');
    if (!codePanel) return;
    
    // 查找包含偏移量的代码行
    const lines = codePanel.querySelectorAll('.code-line');
    for (const line of lines) {
        const start = parseInt(line.getAttribute('parse-start'));
        const end = parseInt(line.getAttribute('parse-end'));
        
        if (offset >= start && offset <= end) {
            console.log("scroll to", start, end);
            // 滚动到代码行位置
            line.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 高亮显示
            const originalBg = line.style.backgroundColor;
            line.style.backgroundColor = 'rgba(255,255,0,0.3)';
            setTimeout(() => {
                line.style.backgroundColor = originalBg;
            }, 5000);
            break;
        }
    }
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
        const selectedDocRawContent = ref('');
        const selectedCodeRawContent = ref('');
        const selectedDocContent = ref('');
        const selectedCodeContent = ref('');
        const renderError = ref('');

        const docUpload = ref(null);
        const codeUpload = ref(null);
        const docFolderUpload = ref(null);
        const codeFolderUpload = ref(null);

        const annotations = ref([]);
        const currentSelection = ref(null);
        const showAnnotationDialog = ref(false);
        const newAnnotation = ref(new Annotation());
        const selectedAnnotation = ref(null);
        const editingAnnotation = ref(false);
        const annotationName = ref('');

        const showSettingsDialog = ref(false);
        const settingsForm = ref({
            workDirectory: ''
        });

        const saveSettings = () => {
            // 规范化路径
            if (settingsForm.value.workDirectory) {
                settingsForm.value.workDirectory = normalizePath(settingsForm.value.workDirectory);
            }            
            showSettingsDialog.value = false;
            ElMessage.success('设置已保存');
        };

        function getPathSeparator() {
            // 根据路径特征判断系统类型
            if (settingsForm.value.workDirectory && settingsForm.value.workDirectory.includes('\\')) {
                return '\\'; // Windows
            }
            return '/'; // Unix/Mac (默认)
        }

        /***********************
         * 增删和选择文件
         ***********************/
        // 上传文件（单个文件或从文件夹）
        const handleFileUpload = (event, fileList, fileType) => {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            const workDir = settingsForm.value.workDirectory || '';
            const separator = getPathSeparator();
            
            files.forEach(file => {
                const localPath = workDir ? `${workDir}${separator}${file.name}` : file.name;
                
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawContent = e.target.result;
                    const content = regularizeFileContent(rawContent, fileType);
                    let renderedDocument = '';
                    try {
                        if (fileType === 'doc') {
                            renderedDocument = await renderMarkdown(content);
                        } else if (fileType === 'code') {
                            renderedDocument = formatCodeWithLineNumbers(content);
                        }
                    } catch (e) {
                        renderError.value = e.message;
                        renderedDocument = '<div class="render-error">渲染失败，请检查源文件格式。</div>';
                        console.error(e);
                    }

                    const newFile = new File(
                        file.name, 
                        content, 
                        renderedDocument, 
                        fileType, 
                        localPath, 
                        new Date(file.lastModified).toISOString()
                    );
                    
                    fileList.value.push(newFile);
                    event.target.value = '';
                    ElMessage.success(`${fileType === 'doc' ? '文档' : '代码'} "${file.name}" 上传成功`);

                    if (fileType === 'doc') {
                        selectDocFile(newFile);
                    } else {
                        selectCodeFile(newFile);
                    }
                };
                reader.readAsText(file);
            });
        };
        const handleFolderUpload = async (event, fileList, fileType, validExtensions) => {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            const workDir = settingsForm.value.workDirectory || '';
            const separator = getPathSeparator();
            
            // 过滤有效文件
            const validFiles = files.filter(file => {
                const ext = file.name.split('.').pop().toLowerCase();
                return validExtensions.includes(ext);
            });

            if (validFiles.length === 0) {
                ElMessage.warning(`没有找到有效的${fileType === 'doc' ? '文档' : '代码'}文件`);
                return;
            }

            // 批量处理文件
            for (const file of validFiles) {
                const localPath = workDir ? `${workDir}${separator}${file.name}` : file.name;
                
                await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const rawContent = e.target.result;
                        const content = regularizeFileContent(rawContent, fileType);
                        let renderedDocument = '';
                        
                        try {
                            if (fileType === 'doc') {
                                renderedDocument = await renderMarkdown(content);
                            } else if (fileType === 'code') {
                                renderedDocument = formatCodeWithLineNumbers(content);
                            }
                        } catch (e) {
                            renderError.value = e.message;
                            renderedDocument = '<div class="render-error">渲染失败，请检查源文件格式。</div>';
                            console.error(e);
                        }

                        const newFile = new File(
                            file.name, 
                            content, 
                            renderedDocument, 
                            fileType, 
                            localPath, 
                            new Date(file.lastModified).toISOString()
                        );
                        
                        fileList.value.push(newFile);
                        resolve();
                    };
                    reader.readAsText(file);
                });
            }

            event.target.value = '';
            ElMessage.success(`已上传 ${validFiles.length} 个${fileType === 'doc' ? '文档' : '代码'}文件`);
            
            // 自动选择第一个文件
            if (fileType === 'doc' && fileList.value.length > 0) {
                selectDocFile(fileList.value[0]);
            } else if (fileType === 'code' && fileList.value.length > 0) {
                selectCodeFile(fileList.value[0]);
            }
        };

        const handleDocUpload = (event) => handleFileUpload(event, docFiles, 'doc');
        const handleCodeUpload = (event) => handleFileUpload(event, codeFiles, 'code');
        const handleDocFolderUpload = (event) => {
            handleFolderUpload(
                event, 
                docFiles, 
                'doc', 
                ['doc', 'docx', 'md', 'txt'] // 支持的文档扩展名
            );
        };
        const handleCodeFolderUpload = (event) => {
            handleFolderUpload(
                event, 
                codeFiles, 
                'code', 
                ['c', 'cpp', 'h','js','py','java','html','css' ] // 支持的代码扩展名
            );
        };

        const triggerDocUpload = () => docUpload.value.click();
        const triggerCodeUpload = () => codeUpload.value.click();
        const triggerDocFolderUpload = () => docFolderUpload.value.click();
        const triggerCodeFolderUpload = () => codeFolderUpload.value.click();

        // 选择文件
        const selectDocFile = (file) => {
            selectedDocFile.value = file.name;
            selectedDocRawContent.value = file.content;
            selectedDocContent.value = file.renderedDocument || '';
        };
        
        const selectCodeFile = (file) => {
            selectedCodeFile.value = file.name;
            selectedCodeRawContent.value = file.content;
            selectedCodeContent.value = file.renderedDocument || '';
        };

        // 删除文件
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

        /***********************
         * 标注方法
         ***********************/
        // 处理文档选择
        const handleDocSelection = (event) => {
            const selection = window.getSelection();
            if (!selection || selection.toString().trim() === '') {
                currentSelection.value = null;
                return;
            }
            
            const range = selection.getRangeAt(0);
            const docPanel = document.querySelector('.content-text-doc');
            
            if (docPanel) {
                const [start, end] = getSourceDocumentRange(docPanel, range);
                if (start !== 0 || end !== 0) {
                    const rawContent = getSourceDocumentContent(start, end, selectedDocRawContent.value);
                    
                    currentSelection.value = {
                        type: 'doc',
                        documentId: selectedDocFile.value,
                        start,
                        end,
                        content: rawContent
                    };
                    showAnnotationDialog.value = true;
                }
            }
        };
        
        // 处理代码选择
        const handleCodeSelection = (event) => {
            const selection = window.getSelection();
            if (!selection || selection.toString().trim() === '') {
                currentSelection.value = null;
                return;
            }
            
            const range = selection.getRangeAt(0);
            const codePanel = document.querySelector('.content-text-code');
            
            if (codePanel) {
                const codeLine = findPositionElement(range.startContainer, codePanel);
                if (codeLine && codeLine.classList.contains('code-line')) {
                    const start = parseInt(codeLine.getAttribute('parse-start'));
                    const end = parseInt(codeLine.getAttribute('parse-end'));
                    
                    if (!isNaN(start) && !isNaN(end)) {
                        currentSelection.value = {
                            type: 'code',
                            documentId: selectedCodeFile.value,
                            start,
                            end,
                            content: selection.toString()
                        };
                        showAnnotationDialog.value = true;
                    }
                }
            }
        };
        
        // 创建新标注
        const createAnnotation = () => {
            if (!currentSelection.value) return;
            
            const annotation = new Annotation();
            annotation.category = annotationName.value || "新标注";
            
            if (currentSelection.value.type === 'doc') {
                annotation.docRanges.push(
                    new DocumentRange(
                        currentSelection.value.documentId,
                        currentSelection.value.start,
                        currentSelection.value.end,
                        currentSelection.value.content
                    )
                );
            } else {
                annotation.codeRanges.push(
                    new CodeRange(
                        currentSelection.value.documentId,
                        currentSelection.value.start,
                        currentSelection.value.end,
                        currentSelection.value.content
                    )
                );
            }
            
            annotations.value.push(annotation);
            annotationName.value = '';
            showAnnotationDialog.value = false;
            currentSelection.value = null;
            
            ElMessage.success('标注创建成功');
        };
        
        // 添加到现有标注
        const addToAnnotation = (annotation) => {
            if (!currentSelection.value || !annotation) return;
            
            if (currentSelection.value.type === 'doc') {
                annotation.docRanges.push(
                    new DocumentRange(
                        currentSelection.value.documentId,
                        currentSelection.value.start,
                        currentSelection.value.end,
                        currentSelection.value.content
                    )
                );
            } else {
                annotation.codeRanges.push(
                    new CodeRange(
                        currentSelection.value.documentId,
                        currentSelection.value.start,
                        currentSelection.value.end,
                        currentSelection.value.content
                    )
                );
            }
            
            annotation.updateTime = new Date().toISOString();
            showAnnotationDialog.value = false;
            currentSelection.value = null;
            
            ElMessage.success('已添加到标注');
        };
        
        // 编辑标注名称
        const editAnnotation = (annotation) => {
            selectedAnnotation.value = annotation;
            annotationName.value = annotation.category;
            editingAnnotation.value = true;
        };
        
        // 保存标注名称
        const saveAnnotationName = () => {
            if (selectedAnnotation.value) {
                selectedAnnotation.value.category = annotationName.value;
                selectedAnnotation.value.updateTime = new Date().toISOString();
                editingAnnotation.value = false;
                ElMessage.success('标注名称已更新');
            }
        };
        
        // 删除标注
        const removeAnnotation = (index) => {
            ElMessageBox.confirm('确定要删除此标注吗?', '确认删除', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                annotations.value.splice(index, 1);
                ElMessage.success('标注已删除');
            }).catch(() => {});
        };
        
        // 删除标注中的范围
        const removeRange = (annotation, type, index) => {
            if (type === 'doc') {
                annotation.docRanges.splice(index, 1);
            } else {
                annotation.codeRanges.splice(index, 1);
            }
            
            annotation.updateTime = new Date().toISOString();
            
            // 如果标注中没有范围了，删除整个标注
            if (annotation.docRanges.length === 0 && annotation.codeRanges.length === 0) {
                const idx = annotations.value.indexOf(annotation);
                if (idx !== -1) {
                    annotations.value.splice(idx, 1);
                    ElMessage.success('标注已删除');
                }
            } else {
                ElMessage.success('范围已删除');
            }
        };
        
        /***********************
         * 滚动定位方法
         ***********************/
        // 跳转到标注范围
        const gotoRange = (range, type) => {
            if (type === 'doc') {
                // 切换到对应的文档
                const docFile = docFiles.value.find(f => f.name === range.documentId);
                if (docFile) {
                    if (selectedDocFile.value !== docFile.name) {
                        selectDocFile(docFile);
                    }
                    
                    // 滚动到指定位置
                    nextTick(() => {
                        scrollDocToOffset(range.start);
                    });
                }
            } else if (type === 'code') {
                // 切换到对应的代码文件
                const codeFile = codeFiles.value.find(f => f.name === range.documentId);
                if (codeFile) {
                    if (selectedCodeFile.value !== codeFile.name) {
                        selectCodeFile(codeFile);
                    }
                    
                    // 滚动到指定位置
                    nextTick(() => {
                        scrollCodeToOffset(range.start);
                    });
                }
            }
        };

        /****************************
         * 保存、导入、导出标注
         ****************************/
        const handleNewTask = async () => {
            if (annotations.value.length > 0 || docFiles.value.length > 0 || codeFiles.value.length > 0) {
                try {
                    await ElMessageBox.confirm('当前有未保存的标注，是否先保存?', '新建任务', {
                        confirmButtonText: '保存并新建',
                        cancelButtonText: '不保存',
                        type: 'warning',
                        distinguishCancelAndClose: true,
                        showClose: false
                    });
                    // 用户选择保存
                    handleExportAnnotations();
                    resetTask();
                } catch (error) {
                    if (error === 'cancel') {
                        // 用户选择不保存
                        resetTask();
                    }
                }
            } else {
                resetTask();
            }
        };

        const resetTask = () => {
            annotations.value = [];
            docFiles.value = [];
            codeFiles.value = [];
            selectedDocFile.value = '';
            selectedCodeFile.value = '';
            selectedDocContent.value = '';
            selectedCodeContent.value = '';
            renderError.value = '';
            annotationName.value = '';
            ElMessage.success('已创建新任务');
        };

        const handleImportAnnotations = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        
                        // 验证数据格式
                        if (!data.annotations || !data.docFiles || !data.codeFiles) {
                            throw new Error('无效的标注文件格式');
                        }
                        
                        // 重置当前状态
                        resetTask();
                        
                        // 导入文档文件
                        for (const fileData of data.docFiles) {
                            docFiles.value.push(new File(
                                fileData.name,
                                fileData.content,
                                fileData.renderedDocument,
                                'doc',
                                fileData.localPath || fileData.name,
                                fileData.lastModified
                            ));
                        }
                        
                        // 导入代码文件
                        for (const fileData of data.codeFiles) {
                            codeFiles.value.push(new File(
                                fileData.name,
                                fileData.content,
                                fileData.renderedDocument,
                                'code',
                                fileData.localPath || fileData.name,
                                fileData.lastModified
                            ));
                        }
                        
                        // 导入标注
                        for (const annoData of data.annotations) {
                            const annotation = new Annotation();
                            annotation.id = annoData.id || crypto.randomUUID();
                            annotation.category = annoData.category;
                            annotation.updateTime = annoData.updateTime;
                            
                            // 导入文档范围
                            for (const rangeData of annoData.docRanges) {
                                annotation.docRanges.push(new DocumentRange(
                                    rangeData.documentId,
                                    rangeData.start,
                                    rangeData.end,
                                    rangeData.content
                                ));
                            }
                            
                            // 导入代码范围
                            for (const rangeData of annoData.codeRanges) {
                                annotation.codeRanges.push(new CodeRange(
                                    rangeData.documentId,
                                    rangeData.start,
                                    rangeData.end,
                                    rangeData.content
                                ));
                            }
                            
                            annotations.value.push(annotation);
                        }
                        
                        // 自动选择第一个文档和代码文件
                        if (docFiles.value.length > 0) {
                            selectDocFile(docFiles.value[0]);
                        }
                        if (codeFiles.value.length > 0) {
                            selectCodeFile(codeFiles.value[0]);
                        }
                        
                        ElMessage.success('标注导入成功');
                    } catch (error) {
                        console.error('导入失败:', error);
                        ElMessage.error(`导入失败: ${error.message}`);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };

        const handleExportAnnotations = () => {
            // 准备导出数据
            const exportData = {
                annotations: annotations.value.map(anno => ({
                    id: anno.id,
                    category: anno.category,
                    docRanges: anno.docRanges.map(range => ({
                        documentId: range.documentId,
                        start: range.start,
                        end: range.end,
                        content: range.content,
                    })),
                    codeRanges: anno.codeRanges.map(range => ({
                        documentId: range.documentId,
                        start: range.start,
                        end: range.end,
                        content: range.content
                    })),
                    updateTime: anno.updateTime
                })),
                docFiles: docFiles.value.map(file => ({
                    id: file.id,
                    name: file.name,
                    content: file.content,
                    type: file.type,
                    renderedDocument: file.renderedDocument,
                    lastModified: file.lastModified,
                    localPath: file.localPath
                })),
                codeFiles: codeFiles.value.map(file => ({
                    id: file.id,
                    name: file.name,
                    content: file.content,
                    type: file.type,
                    renderedDocument: file.renderedDocument,
                    lastModified: file.lastModified,
                    localPath: file.localPath
                }))
            };
            
            // 创建下载链接
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            

            // 生成文件名：标注项目_当前时间.json
            let defaultFilename = '标注项目';
            const now = new Date();
            const dateStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
            a.download = `${defaultFilename}_${dateStr}.json`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            ElMessage.success('标注导出成功');
        };

        // 初始化事件监听
        onMounted(() => {
            const docPanel = document.querySelector('.content-text-doc');
            if (docPanel) {
                docPanel.addEventListener('mouseup', handleDocSelection);
            }
            
            const codePanel = document.querySelector('.content-text-code');
            if (codePanel) {
                codePanel.addEventListener('mouseup', handleCodeSelection);
            }
        });

        return {
            showSettingsDialog, settingsForm, saveSettings,
            docFiles, codeFiles,
            selectedDocFile, selectedCodeFile,
            selectedDocContent, selectedCodeContent,
            renderError,
            docFolderUpload,
            codeFolderUpload,
            triggerDocFolderUpload,
            triggerCodeFolderUpload,
            handleDocFolderUpload,
            handleCodeFolderUpload,
            docUpload, codeUpload,
            triggerDocUpload, triggerCodeUpload,
            handleDocUpload, handleCodeUpload,
            selectDocFile, selectCodeFile,
            removeDocFile, removeCodeFile,
            annotations,
            currentSelection,
            showAnnotationDialog,
            newAnnotation,
            selectedAnnotation,
            editingAnnotation,
            annotationName,
            createAnnotation,
            addToAnnotation,
            editAnnotation,
            saveAnnotationName,
            removeAnnotation,
            removeRange,
            formatDate: (dateStr) => {
                const date = new Date(dateStr);
                return date.toLocaleString();
            },
            gotoRange,
            handleNewTask,handleImportAnnotations, handleExportAnnotations,
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