// app.js

// --- 1. 在 index.html 中通过 <script> 已加载：
//     markdown-it, markdown-it-texmath, katex, Vue, ElementPlus, ElementPlusIconsVue

// 2. 初始化 Markdown-It + TeX 插件，并注入 parse-start/end
const md = window.markdownit({
  html: true,
  linkify: true,
  typographer: true
});
window.texmath.use(window.katex);
md.use(window.texmath, {
  delimiters: 'dollars',
  katexOptions: { "\\RR": "\\mathbb{R}" }
});

// 重写 renderer，给每个 token.open 标记 parse-start/end
function injectSourcePos(md) {
  const defaultRender = md.renderer.renderToken.bind(md.renderer);
  md.renderer.renderToken = (tokens, idx, options) => {
    const token = tokens[idx];
    if (token.map && token.type.endsWith('_open')) {
      const start = token.map[0], end = token.map[1];
      token.attrSet('parse-start', start);
      token.attrSet('parse-end',   end);
    }
    return defaultRender(tokens, idx, options);
  };
}
injectSourcePos(md);

// --- 3. 辅助函数：DOM 选区映射到 Markdown 偏移
function getCaretCharacterOffsetWithin(container, offset, boundaryNode) {
  let chars = 0;
  const walker = document.createTreeWalker(
    boundaryNode,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  let node;
  while (node = walker.nextNode()) {
    if (node === container) {
      return chars + offset;
    }
    chars += node.textContent.length;
  }
  return null;
}

function getStartOffset(node) {
  if (node.nodeType === 1 && node.hasAttribute('parse-start')) {
    return parseInt(node.getAttribute('parse-start'), 10);
  }
  return null;
}

function getEndOffset(node) {
  if (node.nodeType === 1 && node.hasAttribute('parse-end')) {
    return parseInt(node.getAttribute('parse-end'), 10);
  }
  return null;
}

// 根据 DOM 位置(container, offset) 映射到原始 Markdown 文本的绝对 offset
function findOffsetFromPosition(container, offset, rootElement, reduce = null) {
  let node = container;
  while (node) {
    if (node.nodeType === 1) {
      const start = getStartOffset(node);
      const end   = getEndOffset(node);
      if (start != null && end != null) {
        if (node.classList.contains('parse-math')) {
          if (reduce === 'start') return start;
          if (reduce === 'end')   return end;
        }
        const inner = getCaretCharacterOffsetWithin(container, offset, node);
        if (inner != null) {
          if (inner === 0) return start;
          const len = node.textContent.length;
          return end - (len - inner);
        }
      }
    }
    if (node === rootElement) {
      return getCaretCharacterOffsetWithin(container, offset, rootElement);
    }
    node = node.parentNode;
  }
  return null;
}


// 4. Vue 应用
const { createApp, ref } = Vue;
const { ElButton, ElMessage } = ElementPlus;

const app = createApp({
  delimiters: ['${', '}'],
  setup() {
    const requirementFilename = ref('');
    const requirementMarkdown = ref('#### 未加载需求文档... ####');
    const requirementHtml     = ref('');
    const codeFiles           = ref([]);
    const showUpload          = ref(false);
    const activeNames         = ref([]);
    const selectedText        = ref('');
    const requirementRoot     = ref(null);

    const requirementPoints   = ref([]); // [{id, text, start, end, align:[{filename, content, start, end},]}]

    // 渲染 Markdown -> HTML（含 parse-start/end）
    const renderMarkdownWithLatex = (markdownContent) => {
        // 1) 构建每行的起始字符偏移数组
        const lines = markdownContent.split('\r\n');
        console.log('Markdown lines:', lines);

        const lineOffsets = [];
        let pos = 0;
        for (let i = 0; i < lines.length; i++) {
          lineOffsets.push(pos);
          pos += lines[i].length + 1; 
        }
        lineOffsets.push(pos);

        // 2) Monkey‑patch md.renderer.renderToken，注入基于字符偏移的 parse-start / parse-end
            const originalRenderToken = md.renderer.renderToken.bind(md.renderer);
            md.renderer.renderToken = (tokens, idx, options) => {
                const token = tokens[idx];
                if (token.map && token.type.endsWith('_open')) {
                  const [lineBegin, lineEnd] = token.map;
                  const start = lineOffsets[lineBegin];
                  const end = lineOffsets[lineEnd] - 1;
                  token.attrSet('parse-start', start);
                  token.attrSet('parse-end', end);
                }
                return originalRenderToken(tokens, idx, options);
            };

            // 3) 渲染
            const html = md.render(markdownContent);

            // 4) 恢复原始 renderer
            md.renderer.renderToken = originalRenderToken;

            // 5) 为每个带 parse-start 的元素外层包一层 span.parse-unit（可选）
            const container = document.createElement('div');
            container.innerHTML = html;
            container.querySelectorAll('[parse-start]').forEach(el => {
                const wrapper = document.createElement('span');
                wrapper.className = 'parse-unit';
                wrapper.setAttribute('parse-start', el.getAttribute('parse-start'));
                wrapper.setAttribute('parse-end',   el.getAttribute('parse-end'));
                el.replaceWith(wrapper);
                wrapper.appendChild(el);
            });


        console.log('渲染前的 Markdown:\n', markdownContent);
        console.log('渲染后的 HTML:\n', container.innerHTML);
        return container.innerHTML;
    };

    // 鼠标抬起：高亮并映射多单元选区到原始 Markdown
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // 遍历所有“渲染单元”并高亮相交的
      const units = requirementRoot.value.querySelectorAll('[parse-start]');
      let minStart = Infinity, maxEnd = -Infinity;

      units.forEach(el => {
        if (range.intersectsNode(el)) {
          el.classList.add('highlight');
          const s = parseInt(el.getAttribute('parse-start'), 10);
          const e = parseInt(el.getAttribute('parse-end'),   10);
          if (s < minStart) minStart = s;
          if (e > maxEnd)   maxEnd   = e;
        }
      });

      // 从原始 Markdown 中切片
      if (minStart < maxEnd && minStart !== Infinity) {
        selectedText.value = requirementMarkdown.value.slice(minStart, maxEnd);
        console.log(`原文区间 [${minStart},${maxEnd}]`,sel.toString(),'->', selectedText.value);
      }
    }

    // 上传需求文档
    const handleRequirementUploadChange = (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        requirementFilename.value = file.name;
        requirementMarkdown.value = e.target.result;
        requirementHtml.value     = renderMarkdownWithLatex(requirementMarkdown.value);
      };
      reader.readAsText(file.raw);
    };
    const handleRequirementRemove = () => {
      requirementFilename.value = '';
      requirementMarkdown.value = '#### 未加载需求文档... ####';
      requirementHtml.value     = '';
    };
    const handleRequirementExceed = () => {
      ElMessage({
        message: '只能上传一个需求文档文件，请删除后再上传新的文件',
        type: 'warning',
        duration: 4000
      });
    };

    // 上传代码文件
    const handleUploadChange = (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        let content;
        try {
          content = new TextDecoder('utf-8').decode(new Uint8Array(e.target.result));
        } catch {
          content = new TextDecoder('gbk').decode(new Uint8Array(e.target.result));
        }
        let numbered = '';
        content.split('\n').forEach((line, i) => {
          numbered += `${(i+1)+':'}`.padEnd(5,' ') + line + '\n';
        });
        codeFiles.value.push({ name: file.name, content, numberedContent: numbered });
        setTimeout(() => {
          document.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }, 0);
      };
      reader.readAsArrayBuffer(file.raw);
    };
    const handleCodeFileRemove = (file) => {
      const idx = codeFiles.value.findIndex(x => x.name === file.name);
      if (idx !== -1) {
        codeFiles.value.splice(idx, 1);
        activeNames.value = activeNames.value.filter(n => n !== idx);
      }
    };
    const handleCodeSpanChange = names => { activeNames.value = names; };

    const alignSingleRequirement = async point => {
      // TODO: 对齐逻辑
    };

    return {
      requirementFilename,
      requirementMarkdown,
      requirementHtml,
      codeFiles,
      showUpload,
      activeNames,
      selectedText,
      requirementRoot,
      renderMarkdownWithLatex,
      handleRequirementUploadChange,
      handleRequirementRemove,
      handleRequirementExceed,
      handleUploadChange,
      handleCodeFileRemove,
      handleCodeSpanChange,
      onMouseUp,
      alignSingleRequirement
    };
  }
});

app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.mount('#app');
