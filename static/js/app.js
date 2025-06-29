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
        const html = md.render(markdownContent);

        const container = document.createElement('div');
        container.innerHTML = html;

        console.log('渲染前的 Markdown:\n', markdownContent);
        console.log('渲染后的 HTML:\n', container.innerHTML);
        return container.innerHTML;
    };

    // 鼠标抬起：高亮并映射多单元选区到原始 Markdown
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      const commonAncestor = range.commonAncestorContainer;
      const parentBlock = commonAncestor.nodeType === 1 // Check if it's an element node
        ? commonAncestor.closest('div, p, section, table, ul, ol')
        : commonAncestor.parentElement?.closest('div, p, section, table, ul, ol');

      if (!parentBlock) return;

      // Highlight the selected block
      parentBlock.classList.add('highlighted-block');

      // Store the original Markdown content for the block
      const originalMarkdown = requirementMarkdown.value; // Assuming the entire Markdown is stored here
      const selectedHtml = parentBlock.outerHTML;

      // Map the selected HTML back to Markdown (simplified for demonstration)
      const selectedMarkdown = originalMarkdown.split('\n').filter(line => selectedHtml.includes(md.render(line))).join('\n');

      parentBlock.dataset.originalMarkdown = selectedMarkdown;

      console.log('Selected Markdown:', selectedMarkdown);
    }

    // Add a click handler for highlighted blocks
    document.addEventListener('click', (event) => {
      const target = event.target.closest('.highlighted-block');
      if (target) {
        const originalMarkdown = target.dataset.originalMarkdown;
        console.log('Clicked block original Markdown:', originalMarkdown);
      }
    });

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
