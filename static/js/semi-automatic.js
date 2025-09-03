let ORIGINAL_MARKDOWN = '';
let lastPos = 0;

// 初始化 markdown-it
const md = window.markdownit({
  html: true,
  linkify: true,
  typographer: true
});
// 挂载 texmath
md.use(window.texmath, {
  delimiters: 'dollars',
  katexOptions: {}
});

// 在 core.ruler 阶段给所有内容 Token 打属性
md.core.ruler.push('mark_positions', state => {
  state.tokens.forEach(token => {
  // 1) 对于行内内容（普通文字 & math_inline）
    if (token.type === 'inline' && Array.isArray(token.children)) {
      token.children.forEach(child => {
        if (child.content && child.content.trim()) {
          const txt = child.content;
          const i = ORIGINAL_MARKDOWN.indexOf(txt, lastPos);
          if (i >= 0) {
            child.attrSet('data-start', String(i));
            child.attrSet('data-end',   String(i + txt.length));
            lastPos = i + txt.length;
          }
        }
      });
    }

    // 2) 对于块级公式 math_block
    else if (token.type === 'math_block') {
      const txt = token.content;
      const i = ORIGINAL_MARKDOWN.indexOf(txt, lastPos);
      if (i >= 0) {
        token.attrSet('data-start', String(i));
        token.attrSet('data-end',   String(i + txt.length));
        lastPos = i + txt.length;
      }
    }
  });
});

// 普通文本
md.renderer.rules.text = (tokens, idx, options, env, self) => {
  const t = tokens[idx];
  return `<span${ self.renderAttrs(t) }>${
    md.utils.escapeHtml(t.content)
  }</span>`;
};
// 行内公式
md.renderer.rules.math_inline = (tokens, idx, options, env, self) => {
  const t = tokens[idx];
  const html = window.katex.renderToString(t.content, options.katexOptions);
  return `<span class="math-inline"${ self.renderAttrs(t) }>${ html }</span>`;
};
// 块级公式
md.renderer.rules.math_block = (tokens, idx, options, env, self) => {
  const t = tokens[idx];
  const html = window.katex.renderToString(
    t.content,
    Object.assign({ displayMode: true }, options.katexOptions)
  );
  return `<div class="math-block"${ self.renderAttrs(t) }>${ html }</div>`;
};

// 4. Vue 应用
const { createApp, ref, watch, nextTick } = Vue;
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
    const selectedRequirementId = ref(null); // 选中的需求块ID
    const currentCodeBlockIndex = ref(0); // 当前聚焦的代码块索引

    const isEditingIssue = ref(false); // State to track editing mode

    const isAligning = ref(false); // 是否正在对齐
    const isReviewing = ref(false); // 是否正在审查
    const isGenerating = ref(false); // 是否正在反生成

    const codeScrollbarRef = ref(null); // 用于访问代码滚动条组件

    /**
     * 渲染 Markdown -> HTML（含 parse-start/end）
     * @param {*} markdownContent 
     * @returns 
     */
    const renderMarkdownWithLatex = (markdownContent) => {
      const html = md.render(markdownContent);
      return html;
    };

    const findOriginalMarkdown = (sel) => {
      const container = requirementRoot.value;

      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // 1. 遍历容器中所有带 data-start 的元素
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            return node.hasAttribute('data-start') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          }
        },
        false
      );

      const intervals = [];
      let node;
      while ((node = walker.nextNode())) {
        // 2. 只要元素和选区有任何交集，就算选中了
        if (range.intersectsNode(node)) {
          const start = parseInt(node.getAttribute('data-start'), 10);
          const end   = parseInt(node.getAttribute('data-end'),   10);
          // 过滤无效或重复
          if (!isNaN(start) && !isNaN(end) && start < end) {
            intervals.push([ start, end ]);
          }
        }
      }

      if (!intervals.length) return;

      // 3. 去重 & 排序
      const merged = Array.from(new Set(intervals.map(JSON.stringify)))
                          .map(JSON.parse)
                          .sort((a, b) => a[0] - b[0]);

      // 4. 根据区间从原文里 slice 并拼接
      const parts = merged.map(([s, e]) => ORIGINAL_MARKDOWN.slice(s, e));
      const reconstructed = parts.join('\n');
      return reconstructed;
    }

    /**
     * 上传需求文档处理函数
     * @param {*} file 
     */
    const handleRequirementUploadChange = (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        requirementFilename.value = file.name;
        requirementMarkdown.value = e.target.result.replace(/\r\n/g, '\n').replace(/kern{2pt}/g, '');

        // TODO：优化全局变量
        lastPos = 0;
        ORIGINAL_MARKDOWN = requirementMarkdown.value;

        requirementHtml.value = renderMarkdownWithLatex(requirementMarkdown.value);
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

      // 高亮
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

      requirementHtml.value = requirementRoot.value.innerHTML;

      // 获取选中的 Markdown 内容
      const selectedMarkdown = findOriginalMarkdown(sel);
      wrapper.dataset.originalMarkdown = selectedMarkdown;

      window.getSelection().removeAllRanges();

      // Send alignment request to the backend
      isAligning.value = true;
      try {
        const response = await axios.post('/api/query-related-code', {
          requirement: selectedMarkdown,
          codeFiles: codeFiles.value.map(file => ({
            name: file.name,
            content: file.content,
            numberedContent: file.numberedContent
          }))
        });

        const id = wrapper.dataset.id;
        const relatedCode = response.data.relatedCode || [];

        for (const code of relatedCode) {
          // Highlight the code blocks in the files
          code.highlightedContent = hljs.highlight(code.content, { language: 'cpp' }).value;
        }

        // Add or update the requirement point
        const existingPointIndex = requirementPoints.value.findIndex(point => point.id === id);
        if (existingPointIndex !== -1) {
          requirementPoints.value[existingPointIndex].relatedCode = relatedCode;
        } else {
          requirementPoints.value.push({ id, text: selectedMarkdown, relatedCode, state: "未审查" });
        }

        currentCodeBlockIndex.value = 0; // Default to the first code block
        highlightCodeBlocks(relatedCode); // Update code highlights
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
        isAligning.value = false;
      }
    }


    function handleCancelAlign() {
      if (!selectedRequirementId.value) {
        return;
      }
    
      // 找到对应的需求点索引
      const index = requirementPoints.value.findIndex(point => point.id === selectedRequirementId.value);
      if (index !== -1) {
        // 获取对应的高亮块
        const highlightedBlock = document.querySelector(`.highlighted-block[data-id="${selectedRequirementId.value}"]`);
        if (highlightedBlock) {
          // 替换高亮块为普通文本
          const parent = highlightedBlock.parentNode;
          const fragment = document.createDocumentFragment();
          Array.from(highlightedBlock.childNodes).forEach(child => {
            fragment.appendChild(child);
          });
          parent.replaceChild(fragment, highlightedBlock);
        }
    
        // 删除需求点
        requirementPoints.value.splice(index, 1);
      }
    
      selectedRequirementId.value = null; // 清除选中的需求点 ID
      highlightCodeBlocks([]); // 清除代码高亮
      ElMessage({
        message: '需求点已取消对齐',
        type: 'success',
        duration: 2000
      });
    }



    /**
     * 滚动到指定代码块
     * @param {*} index 
     * @returns 
     */
  async function scrollToCodeBlock(index) {
    const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
    if (!point || index < 0 || index >= point.relatedCode.length) return;

    const codeBlock = point.relatedCode[index];
    const file = codeFiles.value.find(f => f.name === codeBlock.filename);
    if (!file) return;

    // 记录当前需要激活的文件名
    const targetFileName = file.name;
    
    // 展开文件（如果需要）
    if (activeName.value !== targetFileName) {
      activeName.value = targetFileName; // 设置目标面板为激活状态
      
      // 等待面板展开完成（可能需要更多时间）
      await nextTick();
      await new Promise(resolve => setTimeout(resolve, 500)); // 增加延迟确保面板完全展开
      
      // 再次检查是否展开成功
      if (activeName.value !== targetFileName) {
        console.warn('Panel failed to expand:', targetFileName);
        return;
      }
    }

    // 查找目标代码元素
    let codeElement = document.querySelector(
      `div.highlighted-code[data-start="${codeBlock.start}"][data-filename="${targetFileName}"]`
    );
    
    // 如果第一次找不到，可能是渲染延迟，尝试再次查找
    if (!codeElement) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const retryElement = document.querySelector(
        `div.highlighted-code[data-start="${codeBlock.start}"][data-filename="${targetFileName}"]`
      );
      if (!retryElement) {
        console.warn('Code block not found after retry:', {
          file: targetFileName,
          start: codeBlock.start,
          end: codeBlock.end
        });
        return;
      }
      codeElement = retryElement;
    }

    // 确保滚动条引用存在
    if (!codeScrollbarRef.value) {
      console.error('Scrollbar reference not found');
      return;
    }

    const scrollbar = codeScrollbarRef.value;
    
    // 获取滚动容器
    const wrap = scrollbar.$el.querySelector('.el-scrollbar__wrap');
    if (!wrap) {
      console.error('Scrollbar wrap element not found');
      return;
    }

    // 计算目标位置（添加更大的偏移量）
    const targetTop = codeElement.offsetTop - wrap.offsetTop - 50;

    // 平滑滚动到目标位置
    wrap.scrollTo({
      top: targetTop,
      behavior: 'smooth'
    });
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
      // Step 1: Collect all previously highlighted code blocks
      const previouslyHighlighted = new Map();
      requirementPoints.value.forEach(point => {
        point.relatedCode.forEach(code => {
          const key = `${code.filename}:${code.start}-${code.end}`;
          previouslyHighlighted.set(key, code);
        });
      });
    
      // Step 2: Highlight code blocks in each file
      codeFiles.value.forEach(file => {
        const lines = file.numberedContent.split('\n');
        const highlightedContent = [];
        let currentBlock = null;
        let currentStart = null;
    
        lines.forEach((line, index) => {
          const lineNumber = index + 1;
          const isPreviouslyHighlighted = Array.from(previouslyHighlighted.values()).some(code =>
            code.filename === file.name && lineNumber >= code.start && lineNumber <= code.end
          );
          const isCurrentlyHighlighted = relatedCode.some(code =>
            code.filename === file.name && lineNumber >= code.start && lineNumber <= code.end
          );
    
          if (isCurrentlyHighlighted) {
            // Highlight current relatedCode blocks
            if (!currentBlock) {
              currentBlock = [];
              currentStart = lineNumber;
            }
            currentBlock.push(line);
          } else {
            if (currentBlock) {
              // Render the current block as a highlighted block
              const blockElement = document.createElement('div');
              blockElement.classList.add('highlighted-code');
              blockElement.dataset.start = currentStart;
              blockElement.dataset.end = lineNumber - 1;
              blockElement.dataset.filename = file.name;
              if (currentCodeBlockIndex.value === relatedCode.findIndex(code =>
                code.start === currentStart && code.filename === file.name
              )) {
                blockElement.classList.add('selected-code');
              }
              const rawCode = currentBlock.join('\n');
              blockElement.innerHTML = `<code class="language-cpp">${hljs.highlight(rawCode, { language: 'cpp' }).value}</code>`;
              highlightedContent.push(blockElement.outerHTML);
              currentBlock = null;
            }
    
            if (isPreviouslyHighlighted) {
              // Render previously highlighted blocks with a light gray background
              const blockElement = document.createElement('div');
              blockElement.classList.add('previously-highlighted-code');
              blockElement.dataset.start = lineNumber;
              blockElement.dataset.end = lineNumber;
              blockElement.dataset.filename = file.name;
              const rawLine = hljs.highlight(line, { language: 'cpp' }).value;
              blockElement.innerHTML = `<code class="language-cpp">${rawLine}</code>`;
              highlightedContent.push(blockElement.outerHTML);
            } else {
              // Render non-highlighted lines
              const rawLine = hljs.highlight(line, { language: 'cpp' }).value;
              highlightedContent.push(`<code class="language-cpp">${rawLine}</code>`);
            }
          }
        });
    
        // Render any remaining block
        if (currentBlock) {
          const blockElement = document.createElement('div');
          blockElement.classList.add('highlighted-code');
          blockElement.dataset.start = currentStart;
          blockElement.dataset.end = lines.length;
          blockElement.dataset.filename = file.name;
          if (currentCodeBlockIndex.value === relatedCode.findIndex(code =>
            code.start === currentStart && code.filename === file.name
          )) {
            blockElement.classList.add('selected-code');
          }
          const rawCode = currentBlock.join('\n');
          blockElement.innerHTML = `<code class="language-cpp">${hljs.highlight(rawCode, { language: 'cpp' }).value}</code>`;
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

      const lineStart = parseInt(target.dataset.start, 10);
      const lineEnd = parseInt(target.dataset.end, 10);
      const filename = target.dataset.filename; // Retrieve filename from the dataset
        
      const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
      const codeIndex = point.relatedCode.findIndex(code =>
        code.start === lineStart &&
        code.end === lineEnd &&
        code.filename === filename
      );
      if (codeIndex === -1) return;
      currentCodeBlockIndex.value = codeIndex;
      highlightCodeBlocks(point.relatedCode);
      scrollToCodeBlock(currentCodeBlockIndex.value);
    }

    function handleCodeBlockRemove() {
      const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
      if (!point) return;
      if (currentCodeBlockIndex.value < 0 || currentCodeBlockIndex.value >= point.relatedCode.length) return;
      const codeBlockToRemove = point.relatedCode[currentCodeBlockIndex.value];
      if (!codeBlockToRemove) return;
      point.relatedCode.splice(currentCodeBlockIndex.value, 1);
      currentCodeBlockIndex.value = Math.min(currentCodeBlockIndex.value, point.relatedCode.length - 1); // Adjust index after removal
      highlightCodeBlocks(point.relatedCode);
      ElMessage({
        message: '代码块对齐已取消',
        type: 'success',
        duration: 2000
      });
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
      point.relatedCode.sort((a, b) => {
        if (a.filename === b.filename) {
          return a.start - b.start; // Sort by start line if filenames are the same
        }
        return a.filename.localeCompare(b.filename); // Otherwise, sort by filename
      });

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

      isReviewing.value = true; // Set reviewing state
      try {
        // Send the selected requirement block to the backend
        const response = await axios.post('/api/review-consistency', { requirement: point.text, relatedCode: point.relatedCode });

        point.reviewProcess = renderMarkdownWithLatex(response.data.reviewProcess);

        let prefix = "在需求文档《" + requirementFilename.value.split('.')[0] + "》中：\n";
        point.issues = prefix + response.data.issues;
        point.state = '未导出';

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
      } finally {
        isReviewing.value = false; // Reset reviewing state
      }
    }

    /**
     * 问题单相关
     */
    function toggleIssueEdit() {
      // 原来处于编辑状态
      if (!selectedRequirementId.value) {
        ElMessage({
          message: '请先选中一个需求块',
          type: 'warning',
          duration: 3000
        });
        return;
      }

      if (isEditingIssue.value) {
        const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
        if (point) {
          const rawContent = document.querySelector('.issue-content').innerText; // Get text with line breaks
          point.issues = rawContent; // Save the text content with line breaks
          ElMessage({
            message: '问题单已保存',
            type: 'success',
            duration: 2000
          });
        }
      }

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

      const point = requirementPoints.value.find(point => point.id === selectedRequirementId.value);
      if (!point) {
        ElMessage({
          message: '请先选中一个需求块',
          type: 'warning',
          duration: 3000
        });
        return;
      } else if (point.state === '未审查') {
        ElMessage({
          message: '该需求未审查，没有问题单可导出',
          type: 'warning',
          duration: 3000
        });
        return;
      }

      const contentToSave = point.issues || '暂无问题单内容';
      const title = `由文档《${requirementFilename.value.split('.')[0]}》导出的问题单`;

      // Create a .doc file with UTF-8 encoding and include the title
      const blob = new Blob(
        [`<html><head><meta charset="utf-8"></head><body><h1>${title}</h1>${contentToSave.replace(/\n/g, '<br>')}</body></html>`],
        { type: 'application/msword;charset=utf-8' }
      );
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = "问题单.doc";
      link.click();

      point.state = '已导出'; // Update state to "已导出"
    }


    /**     * 处理需求反生成按钮点击事件
     * @returns
     */
    async function handleGenerateRequirement() {
      if (!selectedRequirementId.value) {
        ElMessage({
          message: '请先选中一个需求块进行反生成',
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

      isGenerating.value = true; // Set generating state
      try {
        // Send the selected requirement block to the backend
        const response = await axios.post('/api/generate-requirement', { relatedCode: point.relatedCode });

        point.generatedRequirement = renderMarkdownWithLatex(response.data.generatedRequirement);

        ElMessage({
          message: '生成需求完成',
          type: 'success',
          duration: 3000
        });
      } catch (error) {
        ElMessage({
          message: '生成失败: ' + (error.response?.data?.error || error.message),
          type: 'error',
          duration: 4000
        });
      } finally {
        isGenerating.value = false; // Reset generating state
      }
    }

    // 修改导出函数
    function exportRequirementPointsToJson() {
      if (!requirementPoints.value.length) {
        ElMessage.warning('没有需求点可导出');
        return;
      }
      
      // 创建一个包含所有必要状态的对象
      const exportData = {
        requirementFilename: requirementFilename.value,
        requirementMarkdown: requirementMarkdown.value,
        requirementHtml: requirementHtml.value, // 包含所有高亮状态的HTML
        requirementPoints: requirementPoints.value
      };
      
      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'requirement_export.json';
      link.click();
      
      ElMessage.success('需求点及文档状态已成功导出');
    }

    // 修改导入函数
    function importRequirementPointsFromJson() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
          ElMessage.warning('未选择文件');
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const importedData = JSON.parse(e.target.result);
            
            // 检查数据格式
            if (importedData.requirementPoints && Array.isArray(importedData.requirementPoints)) {
              // 恢复整个需求文档状态
              requirementFilename.value = importedData.requirementFilename;
              requirementMarkdown.value = importedData.requirementMarkdown;
              requirementHtml.value = importedData.requirementHtml; // 直接使用保存的HTML
              requirementPoints.value = importedData.requirementPoints;
              
              ElMessage.success('需求点及文档状态已成功导入');
            } else {
              throw new Error('文件格式不正确');
            }
          } catch (error) {
            ElMessage.error(`导入失败: ${error.message}`);
          }
        };
        reader.readAsText(file);
      });
      
      input.click();
    }

    /**
     * 添加点击事件监听器
     * 1. 点击需求高亮块时，选中该块并高亮相关代码
     * 2. 点击代码块时，显示确认框以取消对齐
     */
    document.addEventListener('click', handleRequirementClick);
    document.addEventListener('click', handleCodeBlockClick);

    hljs.highlightAll(); // Initialize highlight.js globally

    return {
      requirementFilename,
      requirementMarkdown,
      requirementHtml,
      requirementPoints,
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
      handleCancelAlign,
      selectedRequirementId,
      handleRequirementClick,
      highlightCodeBlocks,

      currentCodeBlockIndex,
      scrollToCodeBlock,
      handleLastButtonClick,
      handleNextButtonClick,

      handleCodeBlockClick,
      handleCodeBlockRemove,
      handleAddAlign,

      handleStartReview,

      isEditingIssue,
      toggleIssueEdit,
      exportissues,

      handleGenerateRequirement,

      isAligning,
      isReviewing,
      isGenerating,

      codeScrollbarRef,
      exportRequirementPointsToJson,
      importRequirementPointsFromJson,
    };
  }
});

app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.mount('#app');
