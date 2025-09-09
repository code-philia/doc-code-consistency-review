/****************************
 * 全局状态与配置
 ****************************/
let activeView = 'statsView'; // 当前活动视图

const { createApp, ref, onMounted, computed, nextTick } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;
import {
    regularizeFileContent, renderMarkdown, formatCodeWithLineNumbers, getSourceDocumentRange
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

        const alignmentResults = ref([]);
        const isAutoAligning = ref(false);
        const isAutoReviewing = ref(false);
        const alignmentProgress = ref({ current: 0, total: 0 });
        const reviewProgress = ref({ current: 0, total: 0 });
        const showAlignmentDialog = ref(false);
        const currentSelection = ref(null);
        const newAlignmentName = ref('');
        const showReviewDialog = ref(false);
        const selectedReviewAlignment = ref(null);

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
         * 自动审查功能
         ***********************/
        const startAutoReview = async () => {
            if (isAutoReviewing.value) {
                ElMessage.warning('自动审查正在进行中，请稍候...');
                return;
            }

            if (totalAlignedRequirements.value === 0) {
                ElMessage.warning('没有已对齐的需求点，请先进行对齐');
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

                    // 生成mock审查结果
                    await generateMockReview(docFile, alignment);

                    // 实时更新统计数据
                    await fetchAllAlignments();
                    ElMessage.info(`已审查: ${alignment.name}`);

                    // 添加延迟以模拟处理时间
                    await new Promise(resolve => setTimeout(resolve, 800));
                }

                // 重新加载所有对齐数据和问题单
                await fetchAllAlignments();
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

        const generateMockReview = async (docFile, alignment) => {
            // 生成mock审查思考过程
            const requirementContent = alignment.docRanges && alignment.docRanges[0] ? alignment.docRanges[0].content : '';
            const codeContent = alignment.codeRanges && alignment.codeRanges[0] ? alignment.codeRanges[0].content : '';

            let reviewThoughts = `## 审查思考过程\n\n`;
            reviewThoughts += `### 需求分析\n`;
            reviewThoughts += `需求点"${alignment.name}"描述了以下功能要求：\n`;
            reviewThoughts += `${requirementContent.substring(0, 200)}...\n\n`;

            reviewThoughts += `### 代码实现分析\n`;
            reviewThoughts += `对应的代码实现位于文件 \`${alignment.codeRanges[0].filename}\` 第${alignment.codeRanges[0].start}-${alignment.codeRanges[0].end}行。\n\n`;

            // 根据内容生成不同的审查结论
            let hasIssue = Math.random() < 0.3; // 30%概率生成问题单
            let reviewConclusion = '';

            if (requirementContent.includes('表格') || requirementContent.includes('数据')) {
                reviewConclusion = '代码实现了基本的数据结构定义，符合需求中对表格数据处理的要求。';
                if (hasIssue) {
                    reviewConclusion += ' 但缺少数据验证和错误处理机制。';
                }
            } else if (requirementContent.includes('公式') || requirementContent.includes('计算')) {
                reviewConclusion = '代码实现了相应的计算函数，数学逻辑基本正确。';
                if (hasIssue) {
                    reviewConclusion += ' 但需要考虑边界条件和异常情况的处理。';
                }
            } else {
                reviewConclusion = '代码实现与需求描述基本一致，功能覆盖度良好。';
                if (hasIssue) {
                    reviewConclusion += ' 但代码注释不够详细，可维护性有待提升。';
                }
            }

            reviewThoughts += `### 审查结论\n${reviewConclusion}\n`;

            // 更新对齐关系，只添加审查标志和思考过程
            const updatedAlignment = {
                ...alignment,
                isReviewed: true, // 设置审查标志位
                reviewThoughts: reviewThoughts // 记录审查思考过程
            };

            // 保存审查结果
            await axios.post(
                `/project/alignments?path=${encodeURIComponent(projectPath.value)}&doc_filename=${encodeURIComponent(docFile)}`,
                updatedAlignment
            );

            // 如果有问题，生成问题单并保存到issues.json
            if (hasIssue) {
                await generateIssueToFile(alignment, reviewConclusion);
            }

            console.log(`生成审查结果: ${alignment.name}`);
        };

        // 生成问题单并保存到issues.json文件
        const generateIssueToFile = async (alignment, reviewConclusion) => {
            const issueId = crypto.randomUUID();
            const requirementContent = alignment.docRanges && alignment.docRanges[0] ? alignment.docRanges[0].content : '';

            // Mock问题等级（随机生成）
            const levels = ['high', 'medium', 'low'];
            const level = levels[Math.floor(Math.random() * levels.length)];

            // Mock问题概述（根据需求内容生成）
            const summaryOptions = [
                '代码实现与需求描述存在差异',
                '功能实现不够完整',
                '缺少必要的错误处理机制',
                '代码注释不够详细',
                '性能优化空间较大',
                '安全性考虑不足',
                '用户体验有待改进',
                '数据验证逻辑缺失',
                '接口设计不够规范',
                '配置参数需要调整'
            ];

            let summary;
            if (requirementContent.includes('用户') || requirementContent.includes('登录') || requirementContent.includes('认证')) {
                summary = '用户认证功能存在安全隐患';
            } else if (requirementContent.includes('数据库') || requirementContent.includes('连接')) {
                summary = '数据库连接配置需要优化';
            } else if (requirementContent.includes('接口') || requirementContent.includes('API')) {
                summary = 'API接口实现不完整';
            } else if (requirementContent.includes('文件') || requirementContent.includes('上传')) {
                summary = '文件处理功能需要完善';
            } else if (requirementContent.includes('权限') || requirementContent.includes('访问')) {
                summary = '权限控制机制不够严格';
            } else {
                // 随机选择一个问题概述
                summary = summaryOptions[Math.floor(Math.random() * summaryOptions.length)];
            }

            const newIssue = {
                id: issueId,
                level: level, // Mock的问题等级
                summary: summary, // Mock的问题概述
                description: reviewConclusion, // 问题详细描述
                status: 'unconfirmed', // 固定状态：初始为"未确认"
                alignmentId: alignment.id, // 关联的对齐关系ID
                relatedDocFile: selectedDocFile.value,
                relatedRequirementId: alignment.id, // 保持向后兼容
                createdDate: new Date().toISOString(),
                updatedDate: new Date().toISOString()
            };

            // 保存问题单到后端
            await axios.post(
                `/project/issues?path=${encodeURIComponent(projectPath.value)}`,
                newIssue
            );

            console.log(`生成问题单: ${summary}`);
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
                    issues.value = response.data.data || [];
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
                        } else if (fileType === 'code') {
                            selectedCodeFile.value = fileName;
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

            const newAlignment = {
                id: id,
                name: newAlignmentName.value.trim(),
                isReviewed: false,
                reviewThoughts: '',
                docRanges: [{ ...currentSelection.value }],
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

                ElMessage.success('对齐关系创建成功');
            } catch (err) {
                console.error("Error saving alignment:", err);
                ElMessage.error(`保存对齐关系失败: ${err.message}`);
                // 可选：如果保存失败，可以从UI中移除刚添加的项
                alignmentResults.value.pop();
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
            showIssueDetail
        };
    }
});


/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
app.mount('#app');
