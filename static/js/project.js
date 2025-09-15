/****************************
 * 全局状态与配置
 ****************************/
let activeView = 'statsView'; // 当前活动视图

const { createApp, ref, onMounted, computed, nextTick } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;
import {
    regularizeFileContent, renderMarkdown, formatCodeWithLineNumbers, getSourceDocumentRange, convertOffsetToLineNumbers, highlightRange
} from './utils.js';

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

/** 占位功能：预览 */
function previewPanel() {
    alert('预览功能将在后续实现');
}

/** 占位功能：导出 */
function exportPanel() {
    alert('导出功能将在后续实现');
}

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

        /***********************
         * 文件加载相关方法
         ***********************/
        // 存储所有文档的对齐数据
        const allAlignments = ref({});

        const fetchAlignments = async () => {
            if (!projectPath.value) return;

            // 如果没有选中文档，返回空列表
            if (!selectedDocFile.value) {
                alignmentResults.value = [];
                return;
            }

            try {
                const response = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(selectedDocFile.value)}`);
                if (response.data.status === 'success' && response.data.data) {
                    // 后端返回的是以ID为键的对象，转换为数组以便渲染
                    alignmentResults.value = Object.values(response.data.data);
                    
                    // 在下一个tick中添加高亮，确保DOM已更新
                    await nextTick(() => {
                        // 为每个对齐关系的docRanges添加高亮
                        alignmentResults.value.forEach(alignment => {
                            if (alignment.docRanges && alignment.docRanges.length > 0) {
                                alignment.docRanges.forEach(range => {
                                    highlightRequirementRange(range.start, range.end, alignment.id);
                                });
                            }
                        });
                    });
                } else {
                    ElMessage.error(`加载对齐数据失败: ${response.data.message}`);
                }
            } catch (err) {
                // 如果是404或空文件，静默处理
                if (err.response && err.response.status === 404) {
                    alignmentResults.value = [];
                } else {
                    console.error("Error fetching alignments:", err);
                    ElMessage.error(`加载对齐数据失败: ${err.message}`);
                }
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

                for (const { docFile, alignment } of unreviewed) {
                    reviewProgress.value.current++;

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

                    ElMessage.info(`已审查: ${alignment.name}`);

                    // 添加延迟以模拟处理时间
                    await new Promise(resolve => setTimeout(resolve, 800));
                }

                // 重新加载所有对齐数据和问题单
                await fetchAllAlignments();
                await fetchAlignments(); // 确保右侧面板显示最新状态
                await fetchIssues();

                ElMessage.success(`自动审查完成！共审查 ${unreviewed.length} 个对齐关系`);
            } catch (error) {
                console.error('自动审查过程中出现错误:', error);
                ElMessage.error(`自动审查失败: ${error.message}`);
            } finally {
                isAutoReviewing.value = false;
                reviewProgress.value = { current: 0, total: 0 };
            }
        };

        // 加载所有文档的对齐数据用于统计
        const fetchAllAlignments = async () => {
            if (!projectPath.value || !projectFiles.value.doc_files.length) return;

            const alignments = {};

            for (const docFile of projectFiles.value.doc_files) {
                try {
                    const response = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(docFile)}`);
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

                    // 为没有缩略信息的旧问题单提供兼容性支持
                    for (const issue of issuesData) {
                        if (!issue.briefRequirement || !issue.briefCode) {
                            try {
                                // 根据alignmentId查找对齐关系获取缩略信息
                                const alignmentResponse = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(issue.relatedDocFile)}`);
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
                            // 当选择文档时，获取该文档的对齐结果
                            await fetchAlignments();
                            // 重新加载高亮
                            await nextTick(() => {
                                reloadHighlights();
                            });
                        } else if (fileType === 'code') {
                            selectedCodeFile.value = fileName;
                            selectedCodeRawContent.value = content;
                            selectedCodeContent.value = formatCodeWithLineNumbers(content);
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
         * 自动对齐功能
         ***********************/
        const startAutoAlignment = async () => {
            if (isAutoAligning.value) {
                ElMessage.warning('自动对齐正在进行中，请稍候...');
                return;
            }

            if (projectFiles.value.doc_files.length === 0) {
                ElMessage.warning('请先添加需求文档');
                return;
            }

            if (projectFiles.value.code_files.length === 0) {
                ElMessage.warning('请先添加代码文件');
                return;
            }

            isAutoAligning.value = true;
            ElMessage.info('开始自动对齐，正在扫描未对齐的需求点...');

            try {
                // 扫描所有文档中未对齐的需求点
                let totalUnalignedCount = 0;
                let processedCount = 0;

                for (const docFile of projectFiles.value.doc_files) {
                    const unalignedCount = await processUnalignedRequirements(docFile);
                    totalUnalignedCount += unalignedCount;
                    processedCount += unalignedCount;

                    // 实时更新统计数据 - 触发响应式更新
                    await nextTick();
                }

                // 重新加载所有对齐数据以更新统计信息
                await fetchAllAlignments();

                if (totalUnalignedCount === 0) {
                    ElMessage.info('所有需求点都已对齐，无需处理');
                } else {
                    ElMessage.success(`自动对齐完成！共处理 ${processedCount} 个未对齐需求点`);
                }
            } catch (error) {
                console.error('自动对齐过程中出现错误:', error);
                ElMessage.error(`自动对齐失败: ${error.message}`);
            } finally {
                isAutoAligning.value = false;
                alignmentProgress.value = { current: 0, total: 0 };
            }
        };

        const processUnalignedRequirements = async (docFile) => {
            try {
                const alignmentResponse = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(docFile)}`);
                const existingAlignments = alignmentResponse.data.status === 'success' ? Object.values(alignmentResponse.data.data || {}) : [];

                // 找到所有未对齐的需求点（codeRanges为空或不存在）
                const unalignedRequirements = existingAlignments.filter(alignment =>
                    !alignment.codeRanges || alignment.codeRanges.length === 0
                );

                alignmentProgress.value.total += unalignedRequirements.length;

                for (const requirement of unalignedRequirements) {
                    alignmentProgress.value.current++;

                    // 为未对齐的需求点生成mock代码对齐
                    await addMockCodeToRequirement(docFile, requirement);

                    // 实时更新统计数据
                    await fetchAllAlignments();
                    ElMessage.info(`已对齐需求点: ${requirement.name}`);

                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                return unalignedRequirements.length;
            } catch (error) {
                console.error(`处理文档 ${docFile} 时出错:`, error);
                throw error;
            }
        };

        const addMockCodeToRequirement = async (docFile, requirement) => {
            const randomCodeFile = projectFiles.value.code_files[Math.floor(Math.random() * projectFiles.value.code_files.length)];
            const startLine = Math.floor(Math.random() * 50) + 1;
            const endLine = startLine + Math.floor(Math.random() * 20) + 5;
            let mockCode = `// Mock代码段 - 对应需求: ${requirement.name}\n`;
            const updatedAlignment = {
                ...requirement,
                codeRanges: [{
                    filename: randomCodeFile,
                    start: startLine,
                    end: endLine,
                    content: mockCode
                }]
            };

            try {
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(docFile)}`,
                    updatedAlignment
                );

                // 如果当前选中的是这个文档，更新前端显示
                if (selectedDocFile.value === docFile) {
                    const index = alignmentResults.value.findIndex(a => a.id === requirement.id);
                    if (index > -1) {
                        alignmentResults.value[index] = updatedAlignment;
                    }
                }

                console.log(`为需求点添加代码对齐: ${requirement.name}`);
            } catch (error) {
                console.error(`为需求点 ${requirement.name} 添加代码对齐失败:`, error);
                throw error;
            }
        };

        /***********************
         * 状态计算函数
         ***********************/
        const getAlignmentStatus = (alignment) => {
            if (!alignment.codeRanges || alignment.codeRanges.length === 0) {
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
            const id = crypto.randomUUID();
            if (!currentSelection.value) {
                ElMessage.warning('请先选择需求文本。');
                return;
            }
            if (!newAlignmentName.value.trim()) {
                newAlignmentName.value = `需求点_${id.slice(0, 8)}`;
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
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(selectedDocFile.value)}`,
                    newAlignment
                );

                // 更新所有对齐数据以保持统计信息同步
                await fetchAllAlignments();

                // 高亮选中的需求文档部分
                highlightRequirementRange(currentSelection.value.start, currentSelection.value.end, id);

                ElMessage.success('对齐关系创建成功');
            } catch (err) {
                console.error("Error saving alignment:", err);
                ElMessage.error(`保存对齐关系失败: ${err.message}`);
                // 可选：如果保存失败，可以从UI中移除刚添加的项
                alignmentResults.value.pop();
            }
        };

        // 高亮需求文档范围
        const highlightRequirementRange = (start, end, alignmentId) => {
            const highlights = highlightRange(start, end, 'doc', alignmentId);
            
            // 设置浅灰色背景和标识属性
            highlights.forEach(highlight => {
                highlight.style.backgroundColor = '#bdc3c7';
                highlight.classList.add('requirement-highlight');
                highlight.setAttribute('data-alignment-id', alignmentId);
                highlight.setAttribute('data-range-start', start);
                highlight.setAttribute('data-range-end', end);
            });
        };

        // 重新加载当前文档的所有高亮
        const reloadHighlights = () => {
            if (!selectedDocFile.value || !alignmentResults.value) return;

            // 清除现有高亮
            const existingHighlights = document.querySelectorAll('.requirement-highlight');
            existingHighlights.forEach(el => {
                const parent = el.parentNode;
                parent.insertBefore(document.createTextNode(el.textContent), el);
                parent.removeChild(el);
                parent.normalize();
            });

            // 重新应用所有对齐关系的高亮
            alignmentResults.value.forEach(alignment => {
                if (alignment.docRanges && alignment.docRanges.length > 0) {
                    alignment.docRanges.forEach(range => {
                        highlightRequirementRange(range.start, range.end, alignment.id);
                    });
                }
            });
        };

        /***********************
         * 点击高亮筛选功能
         ***********************/
        // 根据范围筛选对齐关系
        const filterAlignmentsByRange = (start, end) => {
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

        // 显示全部对齐关系
        const showAllAlignments = () => {
            filteredAlignments.value = null;
            isFiltered.value = false;
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
            
            // 滚动到第一个元素位置
            elements[0].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
            
            // 为所有元素添加临时高亮效果
            const originalStyles = [];
            elements.forEach((element, index) => {
                // 保存原始样式
                originalStyles[index] = {
                    backgroundColor: element.style.backgroundColor,
                    transition: element.style.transition
                };
                
                // 添加醒目的黄色高亮
                element.style.backgroundColor = '#ffff00'; // 醒目的黄色
                element.style.transition = 'background-color 0.3s ease';
            });
            
            // 5秒后恢复原来的背景色
            setTimeout(() => {
                elements.forEach((element, index) => {
                    element.style.backgroundColor = originalStyles[index].backgroundColor;
                    // 再过一段时间移除transition，避免影响其他样式变化
                    setTimeout(() => {
                        element.style.transition = originalStyles[index].transition;
                    }, 300);
                });
            }, 5000);
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

        // 处理点击高亮需求片段事件
        const handleRequirementClick = (event) => {
            let target = event.target;
            while (target && !target.classList.contains('requirement-highlight')) {
                target = target.parentElement;
            }

            if (!target) return;

            // 获取高亮块的对齐关系ID
            const alignmentId = target.getAttribute('data-alignment-id');
            if (!alignmentId) return;

            // 查找对应的对齐关系
            const alignment = alignmentResults.value.find(a => a.id === alignmentId);
            if (!alignment) return;

            // 查找高亮块对应的范围
            let rangeStart = null;
            let rangeEnd = null;

            // 尝试从高亮块的自定义属性获取范围
            if (target.hasAttribute('data-range-start') && target.hasAttribute('data-range-end')) {
                rangeStart = parseInt(target.getAttribute('data-range-start'));
                rangeEnd = parseInt(target.getAttribute('data-range-end'));
            } else {
                // 如果没有自定义属性，尝试从父元素获取
                const parentWithAttrs = target.closest('[parse-start][parse-end]');
                if (parentWithAttrs) {
                    rangeStart = parseInt(parentWithAttrs.getAttribute('parse-start'));
                    rangeEnd = parseInt(parentWithAttrs.getAttribute('parse-end'));
                }
            }

            if (rangeStart !== null && rangeEnd !== null) {
                filterAlignmentsByRange(rangeStart, rangeEnd);
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
            currentSelection.value = null;

            try {
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(selectedDocFile.value)}`,
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


        /***********************
         * 问题单管理
         ***********************/
        const issues = ref([
            {
                level: 'high',
                description: '需求“用户登录功能”未在代码中实现。',
                relatedReq: '用户登录功能.md:L5-L10',
                relatedCode: 'auth.js:L20-L45',
                status: 'unconfirmed'
            },
            {
                level: 'medium',
                description: '函数`calculate_tax`的计算逻辑与需求文档不一致。',
                relatedReq: '税务计算需求.md:L15-L20',
                relatedCode: 'tax_calculator.py:L100',
                status: 'unconfirmed'
            },
            {
                level: 'low',
                description: '代码注释不完整，不符合规范。',
                relatedReq: '无',
                relatedCode: 'main.c:L30-L35',
                status: 'unconfirmed'
            },
            {
                level: 'high',
                description: 'SQL注入漏洞风险，参数未正确清理。',
                relatedReq: '安全规范.md:L25',
                relatedCode: 'database.php:L50',
                status: 'unconfirmed'
            },
            {
                level: 'high',
                description: 'SQL注入漏洞风险，参数未正确清理。',
                relatedReq: '安全规范.md:L25',
                relatedCode: 'database.php:L50',
                status: 'confirmed'
            }
        ]);
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
                    selectedIssue.value.status = 'confirmed';
                    ElMessage.success('问题单已确认。');
                } else {
                    ElMessage.error('确认失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error confirming issue:', error);
                ElMessage.error('确认失败：' + (error.response?.data?.message || error.message));
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
            contextMenu.value.top = event.clientY;
            contextMenu.value.left = event.clientX;
            contextMenu.value.selectedAlignment = alignment;

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
                        `/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(selectedDocFile.value)}`,
                        alignment
                    );
                    ElMessage.success('重命名成功！');
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
                    await axios.delete(`/project/alignment?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(selectedDocFile.value)}&id=${alignmentToDelete.id}`);
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
                        
                        alignmentResults.value.splice(index, 1);
                        // 更新所有对齐数据以保持统计信息同步
                        await fetchAllAlignments();
                        ElMessage.info('对齐项已删除。');
                    }
                } catch (err) {
                    console.error("Error deleting alignment:", err);
                    ElMessage.error(`删除失败: ${err.message}`);
                }
            }).catch(() => { });
        };

        // 删除对齐关系中的范围
        const removeRange = async (alignment, type, index) => {
            if (type === 'doc') {
                alignment.docRanges.splice(index, 1);
            } else {
                alignment.codeRanges.splice(index, 1);
            }

            // 当删除所有代码范围时，重置审查状态
            if (alignment.codeRanges.length === 0) {
                alignment.isReviewed = false;
                alignment.reviewThoughts = '';
            }

            // 如果对齐关系中没有范围了，删除整个对齐关系
            if (alignment.docRanges.length === 0 && alignment.codeRanges.length === 0) {
                const idx = alignmentResults.value.indexOf(alignment);
                if (idx !== -1) {
                    try {
                        await axios.delete(`/project/alignment?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(selectedDocFile.value)}&id=${alignment.id}`);
                        alignmentResults.value.splice(idx, 1);
                        await fetchAllAlignments();
                        ElMessage.success('对齐关系已删除');
                    } catch (err) {
                        console.error("Error deleting alignment:", err);
                        ElMessage.error(`删除失败: ${err.message}`);
                    }
                }
            } else {
                try {
                    await axios.post(
                        `/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(selectedDocFile.value)}`,
                        alignment
                    );
                    ElMessage.success('范围已删除');
                } catch (err) {
                    console.error("Error updating alignment:", err);
                    ElMessage.error(`更新失败: ${err.message}`);
                }
            }
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
            if (editingIssueId.value === issue.id) {
                // 如果当前是编辑状态，则取消编辑
                const originalIssue = issues.value.find(i => i.id === issue.id);
                if (originalIssue) {
                    originalIssue.description = issueContentBeforeEdit.value;
                }
                editingIssueId.value = null;
            } else {
                // 进入编辑状态
                editingIssueId.value = issue.id;
                issueContentBeforeEdit.value = issue.description;
            }
        };

        const updateIssueContentOnBlur = (event, issue) => {
            // 当用户离开编辑区域时，更新数据模型中的内容
            if (editingIssueId.value === issue.id) {
                issue.description = event.target.innerText;
            }
        };

        const saveIssue = async (issue) => {
            editingIssueId.value = null; // 退出编辑模式
            try {
                const response = await axios.post('/project/issue/update', {
                    path: projectPath.value,
                    issueId: issue.id,
                    description: issue.description
                });
                if (response.data.status === 'success') {
                    ElMessage.success('问题单已更新');
                } else {
                    ElMessage.error(response.data.message || '保存失败');
                    // 可选：回滚内容
                    issue.description = issueContentBeforeEdit.value;
                }
            } catch (error) {
                console.error('保存问题单失败:', error);
                ElMessage.error('保存问题单时发生错误');
                issue.description = issueContentBeforeEdit.value;
            }
        };

        const exportIssue = async (issue) => {
            try {
                const response = await axios.post('/api/export-issue', {
                    issue: issue
                }, {
                    responseType: 'blob' // 重要：接收二进制文件数据
                });

                const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.download = `问题单-${issue.id}.docx`;
                link.click();
                window.URL.revokeObjectURL(link.href);

                // 更新问题单状态
                issue.status = 'confirmed';
                ElMessage.success('问题单已导出');

                // 调用后端更新状态
                await axios.post('/project/issue/update', {
                    path: projectPath.value,
                    issueId: issue.id,
                    status: 'confirmed'
                });

            } catch (error) {
                console.error('导出问题单失败:', error);
                ElMessage.error('导出问题单时发生错误');
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
                const response = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(docFilename)}`);
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
         * 生命周期
         ***********************/
        onMounted(async () => {
            await fetchProjectMetadata();
            await fetchIssues();
            
            // 添加点击高亮需求片段的事件监听器
            const docPanel = document.querySelector('.content-text-doc');
            if (docPanel) {
                docPanel.addEventListener('click', handleRequirementClick);
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
            showCodeSelectionDialog,
            // 自动对齐功能
            startAutoAlignment,
            isAutoAligning,
            alignmentProgress,
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
            // 问题单数据
            fetchIssues,
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
            ignoreIssue,
            showIssueDetail,
            editingIssueId,
            issueContentBeforeEdit,
            toggleEditIssue,
            saveIssue,
            exportIssue,
            updateIssueContentOnBlur,
            
            // Markdown渲染
            renderMarkdownWithLatex,
            
            // 筛选功能
            filteredAlignments,
            isFiltered,
            showAllAlignments,
            
            // 反向映射功能
            handleAlignmentDocRangeClick,

            activeReviewTab
        };
    }
});


/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
app.mount('#app');
