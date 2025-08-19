import { unified } from 'https://esm.sh/unified@11.0.4';
import remarkParse from 'https://esm.sh/remark-parse@11.0.0';
import remarkGfm from 'https://esm.sh/remark-gfm@4.0.0';
import remarkMath from 'https://esm.sh/remark-math@6.0.0';
import remarkRehype from 'https://esm.sh/remark-rehype@11.1.0';
import rehypeKatex from 'https://esm.sh/rehype-katex@7.0.0';
import rehypeStringify from 'https://esm.sh/rehype-stringify@10.0.0';
import { trimLines } from 'https://esm.sh/trim-lines@3.0.1';

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

        return String(file);
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
    const textLines = splitLines(codeContent, true);

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

// 计算在元素内的文本偏移量
function getCaretCharacterOffsetWithin(container, offset, element) {
    let caretOffset = null;
    const preCaretRange = new Range();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(container, offset);
    caretOffset = preCaretRange.toString().length;
    return caretOffset;
}

// 计算在原始文档中的偏移量
function findOffsetFromPosition(container, offset, rootElement, reduce = null) {
    let node = container;
    for (; node; node = node.parentNode) {
        let parseStart;
        let parseEnd;  // NOTE We use this because <td> parse-start will start from '| xxx' in source document
        if (
            node instanceof HTMLElement
            && (parseStart = node.getAttribute('parse-start')) !== null
            && (parseEnd = node.getAttribute('parse-end')) !== null
        ) {
            const i = parseInt(parseStart);
            const j = parseInt(parseEnd);
            if (!Number.isNaN(i) && !Number.isNaN(j)) {
                // TODO: reduce to the start or end of math element
                if (node.classList.contains('parse-math')) {
                    if (reduce === 'start') {
                        return i;
                    }
                    if (reduce === 'end') {
                        return j;
                    }
                }

                // container: contain the text
                // offset: the offset in the text
                // node: the node that contains the parse-start and parse-end attributes
                const _offset = getCaretCharacterOffsetWithin(container, offset, node);
                if (_offset === 0) return i;

                // NOTE e.g., <td> parse-start will start from '| xxx' in source document, and similarly there are other elements that text content starts at different offset
                // NOTE do not use getTextContentBytesLength here because it is the length as string in sourceDocument
                return _offset === null ? null : j - ((node.textContent?.length ?? 0) - _offset);
            }
        }

        if (node === rootElement) {
            const _offset = getCaretCharacterOffsetWithin(container, offset, rootElement);
            return _offset;
        }
    }

    return null;
}

// 获取原始文档中的范围
export function getSourceDocumentRange(rootElement, range) {
    const limitedRange = new Range();
    limitedRange.setStartBefore(rootElement);
    limitedRange.setEndAfter(rootElement);

    const comp = (i) => range.compareBoundaryPoints(i, limitedRange);

    if (
        comp(Range.END_TO_START) >= 0       // range start is behind element's end
        || comp(Range.START_TO_END) <= 0    // range end is before element's start
    ) {
        return [0, 0];
    }

    if (comp(Range.START_TO_START) > 0) { // range start is behind element start
        limitedRange.setStart(range.startContainer, range.startOffset);
    }

    if (comp(Range.END_TO_END) < 0) {     // range end is before element end
        limitedRange.setEnd(range.endContainer, range.endOffset);
    }

    console.log(limitedRange.startContainer, limitedRange.startOffset, limitedRange.endContainer, limitedRange.endOffset);

    const startOffset = findOffsetFromPosition(limitedRange.startContainer, limitedRange.startOffset, rootElement, 'start');
    const endOffset = findOffsetFromPosition(limitedRange.endContainer, limitedRange.endOffset, rootElement, 'end');

    if (startOffset === null || endOffset === null) {
        return [0, 0];
    }

    return [startOffset, endOffset];
}

/****************************
 * 滚动定位工具函数
 ****************************/

// 滚动到文档中的指定偏移量
export function scrollToRange(targetStart, targetEnd, type = 'doc') {
    const editorDiv = document.querySelector(`.content-text-${type}`);
    if (!editorDiv) return;

    const elements = editorDiv.querySelectorAll('[parse-start][parse-end]');
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];

        const start = parseInt(el.getAttribute('parse-start'));
        const end = parseInt(el.getAttribute('parse-end'));

        if ((start >= targetStart && start <= targetEnd) || (end >= targetStart && end <= targetEnd)) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const originalBg = el.style.backgroundColor;
            el.style.backgroundColor = 'rgba(255,255,0,0.3)';
            setTimeout(() => {
                el.style.backgroundColor = originalBg;
            }, 5000);
        }
    }
}