import { unified, remarkParse, remarkGfm, remarkMath, remarkRehype, rehypeKatex, rehypeStringify, trimLines } from './thirdParty/bundle.js';

/****************************
 * Markdown Rendering 
 * with Position Attributes
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

function inlineMathHandler(state, node) {
    const codeElement = {
        type: 'element',
        tagName: 'code',
        properties: {
            className: ['language-math', 'math-inline'],
            'parse-start': node.position.start.offset,
            'parse-end': node.position.end.offset
        },
        children: [{ type: 'text', value: node.value }]
    };
    state.patch(node, codeElement);
    return state.applyData(node, codeElement);
}

function mathBlockHandler(state, node) {
    const codeElement = {
        type: 'element',
        tagName: 'code',
        properties: {
            className: ['language-math', 'math-display'],
            'parse-start': node.position.start.offset,
            'parse-end': node.position.end.offset
        },
        children: [{ type: 'text', value: node.value }]
    };
    state.patch(node, codeElement);

    const preElement = {
        type: 'element',
        tagName: 'pre',
        properties: {
            'parse-start': node.position.start.offset,
            'parse-end': node.position.end.offset
        },
        children: [codeElement]
    };
    state.patch(node, preElement);
    return state.applyData(node, preElement);
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
    inlineCode: inlineCodeHandler,
    inlineMath: inlineMathHandler,
    math: mathBlockHandler
};

function propagateMathSourceRanges(html) {
    if (!html || typeof document === 'undefined') {
        return html;
    }

    const template = document.createElement('template');
    template.innerHTML = html;

    const mathRoots = template.content.querySelectorAll('.katex');
    mathRoots.forEach((mathRoot) => {
        const sourceOwner = mathRoot.closest('[parse-start][parse-end]');
        if (!sourceOwner) {
            return;
        }

        const start = sourceOwner.getAttribute('parse-start');
        const end = sourceOwner.getAttribute('parse-end');
        if (start == null || end == null) {
            return;
        }

        [mathRoot, ...mathRoot.querySelectorAll('*')].forEach((node) => {
            node.setAttribute('parse-start', start);
            node.setAttribute('parse-end', end);
        });
    });

    return template.innerHTML;
}

/**
 * Renders Markdown to HTML using unified/remark, adding position attributes.
 * @param {string} content The Markdown content.
 * @returns {Promise<string>} A promise that resolves to the rendered HTML string.
 */
export async function renderMarkdown(content) {
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

        return propagateMathSourceRanges(String(file));
    } catch (error) {
        console.error("Markdown rendering error:", error);
        throw error; // Re-throw to be caught by the caller
    }
}

/****************************
 * Code Rendering 
 * with Position Attributes
 ****************************/
export function formatCodeWithLineNumbers(codeContent) {
    const textLines = splitLines(codeContent, false);

    let innerHTML = '';
    let offset = 0;
    const createWrapperSpan = (line) => {
        line = line.match(/.*?(\r|\r?\n|$)/)?.[0] ?? '';

        const wrapperCode = document.createElement('code');   // FIXME line number of more than 3 digits will not be in good style
        wrapperCode.className = 'annotation-skip';

        const wrapperSpan = document.createElement('span');
        wrapperSpan.className = 'parse-wrapper-span';
        wrapperSpan.setAttribute('parse-start', `${offset}`);
        wrapperSpan.setAttribute('parse-end', `${offset += line.length}`);
        wrapperSpan.textContent = line;

        wrapperCode.appendChild(wrapperSpan);
        innerHTML += wrapperCode.outerHTML;

        wrapperSpan.remove();
    }

    textLines.forEach(createWrapperSpan);

    return innerHTML;
}

export function regularizeFileContent(content, type) {
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

export function splitLines(text, emptyLastLine = false) {
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

export function normalizePath(path) {
    if (!path) return '';

    // 检测路径中的分隔符
    const isWindowsPath = path.includes('\\');
    const separator = isWindowsPath ? '\\' : '/';

    // 规范化路径
    return path
        .replace(/[\\/]+/g, separator)  // 替换多个连续分隔符
        .replace(/[\\/]$/, '') + separator; // 确保以分隔符结尾
}

/****************************
 * 标注工具函数
 ****************************/
// 获取原始文档中的范围 - 简化版本，确保选中完整的parse元素
export function getSourceDocumentRange(rootElement, range) {
    if (!rootElement || !range) {
        return [0, 0];
    }

    const intersectsNodeSafe = (node) => {
        try {
            return typeof range.intersectsNode === 'function' && range.intersectsNode(node);
        } catch (error) {
            return false;
        }
    };

    const candidates = Array.from(rootElement.querySelectorAll('[parse-start][parse-end]'))
        .filter(intersectsNodeSafe)
        .map((node) => ({
            start: Number.parseInt(node.getAttribute('parse-start'), 10),
            end: Number.parseInt(node.getAttribute('parse-end'), 10)
        }))
        .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start);

    if (!candidates.length) {
        return [0, 0];
    }

    const uniqueCandidates = Array.from(
        new Map(candidates.map((item) => [`${item.start}:${item.end}`, item])).values()
    );

    const minimalCandidates = uniqueCandidates.filter((candidate) => {
        return !uniqueCandidates.some((other) => {
            if (other === candidate) {
                return false;
            }
            const isStrictSubset = other.start >= candidate.start &&
                other.end <= candidate.end &&
                (other.start > candidate.start || other.end < candidate.end);
            return isStrictSubset;
        });
    });

    const selectedRanges = minimalCandidates.length ? minimalCandidates : uniqueCandidates;
    const startOffset = Math.min(...selectedRanges.map((item) => item.start));
    const endOffset = Math.max(...selectedRanges.map((item) => item.end));

    return [startOffset, endOffset];
}

/****************************
 * 滚动定位与临时高亮
 ****************************/
const currentTemporaryHighlights = {
    doc: [],
    code: []
};

export function scrollToRange(targetStart, targetEnd, type = 'doc') {
    const editorDiv = getEditorContainer(type);
    if (!editorDiv) return;

    removeTemporaryHighlights(type);

    const elements = editorDiv.querySelectorAll('[parse-start][parse-end]');
    let firstHighlightedElement = null;

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const start = parseInt(el.getAttribute('parse-start'));
        const end = parseInt(el.getAttribute('parse-end'));

        // 检查元素是否与目标范围有重叠
        if (end > targetStart && start < targetEnd) {
            const highlightStart = Math.max(targetStart, start);
            const highlightEnd = Math.min(targetEnd, end);

            // 计算在元素内的相对位置
            const localStart = highlightStart - start;
            const localEnd = highlightEnd - start;

            const highlight = createTemporaryHighlightInElement(el, localStart, localEnd);
            if (highlight) {
                highlight._originalStyles = {
                    backgroundColor: highlight.style.backgroundColor,
                    boxShadow: highlight.style.boxShadow
                };

                highlight.style.backgroundColor = 'rgba(255, 255, 183, 0.8)';

                currentTemporaryHighlights[type].push(highlight);

                setTimeout(() => {
                    removeTemporaryHighlight(highlight, type);
                }, 5000);

                if (!firstHighlightedElement) {
                    firstHighlightedElement = highlight;
                }
            }
        }
    }

    if (firstHighlightedElement) {
        scrollElementIntoContainer(firstHighlightedElement, editorDiv);
    }
}

function scrollElementIntoContainer(element, container) {
    if (!element || !container) return;
    
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    const elementTop = elementRect.top - containerRect.top + container.scrollTop;
    
    const containerCenter = container.clientHeight / 2;
    const elementCenter = elementRect.height / 2;
    
    let targetScrollTop = elementTop - containerCenter + elementCenter;
    
    const maxScrollTop = container.scrollHeight - container.clientHeight;
    targetScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
    
    container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth'
    });
}

function createTemporaryHighlightInElement(element, start, end) {
    const textNodes = getTextNodesIn(element);
    let currentPos = 0;

    for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        const nodeLength = node.textContent.length;

        if (currentPos + nodeLength > start && currentPos < end) {
            const nodeStart = Math.max(0, start - currentPos);
            const nodeEnd = Math.min(nodeLength, end - currentPos);

            // 拆分文本节点并添加临时高亮
            if (nodeEnd > nodeStart) {
                const range = document.createRange();

                range.setStart(node, nodeStart);
                range.setEnd(node, nodeEnd);

                const highlightSpan = document.createElement('span');
                highlightSpan.className = 'temporary-highlight';

                try {
                    range.surroundContents(highlightSpan);
                    return highlightSpan;
                } catch (e) {
                    // 如果无法包围内容（例如范围跨越多个元素），则跳过
                    console.warn("无法创建高亮:", e);
                    return null;
                }
            }
        }

        currentPos += nodeLength;
    }

    return null;
}

function removeTemporaryHighlight(highlight, type) {
    if (highlight._originalStyles) {
        Object.assign(highlight.style, highlight._originalStyles);
        delete highlight._originalStyles;
    }

    const index = currentTemporaryHighlights[type].indexOf(highlight);
    if (index !== -1) {
        currentTemporaryHighlights[type].splice(index, 1);
    }

    const parent = highlight.parentNode;
    if (parent) {
        // 将高亮内容移回父节点
        while (highlight.firstChild) {
            parent.insertBefore(highlight.firstChild, highlight);
        }
        // 移除空的临时高亮元素
        parent.removeChild(highlight);
    }
}

export function removeTemporaryHighlights(type = null) {
    if (type) {
        while (currentTemporaryHighlights[type].length > 0) {
            const highlight = currentTemporaryHighlights[type].pop();
            if (highlight._originalStyles) {
                Object.assign(highlight.style, highlight._originalStyles);
                delete highlight._originalStyles;
            }

            const parent = highlight.parentNode;
            if (parent) {
                // 将高亮内容移回父节点
                while (highlight.firstChild) {
                    parent.insertBefore(highlight.firstChild, highlight);
                }
                // 移除空的临时高亮元素
                parent.removeChild(highlight);
            }
        }
    } else {
        removeTemporaryHighlights('doc');
        removeTemporaryHighlights('code');
    }
}

/****************************
 * 高亮工具函数
 ****************************/

// 存储当前高亮块的信息
const currentHighlightBlocks = {
    doc: new Map(), // key: annotationId, value: array of highlightBlock elements
    code: new Map()
};

function getEditorContainer(type = 'doc') {
    if (type === 'doc') {
        return document.querySelector('.doc-content-scroll') || document.querySelector('.content-text-doc');
    }
    return document.querySelector(`.content-text-${type}`);
}

// 高亮指定范围
export function highlightRange(start, end, type = 'doc', annotationId = null) {
    const editorDiv = getEditorContainer(type);
    if (!editorDiv) return [];

    // 创建高亮块
    const highlightBlock = createHighlightBlock(start, end, type, annotationId);
    if (highlightBlock) {
        editorDiv.appendChild(highlightBlock);
        
        if (annotationId) {
            // 如果该annotationId还没有高亮块数组，创建一个
            if (!currentHighlightBlocks[type].has(annotationId)) {
                currentHighlightBlocks[type].set(annotationId, []);
            }
            // 将新的高亮块添加到数组中
            currentHighlightBlocks[type].get(annotationId).push(highlightBlock);
        }
        
        return [highlightBlock];
    }

    return [];
}

// 创建高亮块
function createHighlightBlock(start, end, type, annotationId) {
    const editorDiv = getEditorContainer(type);
    if (!editorDiv) return null;

    // 计算高亮块的位置和尺寸
    const blockInfo = calculateHighlightBlockPosition(start, end, type);
    if (!blockInfo) return null;

    // 创建高亮块元素
    const highlightBlock = document.createElement('div');
    highlightBlock.className = 'highlight-block';
    if (annotationId) {
        highlightBlock.setAttribute('data-annotation-id', annotationId);
    }
    highlightBlock.setAttribute('data-range-start', start);
    highlightBlock.setAttribute('data-range-end', end);
    highlightBlock.setAttribute('data-type', type);

    // 设置位置和尺寸
    highlightBlock.style.position = 'absolute';
    highlightBlock.style.left = '0';
    highlightBlock.style.right = '0';
    highlightBlock.style.top = `${blockInfo.top}px`;
    highlightBlock.style.height = `${blockInfo.height}px`;
    highlightBlock.style.pointerEvents = 'auto';
    highlightBlock.style.zIndex = '1';

    return highlightBlock;
}

// 计算高亮块的位置信息
function calculateHighlightBlockPosition(start, end, type) {
    const editorDiv = getEditorContainer(type);
    if (!editorDiv) return null;

    const elements = editorDiv.querySelectorAll('[parse-start][parse-end]');
    let firstElement = null;
    let lastElement = null;

    // 找到范围内的第一个和最后一个元素
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const elemStart = parseInt(el.getAttribute('parse-start'));
        const elemEnd = parseInt(el.getAttribute('parse-end'));

        // 检查元素是否与目标范围有重叠
        if (elemEnd > start && elemStart < end) {
            if (!firstElement) {
                firstElement = el;
            }
            lastElement = el;
        }
    }

    if (!firstElement || !lastElement) return null;

    // 计算相对于编辑器容器的位置
    const editorRect = editorDiv.getBoundingClientRect();
    const firstRect = firstElement.getBoundingClientRect();
    const lastRect = lastElement.getBoundingClientRect();

    const top = firstRect.top - editorRect.top + editorDiv.scrollTop;
    const bottom = lastRect.bottom - editorRect.top + editorDiv.scrollTop;
    const height = bottom - top;

    return {
        top: top,
        height: height
    };
}

export function renderDecompositionBlock(start, end, type = 'doc', isAligned = false) {
    const editorDiv = getEditorContainer(type);
    if (!editorDiv) return;

    const blockInfo = calculateHighlightBlockPosition(start, end, type);
    if (!blockInfo) return;

    const div = document.createElement('div');
    div.className = 'decomposition-highlight highlight-block';
    div.setAttribute('data-range-start', start);
    div.setAttribute('data-range-end', end);
    div.setAttribute('data-type', type);
    
    div.style.position = 'absolute';
    div.style.left = '0';
    div.style.right = '0';
    div.style.top = `${blockInfo.top}px`;
    div.style.height = `${blockInfo.height}px`;
    div.style.backgroundColor = isAligned ? 'rgba(173, 216, 230, 0.4)' : 'rgba(200, 200, 200, 0.3)';
    div.style.pointerEvents = 'auto';
    div.style.zIndex = '1';
    
    editorDiv.appendChild(div);
}

export function updateDecompositionPositions(type) {
    const highlights = type
        ? (getEditorContainer(type)?.querySelectorAll('.decomposition-highlight') || [])
        : document.querySelectorAll('.decomposition-highlight');
    
    highlights.forEach(div => {
        const start = parseInt(div.getAttribute('data-range-start'));
        const end = parseInt(div.getAttribute('data-range-end'));
        const divType = div.getAttribute('data-type') || type;
        
        if (!isNaN(start) && !isNaN(end) && divType) {
            const blockInfo = calculateHighlightBlockPosition(start, end, divType);
            if (blockInfo) {
                div.style.top = `${blockInfo.top}px`;
                div.style.height = `${blockInfo.height}px`;
            }
        }
    });
}

/*
export function renderCodeBlockHighlight(startLine, endLine) {
    // Deprecated in favor of offset-based rendering
}
*/


export function clearDecompositionHighlights(type) {
    if (type) {
        getEditorContainer(type)?.querySelectorAll('.decomposition-highlight').forEach(el => el.remove());
        return;
    }
    document.querySelectorAll('.decomposition-highlight').forEach(el => el.remove());
}

// 移除所有高亮
export function removeAllHighlights(type = 'doc') {
    const editorDiv = getEditorContainer(type);
    if (!editorDiv) return;

    // 移除所有高亮块
    const highlights = editorDiv.querySelectorAll('.highlight-block');
    highlights.forEach(highlight => {
        highlight.remove();
    });

    // 清空存储的高亮块信息
    currentHighlightBlocks[type].clear();
}

// 移除特定标注的高亮
export function removeAnnotationHighlights(annotationId, type = 'doc') {
    if (!annotationId) return;

    const highlightBlocks = currentHighlightBlocks[type].get(annotationId);
    if (highlightBlocks && highlightBlocks.length > 0) {
        // 移除所有该annotationId的高亮块
        highlightBlocks.forEach(block => {
            if (block && block.parentNode) {
                block.remove();
            }
        });
        currentHighlightBlocks[type].delete(annotationId);
    }
}

// 更新高亮块位置（当内容发生变化时调用）
export function updateHighlightPositions(type = 'doc') {
    const blocks = currentHighlightBlocks[type];
    
    blocks.forEach((blockArray, annotationId) => {
        if (blockArray && blockArray.length > 0) {
            blockArray.forEach(block => {
                const start = parseInt(block.getAttribute('data-range-start'));
                const end = parseInt(block.getAttribute('data-range-end'));
                
                const blockInfo = calculateHighlightBlockPosition(start, end, type);
                if (blockInfo) {
                    block.style.top = `${blockInfo.top}px`;
                    block.style.height = `${blockInfo.height}px`;
                }
            });
        }
    });
}

// 确保编辑器容器具有相对定位
export function ensureEditorPositioning() {
    const docEditor = getEditorContainer('doc');
    const codeEditor = getEditorContainer('code');
    
    if (docEditor) {
        docEditor.style.position = 'relative';
    }
    if (codeEditor) {
        codeEditor.style.position = 'relative';
    }
}

// 获取元素内的所有文本节点
function getTextNodesIn(node) {
    const textNodes = [];
    const treeWalker = document.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let currentNode;
    while (currentNode = treeWalker.nextNode()) {
        textNodes.push(currentNode);
    }

    return textNodes;
}


// 将字符偏移转换为行号
export function convertOffsetToLineNumbers(content, startOffset, endOffset) {
    const lines = content.split('\n');
    let currentOffset = 0;
    let startLine = 1;
    let endLine = 1;
    let foundStart = false;

    for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 for the newline character

        if (!foundStart && currentOffset + lineLength > startOffset) {
            startLine = i + 1;
            foundStart = true;
        }

        if (currentOffset + lineLength > endOffset) {
            endLine = i + 1;
            break;
        }

        currentOffset += lineLength;
    }

    return { startLine, endLine };
}

export function generateUUIDLike() {
    const timestamp = Date.now().toString(36);
    const randomStr = () => Math.random().toString(36).slice(2, 10);
    const y = (Math.random() * 16 | 0).toString(16);
    return `${randomStr()}-${timestamp.slice(-4)}-${'4' + randomStr().slice(1)}-${(y & 0x3 | 0x8).toString(16) + randomStr().slice(1)}-${randomStr()}`;
}

/**
 * 从markdown文本中提取纯文本，去除markdown元素
 * @param {string} markdownText - 包含markdown格式的文本
 * @param {number} maxLength - 最大长度，默认20个字符
 * @returns {string} 提取的纯文本
 */
export function extractPlainTextFromMarkdown(markdownText, maxLength = 20) {
    if (!markdownText || typeof markdownText !== 'string') {
        return '';
    }

    let plainText = markdownText
        // 去除代码块
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]*`/g, '')
        // 去除链接，保留链接文本
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        // 去除图片
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        // 去除标题标记
        .replace(/^#{1,6}\s+/gm, '')
        // 去除粗体和斜体标记
        .replace(/\*\*([^*]*)\*\*/g, '$1')
        .replace(/\*([^*]*)\*/g, '$1')
        .replace(/__([^_]*)__/g, '$1')
        .replace(/_([^_]*)_/g, '$1')
        // 去除删除线
        .replace(/~~([^~]*)~~/g, '$1')
        // 去除列表标记
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // 去除引用标记
        .replace(/^>\s+/gm, '')
        // 去除水平线
        .replace(/^[-*_]{3,}$/gm, '')
        // 去除多余的空白字符
        .replace(/\s+/g, ' ')
        .trim();

    // 截取前几个字符作为名称
    if (plainText.length > maxLength) {
        plainText = plainText.substring(0, maxLength) + '...';
    }

    return plainText || '需求点';
}
