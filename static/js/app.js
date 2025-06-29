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
const { createApp, ref } = Vue;
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

    const requirementPoints   = ref([]); // [{id, text, start, end, align:[{filename, content, start, end},]}]

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
        confirmationVisible.value = false; // Clear the confirmation box
        return; // Ensure selection is valid and not empty
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

    function handleConfirm() {
      const { range } = confirmationBox.value;

      // Create a new block to wrap the selected content
      const wrapper = document.createElement('div');
      wrapper.classList.add('highlighted-block');

      // Extract the selected content and wrap it
      const fragment = range.cloneContents();
      wrapper.appendChild(fragment);

      // Replace the selected content with the wrapper
      range.deleteContents();
      range.insertNode(wrapper);

      // Store the original Markdown content for the block
      const originalMarkdown = requirementMarkdown.value; // Assuming the entire Markdown is stored here
      let selectedHtml = Array.from(wrapper.childNodes)
        .map(node => node.outerHTML || node.textContent)
        .join(''); // Extract the actual content inside the wrapper

      selectedHtml = selectedHtml.replace(/\n/g, '');

      // Map the selected HTML back to Markdown (simplified for demonstration)
      const selectedMarkdown = originalMarkdown.split('\n').filter(line => {
        if (!line.trim()) return false; // Skip empty lines
        const renderedLine = md.render(line).trim().replace(/\n/g, '').replace(/<[^>]+>/g, ''); // Remove HTML tags
        const result = selectedHtml.includes(renderedLine);
        return result;
      }).join('\n');

      wrapper.dataset.originalMarkdown = selectedMarkdown;
      console.log('Selected Markdown:', selectedMarkdown);

      // Hide confirmation box
      window.getSelection().removeAllRanges(); // Clear the selection
      confirmationVisible.value = false;
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
      alignSingleRequirement,

      confirmationVisible,
      confirmationPosition,
      handleConfirm,
      handleCancel,
    };
  }
});

app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.mount('#app');
