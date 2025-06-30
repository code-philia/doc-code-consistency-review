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
    const activeName          = ref('');
    const selectedText        = ref('');
    const requirementRoot     = ref(null);

    const requirementPoints = ref([]); // {id, text, relatedCode:[{filename, content, start, end}, ...],  reviewProcess, issues}
    const aligningState = ref(false); // 是否正在对齐
    const selectedRequirementId = ref(null); // 选中的需求块ID
    const currentCodeBlockIndex = ref(0); // 当前聚焦的代码块索引

    // 代码块取消对齐确认框
    const codeBlockConfirmationVisible = ref(false);
    const codeBlockConfirmationPosition = ref({ x: 0, y: 0 });
    const codeBlockToRemove = ref(null);

    const reviewProcess = ref(''); // State for storing review results
    const isEditingIssue = ref(false); // State to track editing mode
    const issues = ref('问题单（点击编辑按钮可修改内容）'); // Default issue content

    /**
     * 渲染 Markdown -> HTML（含 parse-start/end）
     * @param {*} markdownContent 
     * @returns 
     */
    const renderMarkdownWithLatex = (markdownContent) => {
        const html = md.render(markdownContent);
        const container = document.createElement('div');
        container.innerHTML = html;
        return container.innerHTML;
    };

    /**
     * 上传需求文档处理函数
     * @param {*} file 
     */
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

    /**
     * 上传代码文件处理函数
     * @param {*} file 
     */
    const handleUploadChange = (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        let content;
        try {
          content = new TextDecoder('utf-8').decode(new Uint8Array(e.target.result));
        } catch {
          content = new TextDecoder('gbk').decode(new Uint8Array(e.target.result));
        }
        content = content.replace(/\r\n/g, '\n'); // Normalize line endings
        let numbered = '';
        content.split('\n').forEach((line, i) => {
          numbered += `${(i+1)+':'}`.padEnd(5,' ') + line + '\n';
        });
        codeFiles.value.push({ name: file.name, content, numberedContent: numbered });
        if (selectedRequirementId.value === null) { 
          highlightCodeBlocks([]);
        }
        else {
          for (const point of requirementPoints.value) {
            if (point.id === selectedRequirementId.value) {
              highlightCodeBlocks(point.relatedCode);
              break;
            }
          }
        }
      };
      reader.readAsArrayBuffer(file.raw);
    };
    const handleCodeFileRemove = (file) => {
      const idx = codeFiles.value.findIndex(x => x.name === file.name);
      if (idx !== -1) {
        codeFiles.value.splice(idx, 1);
        if(activeName.value === file.name) {
          activeName.value = '';
        }
      }
    };
    const handleCodeSpanChange = name => {
      activeName.value = name;
    };


    /**
     * 确认高亮并对齐需求
     * @param {*} 
     * @return
     */
    // #TODO: 匹配不成功
    async function handleStartAlign() {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.toString() === '') { 
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

      window.getSelection().removeAllRanges();

      // Send alignment request to the backend
      aligningState.value = true;
      try {
        const response = await axios.post('/api/query-related-code', {
          requirement: selectedMarkdown,
          codeFiles: codeFiles.value.map(file => ({
            name: file.name,
            content: file.content
          }))
        });

        const id = wrapper.dataset.id;
        const relatedCode = response.data.relatedCode || [];

        // Add or update the requirement point
        const existingPointIndex = requirementPoints.value.findIndex(point => point.id === id);
        if (existingPointIndex !== -1) {
          requirementPoints.value[existingPointIndex].relatedCode = relatedCode;
        } else {
          requirementPoints.value.push({ id, text: selectedMarkdown, relatedCode });
        }

        highlightCodeBlocks(relatedCode); // Update code highlights
        currentCodeBlockIndex.value = 0; // Default to the first code block
        scrollToCodeBlock(currentCodeBlockIndex.value); // Scroll to the first code block
        
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


    /**
     * 滚动到指定代码块
     * @param {*} index 
     * @returns 
     */
    function scrollToCodeBlock(index) {
      const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
      if (!point || index < 0 || index >= point.relatedCode.length) return;

      const codeBlock = point.relatedCode[index];
      const file = codeFiles.value.find(f => f.name === codeBlock.filename);
      if (!file) return;

      // Expand the file if it is collapsed
      if (activeName.value !== file.name) {
        activeName.value = file.name; // Set activeName to the target panel's name
      }

      // Scroll to the code block
      const codeContainer = document.querySelector(`#code`);
      const codeElement = codeContainer.querySelector(`pre div.highlighted-code:nth-child(${codeBlock.start})`);
      if (codeElement) {
        codeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    /**
     * 点击选中需求高亮块
     * @param {*} event 
     * @returns 
     */
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
          currentCodeBlockIndex.value = 0; // Default to the first code block
          highlightCodeBlocks(point.relatedCode); // Highlight code based on the alignment results
          scrollToCodeBlock(currentCodeBlockIndex.value); // Scroll to the first code block

          reviewProcess.value = renderMarkdownWithLatex(point.reviewProcess);
          issues.value = point.issues;
        }
      }
    }

    function handleLastButtonClick() {
      if (selectedRequirementId.value) {
        const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
        currentCodeBlockIndex.value = Math.max(0, currentCodeBlockIndex.value - 1); // Navigate to the previous block
        highlightCodeBlocks(point.relatedCode);
        scrollToCodeBlock(currentCodeBlockIndex.value);
      }
    }

    function handleNextButtonClick() {
      if (selectedRequirementId.value) {
        const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
        currentCodeBlockIndex.value = Math.min(point.relatedCode.length - 1, currentCodeBlockIndex.value + 1); // Navigate to the next block
        highlightCodeBlocks(point.relatedCode); // Highlight code based on the alignment results
        scrollToCodeBlock(currentCodeBlockIndex.value);
      }
    }

    /**
     * 根据相关代码高亮代码块
     * @param {*} relatedCode 
     */
    const highlightCodeBlocks = (relatedCode) => {
      codeFiles.value.forEach(file => {
        const relatedResults = relatedCode.filter(code => code.filename === file.name);

        // Update the file name with the number of results
        file.resultCount = relatedResults.length;

        // Highlight the code blocks
        const lines = file.numberedContent.split('\n');
        const highlightedContent = [];
        let currentBlock = null;
        let currentStart = null;

        lines.forEach((line, index) => {
          const lineNumber = index + 1;
          const isHighlighted = relatedResults.some(result => 
            lineNumber >= result.start && lineNumber <= result.end
          );

          if (isHighlighted) {
            if (!currentBlock) {
              currentBlock = []; // Start a new block
              currentStart = lineNumber; // Record the start line number
            }
            currentBlock.push(line); // Add line to the current block
          } else {
            if (currentBlock) {
              // Render the current block as a single highlighted block
              const blockElement = document.createElement('div');
              blockElement.classList.add('highlighted-code');
              blockElement.dataset.start = currentStart; // Set start attribute
              blockElement.dataset.end = lineNumber - 1; // Set end attribute
              blockElement.dataset.filename = file.name; // Set filename attribute
              if (currentCodeBlockIndex.value === relatedCode.findIndex(result => ((result.start === currentStart) && (result.filename === file.name)))) {
                blockElement.classList.add('current-code-block'); // Add the current block class
              }
              blockElement.innerHTML = currentBlock.join('\n');
              highlightedContent.push(blockElement.outerHTML);
              currentBlock = null; // Reset the block
            }
            highlightedContent.push(line); // Add non-highlighted line
          }
        });

        // Render any remaining block
        if (currentBlock) {
          const blockElement = document.createElement('div');
          blockElement.classList.add('highlighted-code');
          blockElement.dataset.start = currentStart; // Set start attribute
          blockElement.dataset.end = lines.length; // Set end attribute
          blockElement.dataset.filename = file.name; // Set filename attribute
          if (currentCodeBlockIndex.value === relatedCode.findIndex(result => ((result.start === currentStart) && (result.filename === file.name)))) {
            blockElement.classList.add('current-code-block'); // Add the current block class
          }
          blockElement.innerHTML = currentBlock.join('\n');
          highlightedContent.push(blockElement.outerHTML);
        }

        file.highlightedContent = highlightedContent.join('\n');
      });
    };

    /**
     * 点击选中代码块
     * @param {*} event 
     * @returns 
     */
    function handleCodeBlockClick(event) {
      const target = event.target.closest('.highlighted-code');
      if (!target || !selectedRequirementId.value) return;

      // Show confirmation box near the clicked code block
      codeBlockConfirmationPosition.value = { x: event.clientX, y: event.clientY };
      codeBlockConfirmationVisible.value = true;

      // Determine the code block to remove
      const lineStart = parseInt(target.dataset.start, 10);
      const lineEnd = parseInt(target.dataset.end, 10);
      const filename = target.dataset.filename; // Retrieve filename from the dataset
      codeBlockToRemove.value = { start: lineStart, end: lineEnd, filename };
    }

    function handleCodeBlockRemoveConfirm() {
      const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
      if (!point || !codeBlockToRemove.value) return;

      // Remove the code block from relatedCode
      point.relatedCode = point.relatedCode.filter(code => 
        code.start !== codeBlockToRemove.value.start || 
        code.end !== codeBlockToRemove.value.end || 
        code.filename !== codeBlockToRemove.value.filename
      );

      // Refresh code highlights
      highlightCodeBlocks(point.relatedCode);

      // Hide confirmation box
      codeBlockConfirmationVisible.value = false;
      codeBlockToRemove.value = null;

      ElMessage({
        message: '代码块对齐已取消',
        type: 'success',
        duration: 2000
      });
    }

    function handleCodeBlockRemoveCancel() {
      // Hide confirmation box
      codeBlockConfirmationVisible.value = false;
      codeBlockToRemove.value = null;
    }

    /**
     * 确认选中代码对齐
     * @returns 
     */
    function handleAddAlign() {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.toString() === '') {
        ElMessage({
          message: '请选中一段代码',
          type: 'warning',
          duration: 4000
        });
        return;
      }
      const range = sel.getRangeAt(0);

      const filename = activeName.value;
      if (!filename || filename==='') {
        ElMessage({
          message: '请选中一段代码',
          type: 'warning',
          duration: 4000
        });
        return;
      }

      const file = codeFiles.value.find(f => f.name === filename);
      if (!file) return;

      const lines = file.numberedContent.split('\n'); // Split the original content into lines

      // Extract the selected content using range.cloneContents()
      const fragment = range.cloneContents();
      const selectedText = Array.from(fragment.childNodes)
        .map(node => node.textContent || '')
        .join('')
        .trim();

      console.log('Selected text:', selectedText);

      // Find the start and end line numbers by matching the selected text against the original lines
      let startLine = null;
      let endLine = null;

      for (let i = 0; i < lines.length; i++) {
        if (startLine === null && lines[i].includes(selectedText.split('\n')[0])) {
          startLine = i + 1; // Line numbers are 1-based
        }
        if (lines[i].includes(selectedText.split('\n').slice(-1)[0])) {
          endLine = i + 1; // Line numbers are 1-based
        }
        if (startLine !== null && endLine !== null) break;
      }

      if (!startLine || !endLine || startLine > endLine) return; // Ensure valid range

      console.log('Selected code lines:', startLine, endLine);

      // Construct the selected code block
      const selectedContent = lines.slice(startLine - 1, endLine).join('\n');
      const selectedCodeBlock = { filename, content: selectedContent, start: startLine, end: endLine };

      // Add the selected code block to the relatedCode of the currently selected requirement block
      const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
      if (!point) {
        ElMessage({
          message: '请点击选中一段需求',
          type: 'warning',
          duration: 4000
        });
        return;
      }

      point.relatedCode.push(selectedCodeBlock);

      // Refresh code highlights
      highlightCodeBlocks(point.relatedCode);

      window.getSelection().removeAllRanges();

      // Show success message
      ElMessage({
        message: '代码块已选中并对齐',
        type: 'success',
        duration: 2000
      });
    }


    /**
     * 处理开始审查按钮点击事件
     * @returns
     */
    async function handleStartReview() {
      if (!selectedRequirementId.value) {
        ElMessage({
          message: '请先选中一个需求块进行审查',
          type: 'warning',
          duration: 3000
        });
        return;
      }

      const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
      if (!point) {
        ElMessage({
          message: '选中的需求块不存在，请重新选择',
          type: 'error',
          duration: 3000
        });
        return;
      }

      try {
        // Send the selected requirement block to the backend
        const response = await axios.post('/api/review-consistency', { requirement: point.text, relatedCode: point.relatedCode });

        // Mock response data for testing
        point.reviewProcess = response.data.reviewProcess || "### 审查结果"; // Update the review result in the requirement point
        point.issues = response.data.issues || '问题单（点击编辑按钮可修改内容）'; // Update the issue list

        // Update the review results
        reviewProcess.value = renderMarkdownWithLatex(point.reviewProcess);
        issues.value = point.issues;

        ElMessage({
          message: '审查完成',
          type: 'success',
          duration: 3000
        });
      } catch (error) {
        ElMessage({
          message: '审查失败: ' + (error.response?.data?.error || error.message),
          type: 'error',
          duration: 4000
        });
      }
    }

    /**
     * 问题单相关
     */
    function toggleIssueEdit() {
      isEditingIssue.value = !isEditingIssue.value; // Toggle editing mode
    }

    function exportissues() {
      if (isEditingIssue.value) {
        ElMessage({
          message: '请先完成编辑后再导出问题单',
          type: 'warning',
          duration: 3000
        });
        return;
      }

      // Extract the inner HTML of the issues element
      const contentToSave = issues.value.innerHTML;

      const blob = new Blob([contentToSave], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = "问题单.txt";
      link.click();
    }

    /**
     * 添加点击事件监听器
     * 1. 点击需求高亮块时，选中该块并高亮相关代码
     * 2. 点击代码块时，显示确认框以取消对齐
     */
    document.addEventListener('click', handleRequirementClick);
    document.addEventListener('click', handleCodeBlockClick);

    return {
      requirementFilename,
      requirementMarkdown,
      requirementHtml,
      codeFiles,
      showUpload,
      activeName,
      selectedText,
      requirementRoot,
      renderMarkdownWithLatex,
      handleRequirementUploadChange,
      handleRequirementRemove,
      handleRequirementExceed,
      handleUploadChange,
      handleCodeFileRemove,
      handleCodeSpanChange,

      handleStartAlign,
      aligningState,
      selectedRequirementId,
      handleRequirementClick,
      highlightCodeBlocks,

      currentCodeBlockIndex,
      scrollToCodeBlock,
      handleLastButtonClick,
      handleNextButtonClick,

      codeBlockConfirmationVisible,
      codeBlockConfirmationPosition,
      codeBlockToRemove,
      handleCodeBlockClick,
      handleCodeBlockRemoveConfirm,
      handleCodeBlockRemoveCancel,

      handleAddAlign,

      reviewProcess,
      handleStartReview,

      isEditingIssue,
      issues,
      toggleIssueEdit,
      exportissues,
    };
  }
});

app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.mount('#app');
