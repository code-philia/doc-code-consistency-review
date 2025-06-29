// 初始化 Markdown-It + TeX 插件，并注入 parse-start/end
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

// 重写 renderer，标记 parse-start/end
function injectSourcePos(md) {

}
injectSourcePos(md);


// 4. Vue 应用
const { createApp, ref} = Vue;
const { ElButton, ElMessage } = ElementPlus;

const app = createApp({
  delimiters: ['${', '}'],
  setup() {
    const requirementFilename = ref('');
    const requirementMarkdown = ref('');
    const requirementHtml     = ref('');
    const codeFiles           = ref([]);
    const showUpload          = ref(false);
    const activeNames         = ref([]);
    const selectedText        = ref('');
    const requirementRoot     = ref(null);

    const requirementPoints = ref([]); // [{id, text, start, end, align:[{filename, content, start, end},]}]
    const aligningState = ref(false); // 是否正在对齐

    // 渲染 Markdown -> HTML（含 parse-start/end）
    const renderMarkdownWithLatex = (markdownContent) => {
        const html = md.render(markdownContent);
        const container = document.createElement('div');
        container.innerHTML = html;
        return container.innerHTML;
    };

    // 上传需求文档
    const handleRequirementUploadChange = (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        requirementFilename.value = file.name;
        requirementMarkdown.value = e.target.result.replace(/\r\n/g, '\n');
        requirementHtml.value     = renderMarkdownWithLatex(requirementMarkdown.value);
      };
      reader.readAsText(file.raw);
    };
    const handleRequirementRemove = () => {
      requirementFilename.value = '';
      requirementMarkdown.value = '';
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

    const confirmationBox = ref(null); // Reference to the confirmation box element
    const confirmationVisible = ref(false); // State for confirmation box visibility
    const confirmationPosition = ref({ x: 0, y: 0 }); // Position of the confirmation box

    // 鼠标抬起：高亮并映射多单元选区到原始 Markdown
    // #TODO: 匹配不成功
    function onMouseUp(event) {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.toString() === '') { 
        confirmationVisible.value = false;
        return;
      }
      const range = sel.getRangeAt(0);

      // Check if the selection overlaps with an existing highlighted block
      const commonAncestor = range.commonAncestorContainer;
      const parentBlock = commonAncestor.nodeType === 1
        ? commonAncestor.closest('.highlighted-block')
        : commonAncestor.parentElement?.closest('.highlighted-block');

      if (parentBlock) {
        console.log('Selection overlaps with an existing highlighted block. No new block created.');
        return;
      }

      // Show confirmation box near the mouse cursor
      confirmationPosition.value = { x: event.clientX, y: event.clientY };
      confirmationVisible.value = true;

      // Store the range for later use
      confirmationBox.value = { range, sel };
    }

    // 确认高亮并对齐需求
    async function handleConfirm() {
      const { range } = confirmationBox.value;

      // 高亮
      const wrapper = document.createElement('div');
      wrapper.classList.add('highlighted-block');

      const fragment = range.cloneContents();
      wrapper.appendChild(fragment);

      range.deleteContents();
      range.insertNode(wrapper);

      // 获取原始文本
      const originalMarkdown = requirementMarkdown.value;
      let selectedHtml = Array.from(wrapper.childNodes)
        .map(node => node.outerHTML || node.textContent)
        .join('');

      selectedHtml = selectedHtml.replace(/\n/g, '');

      const selectedMarkdown = originalMarkdown.split('\n').filter(line => {
        if (!line.trim()) return false;
        const renderedLine = md.render(line).trim().replace(/\n/g, '').replace(/<[^>]+>/g, '');
        const result = selectedHtml.includes(renderedLine);
        return result;
      }).join('\n');

      wrapper.dataset.originalMarkdown = selectedMarkdown;
      console.log('Selected Markdown:', selectedMarkdown);

      window.getSelection().removeAllRanges();
      confirmationVisible.value = false;

      // 对齐需求和代码
      // TODO：写后端
      aligningState.value = true;
      try {
        const response = await axios.post('/api/auto-align', {
            requirement: selectedMarkdown,
            codeFiles: codeFiles.value.map(file => ({
                name: file.name,
                content: file.content
            }))
        });
        const id = requirementPoints.value.length + 1;
        requirementPoints.value.push({
            id: `REQ_${id}`,
            text: selectedMarkdown,
            relatedCode: response.data.relatedCode || [
              { filename: 'code.cpp', content: '', start: 1, end: 4 },
              { filename: 'code.h', content: '', start: 1, end: 3 },
              { filename: 'code.h', content: '', start: 9, end: 10 }
            ],
        });

        // 高亮代码块
        highlightCodeBlocks();

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
        aligningState.value = false; // 无论成功或失败都重置加载状态
      }
    }

    function handleCancel() {
      // Hide confirmation box
      window.getSelection().removeAllRanges(); // Clear the selection
      confirmationVisible.value = false;
    }

    // Add a click handler for highlighted blocks
    document.addEventListener('click', (event) => {
      const target = event.target.closest('.highlighted-block');
      if (target) {
        event.stopPropagation(); // Prevent event propagation
        const originalMarkdown = target.dataset.originalMarkdown;
        console.log('Clicked highlighted block with original Markdown:', originalMarkdown);
      }
    });

    const highlightCodeBlocks = () => {
      codeFiles.value.forEach(file => {
        const relatedResults = requirementPoints.value.flatMap(point => 
          point.relatedCode.filter(code => code.filename === file.name)
        );

        // Update the file name with the number of results
        file.resultCount = relatedResults.length;

        // Highlight the code blocks
        const lines = file.numberedContent.split('\n');
        const highlightedContent = [];
        let currentBlock = null;

        lines.forEach((line, index) => {
          const lineNumber = index + 1;
          const isHighlighted = relatedResults.some(result => 
            lineNumber >= result.start && lineNumber <= result.end
          );

          if (isHighlighted) {
            if (!currentBlock) {
              currentBlock = []; // Start a new block
            }
            currentBlock.push(line); // Add line to the current block
          } else {
            if (currentBlock) {
              // Render the current block as a single highlighted block
              highlightedContent.push(`<div class="highlighted-code">${currentBlock.join('\n')}</div>`);
              currentBlock = null; // Reset the block
            }
            highlightedContent.push(line); // Add non-highlighted line
          }
        });

        // Render any remaining block
        if (currentBlock) {
          highlightedContent.push(`<div class="highlighted-code">${currentBlock.join('\n')}</div>`);
        }

        file.highlightedContent = highlightedContent.join('\n');
      });
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

      confirmationVisible,
      confirmationPosition,
      handleConfirm,
      handleCancel,

      aligningState,
      highlightCodeBlocks,
    };
  }
});

app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.mount('#app');
