/****************************
 * 全局状态与配置
 ****************************/
let activeView = 'statsView'; // 当前活动视图

const { createApp, ref, onMounted, computed, nextTick } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;
import {
    regularizeFileContent, renderMarkdown, formatCodeWithLineNumbers, getSourceDocumentRange, convertOffsetToLineNumbers, highlightRange, generateUUIDLike, updateHighlightPositions
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

        const codeFileLines = ref({});
        const codeScale = ref(0);

        // 流程图相关状态
        const currentFlowchart = ref(null);
        const isGeneratingFlowchart = ref(false);
        const flowchartError = ref(null);

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
                            
                            // 当选择文档时，获取该文档的对齐结果
                            await fetchAlignments();
                            // 重新加载高亮
                            await nextTick(() => {
                                reloadHighlights();
                                // 切换需求文档时，根据相关对齐关系自动高亮当前代码文件
                                if (selectedCodeFile.value && alignmentResults.value) {
                                    highlightCurrentCodeFileBasedOnDoc();
                                }
                            });
                        } else if (fileType === 'code') {
                            selectedCodeFile.value = fileName;
                            selectedCodeRawContent.value = content;
                            selectedCodeContent.value = formatCodeWithLineNumbers(content);
                            // 切换代码文件时，根据相关对齐关系自动高亮当前代码文件
                            await nextTick(() => {
                                if (selectedDocFile.value && alignmentResults.value) {
                                    highlightCurrentCodeFileBasedOnDoc();
                                }
                            });
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
                    '需求分解将清空所有现有的需求片段、对齐结果、审查结果和问题单。是否继续？',
                    '确认需求分解',
                    {
                        confirmButtonText: '继续',
                        cancelButtonText: '取消',
                        type: 'warning',
                    }
                );
            } catch {
                return; // 用户取消操作
            }
            
            try {
                // 先清空所有结果
                await clearAllResults();
                
                ElMessage.info('开始需求分解，生成需求点...');
                const response = await axios.post('api/requirement-decomposition',{
                    projectPath: projectPath.value
                });
                if(response.data.status==='success'){
                    ElMessage.success('需求分解完成！');
                    await fetchAlignments();
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
                    '自动分解将清空所有现有的需求片段、对齐结果、审查结果和问题单。是否继续？',
                    '确认自动分解',
                    {
                        confirmButtonText: '继续',
                        cancelButtonText: '取消',
                        type: 'warning',
                    }
                );
            } catch {
                return;
            }
            
            try {
                await clearAllResults();
                
                ElMessage.info('开始自动分解需求文档...');
                const response = await axios.post('api/auto-markdown-split',{
                    projectPath: projectPath.value
                });
                if(response.data.status==='success'){
                    ElMessage.success('自动分解完成！');
                    await fetchAlignments();
                }
                else{
                    ElMessage.error(`自动分解失败: ${response.data.message}`);
                }

            } catch (error) {
                console.error('自动分解过程中出现错误:', error);
                ElMessage.error(`自动分解失败: ${error.message}`);
            }
        }

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
            try {
                // 调用新的API获取真实的代码对齐结果
                const alignResponse = await axios.post('/api/align-requirement-to-project', {
                    docRanges: requirement.docRanges || [],
                    projectPath: projectPath.value
                });

                if (alignResponse.data.status !== 'success') {
                    throw new Error(alignResponse.data.message || '对齐API调用失败');
                }

                const codeRanges = alignResponse.data.codeRanges || [];
                
                const updatedAlignment = {
                    ...requirement,
                    codeRanges: codeRanges
                };

                // 保存对齐结果到文件
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

                console.log(`为需求点添加代码对齐: ${requirement.name}，找到 ${codeRanges.length} 个相关代码块`);
            } catch (error) {
                console.error(`为需求点 ${requirement.name} 添加代码对齐失败:`, error);
                
                // 如果API调用失败，回退到空的codeRanges
                const fallbackAlignment = {
                    ...requirement,
                    codeRanges: []
                };
                
                try {
                    await axios.post(
                        `/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(docFile)}`,
                        fallbackAlignment
                    );
                } catch (saveError) {
                    console.error('保存空对齐关系也失败:', saveError);
                }
                
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
            const id = generateUUIDLike();

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
            
            // 设置淡雅的蓝色背景和标识属性
            highlights.forEach(highlight => {
                highlight.style.backgroundColor = 'rgba(173, 216, 230, 0.25)';
                highlight.classList.add('requirement-highlight');
                highlight.setAttribute('data-alignment-id', alignmentId);
                highlight.setAttribute('data-range-start', start);
                highlight.setAttribute('data-range-end', end);
            });
        };

        // 高亮代码范围
        const highlightCodeRange = (start, end, alignmentId) => {
            const highlights = highlightRange(start, end, 'code', alignmentId);
            
            // 设置淡雅的绿色背景和标识属性
            highlights.forEach(highlight => {
                highlight.style.backgroundColor = 'rgba(173, 216, 230, 0.25)';
                highlight.classList.add('code-highlight');
                highlight.setAttribute('data-alignment-id', alignmentId);
                highlight.setAttribute('data-range-start', start);
                highlight.setAttribute('data-range-end', end);
            });
        };

        // 重新加载当前文档的所有高亮
        const reloadHighlights = () => {
            // 重新加载需求文档高亮
            if (selectedDocFile.value && alignmentResults.value) {
                // 清除现有需求高亮
                const existingDocHighlights = document.querySelectorAll('.requirement-highlight');
                existingDocHighlights.forEach(el => {
                    const parent = el.parentNode;
                    parent.insertBefore(document.createTextNode(el.textContent), el);
                    parent.removeChild(el);
                    parent.normalize();
                });

                // 重新应用所有对齐关系的文档高亮
                alignmentResults.value.forEach(alignment => {
                    if (alignment.docRanges && alignment.docRanges.length > 0) {
                        alignment.docRanges.forEach(range => {
                            if (range.documentId === selectedDocFile.value) {
                                highlightRequirementRange(range.start, range.end, alignment.id);
                            }
                        });
                    }
                });
            }

            // 重新加载代码高亮
            if (selectedCodeFile.value && alignmentResults.value) {
                // 清除现有代码高亮
                const existingCodeHighlights = document.querySelectorAll('.code-highlight');
                existingCodeHighlights.forEach(el => {
                    const parent = el.parentNode;
                    parent.insertBefore(document.createTextNode(el.textContent), el);
                    parent.removeChild(el);
                    parent.normalize();
                });

                // 重新应用所有对齐关系的代码高亮
                alignmentResults.value.forEach(alignment => {
                    if (alignment.codeRanges && alignment.codeRanges.length > 0) {
                        alignment.codeRanges.forEach(range => {
                            if (range.documentId === selectedCodeFile.value) {
                                highlightCodeRange(range.start, range.end, alignment.id);
                            }
                        });
                    }
                });
            }
        };

        // 根据当前需求文档的对齐关系高亮当前代码文件
        const highlightCurrentCodeFileBasedOnDoc = () => {
            if (!selectedDocFile.value || !selectedCodeFile.value || !alignmentResults.value) {
                return;
            }

            // 清除现有代码高亮
            const existingCodeHighlights = document.querySelectorAll('.code-highlight');
            existingCodeHighlights.forEach(el => {
                const parent = el.parentNode;
                parent.insertBefore(document.createTextNode(el.textContent), el);
                parent.removeChild(el);
                parent.normalize();
            });

            // 查找与当前需求文档相关的对齐关系，并高亮对应的代码文件部分
            alignmentResults.value.forEach(alignment => {
                // 检查该对齐关系是否包含当前需求文档
                const hasCurrentDoc = alignment.docRanges && alignment.docRanges.some(range => 
                    range.documentId === selectedDocFile.value
                );
                
                if (hasCurrentDoc && alignment.codeRanges) {
                    // 高亮该对齐关系中当前代码文件的相关部分
                    alignment.codeRanges.forEach(range => {
                        if (range.documentId === selectedCodeFile.value) {
                            highlightCodeRange(range.start, range.end, alignment.id);
                        }
                    });
                }
            });
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
        const handleHighlightBlockClick = (event) => {
            const target = event.target;
            if (!target.classList.contains('highlight-block')) return;

            const type = target.getAttribute('data-type');
            const rangeStart = parseInt(target.getAttribute('data-range-start'));
            const rangeEnd = parseInt(target.getAttribute('data-range-end'));

            if (isNaN(rangeStart) || isNaN(rangeEnd)) return;

            // 查找所有与点击位置重叠的高亮块
            const panel = type === 'doc' 
                ? document.querySelector('.content-text-doc')
                : document.querySelector('.content-text-code');
            
            if (!panel) return;

            const allHighlightBlocks = panel.querySelectorAll('.highlight-block');
            const overlappingRanges = [];

            // 检查所有高亮块是否与点击的高亮块重叠
            allHighlightBlocks.forEach(block => {
                const blockStart = parseInt(block.getAttribute('data-range-start'));
                const blockEnd = parseInt(block.getAttribute('data-range-end'));
                const blockType = block.getAttribute('data-type');

                if (blockType === type && !isNaN(blockStart) && !isNaN(blockEnd)) {
                    // 检查是否与点击的高亮块有交集
                    if (Math.max(blockStart, rangeStart) < Math.min(blockEnd, rangeEnd)) {
                        overlappingRanges.push({
                            start: blockStart,
                            end: blockEnd
                        });
                    }
                }
            });

            // 如果没有找到重叠的范围，至少包含点击的范围
            if (overlappingRanges.length === 0) {
                overlappingRanges.push({
                    start: rangeStart,
                    end: rangeEnd
                });
            }

            // 根据类型调用相应的筛选函数
            if (type === 'doc') {
                filterAlignmentsByMultipleDocRanges(overlappingRanges);
                
                // 点击文档高亮块后，滚动到第一个筛选结果的代码区域
                nextTick(() => {
                    scrollToFirstFilteredCodeRange();
                });
            } else if (type === 'code') {
                const documentId = selectedCodeFile.value;
                filterAlignmentsByMultipleCodeRanges(overlappingRanges, documentId);
                
                // 点击代码高亮块后，滚动到第一个筛选结果的文档区域
                nextTick(() => {
                    scrollToFirstFilteredDocRange();
                });
            }
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
            
            // 滚动到第一个元素位置（只进行垂直滚动）
            elements[0].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'start'
            });
            
            // 为所有元素添加临时高亮效果
            const originalStyles = [];
            elements.forEach((element, index) => {
                // 保存原始样式
                originalStyles[index] = {
                    backgroundColor: element.style.backgroundColor,
                    transition: element.style.transition
                };
                
                // 添加淡雅的黄色高亮
                element.style.backgroundColor = 'rgba(255, 255, 183, 0.8)'; // 淡雅的黄色
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
            }, 4000);
        };

        // 滚动到第一个代码元素并高亮所有相关元素
        const scrollToFirstAndHighlightAllCode = (elements) => {
            if (!elements || elements.length === 0) return;
            
            // 滚动到第一个元素位置（只进行垂直滚动）
            elements[0].scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'start'
            });
            
            // 为所有元素添加临时高亮效果
            const originalStyles = [];
            elements.forEach((element, index) => {
                // 保存原始样式
                originalStyles[index] = {
                    backgroundColor: element.style.backgroundColor,
                    transition: element.style.transition
                };
                
                // 添加淡雅的黄色高亮
                element.style.backgroundColor = 'rgba(255, 255, 183, 0.8)'; // 淡雅的黄色
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
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(selectedDocFile.value)}`,
                    alignment
                );
                
                // 更新所有对齐数据以保持统计信息同步
                await fetchAllAlignments();
                
                // 高亮该对齐关系中当前代码文件的所有代码片段
                if (selectionInfo && selectionInfo.type === 'code') {
                    // 清除当前代码文件中该对齐关系的所有高亮
                    const existingHighlights = document.querySelectorAll(`.code-highlight[data-alignment-id="${alignment.id}"]`);
                    existingHighlights.forEach(el => {
                        const parent = el.parentNode;
                        parent.insertBefore(document.createTextNode(el.textContent), el);
                        parent.removeChild(el);
                        parent.normalize();
                    });
                    
                    // 重新高亮该对齐关系中当前代码文件的所有代码片段
                    alignment.codeRanges.forEach(range => {
                        if (range.documentId === selectedCodeFile.value) {
                            highlightCodeRange(range.start, range.end, alignment.id);
                        }
                    });
                }
                
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
                    
                    ElMessage.success(`成功生成并下载问题单docx文件：${docxFilename}`);
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
                        ElMessage.success('项目删除成功');
                        // 跳转到欢迎页面
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
                    ElMessage.success('问题单已确认。');
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
                    ElMessage.success('问题单已标记为误报。');
                } else {
                    ElMessage.error('标记失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error marking false positive:', error);
                ElMessage.error('标记失败：' + (error.response?.data?.message || error.message));
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
                    ElMessage.success('问题单已删除。');
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
                    description: issue.description,
                    level: issue.level
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
            
            // 重新计算代码的高亮位置
            updateHighlightPositions('code');
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
                docPanel.addEventListener('click', handleHighlightBlockClick);
            }
            
            // 添加点击高亮代码片段的事件监听器
            const codePanel = document.querySelector('.content-text-code');
            if (codePanel) {
                codePanel.addEventListener('click', handleHighlightBlockClick);
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

            // 清理页面上的高亮元素
            try {
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
                    
                    ElMessage.success('流程图生成成功');
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

        // 刷新高亮功能
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
            // 需求分解功能
            startAutoSplit,
            startAutoMarkdownSplit,
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
            deleteSelectedIssue,
            ignoreIssue,
            showIssueDetail,
            editingIssueId,
            issueContentBeforeEdit,
            toggleEditIssue,
            saveIssue,
            updateIssueContentOnBlur,
            
            // Markdown渲染
            renderMarkdownWithLatex,
            
            // 筛选功能
            filteredAlignments,
            isFiltered,
            showAllAlignments,
            
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
            
            // 刷新高亮功能
            refreshHighlights
        };
    }
});


/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
app.mount('#app');

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
