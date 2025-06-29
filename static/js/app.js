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
const { createApp, ref, watch} = Vue;
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
    const selectedRequirementId = ref(null); // Track the currently selected requirement block

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
        highlightCodeBlocks([]); // TODO: 已有高亮结果，再次上传代码文件时不清空高亮结果
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

      // Create a new block to wrap the selected content
      const wrapper = document.createElement('div');
      wrapper.classList.add('highlighted-block', 'selected-requirement'); // Add both states
      wrapper.dataset.id = `REQ_${requirementPoints.value.length + 1}`; // Assign a unique ID

      document.querySelectorAll('.highlighted-block').forEach(block => {
        block.classList.remove('selected-requirement'); // Remove selected state from other blocks
      });
      selectedRequirementId.value = wrapper.dataset.id; // Set the selected requirement ID
      wrapper.classList.add('selected-requirement'); // Add selected state

      const fragment = range.cloneContents();
      wrapper.appendChild(fragment);

      range.deleteContents();
      range.insertNode(wrapper);

      // Extract the original Markdown content
      const originalMarkdown = requirementMarkdown.value;
      let selectedHtml = Array.from(wrapper.childNodes)
        .map(node => node.outerHTML || node.textContent)
        .join('');
      selectedHtml = selectedHtml.replace(/\n/g, '');

      const selectedMarkdown = originalMarkdown.split('\n').filter(line => {
        if (!line.trim()) return false;
        const renderedLine = md.render(line).trim().replace(/\n/g, '').replace(/<[^>]+>/g, '');
        return selectedHtml.includes(renderedLine);
      }).join('\n');

      wrapper.dataset.originalMarkdown = selectedMarkdown;
      console.log('Selected Markdown:', selectedMarkdown);

      window.getSelection().removeAllRanges();
      confirmationVisible.value = false;

      // Send alignment request to the backend
      aligningState.value = true;
      try {
        const response = await axios.post('/api/auto-align', {
          requirement: selectedMarkdown,
          codeFiles: codeFiles.value.map(file => ({
            name: file.name,
            content: file.content
          }))
        });

        const id = wrapper.dataset.id;
        const relatedCode = response.data.relatedCode || [
          { filename: 'code.cpp', start: 1, end: 4 },
          { filename: 'code.h', start: 1, end: 3 },
          { filename: 'code.h', start: 9, end: 10 }
        ];

        // Add or update the requirement point
        const existingPointIndex = requirementPoints.value.findIndex(point => point.id === id);
        if (existingPointIndex !== -1) {
          requirementPoints.value[existingPointIndex].relatedCode = relatedCode;
        } else {
          requirementPoints.value.push({ id, text: selectedMarkdown, relatedCode });
        }

        highlightCodeBlocks(relatedCode); // Update code highlights

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
        aligningState.value = false;
      }
    }

    function handleCancel() {
      // Hide confirmation box
      window.getSelection().removeAllRanges(); // Clear the selection
      confirmationVisible.value = false;
    }

    // 点击需求高亮块
    function handleRequirementClick(event) {
      const target = event.target.closest('.highlighted-block');
      if (!target) return;

      const id = target.dataset.id;
      if (selectedRequirementId.value === id) {
        // Deselect the block
        selectedRequirementId.value = null;
        target.classList.remove('selected-requirement');
        highlightCodeBlocks([]); // Clear code highlights
      } else {
        // Deselect other requirement blocks
        document.querySelectorAll('.highlighted-block').forEach(block => {
          block.classList.remove('selected-requirement');
        });

        // Select the block
        selectedRequirementId.value = id;
        target.classList.add('selected-requirement');

        const point = requirementPoints.value.find(point => point.id === id);
        if (point) {
          highlightCodeBlocks(point.relatedCode); // Highlight code based on the alignment results
        }
      }
    }

    // Add a click handler for highlighted blocks
    document.addEventListener('click', handleRequirementClick);

    const highlightCodeBlocks = (relatedCode) => {
      codeFiles.value.forEach(file => {
        const relatedResults = relatedCode.filter(code => code.filename === file.name);

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
      selectedRequirementId,
      handleRequirementClick,
      highlightCodeBlocks,
    };
  }
});

app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.mount('#app');
