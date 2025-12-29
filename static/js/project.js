/****************************
 * 全局状态与配置
 ****************************/
let activeView = 'alignmentView'; // 当前活动视图

const { createApp, ref, onMounted, computed, nextTick, watch } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;
import {
    regularizeFileContent, renderMarkdown, formatCodeWithLineNumbers, getSourceDocumentRange, convertOffsetToLineNumbers,  generateUUIDLike, updateHighlightPositions, extractPlainTextFromMarkdown, removeAllHighlights,
    clearDecompositionHighlights, renderDecompositionBlock, updateDecompositionPositions
} from './utils.js';
import { mermaid } from './thirdParty/bundle.js';

/****************************
 * 工具函数
 ****************************/
/**
 * 切换视图
 * @param {string} viewName - 'stats' 或 'alignment'
 */
function switchView(viewName) {
    // 隐藏所有视图
    document.getElementById('statsView').style.display = 'none';
    document.getElementById('alignmentView').style.display = 'none';

    // 显示当前视图
    const viewElement = document.getElementById(viewName + 'View');
    viewElement.style.display = (viewName === 'stats') ? 'block' : 'flex';
    activeView = viewName + 'View';

    // 更新按钮状态
    document.getElementById('statsButton').classList.remove('active');
    document.getElementById('alignmentButton').classList.remove('active');
    document.getElementById(viewName + 'Button').classList.add('active');
}
window.switchView = switchView;

/****************************
 * Vue 应用
 ****************************/

const app = createApp({
    delimiters: ['${', '}'],
    setup() {
        /***********************
         * 基础状态
         ***********************/
        const urlParams = new URLSearchParams(window.location.search);
        const projectName = ref(urlParams.get('name') || '未命名项目');
        const projectPath = ref(urlParams.get('path') || '未知路径');

        const projectFiles = ref({
            code_files: [],
            doc_files: [],
            meta_files: ['metadata.json']
        });

        const selectedDocFile = ref('');
        const selectedCodeFile = ref('');
        const selectedDocContent = ref('');
        const selectedCodeContent = ref('');
        const selectedDocRawContent = ref('');
        const selectedCodeRawContent = ref('');

        const alignmentResults = ref([]);
        const isAutoAligning = ref(false);
        const isAutoReviewing = ref(false);
        const alignmentProgress = ref({ current: 0, total: 0 });
        const reviewProgress = ref({ current: 0, total: 0 });
        const showAlignmentDialog = ref(false);
        const showCodeSelectionDialog = ref(false);
        const currentSelection = ref(null);
        const newAlignmentName = ref('');
        const showReviewDialog = ref(false);
        const selectedReviewAlignment = ref(null);
        const activeReviewTab = ref('issues');
        const editingIssueId = ref(null);
        const issueContentBeforeEdit = ref('');
        
        // 筛选相关状态
        const filteredAlignments = ref(null);
        const isFiltered = ref(false);
        const viewMode = ref('all');
        const statusFilters = ref(['unaligned', 'unreviewed', 'reviewed']);
        
        // 联动交互状态
        const currentSelectedAlignmentId = ref(null);
        const currentDocBlockIndex = ref(0);
        const currentCodeBlockIndex = ref(0);

        let linkedDocElement = null;
        let linkedCodeElement = null;
        let linkedAlignmentIdPersist = null;

        // 分解块数据
        const docBlocks = ref([]);
        const codeBlocks = ref([]);

        const codeFileLines = ref({});
        const codeScale = ref(0);

        // 流程图相关状态
        const currentFlowchart = ref(null);
        const isGeneratingFlowchart = ref(false);
        const flowchartError = ref(null);
        
        // 需求反生成相关状态
        const currentReverseRequirement = ref(null);
        const isGeneratingReverse = ref(false);
        const reverseError = ref(null);
        const isViewingFlowchart = ref(false);

        // 进度显示相关状态
        const showProgress = ref(false);
        const progressTitle = ref('');
        const currentProcessingFile = ref('');
        const progressCurrent = ref(0);
        const progressTotal = ref(0);
        const progressPercentage = computed(() => {
            if (progressTotal.value === 0) return 0;
            return (progressCurrent.value / progressTotal.value) * 100;
        });

        /***********************
         * 文件加载相关方法
         ***********************/
        // 存储所有文档的对齐数据
        const allAlignments = ref({});

        // 监听对齐数据变化，更新高亮
        watch(allAlignments, async () => {
            if (selectedDocFile.value) {
                await loadAndRenderDocBlocks(false);
            }
            if (selectedCodeFile.value) {
                await loadAndRenderCodeBlocks(false);
            }
        }, { deep: true });

        // 加载并渲染需求分解块
        const loadAndRenderDocBlocks = async (reload = true) => {
            if (!projectPath.value) return;
            try {
                let blocks = docBlocks.value;
                if (reload || !blocks || blocks.length === 0) {
                    const response = await axios.get(`/api/get-doc-blocks?projectPath=${encodeURIComponent(projectPath.value)}`);
                    if (response.data.status === 'success') {
                        blocks = response.data.data;
                        docBlocks.value = blocks; // Store for other uses if needed
                    }
                }
                
                if (blocks) {
                    // Clear existing highlights
                    clearDecompositionHighlights('doc');
                    
                    // Render highlights for current file
                    if (selectedDocFile.value) {
                        const currentFileBlocks = blocks.filter(b => b.filename === selectedDocFile.value);
                        
                        // 获取当前文件的对齐信息
                        const currentFileAlignments = allAlignments.value[selectedDocFile.value] || [];
                        const alignedRanges = new Set();
                        currentFileAlignments.forEach(alignment => {
                            if (alignment.docRanges) {
                                alignment.docRanges.forEach(range => {
                                    alignedRanges.add(`${range.start}-${range.end}`);
                                });
                            }
                        });

                        await nextTick(() => {
                            currentFileBlocks.forEach(block => {
                                const isAligned = alignedRanges.has(`${block.start}-${block.end}`);
                                renderDecompositionBlock(block.start, block.end, 'doc', isAligned);
                            });
                        });
                    }
                }
            } catch (error) {
                console.error("加载需求分解块失败:", error);
            }
        };

        // Helper to convert line range to char offsets
        const getOffsetsFromLineRange = (content, startLine, endLine) => {
            if (!content) return { start: 0, end: 0 };
            const lines = content.split(/\r\n|\r|\n/);
            
            let currentOffset = 0;
            let startOffset = 0;
            let endOffset = 0;
            
            // Lines are 1-based
            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length + 1; // +1 for newline
                
                if (i + 1 === startLine) {
                    startOffset = currentOffset;
                }
                
                if (i + 1 === endLine) {
                    endOffset = currentOffset + lines[i].length; // End of the line content (excluding newline usually, or including?)
                    // If we want to highlight the whole line, usually we include content.
                    // The decompose block usually implies the content of the lines.
                    break;
                }
                
                currentOffset += lineLength;
            }
            
            // Handle case where endLine is beyond file length
            if (endLine > lines.length) {
                endOffset = currentOffset; 
            }
            
            return { start: startOffset, end: endOffset };
        };

        // 加载并渲染代码分解块
        const loadAndRenderCodeBlocks = async (reload = true) => {
            if (!projectPath.value) return;
            try {
                let blocks = codeBlocks.value;
                if (reload || !blocks || blocks.length === 0) {
                    // 请求获取当前代码文件的代码块，如果没有选中文件则获取所有（取决于后端实现，这里传递文件名以支持后端筛选）
                    const response = await axios.get(`/api/get-code-blocks?projectPath=${encodeURIComponent(projectPath.value)}&filename=${encodeURIComponent(selectedCodeFile.value || '')}`);
                    if (response.data.status === 'success') {
                        blocks = response.data.data;
                        codeBlocks.value = blocks; // Store
                    }
                }
                
                if (blocks) {
                    // Clear existing highlights
                    clearDecompositionHighlights('code');
                    
                    // Render highlights for current file
                    if (selectedCodeFile.value) {
                        // Filter blocks for the current file
                        // The JSON structure has "file" property
                        const currentFileBlocks = blocks.filter(b => b.file === selectedCodeFile.value);
                        
                        // 获取当前代码文件的对齐信息
                        const alignedCodeRanges = new Set();
                        Object.values(allAlignments.value).forEach(alignments => {
                            alignments.forEach(alignment => {
                                if (alignment.codeRanges) {
                                    alignment.codeRanges.forEach(range => {
                                        if (range.documentId === selectedCodeFile.value || range.filename === selectedCodeFile.value) {
                                            alignedCodeRanges.add(`${range.start}-${range.end}`);
                                        }
                                    });
                                }
                            });
                        });

                        await nextTick(() => {
                            currentFileBlocks.forEach(block => {
                                let start, end;
                                if (block.range && Array.isArray(block.range) && block.range.length === 2) {
                                    const [startLine, endLine] = block.range;
                                    const offsets = getOffsetsFromLineRange(selectedCodeRawContent.value, startLine, endLine);
                                    start = offsets.start;
                                    end = offsets.end;
                                } else if (block.start !== undefined && block.end !== undefined) {
                                    start = block.start;
                                    end = block.end;
                                }
                                
                                if (start !== undefined && end !== undefined) {
                                    const isAligned = alignedCodeRanges.has(`${start}-${end}`);
                                    renderDecompositionBlock(start, end, 'code', isAligned);
                                }
                            });
                        });
                    }
                }
            } catch (error) {
                console.error("加载代码分解块失败:", error);
            }
        };

        const fetchAlignments = async () => {
            if (!projectPath.value) return;

            try {
                // 始终获取项目所有对齐关系，不传递file参数
                const response = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}`);
                if (response.data.status === 'success' && response.data.data) {
                    // 后端返回的是以ID为键的对象，转换为数组以便渲染
                    let alignments = Object.values(response.data.data);
                    
                    // 对对齐关系进行排序
                    alignments.sort((a, b) => {
                        // 判断是否为自动分解生成的对齐关系（ID以"auto_"开头）
                        const isAutoA = a.id && a.id.startsWith('auto_');
                        const isAutoB = b.id && b.id.startsWith('auto_');
                        
                        if (isAutoA && isAutoB) {
                            // 两个都是自动分解：按起始位置排序
                            const startA = a.docRanges && a.docRanges.length > 0 ? a.docRanges[0].start : 0;
                            const startB = b.docRanges && b.docRanges.length > 0 ? b.docRanges[0].start : 0;
                            return startA - startB;
                        } else if (!isAutoA && !isAutoB) {
                            // 两个都是标注文件：按名称（category）排序，数字开头的优先
                            const nameA = a.name || '';
                            const nameB = b.name || '';
                            
                            // 检查是否以数字开头
                            const numMatchA = nameA.match(/^(\d+)/);
                            const numMatchB = nameB.match(/^(\d+)/);
                            
                            if (numMatchA && numMatchB) {
                                // 两个都以数字开头，按数字大小排序
                                const numA = parseInt(numMatchA[1]);
                                const numB = parseInt(numMatchB[1]);
                                return numA - numB;
                            } else if (numMatchA && !numMatchB) {
                                // A以数字开头，B不是，A排在前面
                                return -1;
                            } else if (!numMatchA && numMatchB) {
                                // B以数字开头，A不是，B排在前面
                                return 1;
                            } else {
                                // 两个都不以数字开头，按字母顺序排序
                                return nameA.localeCompare(nameB);
                            }
                        } else {
                            // 混合情况：标注文件排在前面，自动分解排在后面
                            return isAutoA ? 1 : -1;
                        }
                    });
                    
                    alignmentResults.value = alignments;
                    
                    // 在下一个tick中添加高亮，确保DOM已更新
                    await nextTick(() => {
                         // reloadHighlights(); (Removed)
                    });
                } else {
                    alignmentResults.value = [];
                    ElMessage.warning(response.data.message || '获取对齐关系失败');
                }
            } catch (error) {
                console.error('获取对齐关系出错:', error);
                alignmentResults.value = [];
                ElMessage.error('获取对齐关系出错: ' + error.message);
            }
        };

        /***********************
         * Markdown渲染功能
         ***********************/
        // 初始化 markdown-it
        const md = window.markdownit({
            html: true,
            linkify: true,
            typographer: true
        });
        
        // 如果有 texmath 插件，则使用它
        if (window.texmath && window.katex) {
            // 确保texmath能找到katex引擎
            window.texmath.katex = window.katex;
            md.use(window.texmath, {
                engine: window.katex,
                delimiters: 'dollars',
                katexOptions: {
                    throwOnError: false,
                    errorColor: '#cc0000',
                    displayMode: false,
                    output: 'html',
                    trust: true
                }
            });
        }
        
        const renderMarkdownWithLatex = (markdownContent) => {
            if (!markdownContent) return '';
            try {
                // 先处理数学公式
                let processedContent = markdownContent;
                if (window.katex) {
                    // 处理块级公式 $$...$$
                    processedContent = processedContent.replace(/\$\$([^$]+?)\$\$/g, (match, formula) => {
                        try {
                            return window.katex.renderToString(formula, {
                                displayMode: true,
                                throwOnError: false
                            });
                        } catch (e) {
                            return match;
                        }
                    });
                    
                    // 处理行内公式 $...$
                    processedContent = processedContent.replace(/\$([^$\n]+?)\$/g, (match, formula) => {
                        try {
                            return window.katex.renderToString(formula, {
                                displayMode: false,
                                throwOnError: false
                            });
                        } catch (e) {
                            return match;
                        }
                    });
                }
                
                // 然后渲染markdown
                const html = md.render(processedContent);
                return html;
            } catch (error) {
                console.error('Markdown渲染错误:', error);
                return markdownContent; // 渲染失败时返回原文
            }
        };

        // 进度管理辅助函数
        const startProgress = (title, total) => {
            showProgress.value = true;
            progressTitle.value = title;
            progressCurrent.value = 0;
            progressTotal.value = total;
            currentProcessingFile.value = '';
        };

        const updateProgress = (current, fileName = '') => {
            progressCurrent.value = current;
            if (fileName) {
                currentProcessingFile.value = fileName;
            }
        };

        const stopProgress = () => {
            showProgress.value = false;
            progressTitle.value = '';
            progressCurrent.value = 0;
            progressTotal.value = 0;
            currentProcessingFile.value = '';
        };

        /***********************
         * 自动审查功能
         ***********************/
        const startAutoReview = async () => {
            if (isAutoReviewing.value) {
                ElMessage.warning('自动审查正在进行中，请稍候...');
                return;
            }

            isAutoReviewing.value = true;
            reviewProgress.value = { current: 0, total: 0 };
            ElMessage.info('开始自动审查，正在分析对齐关系...');

            try {
                // 收集所有已对齐但未审查的需求点
                const unreviewed = [];
                Object.keys(allAlignments.value).forEach(docFile => {
                    const alignments = allAlignments.value[docFile] || [];
                    alignments.forEach(alignment => {
                        if (alignment.codeRanges && alignment.codeRanges.length > 0 && !alignment.isReviewed) {
                            unreviewed.push({ docFile, alignment });
                        }
                    });
                });

                reviewProgress.value.total = unreviewed.length;
                
                // 按文档分组处理
                const groupedByDoc = {};
                unreviewed.forEach(({ docFile, alignment }) => {
                    if (!groupedByDoc[docFile]) {
                        groupedByDoc[docFile] = [];
                    }
                    groupedByDoc[docFile].push(alignment);
                });

                for (const [docFile, alignments] of Object.entries(groupedByDoc)) {
                    // 检查是否需要中断
                    if (!isAutoReviewing.value) {
                        break;
                    }

                    // 启动当前文档的进度显示
                    startProgress('自动审查', alignments.length);

                    for (let i = 0; i < alignments.length; i++) {
                        const alignment = alignments[i];
                        
                        // 检查是否需要中断
                        if (!isAutoReviewing.value) {
                            break;
                        }

                        reviewProgress.value.current++;
                        
                        // 更新进度显示
                        updateProgress(i, docFile);

                        // 调用后端进行审查
                        await axios.post('/api/review-alignment', {
                            projectPath: projectPath.value,
                            docFile: docFile,
                            alignment: alignment
                        });

                        // 实时更新统计数据
                        await fetchAllAlignments();

                        // 如果当前审查的对齐关系属于当前选中的文档，实时更新右侧面板
                        if (docFile === selectedDocFile.value) {
                            await fetchAlignments();
                        }

                        // 添加延迟以模拟处理时间
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }

                    // 停止当前文档的进度显示
                    stopProgress();
                }

                // 重新加载所有对齐数据和问题单
                await fetchAllAlignments();
                await fetchAlignments(); // 确保右侧面板显示最新状态
                await fetchIssues();

                ElMessage.success(`自动审查完成！`);
            } catch (error) {
                console.error('自动审查过程中出现错误:', error);
                ElMessage.error(`自动审查失败: ${error.message}`);
            } finally {
                isAutoReviewing.value = false;
                reviewProgress.value = { current: 0, total: 0 };
                // 停止进度显示
                stopProgress();
            }
        };

        // 加载所有文档的对齐数据用于统计
        const fetchAllAlignments = async () => {
            if (!projectPath.value || !projectFiles.value.doc_files.length) return;

            const alignments = {};

            for (const docFile of projectFiles.value.doc_files) {
                try {
                    const response = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(docFile)}&kind=doc`);
                    if (response.data.status === 'success' && response.data.data) {
                        alignments[docFile] = Object.values(response.data.data);
                    } else {
                        alignments[docFile] = [];
                    }
                } catch (err) {
                    // 如果是404或空文件，静默处理
                    alignments[docFile] = [];
                }
            }

            allAlignments.value = alignments;
        };

        // 加载问题单数据
        const fetchIssues = async () => {
            try {
                const response = await axios.get(`/project/issues?path=${encodeURIComponent(projectPath.value)}`);
                if (response.data.status === 'success') {
                    const issuesData = response.data.data || [];

                    // Compatibility: enrich old issues lacking brief fields
                    for (const issue of issuesData) {
                        // Initialize per-issue editing state
                        if (issue._isEditing === undefined) issue._isEditing = false;
                        if (!issue.briefRequirement || !issue.briefCode) {
                            try {
                                // Lookup alignment by alignmentId to fill brief info
                                const alignmentResponse = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(issue.relatedDocFile)}&kind=doc`);
                                if (alignmentResponse.data.status === 'success') {
                                    const alignments = alignmentResponse.data.data || {};
                                    const alignment = alignments[issue.alignmentId];

                                    if (alignment) {
                                        // 提取缩略信息
                                        issue.briefRequirement = alignment.docRanges && alignment.docRanges[0]
                                            ? alignment.docRanges[0].content.substring(0, 100) + (alignment.docRanges[0].content.length > 100 ? '...' : '')
                                            : '无相关需求';

                                        issue.briefCode = alignment.codeRanges && alignment.codeRanges[0]
                                            ? alignment.codeRanges[0].content.substring(0, 100) + (alignment.codeRanges[0].content.length > 100 ? '...' : '')
                                            : '无相关代码';
                                    }
                                }
                            } catch (err) {
                                // 如果获取对齐关系失败，使用默认值
                                issue.briefRequirement = issue.briefRequirement || '无相关需求';
                                issue.briefCode = issue.briefCode || '无相关代码';
                            }
                        }
                    }

                    const levelOrder = { 'high': 0, 'medium': 1, 'low': 2 };
                    issuesData.sort((a, b) => {
                        const levelA = levelOrder[a.level] !== undefined ? levelOrder[a.level] : 3;
                        const levelB = levelOrder[b.level] !== undefined ? levelOrder[b.level] : 3;
                        return levelA - levelB;
                    });

                    issues.value = issuesData;
                }
            } catch (error) {
                console.error('获取问题单数据失败:', error);
                issues.value = [];
            }
        };

        const fetchProjectMetadata = async () => {
            if (!projectPath.value) {
                ElMessage.error("项目路径不存在，无法加载文件列表。");
                return;
            }
            try {
                const response = await axios.get(`/project/metadata?path=${encodeURIComponent(projectPath.value)}`);
                if (response.data.status === 'success') {
                    const metadata = response.data.metadata;
                    projectFiles.value.code_files = metadata.code_files || [];
                    projectFiles.value.doc_files = metadata.doc_files || [];
                    projectName.value = metadata.project_name || projectName.value;
                    codeFileLines.value = metadata.code_file_lines || {};
                    codeScale.value = metadata.code_scale || 0;

                    // 加载所有文档的对齐数据用于统计
                    await fetchAllAlignments();
                    // 如果有选中的文档，加载其对齐数据
                    await fetchAlignments();
                } else {
                    ElMessage.error(`加载项目元数据失败: ${response.data.message}`);
                }
            } catch (err) {
                console.error("Error fetching project metadata:", err);
                ElMessage.error(`加载项目元数据失败: ${err.message}`);
            }
        };

        const fetchFileContent = async (fileName, fileType) => {
            if (!projectPath.value) {
                ElMessage.error("项目路径不存在，无法加载文件内容。");
                return;
            }
            try {
                // 确保对齐视图被激活
                if (activeView !== 'alignmentView') {
                    switchView('alignment');
                }

                const response = await axios.get(`/project/file-content?path=${encodeURIComponent(projectPath.value)}&filename=${encodeURIComponent(fileName)}&type=${fileType}`);
                if (response.data.status === 'success') {
                    const content = regularizeFileContent(response.data.content, fileType);
                    try {
                        if (fileType === 'doc') {
                            selectedDocFile.value = fileName;
                            selectedDocRawContent.value = content;
                            selectedDocContent.value = await renderMarkdown(content);
                            
                            // 切换文档时自动退出筛选模式
                            if (isFiltered.value) {
                                filteredAlignments.value = null;
                                isFiltered.value = false;
                            }
                            
                            // Load and render decomposition blocks
                            await loadAndRenderDocBlocks();

                            // 当选择文档时，获取该文档的对齐结果
                            await fetchAlignments();
                        } else if (fileType === 'code') {
                            selectedCodeFile.value = fileName;
                            selectedCodeRawContent.value = content;
                            selectedCodeContent.value = formatCodeWithLineNumbers(content);
                            
                            // Load and render decomposition blocks
                            await loadAndRenderCodeBlocks();

                            // 当选择代码文件时，重新获取所有对齐结果，由前端筛选
                            await fetchAlignments();
                        }
                    } catch (e) {
                        renderError.value = e.message;
                        renderedDocument = '<div class="render-error">渲染失败，请检查源文件格式。</div>';
                        console.error(e);
                    }
                } else {
                    ElMessage.error(`加载文件内容失败: ${response.data.message}`);
                }
            } catch (err) {
                console.error("Error fetching file content:", err);
                ElMessage.error(`加载文件内容失败: ${err.message}`);
            }
        };

        const buildFileTree = (files, fileType) => {
            const tree = [];
            const root = {};

            files.forEach(path => {
                // 兼容'\'和'/'两种路径分隔符
                const parts = path.replace(/\\/g, '/').split('/');
                let currentLevel = root;

                parts.forEach((part, index) => {
                    if (!currentLevel[part]) {
                        currentLevel[part] = {};
                    }

                    if (index === parts.length - 1) {
                        // 这是文件节点
                        currentLevel[part].__isFile = true;
                        currentLevel[part].__path = path;
                        currentLevel[part].__fileType = fileType;
                    }
                    currentLevel = currentLevel[part];
                });
            });

            const convertToTreeNodes = (node, pathPrefix = '') => {
                return Object.keys(node).map(key => {
                    const currentPath = pathPrefix ? `${pathPrefix}/${key}` : key;
                    if (key.startsWith('__')) return null;

                    const childNode = node[key];
                    if (childNode.__isFile) {
                        return {
                            label: key,
                            path: childNode.__path,
                            type: 'file',
                            fileType: childNode.__fileType,
                            icon: childNode.__fileType === 'doc' ? 'fas fa-file-word' : 'fas fa-file-code'
                        };
                    } else {
                        return {
                            label: key,
                            path: currentPath,
                            type: 'directory',
                            icon: 'fas fa-folder',
                            children: convertToTreeNodes(childNode, currentPath).filter(n => n)
                        };
                    }
                }).filter(n => n);
            };

            return convertToTreeNodes(root);
        };

        const docFileTree = computed(() => buildFileTree(projectFiles.value.doc_files, 'doc'));
        const codeFileTree = computed(() => buildFileTree(projectFiles.value.code_files, 'code'));

        const handleNodeClick = (data) => {
            if (data.type === 'file') {
                fetchFileContent(data.path, data.fileType);
            }
        };

        /***********************
         * 文件上传
         ***********************/
        const addFile = (fileType, selectionMode) => {
            const input = document.createElement('input');
            input.type = 'file';

            // 'file'模式下允许选择多个文件
            input.multiple = selectionMode === 'file';

            if (selectionMode === 'folder') {
                input.webkitdirectory = true;
            }

            // 对文档类型进行文件格式过滤
            if (fileType === 'doc') {
                input.accept = '.md,.docx';
            }

            input.onchange = async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) {
                    return; // 用户取消了选择
                }

                const formData = new FormData();
                formData.append('path', projectPath.value);
                formData.append('fileType', fileType);

                for (let i = 0; i < files.length; i++) {
                    // 如果是文件夹上传，浏览器会提供 webkitRelativePath
                    const path = files[i].webkitRelativePath || files[i].name;
                    formData.append('files', files[i], path);
                }

                ElMessage.info('文件正在上传，请稍候...');

                try {
                    const response = await axios.post('/project/upload-files', formData, {
                        headers: {
                            'Content-Type': 'multipart/form-data'
                        }
                    });

                    if (response.data.status === 'success') {
                        ElMessage.success('文件上传成功！');
                        await fetchProjectMetadata(); // 刷新文件列表
                    } else {
                        ElMessage.error(`上传失败: ${response.data.message}`);
                    }
                } catch (err) {
                    console.error("Error uploading files:", err);
                    ElMessage.error(`上传文件时发生网络错误: ${err.message}`);
                }
            };

            input.click();
        };

        /***********************
         * 统计数据计算
         ***********************/
        const requirementStats = computed(() => {
            const stats = {};
            projectFiles.value.doc_files.forEach(docFile => {
                stats[docFile] = {
                    totalRequirements: 0,
                    alignedRequirements: 0
                };
            });

            // 基于所有文档的对齐数据计算统计信息
            Object.keys(allAlignments.value).forEach(docFile => {
                const alignments = allAlignments.value[docFile] || [];
                if (stats[docFile]) {
                    stats[docFile].totalRequirements = alignments.length;
                    stats[docFile].alignedRequirements = alignments.filter(alignment =>
                        alignment.codeRanges && alignment.codeRanges.length > 0
                    ).length;
                }
            });

            return stats;
        });

        const totalRequirements = computed(() => {
            return Object.values(requirementStats.value).reduce((sum, stat) => sum + stat.totalRequirements, 0);
        });

        const totalAlignedRequirements = computed(() => {
            return Object.values(requirementStats.value).reduce((sum, stat) => sum + stat.alignedRequirements, 0);
        });

        const totalReviewedRequirements = computed(() => {
            let reviewedCount = 0;
            Object.values(allAlignments.value).forEach(alignments => {
                alignments.forEach(alignment => {
                    if (alignment.isReviewed) {
                        reviewedCount++;
                    }
                });
            });
            return reviewedCount;
        });

        const codeFileStats = computed(() => {
            const stats = {};
            projectFiles.value.code_files.forEach(codeFile => {
                stats[codeFile] = {
                    totalAlignments: 0,
                    coveredRequirements: 0
                };
            });

            // 基于所有文档的对齐数据计算代码文件统计信息
            Object.values(allAlignments.value).forEach(alignments => {
                alignments.forEach(alignment => {
                    if (alignment.codeRanges && alignment.codeRanges.length > 0) {
                        alignment.codeRanges.forEach(codeRange => {
                            const codeFile = codeRange.filename;
                            if (stats[codeFile]) {
                                stats[codeFile].alignmentCount++;
                            }
                        });
                        // 每个对齐关系代表一个被覆盖的需求
                        const uniqueCodeFiles = [...new Set(alignment.codeRanges.map(cr => cr.filename))];
                        uniqueCodeFiles.forEach(codeFile => {
                            if (stats[codeFile]) {
                                stats[codeFile].coveredRequirements++;
                            }
                        });
                    }
                });
            });

            return stats;
        });

        /***********************
         * 需求分解功能
         ***********************/
        
        // 清空项目所有结果的函数
        const clearAllResults = async () => {
            try {
                const response = await axios.post('/api/clear-project-results', {
                    projectPath: projectPath.value
                });
                
                if (response.data.status === 'success') {
                    // 清空前端状态
                    alignmentResults.value = [];
                    issues.value = [];
                    selectedIssue.value = null;
                    selectedDocFile.value = null;
                    selectedCodeFile.value = null;
                    
                    // 重新获取项目文件信息
                    await fetchProjectMetadata();
                } else {
                    throw new Error(response.data.message || '清空失败');
                }
            } catch (error) {
                console.error('清空结果时出现错误:', error);
                ElMessage.error(`清空失败: ${error.message}`);
                throw error;
            }
        };
        
        const startAutoSplit = async () => {
            if (projectFiles.value.doc_files.length === 0) {
                ElMessage.warning('请先添加需求文档');
                return;
            }
            
            // 显示确认对话框
            try {
                await ElMessageBox.confirm(
                    '需求分解将清空当前数据库中的所有对齐关系和问题单。是否确认继续？',
                    '确认需求分解',
                    {
                        confirmButtonText: '确定清空并分解',
                        cancelButtonText: '取消',
                        type: 'warning',
                        confirmButtonClass: 'el-button--danger'
                    }
                );
            } catch {
                return; // 用户取消操作
            }
            
            try {
                // 先清空所有结果
                await axios.post('/api/clear-project-results', {
                    projectPath: projectPath.value
                });
                
                // 刷新界面状态
                // await fetchAllAlignments(); // 移除 fetchAllAlignments 调用
                await fetchAlignments();
                await fetchIssues();
                
                ElMessage.info('已清空旧数据，开始需求分解...');
                const response = await axios.post('api/requirement-decomposition',{
                    projectPath: projectPath.value
                });
                if(response.data.status==='success'){
                    ElMessage.success('需求分解完成！');
                    await loadAndRenderDocBlocks();
                }
                else{
                    ElMessage.error(`需求分解失败: ${response.data.message}`);
                }

            } catch (error) {
                console.error('需求分解过程中出现错误:', error);
                ElMessage.error(`需求分解失败: ${error.message}`);
            }
        }

        const startAutoMarkdownSplit = async () => {
            if (projectFiles.value.doc_files.length === 0) {
                ElMessage.warning('请先添加需求文档');
                return;
            }
            
            // 显示确认对话框
            try {
                await ElMessageBox.confirm(
                    '自动分解将清空当前数据库中的所有对齐关系和问题单。是否确认继续？',
                    '确认自动分解',
                    {
                        confirmButtonText: '确定清空并分解',
                        cancelButtonText: '取消',
                        type: 'warning',
                        confirmButtonClass: 'el-button--danger'
                    }
                );
            } catch {
                return;
            }
            
            try {
                // 先清空所有结果
                await axios.post('/api/clear-project-results', {
                    projectPath: projectPath.value
                });
                
                await fetchAlignments();
                await fetchIssues();
                
                const response = await axios.post('api/auto-markdown-split',{
                    projectPath: projectPath.value
                });
                if(response.data.status==='success'){
                    ElMessage.success('自动分解完成！');
                    await loadAndRenderDocBlocks();
                }
                else{
                    ElMessage.error(`自动分解失败: ${response.data.message}`);
                }

            } catch (error) {
                console.error('自动分解过程中出现错误:', error);
                ElMessage.error(`自动分解失败: ${error.message}`);
            }
        }

        const startAutoCodeSplit = async () => {
            if (projectFiles.value.code_files.length === 0) {
                ElMessage.warning('请先添加代码文件');
                return;
            }
            try {
                await ElMessageBox.confirm(
                    '代码分解将清空当前数据库中的所有对齐关系和问题单。是否确认继续？',
                    '确认代码分解',
                    {
                        confirmButtonText: '确定清空并分解',
                        cancelButtonText: '取消',
                        type: 'warning',
                        confirmButtonClass: 'el-button--danger'
                    }
                );
            } catch {
                return;
            }
            try {
                // 先清空所有结果
                await axios.post('/api/clear-project-results', {
                    projectPath: projectPath.value
                });
                
                await fetchAlignments();
                await fetchIssues();
                
                const response = await axios.post('/api/code-decomposition', {
                    projectPath: projectPath.value
                });
                if (response.data.status === 'success') {
                    ElMessage.success('代码分解完成！');
                    await loadAndRenderCodeBlocks();
                } else {
                    ElMessage.error(`代码分解失败: ${response.data.message}`);
                }
            } catch (error) {
                console.error('代码分解过程中出现错误:', error);
                ElMessage.error(`代码分解失败: ${error.message}`);
            }
        };

        /***********************
         * 自动对齐功能
         ***********************/
        const stopAutoAlignment = () => {
            isAutoAligning.value = false;
        };

        const startAutoAlignmentReqToCode = async () => {
            if (isAutoAligning.value) return;
            isAutoAligning.value = true;
            ElMessage.info('开始自动对齐（需求 → 代码）...');

            try {
                // 1. 获取需求分块
                const chunksResponse = await axios.get('/api/get-requirement-chunks', {
                    params: { projectPath: projectPath.value }
                });
                const requirements = chunksResponse.data.data || [];
                
                if (requirements.length === 0) {
                    ElMessage.warning('未找到需求分块，请先进行需求分解');
                    isAutoAligning.value = false;
                    return;
                }

                // 初始化进度
                startProgress('自动对齐 (需求 → 代码)', requirements.length);
                alignmentProgress.value.total = requirements.length;
                alignmentProgress.value.current = 0;

                // 2. 遍历处理
                for (let i = 0; i < requirements.length; i++) {
                    if (!isAutoAligning.value) break;

                    const req = requirements[i];
                    updateProgress(i, req.docRanges[0]?.filename || 'Unknown');
                    alignmentProgress.value.current++;

                    try {
                        // 调用对齐API
                        const alignResponse = await axios.post('/api/align-requirement-to-project', {
                            docRanges: req.docRanges,
                            projectPath: projectPath.value
                        });

                        const codeRanges = alignResponse.data.status === 'success' ? alignResponse.data.codeRanges : [];
                        
                        // 构造并保存对齐关系
                        const alignment = {
                            ...req,
                            codeRanges: codeRanges,
                            // 保持其他字段默认
                        };

                        await axios.post(`/project/alignments?path=${encodeURIComponent(projectPath.value)}`, alignment);

                    } catch (err) {
                        console.error('对齐出错:', err);
                    }
                    
                    if (i % 5 === 0) await nextTick();
                }

                await fetchAllAlignments();
                ElMessage.success('需求 → 代码 对齐完成！');

            } catch (error) {
                ElMessage.error(`对齐失败: ${error.message}`);
            } finally {
                isAutoAligning.value = false;
                stopProgress();
            }
        };

        const startAutoAlignmentCodeToReq = async () => {
            if (isAutoAligning.value) return;
            isAutoAligning.value = true;
            ElMessage.info('开始自动对齐（代码 → 需求）...');

            try {
                // 1. 获取代码分块
                const chunksResponse = await axios.get('/api/get-code-chunks', {
                    params: { projectPath: projectPath.value }
                });
                const codeBlocks = chunksResponse.data.data || [];
                
                if (codeBlocks.length === 0) {
                    ElMessage.warning('未找到代码分块，请先进行代码分解');
                    isAutoAligning.value = false;
                    return;
                }

                // 初始化进度
                startProgress('自动对齐 (代码 → 需求)', codeBlocks.length);
                alignmentProgress.value.total = codeBlocks.length;
                alignmentProgress.value.current = 0;

                // 2. 遍历处理
                for (let i = 0; i < codeBlocks.length; i++) {
                    if (!isAutoAligning.value) break;

                    const block = codeBlocks[i];
                    updateProgress(i, block.codeRanges[0]?.filename || 'Unknown');
                    alignmentProgress.value.current++;

                    try {
                        // 调用对齐API
                        const alignResponse = await axios.post('/api/align-code-to-requirement', {
                            codeRanges: block.codeRanges,
                            projectPath: projectPath.value
                        });

                        const docRanges = alignResponse.data.status === 'success' ? alignResponse.data.docRanges : [];
                        
                        // 构造并保存对齐关系
                        const alignment = {
                            ...block,
                            docRanges: docRanges,
                            // 保持其他字段默认
                        };

                        await axios.post(`/project/alignments?path=${encodeURIComponent(projectPath.value)}`, alignment);

                    } catch (err) {
                        console.error('对齐出错:', err);
                    }
                    
                    if (i % 5 === 0) await nextTick();
                }

                await fetchAllAlignments();
                ElMessage.success('代码 → 需求 对齐完成！');

            } catch (error) {
                ElMessage.error(`对齐失败: ${error.message}`);
            } finally {
                isAutoAligning.value = false;
                stopProgress();
            }
        };





        /***********************
         * 状态计算函数
         ***********************/
        const getAlignmentStatus = (alignment) => {
            const noDoc = !alignment.docRanges || alignment.docRanges.length === 0;
            const noCode = !alignment.codeRanges || alignment.codeRanges.length === 0;
            if (noDoc || noCode) {
                return {
                    status: 'unaligned',
                    text: '未对齐',
                    type: 'info'
                };
            }

            if (alignment.isReviewed) {
                return {
                    status: 'reviewed',
                    text: '已审查',
                    type: 'success'
                };
            }

            return {
                status: 'unreviewed',
                text: '未审查',
                type: 'warning'
            };
        };

        const sidebarAlignments = computed(() => {
            let source = alignmentResults.value;

            if (isFiltered.value && filteredAlignments.value) {
                return filteredAlignments.value;
            }

            // Apply View Mode
            if (viewMode.value === 'current') {
                source = source.filter(a =>
                    (a.docRanges && a.docRanges.some(r => r.documentId === selectedDocFile.value)) ||
                    (a.codeRanges && a.codeRanges.some(r => r.documentId === selectedCodeFile.value))
                );
            }

            // Apply Status Filter
            if (statusFilters.value.length > 0) {
                source = source.filter(a => {
                    const statusObj = getAlignmentStatus(a);
                    return statusFilters.value.includes(statusObj.status);
                });
            } else {
                return []; 
            }

            return source;
        });

        /***********************
         * 对齐关系创建
         ***********************/
        const handleDocSelection = (event) => {
            const selection = window.getSelection();
            console.log("User selection:", selection ? selection.toString() : 'null');
            if (!selection || selection.toString().trim() === '') return;

            const range = selection.getRangeAt(0);
            const editorDiv = document.querySelector('.content-text-doc');

            if (editorDiv && editorDiv.contains(range.commonAncestorContainer)) {
                const [start, end] = getSourceDocumentRange(editorDiv, range);
                if (end - start > 0) {
                    currentSelection.value = {
                        documentId: selectedDocFile.value,
                        start,
                        end,
                        content: selectedDocRawContent.value.slice(start, end)
                    };
                    showAlignmentDialog.value = true;
                    newAlignmentName.value = '';
                }
            }
        };

        const createAlignment = async () => {
            const id = generateUUIDLike();

            if (!currentSelection.value) {
                ElMessage.warning('请先选择需求文本。');
                return;
            }
            if (!newAlignmentName.value.trim()) {
                // 从实际选中的完整parse元素中提取纯文本作为名称
                const docElement = document.getElementById('doc-content');
                if (docElement) {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const [startOffset, endOffset] = getSourceDocumentRange(docElement, range);
                        
                        // 从原始文档内容中提取对应范围的文本
                        const docFileContent = selectedDocRawContent.value;
                        const selectedText = docFileContent.substring(startOffset, endOffset);
                        const extractedName = extractPlainTextFromMarkdown(selectedText, 20);
                        newAlignmentName.value = extractedName;
                    } else {
                        // 如果没有选择范围，使用原来的逻辑作为后备
                        const extractedName = extractPlainTextFromMarkdown(currentSelection.value.content, 20);
                        newAlignmentName.value = extractedName;
                    }
                } else {
                    // 如果找不到文档元素，使用原来的逻辑作为后备
                    const extractedName = extractPlainTextFromMarkdown(currentSelection.value.content, 20);
                    newAlignmentName.value = extractedName;
                }
            }

            // 为文档范围添加filename和行号信息
            const docFileContent = selectedDocRawContent.value;
            const { startLine, endLine } = convertOffsetToLineNumbers(
                docFileContent,
                currentSelection.value.start,
                currentSelection.value.end
            );

            const docRange = {
                ...currentSelection.value,
                filename: currentSelection.value.documentId, // 添加文件名
                startLine: startLine, // 添加起始行号
                endLine: endLine // 添加结束行号
            };

            const newAlignment = {
                id: id,
                name: newAlignmentName.value.trim(),
                isReviewed: false,
                reviewThoughts: '',
                docRanges: [docRange],
                codeRanges: [] // 初始代码范围为空
            };

            // 更新前端UI
            alignmentResults.value.push(newAlignment);
            showAlignmentDialog.value = false;

            // 发送到后端保存
            try {
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}`,
                    newAlignment
                );

                // 更新所有对齐数据以保持统计信息同步
                await fetchAllAlignments();

                ElMessage.success('对齐关系创建成功');
            } catch (err) {
                console.error("Error saving alignment:", err);
                ElMessage.error(`保存对齐关系失败: ${err.message}`);
                // 可选：如果保存失败，可以从UI中移除刚添加的项
                alignmentResults.value.pop();
            }
        };







        // 刷新对齐关系和高亮
        const refreshAlignments = async () => {
            try {                
                // 重新获取对齐关系
                await fetchAlignments();
            } catch (error) {
                console.error('刷新对齐关系失败:', error);
                ElMessage.error(`刷新失败: ${error.message}`);
            }
        };



        // 刷新筛选状态下的对齐列表
        const refreshFilteredAlignments = () => {
            if (isFiltered.value) {
                // 重新应用当前的筛选条件
                const currentFilteredIds = filteredAlignments.value.map(a => a.id);
                filteredAlignments.value = alignmentResults.value.filter(alignment => 
                    currentFilteredIds.includes(alignment.id)
                );
            }
        };



        /***********************
         * 点击高亮筛选功能
         ***********************/
        // 根据需求范围筛选对齐关系
        const filterAlignmentsByDocRange = (start, end) => {
            const overlappingAlignments = alignmentResults.value.filter(alignment => {
                // 检查需求文档范围是否有交集
                const hasDocOverlap = alignment.docRanges.some(range =>
                    range.end > start && range.start < end
                );
                return hasDocOverlap;
            });

            filteredAlignments.value = overlappingAlignments;
            isFiltered.value = true;

            // 如果没有找到匹配的对齐关系，显示提示
            if (overlappingAlignments.length === 0) {
                ElMessage.info('未找到包含此范围的对齐关系');
            }
        };

        // 根据代码范围筛选对齐关系
        const filterAlignmentsByCodeRange = (start, end, documentId) => {
            const overlappingAlignments = alignmentResults.value.filter(alignment => {
                // 检查代码范围是否有交集
                const hasCodeOverlap = alignment.codeRanges.some(range =>
                    range.documentId === documentId && range.end > start && range.start < end
                );
                return hasCodeOverlap;
            });

            filteredAlignments.value = overlappingAlignments;
            isFiltered.value = true;

            // 如果没有找到匹配的对齐关系，显示提示
            if (overlappingAlignments.length === 0) {
                ElMessage.info('未找到包含此代码范围的对齐关系');
            }
        };

        // 显示全部对齐关系
        const showAllAlignments = () => {
            filteredAlignments.value = null;
            isFiltered.value = false;
        };

        // 根据多个文档范围筛选对齐关系（支持重叠高亮块）
        const filterAlignmentsByMultipleDocRanges = (ranges) => {
            const overlappingAlignments = alignmentResults.value.filter(alignment => {
                // 检查是否与任意一个范围有交集
                return ranges.some(range => {
                    return alignment.docRanges && alignment.docRanges.some(docRange =>
                        docRange.documentId === selectedDocFile.value &&
                        docRange.end > range.start && docRange.start < range.end
                    );
                });
            });

            filteredAlignments.value = overlappingAlignments;
            isFiltered.value = true;

            // 如果没有找到匹配的对齐关系，显示提示
            if (overlappingAlignments.length === 0) {
                ElMessage.info('未找到包含此范围的对齐关系');
            }
        };

        // 根据多个代码范围筛选对齐关系（支持重叠高亮块）
        const filterAlignmentsByMultipleCodeRanges = (ranges, documentId) => {
            const overlappingAlignments = alignmentResults.value.filter(alignment => {
                // 检查是否与任意一个范围有交集
                return ranges.some(range => {
                    return alignment.codeRanges && alignment.codeRanges.some(codeRange =>
                        codeRange.documentId === documentId &&
                        codeRange.end > range.start && codeRange.start < range.end
                    );
                });
            });

            filteredAlignments.value = overlappingAlignments;
            isFiltered.value = true;

            // 如果没有找到匹配的对齐关系，显示提示
            if (overlappingAlignments.length === 0) {
                ElMessage.info('未找到包含此范围的对齐关系');
            }
        };

        // 处理新高亮块的点击事件
        const handleHighlightBlockClick = async (event) => {
            const target = event.target.closest('.highlight-block');
            if (!target) return;

            const type = target.getAttribute('data-type');
            const rangeStart = parseInt(target.getAttribute('data-range-start'));
            const rangeEnd = parseInt(target.getAttribute('data-range-end'));

            const alignmentIdAttr = target.getAttribute('data-alignment-id') || '';
            const alignmentIds = alignmentIdAttr.split(',').filter(id => id);
            const alignmentId = alignmentIds[0] || null;

            let alignment = null;
            if (alignmentId) {
                alignment = alignmentResults.value.find(a => a.id === alignmentId) || null;
            }

            if (!alignment) {
                if (type === 'code') {
                    alignment = findAlignmentByCodeRange(rangeStart, rangeEnd);
                } else if (type === 'doc') {
                    alignment = findAlignmentByDocRange(rangeStart, rangeEnd);
                }
            }
            
            if (!alignment) return;

            // Calculate indices
            let docIndex = 0;
            let codeIndex = 0;

            if (type === 'doc' && alignment.docRanges) {
                // Find index of the clicked range in alignment.docRanges
                const idx = alignment.docRanges.findIndex(r => 
                    r.documentId === selectedDocFile.value && 
                    Math.max(r.start, rangeStart) < Math.min(r.end, rangeEnd)
                );
                if (idx !== -1) docIndex = idx;
            } else if (type === 'code' && alignment.codeRanges) {
                 const idx = alignment.codeRanges.findIndex(r => 
                    r.documentId === selectedCodeFile.value && 
                    Math.max(r.start, rangeStart) < Math.min(r.end, rangeEnd)
                );
                if (idx !== -1) codeIndex = idx;
            }

            selectAlignment(alignment, docIndex, codeIndex);
        };

        // 选中对齐关系的核心逻辑
        const selectAlignment = async (alignment, docIndex = 0, codeIndex = 0) => {
            if (!alignment) return;
            currentSelectedAlignmentId.value = alignment.id;
            currentDocBlockIndex.value = docIndex;
            currentCodeBlockIndex.value = codeIndex;

            statusFilters.value = ['unaligned', 'unreviewed', 'reviewed'];
            await nextTick();
            scrollToAlignmentInSidebar(alignment.id);

            clearLinkedAll();
            applyAlignmentYellow(alignment.id);

            if (alignment.docRanges && alignment.docRanges.length > 0) {
                const targetDocIndex = (docIndex >= 0 && docIndex < alignment.docRanges.length) ? docIndex : 0;
                await applyDocYellowRange(alignment.docRanges[targetDocIndex]);
            }
            if (alignment.codeRanges && alignment.codeRanges.length > 0) {
                const targetCodeIndex = (codeIndex >= 0 && codeIndex < alignment.codeRanges.length) ? codeIndex : 0;
                await applyCodeYellowRange(alignment.codeRanges[targetCodeIndex]);
            }
        };

        // 侧边栏点击处理
        const handleAlignmentItemClick = (alignment) => {
            selectAlignment(alignment);
        };

        // 滚动侧边栏到指定对齐项
        const scrollToAlignmentInSidebar = (alignmentId) => {
            const element = document.getElementById(`alignment-item-${alignmentId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };

        // 临时高亮元素（淡黄色3秒）
        const highlightTemp = (element) => {
            if (!element) return;
            const originalBg = element.style.backgroundColor;
            const originalTransition = element.style.transition;

            element.style.transition = 'background-color 0.3s ease';
            element.style.backgroundColor = 'rgba(255, 255, 183, 0.8)';

            setTimeout(() => {
                element.style.backgroundColor = originalBg;
                setTimeout(() => {
                    element.style.transition = originalTransition;
                }, 300);
            }, 3000);
        };

        // 需求块导航
        const navigateDocBlock = async (step) => {
            if (!currentSelectedAlignmentId.value) return;
            const alignment = alignmentResults.value.find(a => a.id === currentSelectedAlignmentId.value);
            if (!alignment || !alignment.docRanges || alignment.docRanges.length === 0) return;

            let newIndex = currentDocBlockIndex.value + step;
            if (newIndex < 0) newIndex = 0;
            if (newIndex >= alignment.docRanges.length) newIndex = alignment.docRanges.length - 1;
            
            if (newIndex !== currentDocBlockIndex.value) {
                currentDocBlockIndex.value = newIndex;
                const docRange = alignment.docRanges[newIndex];
                
                if (selectedDocFile.value !== docRange.documentId) {
                    await fetchFileContent(docRange.documentId, 'doc');
                }
                await nextTick();
                clearDocYellow();
                await applyDocYellowRange(docRange);
            }
        };

        // 代码块导航
        const navigateCodeBlock = async (step) => {
            if (!currentSelectedAlignmentId.value) return;
            const alignment = alignmentResults.value.find(a => a.id === currentSelectedAlignmentId.value);
            if (!alignment || !alignment.codeRanges || alignment.codeRanges.length === 0) return;

            let newIndex = currentCodeBlockIndex.value + step;
            if (newIndex < 0) newIndex = 0;
            if (newIndex >= alignment.codeRanges.length) newIndex = alignment.codeRanges.length - 1;
            
            if (newIndex !== currentCodeBlockIndex.value) {
                currentCodeBlockIndex.value = newIndex;
                const codeRange = alignment.codeRanges[newIndex];
                
                if (selectedCodeFile.value !== codeRange.documentId) {
                    await fetchFileContent(codeRange.documentId, 'code');
                }
                await nextTick();
                clearCodeYellow();
                await applyCodeYellowRange(codeRange);
            }
        };

        const clearDocYellow = () => {
            if (linkedDocElement) {
                linkedDocElement.classList.remove('linked-yellow');
                linkedDocElement = null;
            }
        };

        const clearCodeYellow = () => {
            if (linkedCodeElement) {
                linkedCodeElement.classList.remove('linked-yellow');
                linkedCodeElement = null;
            }
        };

        const clearAlignmentYellow = () => {
            if (linkedAlignmentIdPersist) {
                const el = document.getElementById(`alignment-item-${linkedAlignmentIdPersist}`);
                if (el) el.classList.remove('linked-yellow');
                linkedAlignmentIdPersist = null;
            }
        };

        const clearLinkedAll = () => {
            clearDocYellow();
            clearCodeYellow();
            clearAlignmentYellow();
        };

        const cancelSelection = () => {
            currentSelectedAlignmentId.value = null;
            currentDocBlockIndex.value = 0;
            currentCodeBlockIndex.value = 0;
            clearLinkedAll();
        };

        const applyAlignmentYellow = (alignmentId) => {
            clearAlignmentYellow();
            const el = document.getElementById(`alignment-item-${alignmentId}`);
            if (el) {
                el.classList.add('linked-yellow');
                linkedAlignmentIdPersist = alignmentId;
            }
        };

        const applyDocYellowRange = async (docRange) => {
            if (!docRange) return;
            if (selectedDocFile.value !== docRange.documentId) {
                await fetchFileContent(docRange.documentId, 'doc');
            }
            await nextTick();
            const docPanel = document.querySelector('.content-text-doc');
            if (!docPanel) return;
            const candidates = Array.from(docPanel.querySelectorAll('.highlight-block[data-type="doc"]'))
                .filter(el => parseInt(el.getAttribute('data-range-start')) <= docRange.end && parseInt(el.getAttribute('data-range-end')) >= docRange.start);
            const target = candidates[0] || null;
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' });
                target.classList.add('linked-yellow');
                linkedDocElement = target;
            }
        };

        const applyCodeYellowRange = async (codeRange) => {
            if (!codeRange) return;
            if (selectedCodeFile.value !== codeRange.documentId) {
                await fetchFileContent(codeRange.documentId, 'code');
            }
            await nextTick();
            const codePanel = document.querySelector('.content-text-code');
            if (!codePanel) return;
            const candidates = Array.from(codePanel.querySelectorAll('.highlight-block[data-type="code"]'))
                .filter(el => parseInt(el.getAttribute('data-range-start')) <= codeRange.end && parseInt(el.getAttribute('data-range-end')) >= codeRange.start);
            const target = candidates[0] || null;
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' });
                target.classList.add('linked-yellow');
                linkedCodeElement = target;
            }
        };

        // 处理需求高亮块的右键点击事件
        const handleHighlightBlockRightClick = (event) => {
            event.preventDefault(); // 阻止默认右键菜单
            
            const target = event.target;
            if (!target.classList.contains('highlight-block')) return;

            const type = target.getAttribute('data-type');
            // 只处理文档类型的高亮块
            if (type !== 'doc') return;

            const rangeStart = parseInt(target.getAttribute('data-range-start'));
            const rangeEnd = parseInt(target.getAttribute('data-range-end'));

            if (isNaN(rangeStart) || isNaN(rangeEnd)) return;

            // 查找与此高亮块对应的对齐关系
            const correspondingAlignment = findAlignmentByDocRange(rangeStart, rangeEnd);
            
            if (!correspondingAlignment) {
                ElMessage.warning('未找到与此高亮块对应的对齐关系');
                return;
            }

            // 显示右键菜单
            showContextMenu(event, correspondingAlignment);

            // 同时执行左键点击的功能（代码跳转和对齐关系筛选）
            handleHighlightBlockClick(event);
        };

        // 根据文档范围查找对应的对齐关系
        const findAlignmentByDocRange = (rangeStart, rangeEnd) => {
            return alignmentResults.value.find(alignment => {
                return alignment.docRanges && alignment.docRanges.some(docRange =>
                    docRange.documentId === selectedDocFile.value &&
                    // 检查范围是否有交集
                    docRange.end > rangeStart && docRange.start < rangeEnd
                );
            });
        };

        // 代码高亮块右键菜单处理函数
        const handleCodeHighlightBlockRightClick = (event) => {
            event.preventDefault(); // 阻止默认右键菜单
            
            const target = event.target;
            if (!target.classList.contains('highlight-block')) return;

            const type = target.getAttribute('data-type');
            // 只处理代码类型的高亮块
            if (type !== 'code') return;

            const rangeStart = parseInt(target.getAttribute('data-range-start'));
            const rangeEnd = parseInt(target.getAttribute('data-range-end'));

            if (isNaN(rangeStart) || isNaN(rangeEnd)) return;

            // 查找与此高亮块对应的对齐关系（返回第一个匹配的）
            const correspondingAlignment = findAlignmentByCodeRange(rangeStart, rangeEnd);
            
            if (!correspondingAlignment) {
                ElMessage.warning('未找到与此高亮块对应的对齐关系');
                return;
            }

            // 显示右键菜单
            showContextMenu(event, correspondingAlignment);

            // 同时执行左键点击的功能（代码跳转和对齐关系筛选）
            handleHighlightBlockClick(event);
        };

        // 根据代码范围查找对应的对齐关系（返回第一个匹配的）
        const findAlignmentByCodeRange = (rangeStart, rangeEnd) => {
            return alignmentResults.value.find(alignment => {
                return alignment.codeRanges && alignment.codeRanges.some(codeRange =>
                    codeRange.documentId === selectedCodeFile.value &&
                    // 检查范围是否有交集
                    codeRange.end > rangeStart && codeRange.start < rangeEnd
                );
            });
        };

        // 根据docRange查找文档中所有有交集的高亮元素
        const findIntersectingHighlightElements = (start, end) => {
            const docPanel = document.querySelector('.content-text-doc');
            if (!docPanel) return [];

            // 查找所有高亮元素
            const highlights = docPanel.querySelectorAll('.requirement-highlight');
            const intersectingElements = [];
            
            for (const highlight of highlights) {
                const highlightStart = parseInt(highlight.getAttribute('data-range-start'));
                const highlightEnd = parseInt(highlight.getAttribute('data-range-end'));
                
                // 检查范围是否有交集：两个范围有交集的条件是 max(start1, start2) < min(end1, end2)
                if (Math.max(highlightStart, start) < Math.min(highlightEnd, end)) {
                    intersectingElements.push(highlight);
                }
            }
            
            return intersectingElements;
        };

        // 根据codeRange查找代码中所有有交集的高亮元素
        const findIntersectingCodeHighlightElements = (start, end) => {
            const codePanel = document.querySelector('.content-text-code');
            if (!codePanel) return [];

            // 查找所有代码高亮元素
            const highlights = codePanel.querySelectorAll('.code-highlight');
            const intersectingElements = [];
            
            for (const highlight of highlights) {
                const highlightStart = parseInt(highlight.getAttribute('data-range-start'));
                const highlightEnd = parseInt(highlight.getAttribute('data-range-end'));
                
                // 检查范围是否有交集：两个范围有交集的条件是 max(start1, start2) < min(end1, end2)
                if (Math.max(highlightStart, start) < Math.min(highlightEnd, end)) {
                    intersectingElements.push(highlight);
                }
            }
            
            return intersectingElements;
        };

        // 同时查找所有parse-start和parse-end属性的元素
        const findIntersectingParseElements = (start, end) => {
            const docPanel = document.querySelector('.content-text-doc');
            if (!docPanel) return [];

            // 查找所有带有parse-start和parse-end属性的元素
            const parseElements = docPanel.querySelectorAll('[parse-start][parse-end]');
            const intersectingElements = [];
            
            for (const element of parseElements) {
                const parseStart = parseInt(element.getAttribute('parse-start'));
                const parseEnd = parseInt(element.getAttribute('parse-end'));
                
                // 检查范围是否有交集
                if (Math.max(parseStart, start) < Math.min(parseEnd, end)) {
                    intersectingElements.push(element);
                }
            }
            
            return intersectingElements;
        };

        // 滚动到第一个元素并高亮所有相关元素
        const scrollToFirstAndHighlightAll = (elements) => {
            if (!elements || elements.length === 0) return;
            
            // 只处理高亮块元素，忽略其他内部元素
            const highlightBlocks = elements.filter(el => el.classList.contains('highlight-block'));
            
            // 滚动到第一个元素位置（只进行垂直滚动）
            elements[0].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'start'
            });
            
            // 只为高亮块添加临时高亮效果（直接改变背景色）
            const originalHighlightStyles = [];
            highlightBlocks.forEach((element, index) => {
                // 保存原始样式
                originalHighlightStyles[index] = {
                    backgroundColor: element.style.backgroundColor,
                    transition: element.style.transition
                };
                
                // 添加淡雅的黄色高亮
                element.style.backgroundColor = 'rgba(255, 255, 183, 0.8)'; // 淡雅的黄色
                element.style.transition = 'background-color 0.3s ease';
            });
            
            // 5秒后恢复原来的背景色
            setTimeout(() => {
                highlightBlocks.forEach((element, index) => {
                    if (originalHighlightStyles[index]) {
                        element.style.backgroundColor = originalHighlightStyles[index].backgroundColor;
                        // 再过一段时间移除transition，避免影响其他样式变化
                        setTimeout(() => {
                            element.style.transition = originalHighlightStyles[index].transition;
                        }, 300);
                    }
                });
            }, 4000);
        };

        // 滚动到第一个代码元素并高亮所有相关元素
        const scrollToFirstAndHighlightAllCode = (elements) => {
            if (!elements || elements.length === 0) return;
            
            // 只处理高亮块元素，忽略其他内部元素
            const highlightBlocks = elements.filter(el => el.classList.contains('highlight-block'));
            
            // 滚动到第一个元素位置（只进行垂直滚动）
            elements[0].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'start'
            });
            
            // 只为高亮块添加临时高亮效果（直接改变背景色）
            const originalHighlightStyles = [];
            highlightBlocks.forEach((element, index) => {
                // 保存原始样式
                originalHighlightStyles[index] = {
                    backgroundColor: element.style.backgroundColor,
                    transition: element.style.transition
                };
                
                // 添加淡雅的黄色高亮
                element.style.backgroundColor = 'rgba(255, 255, 183, 0.8)'; // 淡雅的黄色
                element.style.transition = 'background-color 0.3s ease';
            });
            
            // 5秒后恢复原来的背景色
            setTimeout(() => {
                highlightBlocks.forEach((element, index) => {
                    if (originalHighlightStyles[index]) {
                        element.style.backgroundColor = originalHighlightStyles[index].backgroundColor;
                        // 再过一段时间移除transition，避免影响其他样式变化
                        setTimeout(() => {
                            element.style.transition = originalHighlightStyles[index].transition;
                        }, 300);
                    }
                });
            }, 4000);
        };

        // 处理对齐结果中代码片段的点击事件（反向映射）
        const handleAlignmentCodeRangeClick = (codeRange) => {
            // 确保当前显示的是对应的代码文件
            if (selectedCodeFile.value !== codeRange.documentId) {
                // 如果不是当前代码文件，先切换到对应文件
                fetchFileContent(codeRange.documentId, 'code').then(() => {
                    // 文件加载完成后再查找和高亮
                    setTimeout(() => {
                        // 查找所有有交集的高亮元素
                        const highlightElements = findIntersectingCodeHighlightElements(codeRange.start, codeRange.end);
                        
                        scrollToFirstAndHighlightAllCode(highlightElements);
                    }, 100);
                });
            } else {
                // 如果是当前代码文件，直接查找和高亮
                const highlightElements = findIntersectingCodeHighlightElements(codeRange.start, codeRange.end);
                
                scrollToFirstAndHighlightAllCode(highlightElements);
            }
        };

        // 处理对齐结果中需求片段的点击事件（反向映射）
        const handleAlignmentDocRangeClick = (docRange) => {
            // 确保当前显示的是对应的文档
            if (selectedDocFile.value !== docRange.documentId) {
                // 如果不是当前文档，先切换到对应文档
                fetchFileContent(docRange.documentId, 'doc').then(() => {
                    // 文档加载完成后再查找和高亮
                    setTimeout(() => {
                        // 查找所有有交集的高亮元素和parse元素
                        const highlightElements = findIntersectingHighlightElements(docRange.start, docRange.end);
                        const parseElements = findIntersectingParseElements(docRange.start, docRange.end);
                        
                        // 合并所有相关元素
                        const allElements = [...highlightElements, ...parseElements];
                        
                        // 去重（可能有重复的元素）
                        const uniqueElements = [...new Set(allElements)];
                        
                        scrollToFirstAndHighlightAll(uniqueElements);
                    }, 100);
                });
            } else {
                // 如果是当前文档，直接查找和高亮
                const highlightElements = findIntersectingHighlightElements(docRange.start, docRange.end);
                const parseElements = findIntersectingParseElements(docRange.start, docRange.end);
                
                // 合并所有相关元素
                const allElements = [...highlightElements, ...parseElements];
                
                // 去重（可能有重复的元素）
                const uniqueElements = [...new Set(allElements)];
                
                scrollToFirstAndHighlightAll(uniqueElements);
            }
        };

        // 滚动到第一个筛选结果的代码区域
        const scrollToFirstFilteredCodeRange = () => {
            if (!filteredAlignments.value || filteredAlignments.value.length === 0) return;
            
            const firstAlignment = filteredAlignments.value[0];
            if (!firstAlignment.codeRanges || firstAlignment.codeRanges.length === 0) return;
            
            const firstCodeRange = firstAlignment.codeRanges[0];
            
            // 确保当前显示的是对应的代码文件
            if (selectedCodeFile.value !== firstCodeRange.documentId) {
                // 如果不是当前代码文件，先切换到对应文件
                fetchFileContent(firstCodeRange.documentId, 'code').then(() => {
                    // 文件加载完成后再查找和高亮
                    setTimeout(() => {
                        const highlightElements = findIntersectingCodeHighlightElements(firstCodeRange.start, firstCodeRange.end);
                        scrollToFirstAndHighlightAllCode(highlightElements);
                    }, 100);
                });
            } else {
                // 如果是当前代码文件，直接查找和高亮
                const highlightElements = findIntersectingCodeHighlightElements(firstCodeRange.start, firstCodeRange.end);
                scrollToFirstAndHighlightAllCode(highlightElements);
            }
        };

        // 滚动到第一个筛选结果的文档区域
        const scrollToFirstFilteredDocRange = () => {
            if (!filteredAlignments.value || filteredAlignments.value.length === 0) return;
            
            const firstAlignment = filteredAlignments.value[0];
            if (!firstAlignment.docRanges || firstAlignment.docRanges.length === 0) return;
            
            const firstDocRange = firstAlignment.docRanges[0];
            
            // 确保当前显示的是对应的文档
            if (selectedDocFile.value !== firstDocRange.documentId) {
                // 如果不是当前文档，先切换到对应文档
                fetchFileContent(firstDocRange.documentId, 'doc').then(() => {
                    // 文档加载完成后再查找和高亮
                    setTimeout(() => {
                        const highlightElements = findIntersectingHighlightElements(firstDocRange.start, firstDocRange.end);
                        const parseElements = findIntersectingParseElements(firstDocRange.start, firstDocRange.end);
                        
                        // 合并所有相关元素
                        const allElements = [...highlightElements, ...parseElements];
                        
                        // 去重（可能有重复的元素）
                        const uniqueElements = [...new Set(allElements)];
                        
                        scrollToFirstAndHighlightAll(uniqueElements);
                    }, 100);
                });
            } else {
                // 如果是当前文档，直接查找和高亮
                const highlightElements = findIntersectingHighlightElements(firstDocRange.start, firstDocRange.end);
                const parseElements = findIntersectingParseElements(firstDocRange.start, firstDocRange.end);
                
                // 合并所有相关元素
                const allElements = [...highlightElements, ...parseElements];
                
                // 去重（可能有重复的元素）
                const uniqueElements = [...new Set(allElements)];
                
                scrollToFirstAndHighlightAll(uniqueElements);
            }
        };

        // 处理代码选择
        const handleCodeSelection = (event) => {
            const selection = window.getSelection();
            console.log("Code selection:", selection ? selection.toString() : 'null');
            if (!selection || selection.toString().trim() === '') return;

            const range = selection.getRangeAt(0);
            const editorDiv = document.querySelector('.content-text-code');

            if (editorDiv && editorDiv.contains(range.commonAncestorContainer)) {
                const [start, end] = getSourceDocumentRange(editorDiv, range);
                if (end - start > 0) {
                    currentSelection.value = {
                        type: 'code',
                        documentId: selectedCodeFile.value,
                        start,
                        end,
                        content: selectedCodeRawContent.value.slice(start, end)
                    };
                    showCodeSelectionDialog.value = true;
                    newAlignmentName.value = '';
                }
            }
        };

        // 添加到现有对齐关系
        const addToAlignment = async (alignment) => {
            if (!currentSelection.value || !alignment) return;

            if (currentSelection.value.type === 'code') {
                // 获取代码文件内容以转换字符偏移为行号
                const codeFileContent = selectedCodeRawContent.value;
                const { startLine, endLine } = convertOffsetToLineNumbers(
                    codeFileContent,
                    currentSelection.value.start,
                    currentSelection.value.end
                );

                alignment.codeRanges.push({
                    documentId: currentSelection.value.documentId,
                    filename: currentSelection.value.documentId, // 文件名
                    start: currentSelection.value.start,
                    end: currentSelection.value.end,
                    startLine: startLine, // 起始行号
                    endLine: endLine, // 结束行号
                    content: currentSelection.value.content
                });
            }

            showCodeSelectionDialog.value = false;
            
            // 保存当前选择信息，因为稍后会清空currentSelection
            const selectionInfo = currentSelection.value;
            currentSelection.value = null;

            try {
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(selectedDocFile.value)}&kind=doc`,
                    alignment
                );
                
                // 更新所有对齐数据以保持统计信息同步
                await fetchAllAlignments();
                
                ElMessage.success('已添加到对齐关系');
            } catch (err) {
                console.error("Error updating alignment:", err);
                ElMessage.error(`更新对齐关系失败: ${err.message}`);
            }
        };

        // 添加需求范围到现有对齐关系
        const addDocToAlignment = async (alignment) => {
            if (!currentSelection.value || !alignment) return;

            // 获取需求文档内容以转换字符偏移为行号
            const docFileContent = selectedDocRawContent.value;
            const { startLine, endLine } = convertOffsetToLineNumbers(
                docFileContent,
                currentSelection.value.start,
                currentSelection.value.end
            );

            const docRange = {
                documentId: currentSelection.value.documentId,
                filename: currentSelection.value.documentId, // 文件名
                start: currentSelection.value.start,
                end: currentSelection.value.end,
                startLine: startLine, // 起始行号
                endLine: endLine, // 结束行号
                content: currentSelection.value.content
            };

            alignment.docRanges.push(docRange);
            
            showAlignmentDialog.value = false;
            
            // 保存当前选择信息，因为稍后会清空currentSelection
            const selectionInfo = currentSelection.value;
            currentSelection.value = null;

            try {
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(selectedDocFile.value)}&kind=doc`,
                    alignment
                );
                
                // 更新所有对齐数据以保持统计信息同步
                await fetchAllAlignments();
                
                ElMessage.success('已添加到对齐关系');
            } catch (err) {
                console.error("Error updating alignment:", err);
                ElMessage.error(`更新对齐关系失败: ${err.message}`);
            }
        };

        // 导出表单相关状态
        const showExportDialog = ref(false);
        const exportForm = ref({
            productName: 'AAA软件',
            issueId: 'BBB',
            productId: 'CCC',
            discoveryMethod: '代码审查',
            issueTracking: 'DDD',
            issueCategories: ['文档', '编码'],
            exportPath: projectPath.value || '',
            selectedFolderName: '',
            selectedFolderHandle: null
        });

        // 选择导出文件夹
        // 导出非误报的问题单
        const exportConfirmedIssues = async () => {
            try {
                // 筛选非误报的问题单
                const confirmedIssues = issues.value.filter(issue => issue.status === 'confirmed' || issue.status === 'unconfirmed');
                
                if (confirmedIssues.length === 0) {
                    ElMessage.warning('没有可导出（非误报）的问题单');
                    return;
                }

                // 显示导出对话框
                showExportDialog.value = true;
            } catch (error) {
                console.error('导出问题单失败:', error);
                ElMessage.error('导出失败：' + error.message);
            }
        };

        // 确认导出
        const confirmExport = async () => {
            try {
                // 筛选出非误报的问题单
                const confirmedIssues = issues.value.filter(issue => issue.status === 'confirmed' || issue.status === 'unconfirmed');
                
                if (confirmedIssues.length === 0) {
                    ElMessage.warning('没有非误报的问题单可导出');
                    showExportDialog.value = false;
                    return;
                }

                // 调用后端API生成docx文件
                const response = await axios.post('/project/export-issues-download', {
                    issues: confirmedIssues,
                    formData: exportForm.value,
                    projectPath: projectPath.value
                });

                if (response.data.status === 'success') {
                    // 直接下载docx文件
                    const docxFilename = response.data.docxFile;
                    
                    // 创建下载链接
                    const downloadUrl = `/project/download-file/${docxFilename}`;
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = docxFilename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    showExportDialog.value = false;
                } else {
                    ElMessage.error('导出失败：' + response.data.message);
                }
            } catch (error) {
                console.error('导出问题单失败:', error);
                ElMessage.error('导出失败：' + error.message);
            }
        };

        // 删除项目
        const deleteProject = async () => {
            try {
                const result = await ElMessageBox.confirm(
                    '这将删除服务器上的项目文件，确认删除？',
                    '删除项目',
                    {
                        confirmButtonText: '确认删除',
                        cancelButtonText: '取消',
                        type: 'warning',
                        confirmButtonClass: 'el-button--danger'
                    }
                );

                if (result === 'confirm') {
                    // 调用后端API删除项目
                    const response = await axios.post('/project/delete', {
                        path: projectPath.value
                    });
                    
                    if (response.data.status === 'success') {
                        window.location.href = '/';
                    } else {
                        ElMessage.error('删除失败：' + response.data.message);
                    }
                }
            } catch (error) {
                if (error !== 'cancel') {
                    console.error('删除项目失败:', error);
                    ElMessage.error('删除失败：' + (error.response?.data?.message || error.message));
                }
            }
        };

        /***********************
         * 问题单管理
         ***********************/
        const issues = ref([]);
        const selectedIssue = ref(null);

        const selectIssue = (issue) => {
            selectedIssue.value = issue;
        };

        const confirmIssue = async () => {
            if (!selectedIssue.value) {
                ElMessage.warning('请先选择一个问题单。');
                return;
            }

            try {
                // 更新问题单状态为已确认
                const updatedIssue = { ...selectedIssue.value, status: 'confirmed' };
                const response = await axios.put(
                    `/project/issues/${selectedIssue.value.id}?path=${encodeURIComponent(projectPath.value)}`,
                    updatedIssue
                );

                if (response.data.status === 'success') {
                    // 更新本地数据
                    const idx = issues.value.findIndex(i => i.id === selectedIssue.value.id);
                    if (idx > -1) issues.value[idx].status = 'confirmed';
                    selectedIssue.value.status = 'confirmed';
                } else {
                    ElMessage.error('确认失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error confirming issue:', error);
                ElMessage.error('确认失败：' + (error.response?.data?.message || error.message));
            }
        };

        // 将选中的问题单标记为误报
        const markFalsePositive = async () => {
            if (!selectedIssue.value) {
                ElMessage.warning('请先选择一个问题单。');
                return;
            }

            try {
                const updatedIssue = { ...selectedIssue.value, status: 'false_positive' };
                const response = await axios.put(
                    `/project/issues/${selectedIssue.value.id}?path=${encodeURIComponent(projectPath.value)}`,
                    updatedIssue
                );

                if (response.data.status === 'success') {
                    const idx = issues.value.findIndex(i => i.id === selectedIssue.value.id);
                    if (idx > -1) issues.value[idx].status = 'false_positive';
                    selectedIssue.value.status = 'false_positive';
                } else {
                    ElMessage.error('标记失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error marking false positive:', error);
                ElMessage.error('标记失败：' + (error.response?.data?.message || error.message));
            }
        };

        // 循环切换问题单状态
        const cycleIssueStatus = async (issue) => {
            let newStatus;
            
            // 状态循环：未确认 -> 已确认 -> 误报 -> 未确认
            switch (issue.status) {
                case 'unconfirmed':
                case undefined:
                case null:
                    newStatus = 'confirmed';
                    break;
                case 'confirmed':
                    newStatus = 'false_positive';
                    break;
                case 'false_positive':
                    newStatus = 'unconfirmed';
                    break;
                default:
                    newStatus = 'confirmed';
            }

            try {
                const updatedIssue = { ...issue, status: newStatus };
                const response = await axios.put(
                    `/project/issues/${issue.id}?path=${encodeURIComponent(projectPath.value)}`,
                    updatedIssue
                );

                if (response.data.status === 'success') {
                    // 更新本地数据
                    const idx = issues.value.findIndex(i => i.id === issue.id);
                    if (idx > -1) {
                        issues.value[idx].status = newStatus;
                    }
                    issue.status = newStatus;
                    
                    // 如果是当前选中的问题单，也要更新
                    if (selectedIssue.value && selectedIssue.value.id === issue.id) {
                        selectedIssue.value.status = newStatus;
                    }
                    
                    const statusText = newStatus === 'confirmed' ? '已确认' : 
                                     newStatus === 'false_positive' ? '误报' : '未确认';
                } else {
                    ElMessage.error('状态更新失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error updating issue status:', error);
                ElMessage.error('状态更新失败：' + (error.response?.data?.message || error.message));
            }
        };

        // 删除选中的问题单
        const deleteSelectedIssue = async () => {
            if (!selectedIssue.value) {
                ElMessage.warning('请先选择一个问题单。');
                return;
            }

            try {
                const response = await axios.delete(
                    `/project/issues/${selectedIssue.value.id}?path=${encodeURIComponent(projectPath.value)}`
                );

                if (response.data.status === 'success') {
                    const idx = issues.value.findIndex(i => i.id === selectedIssue.value.id);
                    if (idx > -1) issues.value.splice(idx, 1);
                    selectedIssue.value = null;
                } else {
                    ElMessage.error('删除失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error deleting issue:', error);
                ElMessage.error('删除失败：' + (error.response?.data?.message || error.message));
            }
        };

        const ignoreIssue = async () => {
            if (!selectedIssue.value) {
                ElMessage.warning('请先选择一个问题单。');
                return;
            }

            try {
                const response = await axios.delete(
                    `/project/issues/${selectedIssue.value.id}?path=${encodeURIComponent(projectPath.value)}`
                );

                if (response.data.status === 'success') {
                    const index = issues.value.indexOf(selectedIssue.value);
                    if (index > -1) {
                        issues.value.splice(index, 1);
                        selectedIssue.value = null;
                        ElMessage.info('问题单已忽略。');
                    }
                } else {
                    ElMessage.error('删除失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error deleting issue:', error);
                ElMessage.error('删除失败：' + (error.response?.data?.message || error.message));
            }
        };

        // 问题单严重等级文本映射
        const issueLevelText = (level) => {
            if (!level) return '';
            switch (level.toLowerCase()) {
                case 'high': return '重大';
                case 'medium': return '严重';
                case 'low': return '一般';
                default: return level;
            }
        };

        // 刷新问题单排序
        const refreshIssuesSorting = () => {
            const levelOrder = { 'high': 0, 'medium': 1, 'low': 2 };
            issues.value.sort((a, b) => {
                const levelA = levelOrder[a.level] !== undefined ? levelOrder[a.level] : 3;
                const levelB = levelOrder[b.level] !== undefined ? levelOrder[b.level] : 3;
                return levelA - levelB;
            });
        };

        /***********************
         * 自动对齐和审查切换功能
         ***********************/
        const toggleAutoAlignment = async () => {
            if (isAutoAligning.value) {
                // 停止对齐
                isAutoAligning.value = false;
                alignmentProgress.value = { current: 0, total: 0 };
                // 停止进度显示
                stopProgress();
                ElMessage.info('已停止自动对齐');
            } else {
                // 默认为 需求 -> 代码 对齐
                await startAutoAlignmentReqToCode();
            }
        };

        const toggleAutoReview = async () => {
            if (isAutoReviewing.value) {
                // 停止审查
                isAutoReviewing.value = false;
                reviewProgress.value = { current: 0, total: 0 };
                // 停止进度显示
                stopProgress();
                ElMessage.info('已停止自动审查');
            } else {
                // 开始审查
                await startAutoReview();
            }
        };

        /***********************
         * 重新对齐和重新审查功能
         ***********************/
        const restartAlignment = async () => {
            try {
                const result = await ElMessageBox.confirm(
                    '这将清除已有的代码对齐结果，保留需求分解结果，然后重新开始自动对齐。确认继续？',
                    '重新对齐',
                    {
                        confirmButtonText: '确认',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }
                );

                if (result === 'confirm') {                    
                    // 调用后端清除代码范围
                    const response = await axios.post('/api/clear-code-ranges', {
                        projectPath: projectPath.value
                    });
                    
                    if (response.data.status === 'success') {
                        // 清除前端代码高亮
                        removeAllHighlights();
                        
                        // 重新获取对齐数据
                        // await fetchAllAlignments(); // 移除 fetchAllAlignments 调用
                        await fetchAlignments();
                                                
                        // 开始自动对齐
                        await startAutoAlignmentReqToCode();
                    } else {
                        throw new Error(response.data.message || '清除代码范围失败');
                    }
                }
            } catch (error) {
                if (error !== 'cancel') {
                    console.error('重新对齐失败:', error);
                    ElMessage.error(`重新对齐失败: ${error.message}`);
                }
            }
        };

        const restartReview = async () => {
            try {
                const result = await ElMessageBox.confirm(
                    '这将清除已有的审查结果，然后重新开始自动审查。确认继续？',
                    '重新审查',
                    {
                        confirmButtonText: '确认',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }
                );

                if (result === 'confirm') {                    
                    // 调用后端清除审查结果
                    const response = await axios.post('/api/clear-review-results', {
                        projectPath: projectPath.value
                    });
                    
                    if (response.data.status === 'success') {
                        // 清空前端审查相关状态
                        issues.value = [];
                        selectedIssue.value = null;
                        
                        // 重新获取对齐数据（更新审查状态）
                        // await fetchAllAlignments(); // 移除 fetchAllAlignments 调用
                        await fetchAlignments();
                                                
                        // 开始自动审查
                        await startAutoReview();
                    } else {
                        throw new Error(response.data.message || '清除审查结果失败');
                    }
                }
            } catch (error) {
                if (error !== 'cancel') {
                    console.error('重新审查失败:', error);
                    ElMessage.error(`重新审查失败: ${error.message}`);
                }
            }
        };

        /***********************
         * 对齐结果与右键菜单管理
         ***********************/
        const contextMenu = ref({
            visible: false,
            top: 0,
            left: 0,
            selectedAlignment: null,
        });

        const showContextMenu = (event, alignment) => {
            contextMenu.value.visible = true;
            contextMenu.value.selectedAlignment = alignment;

            // 先设置菜单可见，以便获取菜单尺寸
            nextTick(() => {
                const menuElement = document.querySelector('.context-menu');
                if (!menuElement) return;

                const menuRect = menuElement.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                let left = event.clientX;
                let top = event.clientY;

                // 检查右边界，如果菜单会超出右边界，则显示在鼠标左侧
                if (left + menuRect.width > viewportWidth) {
                    left = event.clientX - menuRect.width;
                }

                // 检查下边界，如果菜单会超出下边界，则显示在鼠标上方
                if (top + menuRect.height > viewportHeight) {
                    top = event.clientY - menuRect.height;
                }

                // 确保菜单不会超出左边界和上边界
                left = Math.max(0, left);
                top = Math.max(0, top);

                contextMenu.value.left = left;
                contextMenu.value.top = top;
            });

            // 添加一个全局点击事件监听器来隐藏菜单
            document.addEventListener('click', hideContextMenu);
        };

        const hideContextMenu = () => {
            contextMenu.value.visible = false;
            // 移除监听器，避免内存泄漏
            document.removeEventListener('click', hideContextMenu);
        };


        const renameAlignment = async () => {
            if (!contextMenu.value.selectedAlignment) return;
            const alignment = alignmentResults.value.find(a => a.id === contextMenu.value.selectedAlignment.id);
            if (!alignment) return;

            const oldName = alignment.name;
            const newName = prompt('请输入新的名称：', oldName);

            if (newName && newName.trim() !== '' && newName.trim() !== oldName) {
                alignment.name = newName.trim();
                try {
                    await axios.post(
                        `/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(selectedDocFile.value)}&kind=doc`,
                        alignment
                    );
                } catch (err) {
                    // 如果后端更新失败，则恢复前端的名称
                    alignment.name = oldName;
                    console.error("Error renaming alignment:", err);
                    ElMessage.error(`重命名失败: ${err.message}`);
                }
            }
        };

        const deleteAlignment = () => {
            if (!contextMenu.value.selectedAlignment) return;
            const alignmentToDelete = contextMenu.value.selectedAlignment;

            ElMessageBox.confirm(`确定要删除对齐项 "${alignmentToDelete.name}" 吗？`, '确认删除', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(async () => {
                try {
                    await axios.delete(`/project/alignment?path=${encodeURIComponent(projectPath.value)}&id=${alignmentToDelete.id}`);
                    const index = alignmentResults.value.findIndex(a => a.id === alignmentToDelete.id);
                    if (index > -1) {
                        // 移除对应的高亮
                        const highlightsToRemove = document.querySelectorAll(`.requirement-highlight[data-alignment-id="${alignmentToDelete.id}"]`);
                        highlightsToRemove.forEach(el => {
                            const parent = el.parentNode;
                            parent.insertBefore(document.createTextNode(el.textContent), el);
                            parent.removeChild(el);
                            parent.normalize();
                        });
                        
                        // 移除代码高亮
                        const codeHighlightsToRemove = document.querySelectorAll(`.code-highlight[data-alignment-id="${alignmentToDelete.id}"]`);
                        codeHighlightsToRemove.forEach(el => {
                            const parent = el.parentNode;
                            parent.insertBefore(document.createTextNode(el.textContent), el);
                            parent.removeChild(el);
                            parent.normalize();
                        });
                        
                        alignmentResults.value.splice(index, 1);
                        // 更新所有对齐数据以保持统计信息同步
                        // await fetchAllAlignments(); // 移除 fetchAllAlignments 调用，使用 fetchAlignments 代替
                        await fetchAlignments();
                        
                        // 刷新筛选状态下的对齐列表
                        refreshFilteredAlignments();
                        
                        ElMessage.info('对齐项已删除。');
                    }
                } catch (err) {
                    console.error("Error deleting alignment:", err);
                    ElMessage.error(`删除失败: ${err.message}`);
                }
            }).catch(() => { });
        };

        // 单独对齐功能
        const singleAlignment = async () => {
            if (!contextMenu.value.selectedAlignment) return;
            const alignment = contextMenu.value.selectedAlignment;

            // 检查是否已有代码对齐
            if (alignment.codeRanges && alignment.codeRanges.length > 0) {
                ElMessageBox.confirm(
                    `对齐关系 "${alignment.name}" 已有代码对齐，是否删除现有对齐并重新对齐？`,
                    '确认重新对齐',
                    {
                        confirmButtonText: '重新对齐',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }
                ).then(async () => {
                    await performSingleAlignment(alignment);
                }).catch(() => {});
            } else {
                await performSingleAlignment(alignment);
            }
        };

        // 执行单独对齐
        const performSingleAlignment = async (alignment) => {
            try {
                ElMessage.info(`开始为 "${alignment.name}" 进行对齐...`);
                
                const hasDocRanges = Array.isArray(alignment.docRanges) && alignment.docRanges.length > 0;
                const hasCodeRanges = Array.isArray(alignment.codeRanges) && alignment.codeRanges.length > 0;

                let sourceType = null;
                if (hasDocRanges && !hasCodeRanges) {
                    sourceType = 'doc';
                } else if (hasCodeRanges && !hasDocRanges) {
                    sourceType = 'code';
                } else if (!hasDocRanges && !hasCodeRanges) {
                    throw new Error('该对齐关系既没有需求范围也没有代码范围，无法对齐');
                } else {
                    const matchesCurrentDoc = selectedDocFile.value && alignment.docRanges.some(r => r.documentId === selectedDocFile.value);
                    const matchesCurrentCode = selectedCodeFile.value && alignment.codeRanges.some(r => r.documentId === selectedCodeFile.value);
                    sourceType = matchesCurrentCode && !matchesCurrentDoc ? 'code' : 'doc';
                }

                if (alignment.isReviewed) {
                    await axios.post('/api/clear-alignment-review', {
                        projectPath: projectPath.value,
                        alignmentId: alignment.id
                    });
                }

                const updatedAlignment = {
                    ...alignment,
                    isReviewed: false,
                    reviewThoughts: ''
                };

                if (sourceType === 'doc') {
                    ElMessage.info('当前为未对齐的需求块，将匹配代码块...');
                    const alignResponse = await axios.post('/api/align-requirement-to-project', {
                        docRanges: updatedAlignment.docRanges,
                        projectPath: projectPath.value
                    });
                    if (!alignResponse.data || alignResponse.data.status !== 'success') {
                        throw new Error(alignResponse.data?.message || '需求 → 代码 对齐失败');
                    }
                    updatedAlignment.codeRanges = alignResponse.data.codeRanges || [];
                } else {
                    ElMessage.info('当前为未对齐的代码块，将匹配需求块...');
                    const alignResponse = await axios.post('/api/align-code-to-requirement', {
                        codeRanges: updatedAlignment.codeRanges,
                        projectPath: projectPath.value
                    });
                    if (!alignResponse.data || alignResponse.data.status !== 'success') {
                        throw new Error(alignResponse.data?.message || '代码 → 需求 对齐失败');
                    }
                    updatedAlignment.docRanges = alignResponse.data.docRanges || [];
                }

                await axios.post(`/project/alignments?path=${encodeURIComponent(projectPath.value)}`, updatedAlignment);
                
                // 刷新对齐数据
                await fetchAlignments();
                refreshFilteredAlignments();
                
                ElMessage.success(`"${alignment.name}" 对齐完成！`);
            } catch (error) {
                console.error('单独对齐失败:', error);
                ElMessage.error(`对齐失败: ${error.message}`);
            }
        };

        // 单独审查功能
        const singleReview = async () => {
            if (!contextMenu.value.selectedAlignment) return;
            const alignment = contextMenu.value.selectedAlignment;

            // 检查是否有代码对齐
            if (!alignment.codeRanges || alignment.codeRanges.length === 0) {
                ElMessage.warning('该对齐关系还没有代码对齐，请先进行对齐');
                return;
            }

            // 检查是否已审查
            if (alignment.isReviewed) {
                ElMessageBox.confirm(
                    `对齐关系 "${alignment.name}" 已审查过。重新审查将清空历史结果（审查思考与关联问题单），是否继续？`,
                    '确认重新审查',
                    {
                        confirmButtonText: '重新审查',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }
                ).then(async () => {
                    try {
                        // First clear previous review results for this alignment
                        const resp = await axios.post('/api/clear-alignment-review', {
                            projectPath: projectPath.value,
                            docFile: selectedDocFile.value,
                            alignmentId: alignment.id
                        });

                        if (resp.data && resp.data.status === 'success') {
                            const removed = resp.data.removedIssues || 0;
                            ElMessage.success(`已清空历史审查结果（删除关联问题单 ${removed} 条）。`);
                        } else {
                            throw new Error(resp.data?.message || '清理历史审查结果失败');
                        }

                        // Refresh alignments and issues after clearing
                        await fetchAlignments();
                        await fetchAllAlignments();
                        await fetchIssues();

                        // Then perform re-review
                        await performSingleReview(alignment);
                    } catch (err) {
                        console.error('清理并重新审查失败:', err);
                        ElMessage.error(`清理或重新审查失败: ${err.message}`);
                    }
                }).catch(() => {});
            } else {
                await performSingleReview(alignment);
            }
        };

        // 执行单独审查
        const performSingleReview = async (alignment) => {
            try {
                ElMessage.info(`开始为 "${alignment.name}" 进行审查...`);
                
                // 调用后端审查API
                await axios.post('/api/review-alignment', {
                    projectPath: projectPath.value,
                    docFile: selectedDocFile.value,
                    alignment: alignment
                });
                
                // 刷新对齐数据
                await fetchAlignments();
                await fetchAllAlignments();
                await fetchIssues();
                
                ElMessage.success(`"${alignment.name}" 审查完成！`);
            } catch (error) {
                console.error('单独审查失败:', error);
                ElMessage.error(`审查失败: ${error.message}`);
            }
        };

        // 删除对齐关系中的范围
        const removeRange = async (alignment, type, index) => {
            // 保存要删除的范围信息，用于精确移除高亮
            const rangeToRemove = type === 'doc' ? alignment.docRanges[index] : alignment.codeRanges[index];
            
            if (type === 'doc') {
                alignment.docRanges.splice(index, 1);
            } else {
                alignment.codeRanges.splice(index, 1);
            }

            // 精确移除被删除范围的高亮
            if (rangeToRemove) {
                // removeSpecificHighlights([rangeToRemove], type, alignment.id);
            }

            // 当删除所有代码范围或所有需求范围时，重置为未审查/未对齐
            const noCode = alignment.codeRanges.length === 0;
            const noDoc = alignment.docRanges.length === 0;
            if (noCode || noDoc) {
                alignment.isReviewed = false;
                alignment.reviewThoughts = '';
            }

            // 如果对齐关系中没有范围了，删除整个对齐关系
            if (noDoc && noCode) {
                const idx = alignmentResults.value.indexOf(alignment);
                if (idx !== -1) {
                    try {
                        await axios.delete(`/project/alignment?path=${encodeURIComponent(projectPath.value)}&id=${alignment.id}`);
                        alignmentResults.value.splice(idx, 1);
                        await fetchAllAlignments();
                    } catch (err) {
                        console.error("Error deleting alignment:", err);
                        ElMessage.error(`删除失败: ${err.message}`);
                    }
                }
            } else {
                try {
                    await axios.post(
                        `/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(selectedDocFile.value)}&kind=doc`,
                        alignment
                    );
                } catch (err) {
                    console.error("Error updating alignment:", err);
                    ElMessage.error(`更新失败: ${err.message}`);
                }
            }

            // 刷新筛选状态下的对齐列表
            refreshFilteredAlignments();
        };

        const showReviewResult = () => {
            if (!contextMenu.value.selectedAlignment) return;

            selectedReviewAlignment.value = contextMenu.value.selectedAlignment;
            showReviewDialog.value = true;
            hideContextMenu();
        };

        const getIssueById = (issueId) => {
            return issues.value.find(issue => issue.id === issueId);
        };

        const getIssuesByAlignmentId = (alignmentId) => {
            return issues.value.filter(issue => issue.alignmentId === alignmentId);
        };

        const toggleEditIssue = (issue) => {
            // Set other issues to non-editing; toggle only current issue
            issues.value.forEach(i => {
                if (i.id !== issue.id && i._isEditing) {
                    // Optional: revert other items' content when cancelling edit
                    // i.description = i.description;
                }
                i._isEditing = (i.id === issue.id) ? !issue._isEditing : false;
            });

            if (issue._isEditing) {
                // Backup content when entering edit mode
                issueContentBeforeEdit.value = issue.description;
            } else {
                // Optional: restore original content when exiting edit mode
                // issue.description = issueContentBeforeEdit.value; // 如需恢复请取消注释
            }
        };

        const updateIssueContentOnBlur = (event, issue) => {
            // Update model when editor loses focus
            if (issue._isEditing) {
                issue.description = event.target.innerText;
            }
        };

        const saveIssue = async (issue) => {
            issue._isEditing = false; // Exit edit mode
            try {
                const response = await axios.post('/project/issue/update', {
                    path: projectPath.value,
                    issueId: issue.id,
                    description: issue.description,
                    level: issue.level
                });
                if (response.data.status === 'success') {
                } else {
                    ElMessage.error(response.data.message || '保存失败');
                    // Optional: rollback content
                    issue.description = issueContentBeforeEdit.value;
                }
            } catch (error) {
                console.error('保存问题单失败:', error);
                ElMessage.error('保存问题单时发生错误');
                issue.description = issueContentBeforeEdit.value;
            }
        };

        // 删除指定问题单（审查结果详情弹窗中的每条问题单）
        const deleteIssue = async (issue) => {
            if (!issue) return;

            try {
                const result = await ElMessageBox.confirm(
                    `确定删除问题单 ${issue.displayId || ''} 吗？`,
                    '删除问题单',
                    {
                        confirmButtonText: '删除',
                        cancelButtonText: '取消',
                        type: 'warning',
                        confirmButtonClass: 'el-button--danger'
                    }
                );

                if (result === 'confirm') {
                    const response = await axios.delete(
                        `/project/issues/${issue.id}?path=${encodeURIComponent(projectPath.value)}`
                    );

                    if (response.data.status === 'success') {
                        const idx = issues.value.findIndex(i => i.id === issue.id);
                        if (idx > -1) {
                            issues.value.splice(idx, 1);
                        }
                        if (selectedIssue.value && selectedIssue.value.id === issue.id) {
                            selectedIssue.value = null;
                        }
                        ElMessage.success('问题单已删除');
                    } else {
                        ElMessage.error('删除失败：' + (response.data.message || '未知错误'));
                    }
                }
            } catch (error) {
                if (error === 'cancel') return; // 用户取消不提示错误
                console.error('删除问题单失败:', error);
                ElMessage.error('删除失败：' + (error.response?.data?.message || error.message));
            }
        };

        const showIssueDetail = async (issue) => {
            if (!issue) return;

            try {
                // 根据问题单的docFilename构造对齐关系文件路径
                const docFilename = issue.relatedDocFile;
                if (!docFilename) {
                    ElMessage.error('问题单缺少关联的文档信息');
                    return;
                }

                // 使用新的API端点加载对齐关系数据
                const response = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(docFilename)}&kind=doc`);
                if (response.data.status === 'success') {
                    const alignments = response.data.data || {};

                    // 直接通过alignmentId作为键索引找到对应的对齐关系
                    const targetAlignment = alignments[issue.alignmentId];

                    if (targetAlignment) {
                        selectedReviewAlignment.value = targetAlignment;
                        showReviewDialog.value = true;
                    } else {
                        ElMessage.warning(`未找到ID为 ${issue.alignmentId} 的对齐关系`);
                    }
                } else {
                    ElMessage.error(`加载对齐关系文件失败: ${response.data.message || '未知错误'}`);
                }
            } catch (error) {
                console.error('加载对齐关系详情失败:', error);
                ElMessage.error(`加载失败: ${error.message}`);
            }
        };

        /***********************
         * Split Panel 宽度变化监听器
         ***********************/
        // 设置split-panel宽度变化监听器
        const setupSplitPanelResizeListener = () => {
            // 使用ResizeObserver监听面板尺寸变化
            const resizeObserver = new ResizeObserver((entries) => {
                // 延迟执行，避免频繁触发
                setTimeout(() => {
                    recalculateHighlightPositions();
                }, 100);
            });

            // 监听需求文档面板
            const docPanel = document.querySelector('.req-panel');
            if (docPanel) {
                resizeObserver.observe(docPanel);
            }

            // 监听代码面板
            const codePanel = document.querySelector('.code-panel');
            if (codePanel) {
                resizeObserver.observe(codePanel);
            }

            // 监听整个splitter容器
            const splitterContainer = document.querySelector('.el-splitter');
            if (splitterContainer) {
                resizeObserver.observe(splitterContainer);
            }
        };

        // 重新计算所有高亮块的位置
        const recalculateHighlightPositions = () => {
            // 重新计算需求文档的高亮位置
            updateHighlightPositions('doc');
            updateDecompositionPositions('doc');
            
            // 重新计算代码的高亮位置
            updateHighlightPositions('code');
            updateDecompositionPositions('code');
        };

        /***********************
         * 生命周期
         ***********************/
        onMounted(async () => {
            await fetchProjectMetadata();
            // 先加载分解块数据，再加载对齐数据
            await loadAndRenderDocBlocks();
            await loadAndRenderCodeBlocks();
            await fetchAlignments();
            await fetchIssues();
            
            // 添加点击高亮需求片段的事件监听器
            const docPanel = document.querySelector('.content-text-doc');
            if (docPanel) {
                docPanel.addEventListener('click', handleHighlightBlockClick);
                docPanel.addEventListener('contextmenu', handleHighlightBlockRightClick);
            }
            
            // 添加点击高亮代码片段的事件监听器
            const codePanel = document.querySelector('.content-text-code');
            if (codePanel) {
                codePanel.addEventListener('click', handleHighlightBlockClick);
                codePanel.addEventListener('contextmenu', handleCodeHighlightBlockRightClick);
            }

            // 添加split-panel宽度变化监听器
            setupSplitPanelResizeListener();
        });

        // 重置当前项目内存数据（不会修改后端文件），并移除页面高亮
        const resetProjectState = () => {
            // 基本信息
            projectName.value = '未命名项目';
            projectPath.value = '';

            // 文件列表
            projectFiles.value = { code_files: [], doc_files: [], meta_files: ['metadata.json'] };

            // 选中与内容
            selectedDocFile.value = '';
            selectedCodeFile.value = '';
            selectedDocContent.value = '';
            selectedCodeContent.value = '';
            selectedDocRawContent.value = '';
            selectedCodeRawContent.value = '';

            // 对齐与审查状态
            alignmentResults.value = [];
            allAlignments.value = {};
            filteredAlignments.value = null;
            isFiltered.value = false;
            currentSelection.value = null;
            newAlignmentName.value = '';

            // 问题单
            issues.value = [];
            selectedIssue.value = null;

            // 任务与进度
            isAutoAligning.value = false;
            isAutoReviewing.value = false;
            alignmentProgress.value = { current: 0, total: 0 };
            reviewProgress.value = { current: 0, total: 0 };

            // 弹窗
            showAlignmentDialog.value = false;
            showCodeSelectionDialog.value = false;
            showReviewDialog.value = false;
            selectedReviewAlignment.value = null;
            
            // 清理流程图状态
            currentFlowchart.value = null;
            isGeneratingFlowchart.value = false;
            flowchartError.value = null;
            
            // 清理需求反生成状态
            currentReverseRequirement.value = null;
            isGeneratingReverse.value = false;
            reverseError.value = null;
            isViewingFlowchart.value = false;

            // 清理页面上的高亮元素
            try {
                // Remove decomposition highlights
                clearDecompositionHighlights('doc');
                clearDecompositionHighlights('code');
                
                // Remove alignment highlights
                removeAllHighlights('doc');
                removeAllHighlights('code');
                
                // Remove deprecated highlights if any remain (fallback)
                const highlights = document.querySelectorAll('.requirement-highlight, .code-highlight');
                highlights.forEach(el => {
                    const parent = el.parentNode;
                    parent.insertBefore(document.createTextNode(el.textContent), el);
                    parent.removeChild(el);
                    parent.normalize();
                });
            } catch (e) {
                console.warn('清理高亮时出错:', e);
            }

            // 如果有必要，关闭上下文菜单
            try { contextMenu.value.visible = false; } catch (e) {}

            // 暴露到全局，供外部调用（如关闭按钮）
            window.resetProjectState = resetProjectState;
        };

        /***********************
         * 需求反生成相关方法
         ***********************/
        const generateReverseRequirement = async () => {
            if (!selectedReviewAlignment.value) {
                ElMessage.error('未选择对齐关系');
                return;
            }

            isGeneratingReverse.value = true;
            reverseError.value = null;
            currentReverseRequirement.value = null;
            currentFlowchart.value = null;

            try {
                // 构建需求和代码内容
                const docRanges = selectedReviewAlignment.value.docRanges || [];
                const codeRanges = selectedReviewAlignment.value.codeRanges || [];
                
                if (codeRanges.length === 0) {
                    reverseError.value = '未找到相关代码范围';
                    ElMessage.error('未找到相关代码范围');
                    return;
                }

                // 构建需求内容
                let requirementContent = "";
                for (const docRange of docRanges) {
                    requirementContent += docRange.content + "\n";
                }

                // 构建代码内容
                let codeContent = "";
                for (const codeRange of codeRanges) {
                    codeContent += `文件: ${codeRange.filename}\n`;
                    codeContent += `代码:\n${codeRange.content}\n\n`;
                }

                const response = await axios.post('/api/generate-reverse-requirement', {
                    requirementContent: requirementContent,
                    codeContent: codeContent
                });

                if (response.data.status === 'success') {
                    currentReverseRequirement.value = response.data.generatedRequirement;
                    
                    // 如果同时返回了流程图，也设置流程图
                    if (response.data.mermaidCode) {
                        let mermaidCode = response.data.mermaidCode.replace(/\\n/g, '\n').trim();
                        currentFlowchart.value = mermaidCode;
                        
                        // 等待DOM更新后渲染Mermaid图表
                        await nextTick();
                        try {
                            const element = document.getElementById('mermaid-flowchart');
                            if (element) {
                                element.innerHTML = '';
                                const { svg } = await mermaid.render('mermaid-graph', mermaidCode);
                                element.innerHTML = svg;
                            }
                        } catch (mermaidError) {
                            console.error('Mermaid渲染错误:', mermaidError);
                            reverseError.value = 'Mermaid图表渲染失败: ' + mermaidError.message;
                        }
                    }
                    
                } else {
                    reverseError.value = response.data.message || '需求反生成失败';
                    ElMessage.error(reverseError.value);
                }
            } catch (error) {
                console.error('需求反生成时出错:', error);
                reverseError.value = '网络错误或服务器异常';
                ElMessage.error('需求反生成失败');
            } finally {
                isGeneratingReverse.value = false;
            }
        };

        const regenerateReverseRequirement = () => {
            currentReverseRequirement.value = null;
            currentFlowchart.value = null;
            generateReverseRequirement();
        };

        /***********************
         * 流程图相关方法
         ***********************/
        const generateFlowchart = async () => {
            if (!selectedReviewAlignment.value) {
                ElMessage.error('未选择对齐关系');
                return;
            }

            isGeneratingFlowchart.value = true;
            flowchartError.value = null;

            try {
                // 构建代码内容字符串
                const codeRanges = selectedReviewAlignment.value.codeRanges || [];
                if (codeRanges.length === 0) {
                    flowchartError.value = '未找到相关代码范围';
                    ElMessage.error('未找到相关代码范围');
                    return;
                }

                let codeContent = "";
                for (const codeRange of codeRanges) {
                    codeContent += `文件: ${codeRange.filename}\n`;
                    codeContent += `代码:\n${codeRange.content}\n\n`;
                }

                const response = await axios.post('/api/generate-flowchart', {
                    codeContent: codeContent
                });

                if (response.data.status === 'success') {
                    // 将转义的换行符转换为真正的换行符，并清理代码
                    let mermaidCode = response.data.mermaidCode.replace(/\\n/g, '\n');
                    
                    // 清理可能的额外字符和格式问题
                    mermaidCode = mermaidCode.trim();
                    
                    currentFlowchart.value = mermaidCode;
                    
                    // 等待DOM更新后渲染Mermaid图表
                    await nextTick();
                    try {
                        const element = document.getElementById('mermaid-flowchart');
                        if (element) {
                            // 清空元素内容
                            element.innerHTML = '';
                            
                            // 使用Mermaid 10.x的新API
                            const { svg } = await mermaid.render('mermaid-graph', mermaidCode);
                            element.innerHTML = svg;
                        }
                    } catch (mermaidError) {
                        console.error('Mermaid渲染错误:', mermaidError);
                        console.error('错误的Mermaid代码:', mermaidCode);
                        flowchartError.value = 'Mermaid图表渲染失败: ' + mermaidError.message;
                    }
                    
                } else {
                    flowchartError.value = response.data.message || '生成流程图失败';
                    ElMessage.error(flowchartError.value);
                }
            } catch (error) {
                console.error('生成流程图时出错:', error);
                flowchartError.value = '网络错误或服务器异常';
                ElMessage.error('生成流程图失败');
            } finally {
                isGeneratingFlowchart.value = false;
            }
        };

        const regenerateFlowchart = () => {
            currentFlowchart.value = null;
            generateFlowchart();
        };

        const clearFlowchart = () => {
            currentFlowchart.value = null;
            flowchartError.value = null;
        };

        // 查看流程图功能
        const viewFlowchart = async () => {
            if (!currentFlowchart.value) {
                ElMessage.error('没有可查看的流程图');
                return;
            }

            try {
                const element = document.getElementById('mermaid-flowchart');
                if (!element) {
                    ElMessage.error('未找到流程图元素');
                    return;
                }

                const svgElement = element.querySelector('svg');
                if (!svgElement) {
                    ElMessage.error('未找到SVG元素');
                    return;
                }

                // 克隆SVG元素以避免修改原始元素
                const clonedSvg = svgElement.cloneNode(true);
                
                // 设置SVG的背景色为白色
                clonedSvg.style.backgroundColor = 'white';
                
                // 确保SVG有正确的尺寸
                const svgRect = svgElement.getBoundingClientRect();
                const svgWidth = svgElement.viewBox?.baseVal?.width || svgRect.width || 800;
                const svgHeight = svgElement.viewBox?.baseVal?.height || svgRect.height || 600;
                
                clonedSvg.setAttribute('width', svgWidth);
                clonedSvg.setAttribute('height', svgHeight);
                
                // 添加白色背景矩形
                const backgroundRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                backgroundRect.setAttribute('width', '100%');
                backgroundRect.setAttribute('height', '100%');
                backgroundRect.setAttribute('fill', 'white');
                clonedSvg.insertBefore(backgroundRect, clonedSvg.firstChild);

                // 将SVG转换为字符串
                const svgData = new XMLSerializer().serializeToString(clonedSvg);
                
                // 获取HTML模板并替换占位符
                const templateResponse = await fetch('/templates/flowchart-viewer.html');
                if (!templateResponse.ok) {
                    throw new Error('无法加载流程图查看器模板');
                }
                
                let htmlContent = await templateResponse.text();
                htmlContent = htmlContent.replace('{{SVG_CONTENT}}', svgData);
                htmlContent = htmlContent.replace('{{TIMESTAMP}}', new Date().toLocaleString('zh-CN'));
                
                // 创建Blob并在新标签页中打开
                const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                
                // 在新标签页中打开
                const newWindow = window.open(url, '_blank');
                
                if (newWindow) {
                    // 等待一段时间后清理URL对象
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                    }, 1000);
                } else {
                    URL.revokeObjectURL(url);
                    ElMessage.error('无法打开新标签页，请检查浏览器弹窗设置');
                }
                
            } catch (error) {
                console.error('查看流程图时出错:', error);
                ElMessage.error('查看流程图失败: ' + error.message);
            }
        };

        // 生成行号数组的辅助函数
        const getLineNumbers = (startLine, endLine) => {
            const numbers = [];
            for (let i = startLine; i <= endLine; i++) {
                numbers.push(i);
            }
            return numbers;
        };

        // 刷新高亮
        const refreshHighlights = () => {
            try {
                // 调用utils.js中的updateHighlightPositions函数重新计算高亮位置
                if (typeof updateHighlightPositions === 'function') {
                    updateHighlightPositions('doc');
                    updateHighlightPositions('code');
                    ElMessage.success('高亮位置已刷新');
                } else {
                    console.error('updateHighlightPositions函数未找到');
                    ElMessage.error('刷新失败：函数未找到');
                }
            } catch (error) {
                console.error('刷新高亮时出错:', error);
                ElMessage.error('刷新高亮失败');
            }
        };

        /***********************
         * 监听器
         ***********************/
        // 监听选项卡切换，当切换到需求反生成选项卡时自动发送请求
        watch(activeReviewTab, (newTab, oldTab) => {
            if (newTab === 'requirement-reverse' && selectedReviewAlignment.value) {
                // 清除之前的状态
                currentReverseRequirement.value = null;
                currentFlowchart.value = null;
                reverseError.value = null;
                
                // 自动发送请求
                generateReverseRequirement();
            }
        });

        // 监听问题单详情弹窗关闭事件，重置选项卡到第一个选项
        watch(showReviewDialog, (newValue, oldValue) => {
            if (oldValue === true && newValue === false) {
                // 弹窗从打开状态变为关闭状态，重置选项卡
                activeReviewTab.value = 'issues';
            }
        });

        /***********************
         * 暴露到模板
         ***********************/
        return {
            projectName,
            projectFiles,
            selectedDocFile,
            selectedCodeFile,
            selectedDocContent,
            selectedCodeContent,
            selectedDocRawContent,
            handleDocSelection,
            showAlignmentDialog,
            currentSelection,
            newAlignmentName,
            createAlignment,
            alignmentResults,
            fetchFileContent,
            addFile,
            issues,
            selectedIssue,
            selectIssue,
            confirmIssue,
            ignoreIssue,
            docFileTree,
            codeFileTree,
            handleNodeClick,
            contextMenu,
            showContextMenu,
            renameAlignment,
            deleteAlignment,
            removeRange,
            getAlignmentStatus,
            handleCodeSelection,
            addToAlignment,
            addDocToAlignment,
            showCodeSelectionDialog,
            // 需求分解功能
            startAutoSplit,
            cancelSelection,
            refreshAlignments: fetchAlignments,
            startAutoMarkdownSplit,
            // 代码分解功能
            startAutoCodeSplit,
            // 自动对齐功能
            startAutoAlignmentReqToCode,
            startAutoAlignmentCodeToReq,
            stopAutoAlignment,
            isAutoAligning,
            alignmentProgress,
            toggleAutoAlignment,
            singleAlignment,

            // 统计数据
            requirementStats,
            totalRequirements,
            totalAlignedRequirements,
            totalReviewedRequirements,
            codeFileStats,

            // 自动审查功能
            startAutoReview,
            isAutoReviewing,
            reviewProgress,
            toggleAutoReview,
            singleReview,

            // 重新对齐和重新审查功能
            restartAlignment,
            restartReview,

            // 问题单数据
            fetchIssues,
            exportConfirmedIssues,
            deleteProject,
            // 导出表单相关
            showExportDialog,
            exportForm,
            confirmExport,
            // 审查结果弹窗
            showReviewDialog,
            selectedReviewAlignment,
            showReviewResult,
            getIssueById,
            getIssuesByAlignmentId,

            // 问题单相关
            selectedIssue,
            selectIssue,
            confirmIssue,
            markFalsePositive,
            cycleIssueStatus,
            deleteSelectedIssue,
            deleteIssue,
            ignoreIssue,
            showIssueDetail,
            editingIssueId,
            issueContentBeforeEdit,
            toggleEditIssue,
            saveIssue,
            updateIssueContentOnBlur,
            refreshIssuesSorting,
            
            // Markdown渲染
            renderMarkdownWithLatex,
            
            // 筛选功能
            filteredAlignments,
            isFiltered,
            showAllAlignments,
            viewMode,
            statusFilters,
            sidebarAlignments,
            
            // 反向映射功能
            handleAlignmentDocRangeClick,
            handleAlignmentCodeRangeClick,
            
            resetProjectState,
            activeReviewTab,
            issueLevelText,
            codeFileLines,
            codeScale,
            
            // 流程图相关
            currentFlowchart,
            isGeneratingFlowchart,
            flowchartError,
            generateFlowchart,
            regenerateFlowchart,
            clearFlowchart,
            viewFlowchart,
            
            // 需求反生成相关
            currentReverseRequirement,
            isGeneratingReverse,
            reverseError,
            isViewingFlowchart,
            generateReverseRequirement,
            regenerateReverseRequirement,
            
            // 联动相关
            currentSelectedAlignmentId,
            navigateDocBlock,
            navigateCodeBlock,
            handleAlignmentItemClick,
            
            // 行号生成
            getLineNumbers,
            
            // 进度显示相关
            showProgress,
            progressTitle,
            currentProcessingFile,
            progressCurrent,
            progressTotal,
            progressPercentage,

            refreshAlignments
        };
    }
});


/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
app.mount('#app');

// 初始化默认视图
document.addEventListener('DOMContentLoaded', function() {
    // 确保DOM已加载完成后再初始化视图
    setTimeout(() => {
        switchView('alignment');
    }, 100);
});

// 全局关闭项目函数：调用组件内的重置函数，然后跳转到欢迎页
window.closeProject = async () => {
    try {
        if (window.resetProjectState && typeof window.resetProjectState === 'function') {
            window.resetProjectState();
        }
    } catch (err) {
        console.error('resetProjectState 调用失败:', err);
    }

    // 跳转到欢迎页面（根路径或 /welcome 可根据后端路由调整）
    window.location.href = '/';
};
