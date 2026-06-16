/****************************
 * 全局状态与配置
 ****************************/
let activeView = 'alignmentView'; // 当前活动视图

const { createApp, ref, onMounted, onUnmounted, onBeforeUnmount, computed, nextTick, watch } = Vue;
const { ElMessage, ElMessageBox, ElLoading } = ElementPlus;
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
        const sectionRef = ref(null);
        const tocRef = ref(null);
        const activeRangeId = ref(null);
        const isTocCollapsed = ref(false)
        const urlParams = new URLSearchParams(window.location.search);
        const projectName = ref(urlParams.get('name') || '未命名项目');
        
        const projectPath = ref(urlParams.get('path') || '未知路径');
        const errorMax = 0.5 * 60 * 5
        const errorCount = ref(0)
        const AlignTaskId = ref(null);
        const ReviewTaskId = ref(null);
        const nextTaskId = ref(null);
        const AlignCurrentTotal = ref(0);
        const ReviewCurrentTotal = ref(0);
        const nextTaskCurrent = ref(0)
        const nextTaskTotal = ref(0);
        const STORAGE_ALIGN_KEY = () => `align_task_state_${getProjectId()}`
        const STORAGE_REVIEW_KEY = () => `review_task_state_${getProjectId()}`
        const pollingTimer = ref(null);
        const pollingTimerReview = ref(null);
        const pollCount = ref(0);
        const pollCountReview = ref(0);
        const MAX_POLL_COUNT = 2000;
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
        const docPageRanges = ref([]);
        const currentDocPage = ref(1);
        const codePageRanges = ref([]);
        const currentCodePage = ref(1);
        const codePageStartLine = ref(1);
        
        const dialogParseDocMethodVisible = ref(false);
        const parseDocMethod = ref('default');
        const docFileTree = ref([]);
        const codeFileTree = ref([]);

        const alignmentResults = ref([]);
        const sidebarAlignmentItems = ref([]);
        const isAutoAligning = ref(false);
        const isAutoReviewing = ref(false);
        const alignmentProgress = ref({ current: 0, total: 0 });
        const reviewProgress = ref({ current: 0, total: 0 });
        const showAlignmentDialog = ref(false);
        const showCodeSelectionDialog = ref(false);
        const currentSelection = ref(null);
        const manualAlignFromBlock = ref(false);
        const newAlignmentName = ref('');
        const showReviewDialog = ref(false);
        const showAlignmentDirectionDialog = ref(false);
        const alignmentDirectionMode = ref('auto');
        const selectedReviewAlignment = ref(null);
        const reviewDialogSource = ref('alignment');
        const reviewDialogBlockType = ref(null);
        const reviewDialogCurrentBlockKey = ref(null);
        const currentReviewIssueId = ref(null);
        const activeReviewTab = ref('issues');
        const editingIssueId = ref(null);
        const issueContentBeforeEdit = ref('');
        // 控制提示词设置弹窗
        const showPromptDialog = ref(false)
        const outerActive = ref('moduleA')
        const innerActiveA = ref('req-code-align') // 默认对齐页
        const innerActiveB = ref('req-code-align-kbs') // 默认对齐页
        const showAlignPromptDialog = ref(false); // 控制对齐提示词设置弹窗
        const AddAlignPrompt = ref('');
        const currentReq2CodeAlignPrompt = ref('');
        const currentCode2ReqAlignPrompt = ref('');
        const defaultReq2CodeAlignPrompt = ref('');
        const defaultCode2ReqAlignPrompt = ref('');
        const currentReq2CodeAlignPromptKbs = ref('');
        const currentCode2ReqAlignPromptKbs = ref('');
        const defaultReq2CodeAlignPromptKbs = ref('');
        const defaultCode2ReqAlignPromptKbs = ref('');
        const showReviewPromptDialog = ref(false); // 控制审查提示词设置弹窗
        const AddReviewPrompt = ref('');
        const showRestartReview = ref(false)
        const showSingleReview = ref(false)
        const showReview = ref(false)
        const reviewMode = ref('default')
        const reviewModeKbs = ref('default')
        const currentReviewPrompt = ref('');
        const currentCodeReviewPrompt = ref('');
        const defaultReviewPrompt = ref('');
        const defaultCodeReviewPrompt = ref('');
        const currentReviewPromptKbs = ref('');
        const currentCodeReviewPromptKbs = ref('');
        const defaultReviewPromptKbs = ref('');
        const defaultCodeReviewPromptKbs = ref('');
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
        const currentDocBlocksForHighlight = ref([]);
        const currentCodeBlocksForHighlight = ref([]);
        const alignmentPage = ref(1);
        const alignmentPageSize = ref(100); // 对齐视图分页的每页展示数量
        const alignmentTotal = ref(0);
        const docBlockPage = ref(1);
        const docBlockPageSize = ref(100);  // 以后端返回的分页大小为准
        const docBlockTotal = ref(0);
        const codeBlockPage = ref(1);
        const codeBlockPageSize = ref(100);
        const codeBlockTotal = ref(0);

        // 手动对齐弹窗：已有对齐关系选项卡
        const existingAlignTab = ref('req2code');
        const selectedExistingAlignmentId = ref('');
        const projectAlignmentPool = computed(() => {
            const flattened = Object.values(allAlignments.value || {}).flat();
            const uniqueAlignments = new Map();
            flattened.forEach(item => {
                if (item && item.id) {
                    uniqueAlignments.set(item.id, item);
                }
            });
            return Array.from(uniqueAlignments.values());
        });
        const existingAlignmentsReq2Code = computed(() => {
            return projectAlignmentPool.value.filter(item =>
                item.align_type === 'req2code' &&
                Number(item.isCodeReview || 0) !== 1
            );
        });
        const existingAlignmentsCode2Req = computed(() => {
            return projectAlignmentPool.value.filter(item =>
                item.align_type === 'code2req' &&
                Number(item.isCodeReview || 0) !== 1
            );
        });
        const currentExistingAlignments = computed(() => {
            return existingAlignTab.value === 'code2req'
                ? existingAlignmentsCode2Req.value
                : existingAlignmentsReq2Code.value;
        });
        watch(existingAlignTab, () => {
            selectedExistingAlignmentId.value = '';
        });
        const ensureProjectAlignmentsLoaded = async () => {
            if (projectAlignmentPool.value.length > 0) return;
            await fetchAllAlignments();
        };
        
        // KB Application State
        const showKbAppDialog = ref(false);
        const kbAppList = ref([]);
        const kbAppSearch = ref('');
        const kbAppFilterType = ref('all');
        const selectedKbAppItems = ref([]);
        const isSavingKbApp = ref(false);

        /***********************
         * 知识库应用逻辑
         ***********************/
        const openKbAppDialog = () => {
            showKbAppDialog.value = true;
        };

        const fetchKbAppData = async () => {
            try {
                // 1. 获取所有知识库
                const res = await axios.get('/api/list-kbs');
                if (res.data.status === 'success') {
                    kbAppList.value = res.data.kbs;
                }
                
                // 2. 获取当前项目元数据中的 selected_kbs
                const metaRes = await axios.get('/project/metadata', {
                    params: { path: projectPath.value }
                });
                if (metaRes.data.status === 'success') {
                    selectedKbAppItems.value = metaRes.data.metadata.selected_kbs || [];
                }
            } catch (e) {
                console.error("Fetch KB App Data Error:", e);
                ElMessage.error("获取知识库数据失败");
            }
        };
        
        const normalizeKbType = (type) => {
            const typeMap = {
                'rule': 'coding_rule',
                'issue': 'history_issue',
                'history_align': 'align',
                'case': 'typical_case',
            };
            return typeMap[type] || type || 'other';
        };

        const shouldRenderAlignmentAsAlignedBlock = (alignment) => {
            if (!alignment) return false;
            return Number(alignment.isCodeReview || 0) !== 1 || !!alignment.isReviewed;
        };

        const getKbSelectionKey = (kb) => {
            return `${normalizeKbType(kb?.type)}::${kb?.name || ''}`;
        };
        
        
        const filteredKbAppList = computed(() => {
            let list = kbAppList.value;
            
            // Search filter
            if (kbAppSearch.value) {
                const q = kbAppSearch.value.toLowerCase();
                list = list.filter(kb => kb.name.toLowerCase().includes(q));
            }
            
            // Type filter
            if (kbAppFilterType.value !== 'all') {
                list = list.filter(kb => normalizeKbType(kb.type) === kbAppFilterType.value);
            }
            
            return list;
        });

        const areAllFilteredKbAppsSelected = computed(() => {
            if (filteredKbAppList.value.length === 0) {
                return false;
            }

            return filteredKbAppList.value.every(kb => isKbSelected(kb));
        });

        const hasAnyFilteredKbAppsSelected = computed(() => {
            return filteredKbAppList.value.some(kb => isKbSelected(kb));
        });

        const isKbSelected = (kb) => {
            const currentType = normalizeKbType(kb.type);
            return selectedKbAppItems.value.some(item => item.name === kb.name && normalizeKbType(item.type) === currentType);
        };

        const toggleKbSelection = (kb) => {
            const currentType = normalizeKbType(kb.type);
            const index = selectedKbAppItems.value.findIndex(item => item.name === kb.name && normalizeKbType(item.type) === currentType);
            if (index > -1) {
                selectedKbAppItems.value.splice(index, 1);
            } else {
                selectedKbAppItems.value.push({ name: kb.name, type: kb.type });
            }
        };

        const selectAllFilteredKbApps = () => {
            if (filteredKbAppList.value.length === 0) {
                ElMessage.warning('当前没有可选择的知识库');
                return;
            }

            const selectedKeys = new Set(
                selectedKbAppItems.value.map(item => getKbSelectionKey(item))
            );

            let addedCount = 0;
            filteredKbAppList.value.forEach((kb) => {
                const key = getKbSelectionKey(kb);
                if (selectedKeys.has(key)) {
                    return;
                }
                selectedKbAppItems.value.push({ name: kb.name, type: kb.type });
                selectedKeys.add(key);
                addedCount += 1;
            });

            if (addedCount === 0) {
                ElMessage.info('当前搜索结果已全部选中');
                return;
            }

            ElMessage.success(`已选中当前结果中的 ${addedCount} 个知识库`);
        };

        const clearAllFilteredKbAppsSelection = () => {
            if (filteredKbAppList.value.length === 0) {
                ElMessage.warning('当前没有可取消的知识库');
                return;
            }

            const filteredKeys = new Set(
                filteredKbAppList.value.map(kb => getKbSelectionKey(kb))
            );
            const originalLength = selectedKbAppItems.value.length;

            selectedKbAppItems.value = selectedKbAppItems.value.filter(
                item => !filteredKeys.has(getKbSelectionKey(item))
            );

            const removedCount = originalLength - selectedKbAppItems.value.length;
            if (removedCount === 0) {
                ElMessage.info('当前结果中没有已选中的知识库');
                return;
            }

            ElMessage.success(`已取消当前结果中的 ${removedCount} 个知识库`);
        };

        const saveKbAppSelection = async () => {
            isSavingKbApp.value = true;
            try {
                const res = await axios.post('/project/save-kbs', {
                    projectPath: projectPath.value,
                    selectedKbs: selectedKbAppItems.value
                });
                
                if (res.data.status === 'success') {
                    ElMessage.success("知识库配置已保存");
                    showKbAppDialog.value = false;
                } else {
                    ElMessage.error(res.data.message);
                }
            } catch (e) {
                console.error(e);
                ElMessage.error("保存失败");
            } finally {
                isSavingKbApp.value = false;
            }
        };

        // Helper for UI
        const getKbColor = (type) => {
            const map = {
                'coding_rule': '#409EFF',
                'history_issue': '#E6A23C',
                'align': '#67C23A',
                'typical_case': '#9B59B6',
                'checklist': '#F39C12',
                'other': '#909399'
            };
            return map[normalizeKbType(type)] || '#909399';
        };
        
        const getKbTypeName = (type) => {
            const map = {
                'coding_rule': '编码规则',
                'history_issue': '历史问题',
                'align': '历史对齐',
                'typical_case': '典型案例',
                'checklist': '必查清单',
                'other': '其他'
            };
            const normalizedType = normalizeKbType(type);
            return map[normalizedType] || normalizedType || '未知';
        };

        const parseLocalDateTime = (value) => {
            if (!value) return null;
            if (value instanceof Date) {
                return Number.isNaN(value.getTime()) ? null : value;
            }

            const raw = String(value).trim();
            const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
            if (localMatch) {
                const [, year, month, day, hour, minute, second = '0'] = localMatch;
                return new Date(
                    Number(year),
                    Number(month) - 1,
                    Number(day),
                    Number(hour),
                    Number(minute),
                    Number(second)
                );
            }

            const parsed = new Date(raw);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        
        // Format time helper (duplicate from welcome.js but needed here)
        const formatRelativeTime = (isoString) => {
            if (!isoString) return '未知时间';
            const now = new Date();
            const past = parseLocalDateTime(isoString);
            if (!past) return '未知时间';
            const diffInSeconds = Math.floor((now - past) / 1000);
            if (diffInSeconds < 60) return '刚刚';
            const diffInMinutes = Math.floor(diffInSeconds / 60);
            if (diffInMinutes < 60) return `${diffInMinutes}分钟前`;
            const diffInHours = Math.floor(diffInMinutes / 60);
            if (diffInHours < 24) return `${diffInHours}小时前`;
            const diffInDays = Math.floor(diffInHours / 24);
            return `${diffInDays}天前`;
        };
        
        // 右侧侧边栏视图模式
        const rightSidebarMode = ref('alignment'); // 'alignment' | 'block'
        const blockType = ref('doc'); // 'doc' | 'code'

        // 计算属性：当前显示的块列表
        const displayedBlocks = computed(() => {
            return (blockType.value === 'doc' ? docBlocks.value : codeBlocks.value).filter(Boolean);
        });
        
        
        // 对左侧视图中，单个文件的删除
        const removeFile = async (path, fileName, fileType, nodeType = 'file') => {
            const isDirectory = nodeType === 'directory';
            try {
                await ElMessageBox.confirm(
                    isDirectory
                        ? `确定删除目录 "${fileName}" 吗？目录中的所有${fileType === 'doc' ? '需求文档' : '代码文件'}都会被递归删除。`
                        : `确定删除${fileType === 'doc' ? '需求文档' : '代码文件'} "${fileName}" 吗？`,
                    isDirectory ? '删除目录' : '删除文件',
                    {
                        confirmButtonText: '删除',
                        cancelButtonText: '取消',
                        type: 'warning',
                        confirmButtonClass: 'el-button--danger'
                    }
                );
            } catch (error) {
                if (error === 'cancel' || error === 'close') return;
                ElMessage.error("删除确认失败: " + error.message);
                return;
            }

            try {
                const response = await axios.get(`/project/file-remove?path=${encodeURIComponent(projectPath.value)}&filename=${encodeURIComponent(path)}&type=${fileType}&node_type=${nodeType}`);
                if (response.data.status !== 'success') {
                    ElMessage.warning(response.data.message);
                    return;
                }

                const isSelectedDocAffected = fileType === 'doc' && selectedDocFile.value &&
                    (selectedDocFile.value === path || selectedDocFile.value.startsWith(`${path}/`));
                const isSelectedCodeAffected = fileType === 'code' && selectedCodeFile.value &&
                    (selectedCodeFile.value === path || selectedCodeFile.value.startsWith(`${path}/`));

                if (isSelectedDocAffected) {
                    selectedDocFile.value = '';
                    selectedDocContent.value = '';
                    selectedDocRawContent.value = '';
                    docPageRanges.value = [];
                    currentDocPage.value = 1;
                }

                if (isSelectedCodeAffected) {
                    selectedCodeFile.value = '';
                    selectedCodeContent.value = '';
                    selectedCodeRawContent.value = '';
                    codePageRanges.value = [];
                    currentCodePage.value = 1;
                    codePageStartLine.value = 1;
                }

                await fetchProjectMetadata();
                if (fileType === 'doc') {
                    await loadAndRenderDocBlocks(true);
                } else {
                    await loadAndRenderCodeBlocks(true);
                }

                ElMessage.success(`${isDirectory ? '目录' : '文件'} "${fileName}" 删除成功`);
            } catch (error) {
                ElMessage.error("删除失败: " + error.message);
            }
        };
		
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
		let reverseRequestSeq = 0;

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
        watch(alignmentResults, async () => {
            if (selectedDocFile.value) {
                await loadAndRenderDocBlocks(false);
            }
            if (selectedCodeFile.value) {
                await loadAndRenderCodeBlocks(false);
            }
        }, { deep: true });

        const fetchAlignmentSidebarPage = async (resetPage = false, alignType = null) => {
            if (!projectPath.value) return;
            if (resetPage) alignmentPage.value = 1;

            if (statusFilters.value.length === 0) {
                sidebarAlignmentItems.value = [];
                alignmentTotal.value = 0;
                return;
            }

            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.get('/project/alignments', {
                    params: {
                        path: projectPath.value,
                        project_id: projectId,
                        page: alignmentPage.value,
                        view_mode: viewMode.value,
                        selected_doc_file: selectedDocFile.value || '',
                        selected_code_file: selectedCodeFile.value || '',
                        status_filters: statusFilters.value.join(','),
                        include_code_review: alignType === 'code2req' ? 'reviewed_only' : 0,
                        align_type: alignType
                    }
                });

                if (response.data.status === 'success') {
                    const pagination = response.data.pagination || {};
                    const serverPageSize = Number(pagination.page_size) || alignmentPageSize.value;
                    const serverTotal = Number(pagination.total) || 0;
                    const serverTotalPages = Math.max(0, Number(pagination.pages) || Number(pagination.total_pages) || 0);

                    alignmentPageSize.value = serverPageSize;
                    sidebarAlignmentItems.value = response.data.data || [];
                    alignmentTotal.value = serverTotal;

                    if (serverTotalPages > 0 && alignmentPage.value > serverTotalPages) {
                        alignmentPage.value = serverTotalPages;
                        await fetchAlignmentSidebarPage(false, alignType);
                        return;
                    }

                    if (serverTotal === 0) {
                        alignmentPage.value = 1;
                    }
                } else {
                    sidebarAlignmentItems.value = [];
                    alignmentTotal.value = 0;
                }
            } catch (error) {
                console.error('获取对齐分页数据出错:', error);
                sidebarAlignmentItems.value = [];
                alignmentTotal.value = 0;
            }
        };

        const fetchSidebarBlocksPage = async (resetPage = false) => {
            if (!projectPath.value) return;
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project_id');
            const isDoc = blockType.value === 'doc';
            const pageRef = isDoc ? docBlockPage : codeBlockPage;
            const pageSizeRef = isDoc ? docBlockPageSize : codeBlockPageSize;
            const totalRef = isDoc ? docBlockTotal : codeBlockTotal;
            const targetRef = isDoc ? docBlocks : codeBlocks;
            const currentFile = isDoc ? selectedDocFile.value : selectedCodeFile.value;

            if (resetPage) pageRef.value = 1;
            if (viewMode.value === 'current' && !currentFile) {
                targetRef.value = [];
                totalRef.value = 0;
                return;
            }

            try {
                const endpoint = isDoc ? '/api/get-doc-blocks' : '/api/get-code-blocks';
                const response = await axios.get(endpoint, {
                    params: {
                        projectPath: projectPath.value,
                        project_id: projectId,
                        page: pageRef.value,
                        filename: viewMode.value === 'current' ? currentFile : ''
                    }
                });

                if (response.data.status === 'success') {
                    const pagination = response.data.pagination || {};
                    const serverPageSize = Number(pagination.page_size) || pageSizeRef.value;
                    const serverTotal = Number(pagination.total) || 0;
                    const serverTotalPages = Math.max(0, Number(pagination.pages) || 0);

                    pageSizeRef.value = serverPageSize;
                    targetRef.value = response.data.data || [];
                    totalRef.value = serverTotal;

                    if (serverTotalPages > 0 && pageRef.value > serverTotalPages) {
                        pageRef.value = serverTotalPages;
                        await fetchSidebarBlocksPage(false);
                        return;
                    }

                    if (serverTotal === 0) {
                        pageRef.value = 1;
                    }
                } else {
                    targetRef.value = [];
                    totalRef.value = 0;
                }
            } catch (error) {
                console.error('获取块分页数据失败:', error);
                targetRef.value = [];
                totalRef.value = 0;
            }
        };
         
        // 加载并渲染需求分解块
        const loadAndRenderDocBlocks = async (reload = true) => {
            if (!projectPath.value) return;
            try {
                let blocks = currentDocBlocksForHighlight.value;
                if (reload || !blocks || blocks.length === 0) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    const response = await axios.get('/api/get-doc-blocks', {
                        params: {
                            projectPath: projectPath.value,
                            project_id: projectId,
                            filename: selectedDocFile.value || ''
                        }
                    });
                    if (response.data.status === 'success') {
                        blocks = response.data.data;
                        currentDocBlocksForHighlight.value = blocks;
                    }
                }
                
                if (blocks) {
                    // Clear existing highlights
                    clearDecompositionHighlights('doc');
                    
                    // Render highlights for current file
                    if (selectedDocFile.value) {
                        const currentFileBlocks = blocks.filter(b => b.filename === selectedDocFile.value);
                        
                        const alignedRanges = new Set();
                        if (alignmentResults.value) {
                            alignmentResults.value.forEach(alignment => {
                                if (!shouldRenderAlignmentAsAlignedBlock(alignment)) {
                                    return;
                                }
                                if (alignment.docRanges) {
                                    alignment.docRanges.forEach(range => {
                                        if (range.documentId === selectedDocFile.value) {
                                            alignedRanges.add(`${range.start}-${range.end}`);
                                        }
                                    });
                                }
                            });
                        }

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
                let blocks = currentCodeBlocksForHighlight.value;
                if (reload || !blocks || blocks.length === 0) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    const response = await axios.get('/api/get-code-blocks', {
                        params: {
                            projectPath: projectPath.value,
                            project_id: projectId,
                            filename: selectedCodeFile.value || ''
                        }
                    });
                    if (response.data.status === 'success') {
                        blocks = response.data.data;
                        currentCodeBlocksForHighlight.value = blocks;
                    }
                }
                
                if (blocks) {
                    // Clear existing highlights
                    clearDecompositionHighlights('code');
                    
                    // Render highlights for current file
                    if (selectedCodeFile.value) {
                        const currentFileBlocks = blocks.filter(b => b.file === selectedCodeFile.value);
                        
                        const alignedCodeRanges = [];
                        if (alignmentResults.value) {
                            alignmentResults.value.forEach(alignment => {
                                if (!shouldRenderAlignmentAsAlignedBlock(alignment)) {
                                    return;
                                }
                                if (alignment.codeRanges) {
                                    alignment.codeRanges.forEach(range => {
                                        if (range.documentId === selectedCodeFile.value || range.filename === selectedCodeFile.value) {
                                            alignedCodeRanges.push(range);
                                        }
                                    });
                                }
                            });
                        }

                        const codeFileContent = await ensureCurrentRawFileContent('code');
                        await nextTick(() => {
                            currentFileBlocks.forEach(block => {
                                let start, end;
                                let isAligned = false;

                                if (block.range && Array.isArray(block.range) && block.range.length === 2) {
                                    const [startLine, endLine] = block.range;
                                    const offsets = getOffsetsFromLineRange(codeFileContent, startLine, endLine);
                                    start = offsets.start;
                                    end = offsets.end;
                                    
                                    // Check alignment using line intersection
                                    isAligned = alignedCodeRanges.some(r => {
                                        if (r.startLine !== undefined && r.endLine !== undefined) {
                                            return Math.max(r.startLine, startLine) <= Math.min(r.endLine, endLine);
                                        }
                                        return false;
                                    });
                                    
                                    // Fallback to offset check if line check didn't pass (e.g. missing line info)
                                    if (!isAligned && start !== undefined && end !== undefined) {
                                         isAligned = alignedCodeRanges.some(r => {
                                            if (r.start !== undefined && r.end !== undefined) {
                                                return Math.max(r.start, start) < Math.min(r.end, end);
                                            }
                                            return false;
                                        });
                                    }

                                } else if (block.start !== undefined && block.end !== undefined) {
                                    start = block.start;
                                    end = block.end;
                                    
                                    // Offset based check
                                    isAligned = alignedCodeRanges.some(r => {
                                        if (r.start !== undefined && r.end !== undefined) {
                                             return Math.max(r.start, start) < Math.min(r.end, end);
                                        }
                                        return false;
                                    });
                                }
                                
                                if (start !== undefined && end !== undefined) {
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

        const refreshBlocks = async () => {
             await fetchSidebarBlocksPage(true);
             if (selectedDocFile.value) await loadAndRenderDocBlocks(true);
             if (selectedCodeFile.value) await loadAndRenderCodeBlocks(true);
             ElMessage.success('块列表已刷新');
        };

        const handleDeleteBlock = async (block) => {
            if (!projectPath.value) return;
            
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.post('/api/delete-block', {
                    projectPath: projectPath.value,
                    blockType: blockType.value,
                    blockData: block,
                    project_id: projectId
                });
                
                if (response.data.status === 'success') {
                    ElMessage.success(response.data.message);
                    // Refresh blocks
                    if (blockType.value === 'doc') {
                        await loadAndRenderDocBlocks(true);
                    } else {
                        await loadAndRenderCodeBlocks(true);
                    }
                    await fetchSidebarBlocksPage(false);
                    await fetchAlignments();
                    await fetchAlignmentSidebarPage(false, alignType.value);
                } else {
                    ElMessage.warning(response.data.message);
                }
            } catch (error) {
                console.error("删除块失败:", error);
                ElMessage.error("删除失败: " + error.message);
            }
        };

        const fetchAlignments = async () => {
            if (!projectPath.value) return;

            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.get('/project/alignments', {
                    params: {
                        path: projectPath.value,
                        project_id: projectId,
                        view_mode: 'current',
                        selected_doc_file: selectedDocFile.value || '',
                        selected_code_file: selectedCodeFile.value || ''
                    }
                });
                if (response.data.status === 'success' && response.data.data) {
                    alignmentResults.value = Object.values(response.data.data || {});
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

        const fetchAlignmentById = async (alignmentId) => {
            if (!alignmentId || !projectPath.value) return null;
            const existing = (alignmentResults.value || []).find(item => item.id === alignmentId) ||
                (sidebarAlignmentItems.value || []).find(item => item.id === alignmentId) ||
                (filteredAlignments.value || []).find(item => item.id === alignmentId);
            //console.log(existing)
            //if (existing) return existing;

            try {
                const response = await axios.get('/project/alignment-by-id', {
                    params: {
                        path: projectPath.value,
                        id: alignmentId
                    }
                });

                if (response.data.status === 'success') {
                    return response.data.data || null;
                }
            } catch (error) {
                console.error('按 ID 获取对齐关系失败:', error);
            }
            return null;
        };
        
        
        // 导出结果功能
		// 接口已改为从SQLite读取数据
		const exportResults = async () => {
		  try {
			// 1. 弹出确认框（参考 confirmExport 的确认逻辑）
			await ElMessageBox.confirm(
			  '确定要导出结果吗？',
			  '导出确认',
			  {
				confirmButtonText: '确定',
				cancelButtonText: '取消',
				type: 'info'
			  }
			);

			// 2. 调用核心导出函数（参考 exportConfirmedIssues 逻辑）
			const exportfilename = await exportConfirmedAlignments();
            //console.log(exportfilename)
            
            //删除临时文件
            const res = await axios.post('/project/delete-export-files', {
               filename: exportfilename
            });
            
            
		  } catch (error) {
			if (error !== 'cancel') {
			  ElMessage.error('导出取消或失败：' + error.message);
			} else {
			  ElMessage.info('已取消导出');
			}
		  }
		};
		

		const exportConfirmedAlignments = async () => {
		  if (!projectPath.value) {
			ElMessage.warning('请先选择项目路径！');
			return;
		  }

		  try {
		    const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project_id');
			// 步骤1：调用后端获取文件流
			const response = await axios({
			  method: 'GET',
			  url: `/project/export?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`,
			  responseType: 'blob',
			  timeout: 30000
			});
            
            
            // 获取 Content-Disposition 头
            const contentDisposition = response.headers['content-disposition'];

            // 从 content-disposition 中提取文件名
            let filename = 'download.docx'; // 默认名
            if (contentDisposition) {
              const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
              if (filenameMatch) {
                filename = filenameMatch[1];
              } else {
                const filenameMatch2 = contentDisposition.match(/filename\*?=(?:UTF-8''|'')(.+)/);
                if (filenameMatch2) {
                  filename = decodeURIComponent(filenameMatch2[1]);
                }
              }
            }
            //console.log(filename)
            
			// ========== 核心：仅保留Electron原生文件夹选择窗口（无上传、无输入） ==========
			let selectedFolder = '';
			// 仅在Electron环境下弹出原生文件夹选择窗口（可视化选文件夹）
			if (window.require) {
			  try {
				// 引入Electron对话框模块（核心：弹出系统原生文件夹选择窗口）
				const electron = window.require('electron');
				const dialog = electron.remote?.dialog || electron.dialog;
				
				// 弹出「选择文件夹」窗口（系统原生，可视化选择）
				const dialogResult = await dialog.showOpenDialog({
				  title: '选择Excel导出文件夹', // 窗口标题
				  properties: ['openDirectory', 'createDirectory'], // 仅选文件夹 + 允许新建文件夹
				  defaultPath: process.cwd() // 默认打开当前目录（可选）
				});

				// 处理取消选择
				if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
				  ElMessage.info('已取消选择导出文件夹');
				  return filename;
				}

				// 获取选中的文件夹路径（可视化选择的结果）
				selectedFolder = dialogResult.filePaths[0];
			  } catch (err) {
				ElMessage.error('打开文件夹选择窗口失败：' + err.message);
				return;
			  }
			} else { // 我们的平台走这个流程
			  // 非Electron环境提示（无原生窗口，仅告知）
			  //ElMessage.warning('当前环境不支持文件夹选择窗口，将自动下载文件');

			  const link = document.createElement('a');
			  link.href = URL.createObjectURL(response.data);
			  link.download = `结果_${new Date().getTime()}.docx`;
			  link.click();
			  URL.revokeObjectURL(link.href);
			  return filename;
			}

			// 步骤2：将文件写入选中的文件夹（无上传，纯保存）
			const fs = window.require('fs');
			const path = window.require('path');
			// 拼接完整保存路径：选中的文件夹 + 自定义文件名
			const excelSavePath = path.join(selectedFolder, `导出结果_${new Date().getTime()}.docx`);
			
			// 把后端返回的文件流写入选中的文件夹
			const buffer = Buffer.from(await response.data.arrayBuffer());

			fs.writeFile(excelSavePath, buffer, (writeErr) => {

			  if (writeErr) {
				ElMessage.error(`结果保存失败：${writeErr.message}`);
			  } else {
				ElMessage.success(`结果已成功导出至：${excelSavePath}`);
			  }
			});

            return filename;
            

		  } catch (error) {
			console.error('导出流程失败：', error);
			ElMessage.error(`导出失败：${error.response?.data?.message || error.message}`);
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

        const totalDocPages = computed(() => docPageRanges.value.length || 1);
        const totalCodePages = computed(() => codePageRanges.value.length || 1);
        const alignmentTotalPages = computed(() => Math.max(1, Math.ceil(alignmentTotal.value / alignmentPageSize.value)));
        const docBlockTotalPages = computed(() => Math.max(1, Math.ceil(docBlockTotal.value / docBlockPageSize.value)));
        const codeBlockTotalPages = computed(() => Math.max(1, Math.ceil(codeBlockTotal.value / codeBlockPageSize.value)));

        const shiftMarkdownParseOffsets = (html, offsetBase) => {
            if (!html || !offsetBase) return html;
            return html.replace(/(parse-(?:start|end)=")(\d+)(")/g, (_, prefix, value, suffix) => {
                return `${prefix}${Number(value) + offsetBase}${suffix}`;
            });
        };

        const fetchFilePage = async (fileName, fileType, pageNumber = 1) => {
            const response = await axios.get('/project/file-content', {
                params: {
                    path: projectPath.value,
                    filename: fileName,
                    type: fileType,
                    page: pageNumber
                }
            });
            if (response.data.status !== 'success') {
                throw new Error(response.data.message || '加载分页内容失败');
            }
            return response.data;
        };

        const ensureCurrentRawFileContent = async (fileType) => {
            if (fileType === 'doc') {
                if (!selectedDocFile.value) return '';
                if (!selectedDocRawContent.value) {
                    selectedDocRawContent.value = await fetchRawFileContentOnly(selectedDocFile.value, 'doc');
                }
                return selectedDocRawContent.value;
            }
            if (!selectedCodeFile.value) return '';
            if (!selectedCodeRawContent.value) {
                selectedCodeRawContent.value = await fetchRawFileContentOnly(selectedCodeFile.value, 'code');
            }
            return selectedCodeRawContent.value;
        };

        const renderDocPage = async (pageNumber = 1, targetFile = null) => {
            const fileName = targetFile || selectedDocFile.value;
            if (!fileName) {
                currentDocPage.value = 1;
                selectedDocContent.value = '';
                return;
            }
            const pageResponse = await fetchFilePage(fileName, 'doc', pageNumber);
            const renderedHtml = await renderMarkdown(pageResponse.content || '');
            docPageRanges.value = pageResponse.pagination?.page_ranges || [];
            currentDocPage.value = pageResponse.pagination?.page || 1;
            selectedDocContent.value = shiftMarkdownParseOffsets(renderedHtml, pageResponse.page_start || 0);

            await nextTick();
            await loadAndRenderDocBlocks(false);
        };

        const renderCodePage = async (pageNumber = 1, targetFile = null) => {
            const fileName = targetFile || selectedCodeFile.value;
            if (!fileName) {
                currentCodePage.value = 1;
                codePageStartLine.value = 1;
                selectedCodeContent.value = '';
                return;
            }
            const pageResponse = await fetchFilePage(fileName, 'code', pageNumber);
            const renderedHtml = formatCodeWithLineNumbers(pageResponse.content || '');
            codePageRanges.value = pageResponse.pagination?.page_ranges || [];
            currentCodePage.value = pageResponse.pagination?.page || 1;
            codePageStartLine.value = pageResponse.start_line || 1;
            selectedCodeContent.value = shiftMarkdownParseOffsets(renderedHtml, pageResponse.page_start || 0);

            await nextTick();
            await loadAndRenderCodeBlocks(false);
        };

        const goToDocFirstPage = async () => {
            if (currentDocPage.value === 1) return;
            await renderDocPage(1);
        };

        const goToDocPrevPage = async () => {
            if (currentDocPage.value <= 1) return;
            await renderDocPage(currentDocPage.value - 1);
        };

        const goToDocNextPage = async () => {
            if (currentDocPage.value >= totalDocPages.value) return;
            await renderDocPage(currentDocPage.value + 1);
        };

        const goToDocLastPage = async () => {
            if (currentDocPage.value === totalDocPages.value) return;
            await renderDocPage(totalDocPages.value);
        };

        const goToCodeFirstPage = async () => {
            if (currentCodePage.value === 1) return;
            await renderCodePage(1);
        };

        const goToCodePrevPage = async () => {
            if (currentCodePage.value <= 1) return;
            await renderCodePage(currentCodePage.value - 1);
        };

        const goToCodeNextPage = async () => {
            if (currentCodePage.value >= totalCodePages.value) return;
            await renderCodePage(currentCodePage.value + 1);
        };

        const goToCodeLastPage = async () => {
            if (currentCodePage.value === totalCodePages.value) return;
            await renderCodePage(totalCodePages.value);
        };

        const getDocRangeFile = (docRange) => {
            return docRange?.documentId || docRange?.filename || '';
        };

        const getCodeRangeFile = (codeRange) => {
            return codeRange?.documentId || codeRange?.filename || '';
        };

        const getDocPageIndicesForRange = (start, end) => {
            const pages = docPageRanges.value || [];
            if (!pages.length) return [0];

            const rangeStart = Number(start);
            const rangeEnd = Number(end);
            const effectiveStart = Number.isFinite(rangeStart) ? rangeStart : 0;
            const effectiveEnd = Number.isFinite(rangeEnd) && rangeEnd > effectiveStart ? rangeEnd : effectiveStart + 1;

            const matches = [];
            pages.forEach((page, index) => {
                if (effectiveStart < page.end && effectiveEnd > page.start) {
                    matches.push(index);
                }
            });

            if (matches.length > 0) return matches;

            const containingIndex = pages.findIndex(page => effectiveStart >= page.start && effectiveStart < page.end);
            if (containingIndex !== -1) return [containingIndex];

            if (effectiveStart <= pages[0].start) return [0];
            return [pages.length - 1];
        };

        const getDocElementsInCurrentPageForRange = (docRange) => {
            if (!docRange) return [];
            const start = Number(docRange.start);
            const end = Number(docRange.end);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

            const docPanel = document.querySelector('.content-text-doc');
            const blockElements = docPanel
                ? Array.from(docPanel.querySelectorAll('.highlight-block[data-type="doc"]'))
                    .filter(el => parseInt(el.getAttribute('data-range-start')) <= end && parseInt(el.getAttribute('data-range-end')) >= start)
                : [];
            const highlightElements = findIntersectingHighlightElements(start, end);
            const parseElements = findIntersectingParseElements(start, end);
            return [...new Set([...blockElements, ...highlightElements, ...parseElements])];
        };

        const ensureDocFileAndPageForRange = async (docRange) => {
            const fileName = getDocRangeFile(docRange);
            if (!fileName) return [];

            if (selectedDocFile.value !== fileName) {
                await fetchFileContent(fileName, 'doc');
            }

            const candidatePages = getDocPageIndicesForRange(docRange.start, docRange.end);
            const currentIndex = currentDocPage.value - 1;
            const orderedPages = candidatePages.includes(currentIndex)
                ? [currentIndex, ...candidatePages.filter(index => index !== currentIndex)]
                : candidatePages;

            for (const pageIndex of orderedPages) {
                if (currentDocPage.value !== pageIndex + 1) {
                    await renderDocPage(pageIndex + 1);
                } else {
                    await nextTick();
                }

                const elements = getDocElementsInCurrentPageForRange(docRange);
                if (elements.length > 0) {
                    return elements;
                }
            }

            await nextTick();
            return getDocElementsInCurrentPageForRange(docRange);
        };

        const getCodeElementsInCurrentFileForRange = (codeRange) => {
            if (!codeRange) return [];
            const start = Number(codeRange.start);
            const end = Number(codeRange.end);
            if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
            const codePanel = document.querySelector('.content-text-code');
            const blockElements = codePanel
                ? Array.from(codePanel.querySelectorAll('.highlight-block[data-type="code"]'))
                    .filter(el => parseInt(el.getAttribute('data-range-start')) <= end && parseInt(el.getAttribute('data-range-end')) >= start)
                : [];
            const highlightElements = findIntersectingCodeHighlightElements(start, end);
            return [...new Set([...blockElements, ...highlightElements])];
        };

        const getCodePageIndicesForRange = (start, end) => {
            const pages = codePageRanges.value || [];
            if (!pages.length) return [0];

            const effectiveStart = Number.isFinite(Number(start)) ? Number(start) : 0;
            const effectiveEnd = Number.isFinite(Number(end)) ? Number(end) : effectiveStart;
            const indices = [];

            pages.forEach((page, index) => {
                if (effectiveStart < page.end && effectiveEnd > page.start) {
                    indices.push(index);
                }
            });

            if (indices.length) return indices;

            const containingIndex = pages.findIndex(page => effectiveStart >= page.start && effectiveStart < page.end);
            if (containingIndex !== -1) return [containingIndex];
            if (effectiveStart <= pages[0].start) return [0];
            return [pages.length - 1];
        };

        const ensureCodeFileForRange = async (codeRange) => {
            const fileName = getCodeRangeFile(codeRange);
            if (!fileName) return [];
            if (selectedCodeFile.value !== fileName) {
                await fetchFileContent(fileName, 'code');
            }

            const candidatePages = getCodePageIndicesForRange(codeRange.start, codeRange.end);
            const currentIndex = currentCodePage.value - 1;
            const orderedPages = candidatePages.includes(currentIndex)
                ? [currentIndex, ...candidatePages.filter(index => index !== currentIndex)]
                : candidatePages;

            for (const pageIndex of orderedPages) {
                if (currentCodePage.value !== pageIndex + 1) {
                    await renderCodePage(pageIndex + 1);
                } else {
                    await nextTick();
                }

                const elements = getCodeElementsInCurrentFileForRange(codeRange);
                if (elements.length > 0) {
                    return elements;
                }
            }

            await nextTick();
            return getCodeElementsInCurrentFileForRange(codeRange);
        };

        // 进度管理辅助函数
        const startProgress = (title, total, current) => {
            showProgress.value = true;
            progressTitle.value = title;
            progressCurrent.value = current || 0;
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


        /** 审查的恢复状态
         * 把当前任务状态持久化到 localStorage
         * 在【启动、切换任务、每次进度更新】时调用
         */
        const saveReviewTaskState = () => {
            const state = {
                projectId: getProjectId(),
                taskId: ReviewTaskId.value,
                nextTaskId: nextTaskId.value,
                currentTotal: ReviewCurrentTotal.value,
                nextTaskTotal: nextTaskTotal.value,
                title: progressTitle.value,
                current: progressCurrent.value,
                isRunning: isAutoReviewing.value,
                timestamp: Date.now()
            }
            localStorage.setItem(STORAGE_REVIEW_KEY(), JSON.stringify(state))
        }

        /**
         * 清理 localStorage (任务完成/失败/过期时调用)
         *
         */
        const clearReviewTaskState = () => {
            localStorage.removeItem(STORAGE_REVIEW_KEY())
        }

        const forceResetReviewState = () => {
            if (pollingTimerReview.value) {
                clearInterval(pollingTimerReview.value)
                pollingTimerReview.value = null
            }
            ReviewTaskId.value = ''
            nextTaskId.value = null
            nextTaskTotal.value = 0
            ReviewCurrentTotal.value = 0
            isAutoReviewing.value = false
            stopProgress()
        }

        /**
         * 页面刷新后恢复任务状态
         * 先读 localStorage, 在调后端 //get-progress/<task_id> 确认Celery任务还活着
         */
        const restoreReviewTaskState = async () => {
            const currentProjectId = getProjectId()
            const raw = localStorage.getItem(STORAGE_REVIEW_KEY())
            if (!raw) return

            let state
            try {
                state = JSON.parse(raw)
            } catch {
                clearReviewTaskState()
                return
            }

            if (state.projectId !== currentProjectId) {
                // clearTaskState()
                return
            }

            // 超过 1 小时的旧状态直接丢弃，防止死任务残留
            if (Date.now() - (state.timestamp || 0) > 3600000) {
                clearReviewTaskState()
                return
            }

            // 恢复变量
            ReviewTaskId.value = state.taskId ?? ''
            nextTaskId.value = state.nextTaskId ?? null
            ReviewCurrentTotal.value = state.currentTotal ?? 0
            nextTaskTotal.value = state.nextTaskTotal ?? 0

            if (!ReviewTaskId.value) {
                clearReviewTaskState()
                return
            }

            try {
                // 1. 先查当前任务在 Celery 里的真实状态
                const resp = await axios.get(`/get-progress/${ReviewTaskId.value}`);
                const current = resp.data.meta?.current;
                const name = resp.data.meta?.name;
                const celeryState = resp.data.state ?? 'PENDING';

                // 2. 根据状态决定怎么恢复
                if (celeryState === 'PENDING' || celeryState === 'PROGRESS') {
                    // 任务还在跑，直接恢复进度条 + 轮询
                    startProgress(state.title || '任务处理中', ReviewCurrentTotal.value)
                    updateProgress(current ?? 0, name ?? '')
                    reviewProgress.value.current = current ?? 0
                    reviewProgress.value.total = ReviewCurrentTotal.value
                    isAutoReviewing.value = true

                    saveReviewTaskState() // 重新存一下(刷新时间戳)
                    if (!pollingTimerReview.value) {
                        pollingTimerReview.value = setInterval(getReviewProgress, 2000)
                    }
                    return
                }

                if (celeryState === 'SUCCESS') {
                    // 当前任务已完成，看看有没有下一个
                    if (nextTaskId.value) {
                        // 查一下 task2 的状态
                        const resp2 = await axios.get(`/get-progress/${nextTaskId.value}`);
                        const d2Current = resp2.data.meta?.current;
                        const d2Name = resp2.data.meta?.name;
                        const s2 = resp2.data.state ?? 'PENDING';

                        if (s2 === 'PENDING' || s2 === 'PROGRESS') {
                            // task2 还在跑，切换到 task2 恢复
                            ReviewTaskId.value = nextTaskId.value
                            nextTaskId.value = null
                            ReviewCurrentTotal.value = nextTaskTotal.value > 0
                                ? nextTaskTotal.value
                                : (state.nextTaskTotal ?? state.currentTotal)

                            startProgress('对齐处理', nextTaskTotal.value)
                            updateProgress(d2Current, d2Name)
                            reviewProgress.value.current = d2Current ?? 0
                            reviewProgress.value.total = ReviewCurrentTotal.value
                            isAutoReviewing.value = true

                            saveReviewTaskState()
                            if (!pollingTimerReview.value) {
                                pollingTimerReview.value = setInterval(getReviewProgress, 2000)
                            }
                            return
                        }

                        // task2 也结束了 (SUCCESS / FAILURE / REVOKED)
                        clearReviewTaskState()
                        if (s2 === 'SUCCESS') {
                            ElMessageBox.alert('对齐完成!', '提示', {
                            confirmButtonText: '知道了',
                            type: 'success'
                            });
                        } else {
                            ElMessageBox.alert('查询进度失败!', '提示', {
                            confirmButtonText: '知道了',
                            type: 'error'
                            });
                        }
                        return
                    }
                    // 没有下一个，全部完成
                    clearReviewTaskState()
                    return
                }

                // FAILURE / REVOKED / 未知状态
                clearReviewTaskState()
                ElMessageBox.alert('上次任务以失败或取消!', '提示', {
                confirmButtonText: '知道了',
                type: 'error'
                });
            } catch (err) {
                // 后端报错了 (可能是 task_id 已被 Celery 清理)
                clearReviewTaskState()
            }
        }


        // 查询进度
        const getReviewProgress = async () => {
            if (!ReviewTaskId.value) {
                clearInterval(pollingTimerReview.value)
                pollingTimerReview.value = null
                isAutoReviewing.value = false;
                reviewProgress.value = { current: 0, total: 0 };
                stopProgress();
                clearReviewTaskState()
                return
            }

            pollCountReview.value++
            if (pollCountReview.value >= MAX_POLL_COUNT) {
                ElMessage.info('轮询次数已达上限，已停止轮询');
                clearInterval(pollingTimerReview.value)
                pollingTimerReview.value = null
                isAutoReviewing.value = false;
                reviewProgress.value = { current: 0, total: 0 };
                stopProgress();
                clearReviewTaskState()
                return
            }
            try {
                const response = await axios.get(`/get-progress/${ReviewTaskId.value}`);

//                if (response.data.meta?.current === 1) {
//                    startProgress('自动审查', response.data.meta?.total);
//                }

                if (response.data.code === 0) {
                    const current = response.data.meta?.current || 0
                    updateProgress(current, response.data.meta?.name || 'Unknown');

                    saveReviewTaskState()

                    reviewProgress.value.current = current

                    if (response.data.state === 'SUCCESS'){
                        clearInterval(pollingTimerReview.value)
                        pollingTimerReview.value = null
                        await fetchAllAlignments();
                        isAutoReviewing.value = false;
                        reviewProgress.value = { current: 0, total: 0 };
                        stopProgress();
                        clearReviewTaskState()
                        ElMessageBox.alert('审查完成!', '提示', {
                        confirmButtonText: '知道了',
                        type: 'success'
                        });
                    }

                    if (response.data.state === 'FAILURE'){
                        clearInterval(pollingTimerReview.value)
                        pollingTimerReview.value = null
                        await fetchAllAlignments();
                        isAutoReviewing.value = false;
                        reviewProgress.value = { current: 0, total: 0 };
                        stopProgress();
                        clearReviewTaskState()
                        ElMessageBox.alert('审查失败!', '提示', {
                        confirmButtonText: '知道了',
                        type: 'error'
                        });
                    }
                }
            } catch (error) {
                if (errorCount.value >= errorMax) {
                    clearInterval(pollingTimerReview.value)
                    pollingTimerReview.value = null
                    isAutoReviewing.value = false;
                    reviewProgress.value = { current: 0, total: 0 };
                    stopProgress();
                    clearReviewTaskState()
                    ElMessage.warning(`查询进度失败: ${error.message}`);
                }
//                console.log(errorCount.value)
//                console.log(errorMax)
                errorCount.value++
            } finally {
//                pollCountReview.value++
            }
        }

        const startAutoReview = async (reviewType) => {
            if (isAutoReviewing.value) {
                ElMessage.warning('自动审查正在进行中，请稍候...');
                return;
            }

            isAutoReviewing.value = true;
            reviewProgress.value = { current: 0, total: 0 };
            ElMessage.info('开始自动审查，正在分析对齐关系...');

            try {
                let groupedByDoc = {}
                let total = 0
                let promptType = ''
                let unreviewed = [];
                let totalReviewCount = 0; // 纯代码审查或文实一致性审查的所有对齐数量
                let reviewedCount = 0; // 纯代码审查或文实一致性审查的以审查数量

                await fetchAllAlignments();

                if (reviewType === 'reviewCode'){
                    promptType = reviewType

                    // 收集所有已对齐但未审查的需求点 纯代码审查
                    Object.keys(allAlignments.value).forEach(docFile => {
                        const alignments = allAlignments.value[docFile] || [];
                        alignments.forEach(alignment => {

                            // 新增统计逻辑
                            if (alignment.codeRanges && alignment.codeRanges.length > 0 && alignment.isCodeReview === 1) {
                                totalReviewCount++;
                                if (alignment.isReviewed) {
                                    reviewedCount++
                                }
                            }

                            if (alignment.codeRanges && alignment.codeRanges.length > 0 && !alignment.isReviewed &&
                                alignment.isCodeReview === 1) {
                                unreviewed.push({ docFile, alignment });
                            }
                        });
                    });
                } else {
                    // 收集所有已对齐但未审查的需求点 文实一致性审查
                    Object.keys(allAlignments.value).forEach(docFile => {
                        const alignments = allAlignments.value[docFile] || [];
                        alignments.forEach(alignment => {

                            // 新增统计逻辑
//                            if (alignment.codeRanges && alignment.codeRanges.length > 0 && alignment.isCodeReview === 0) {
//                                totalReviewCount++;
//                                if (alignment.isReviewed) {
//                                    reviewedCount++
//                                }
//                            }
//
//                            if (alignment.codeRanges && alignment.codeRanges.length > 0 && !alignment.isReviewed &&
//                                alignment.isCodeReview === 0) {
//                                unreviewed.push({ docFile, alignment });
//                            }
                            if (alignment.isCodeReview === 0 && alignment.is_alignment === 1) {
                                totalReviewCount++;
                                if (alignment.isReviewed) {
                                    reviewedCount++
                                }
                            }

                            if (alignment.isCodeReview === 0 && alignment.is_alignment === 1 && !alignment.isReviewed) {
                                unreviewed.push({ docFile, alignment });
                            }
                        });
                    });
                }


                total = unreviewed.length;
                if (unreviewed.length === 0)
                {
                    ElMessage.success(`所有块均已审查完成！`);
                    isAutoReviewing.value = false;
                    return;
                }

                // 按文档分组处理
                unreviewed.forEach(({ docFile, alignment }) => {
                    if (!groupedByDoc[docFile]) {
                        groupedByDoc[docFile] = [];
                    }
                    groupedByDoc[docFile].push(alignment);
                });


                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                // 调用后端进行审查
                const reviewResponse = await axios.post('/api/review-alignment', {
                    projectPath: projectPath.value,
                    project_id: projectId,
                    requirement_files: groupedByDoc,
                    promptType: promptType,
                    reviewedCount: reviewedCount || 0
                });

                if (reviewResponse.data.status === 'success'){
                ReviewTaskId.value = reviewResponse.data.task_id;
                ReviewCurrentTotal.value = totalReviewCount
                startProgress('自动审查', totalReviewCount, reviewedCount);
                reviewProgress.value.total = totalReviewCount;
                reviewProgress.value.current = reviewedCount;

                saveReviewTaskState()
                // 开始轮询进度
                pollingTimerReview.value = setInterval(getReviewProgress, 2000);
                } else {
                ElMessage.warning('任务启动失败')
                }

                // 重新加载所有对齐数据和问题单
                await fetchAllAlignments();
                await fetchAlignments(); // 确保右侧面板显示最新状态
                await fetchIssues();

//                ElMessage.success(`自动审查完成！`);
            } catch (error) {
                console.error('自动审查过程中出现错误:', error);
                ElMessage.error(`自动审查失败: ${error.message}`);
            } finally {
//                isAutoReviewing.value = false;
//                reviewProgress.value = { current: 0, total: 0 };
                // 停止进度显示
//                stopProgress();
            }
        };

        // 加载所有文档的对齐数据用于统计
        const fetchAllAlignments = async () => {

            if (!projectPath.value) return;

            const alignments = {};
            projectFiles.value.doc_files.forEach(docFile => {
                alignments[docFile] = [];
            });

            const pickRangeFile = (ranges = []) => {
                if (!Array.isArray(ranges)) return '';
                const firstRange = ranges.find(item => item && typeof item === 'object');
                if (!firstRange) return '';
                return firstRange.filename || firstRange.documentId || '';
            };

            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.get(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`);

                if (response.data.status === 'success' && response.data.data) {
                    Object.values(response.data.data).forEach(alignment => {
                        const docFile = pickRangeFile(alignment.docRanges);
                        const codeFile = pickRangeFile(alignment.codeRanges);
                        const bucketKey = docFile || codeFile || '__ungrouped__';

                        if (!alignments[bucketKey]) {
                            alignments[bucketKey] = [];
                        }
                        alignments[bucketKey].push(alignment);
                    });
                }
            } catch (err) {
            }
            
            allAlignments.value = alignments;
        };

        // 加载问题单数据
        const fetchIssues = async () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.get(`/project/issues?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`);
                if (response.data.status === 'success') {
                    const issuesData = response.data.data || [];

                    // Compatibility: enrich old issues lacking brief fields
                    for (const issue of issuesData) {
                        // Initialize per-issue editing state
                        if (issue._isEditing === undefined) issue._isEditing = false;
                        if (!issue.briefRequirement || !issue.briefCode) {
                            try {
                                const alignment = await fetchAlignmentById(issue.alignmentId);
                                if (alignment) {
                                    issue.briefRequirement = alignment.docRanges && alignment.docRanges[0]
                                        ? alignment.docRanges[0].content.substring(0, 100) + (alignment.docRanges[0].content.length > 100 ? '...' : '')
                                        : '无相关需求';

                                    issue.briefCode = alignment.codeRanges && alignment.codeRanges[0]
                                        ? alignment.codeRanges[0].content.substring(0, 100) + (alignment.codeRanges[0].content.length > 100 ? '...' : '')
                                        : '无相关代码';
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
                    projectName.value = metadata.project_name || projectName.value; //urlParams.get('name')
                    codeFileLines.value = metadata.code_file_lines || {};
                    codeScale.value = metadata.code_scale || 0;

                    allAlignments.value = {};
                    await fetchAlignments();
                    await fetchAlignmentSidebarPage(true, alignType.value);
                    await fetchSidebarBlocksPage(true);
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

                try {
                    if (fileType === 'doc') {
                        selectedDocFile.value = fileName;
                        selectedDocRawContent.value = '';
                        docPageRanges.value = [];
                        await renderDocPage(1, fileName);

                        if (isFiltered.value) {
                            filteredAlignments.value = null;
                            isFiltered.value = false;
                        }

                        await fetchAlignments();
                        if (rightSidebarMode.value === 'alignment') {
                            await fetchAlignmentSidebarPage(true, alignType.value);
                        } else if (blockType.value === 'doc' || viewMode.value === 'current') {
                            await fetchSidebarBlocksPage(true);
                        }
                    } else if (fileType === 'code') {
                        selectedCodeFile.value = fileName;
                        selectedCodeRawContent.value = '';
                        codePageRanges.value = [];
                        await renderCodePage(1, fileName);

                        await fetchAlignments();
                        if (rightSidebarMode.value === 'alignment') {
                            await fetchAlignmentSidebarPage(true, alignType.value);
                        } else if (blockType.value === 'code' || viewMode.value === 'current') {
                            await fetchSidebarBlocksPage(true);
                        }
                    }
                } catch (e) {
                    console.error(e);
                    ElMessage.error(`渲染失败: ${e.message}`);
                }
            } catch (err) {
                console.error("Error fetching file content:", err);
                ElMessage.error(`加载文件内容失败: ${err.message}`);
            }
        };

        const fetchRawFileContentOnly = async (fileName, fileType) => {
            const response = await axios.get(`/project/file-content?path=${encodeURIComponent(projectPath.value)}&filename=${encodeURIComponent(fileName)}&type=${fileType}`);
            if (response.data.status !== 'success') {
                throw new Error(response.data.message || '加载文件内容失败');
            }
            return regularizeFileContent(response.data.content, fileType);
        };

        const resetManualAlignFromBlock = () => {
            manualAlignFromBlock.value = false;
            existingAlignTab.value = 'req2code';
            selectedExistingAlignmentId.value = '';
        };

        const getSelectionRawContent = async (selection) => {
            if (!selection || !selection.documentId) return '';
            const selectionType = selection.type === 'code' ? 'code' : 'doc';
            if (selectionType === 'doc' && selection.documentId === selectedDocFile.value && selectedDocRawContent.value) {
                return selectedDocRawContent.value;
            }
            if (selectionType === 'code' && selection.documentId === selectedCodeFile.value && selectedCodeRawContent.value) {
                return selectedCodeRawContent.value;
            }
            return await fetchRawFileContentOnly(selection.documentId, selectionType);
        };

        const resolveDocSelectionRange = async (selection) => {
            const resolved = {
                start: Number(selection?.start),
                end: Number(selection?.end),
                startLine: Number(selection?.startLine),
                endLine: Number(selection?.endLine)
            };

            if (Number.isFinite(resolved.startLine) && Number.isFinite(resolved.endLine)) {
                return resolved;
            }

            const docFileContent = await getSelectionRawContent(selection);
            const { startLine, endLine } = convertOffsetToLineNumbers(
                docFileContent,
                resolved.start,
                resolved.end
            );
            resolved.startLine = startLine;
            resolved.endLine = endLine;
            return resolved;
        };

        const resolveCodeSelectionRange = async (selection) => {
            const resolved = {
                start: Number(selection?.start),
                end: Number(selection?.end),
                startLine: Number(selection?.startLine),
                endLine: Number(selection?.endLine)
            };

            const hasOffsets = Number.isFinite(resolved.start) && Number.isFinite(resolved.end);
            const hasLines = Number.isFinite(resolved.startLine) && Number.isFinite(resolved.endLine);

            if (hasOffsets && hasLines) {
                return resolved;
            }

            const codeFileContent = await getSelectionRawContent(selection);
            if (!hasOffsets && hasLines) {
                const offsets = getOffsetsFromLineRange(codeFileContent, resolved.startLine, resolved.endLine);
                resolved.start = offsets.start;
                resolved.end = offsets.end;
                return resolved;
            }

            const { startLine, endLine } = convertOffsetToLineNumbers(
                codeFileContent,
                resolved.start,
                resolved.end
            );
            resolved.startLine = startLine;
            resolved.endLine = endLine;
            return resolved;
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
                            fileType: fileType,
                            icon: 'fas fa-folder',
                            children: convertToTreeNodes(childNode, currentPath).filter(n => n)
                        };
                    }
                }).filter(n => n);
            };

            return convertToTreeNodes(root);
        };
        
        //监听 projectFiles.value.doc_files 变化
        watch(
          () => projectFiles.value.doc_files,
          (newFiles) => {
            docFileTree.value = buildFileTree(newFiles, 'doc');
          },
          { immediate: true }
        );
        
        //监听 projectFiles.value.code_files 变化
        watch(
          () => projectFiles.value.code_files,
          (newFiles) => {
            codeFileTree.value = buildFileTree(newFiles, 'code');
          },
          { immediate: true }
        );
 
        //const docFileTree = computed(() => buildFileTree(projectFiles.value.doc_files, 'doc'));
        //const codeFileTree = computed(() => buildFileTree(projectFiles.value.code_files, 'code'));

        const handleNodeClick = (data) => {
            if (data.type === 'file') {
                fetchFileContent(data.path, data.fileType);
            }
        };

        /***********************
         * 文件上传
         ***********************/
        const addFile = (fileType, selectionMode) => {
          if (fileType === 'doc') {
            dialogParseDocMethodVisible.value = true;
            return;
          }
          // 其他类型直接上传
          startUpload(fileType, selectionMode, 'default');
        };

        const handleConfirmParseDocMethod = () => {
          startUpload('doc', 'file', parseDocMethod.value);
          dialogParseDocMethodVisible.value = false;
        };

        const startUpload = (fileType, selectionMode, parseDocMethod) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = selectionMode === 'file';

          if (selectionMode === 'folder') {
            input.webkitdirectory = true;
          }

          if (fileType === 'doc') {
            input.accept = '.md,.docx';
          }

          input.onchange = async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) {
              return;
            }

            const formData = new FormData();
            formData.append('path', projectPath.value);
            formData.append('fileType', fileType);
            formData.append('parseDocMethod', parseDocMethod);
            // 打印所有字段debug
            /* for (let [key, value] of formData.entries()) {
              console.log(key, value);
            } */
            for (let i = 0; i < files.length; i++) {
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
                await fetchProjectMetadata();
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
         
        /* const addFile = (fileType, selectionMode) => {
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
        }; */

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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.post('/api/clear-project-results', {
                    projectPath: projectPath.value,
                    project_id: projectId
                });
                
                if (response.data.status === 'success') {
                    // 清空前端状态
                    alignmentResults.value = [];
                    issues.value = [];
                    selectedIssue.value = null;
                    selectedIssueIds.value = new Set();
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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                // 先清空所有结果
                await axios.post('/api/clear-project-results', {
                    projectPath: projectPath.value,
                    project_id: projectId
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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                // 先清空所有结果
                await axios.post('/api/clear-project-results', {
                    projectPath: projectPath.value,
                    project_id: projectId
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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                // 先清空所有结果
                await axios.post('/api/clear-project-results', {
                    projectPath: projectPath.value,
                    project_id: projectId
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
            // 获取所有代码块，进行入库操作，方便单个的纯代码审查
            try {
                // 1. 获取代码分块
                const chunksResponse = await axios.get('/api/get-code-chunks', {
                    params: { projectPath: projectPath.value }
                });
                const codeBlocks = chunksResponse.data.data || [];
                if (codeBlocks.length === 0) {
                    ElMessage.warning('未找到代码分块，请检查代码分解结果');
                    return;
                }

                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');

                // 调用后端添加数据
                const result = await axios.post('/api/add-code-data', {
                    project_id: projectId,
                    code_blocks: codeBlocks,
                });

            } catch (error) {
                ElMessage.error(`代码块入库失败: ${error.message}`);
            }
        };

        /***********************
         * 自动对齐功能
         ***********************/
        const ensureRequirementDecompositionReady = async () => {
            if (projectFiles.value.doc_files.length === 0) {
                ElMessage.warning('请先添加需求文档');
                return false;
            }

            try {
                const chunksResponse = await axios.get('/api/get-requirement-chunks', {
                    params: { projectPath: projectPath.value }
                });
                const requirements = chunksResponse.data.data || [];
                if (requirements.length > 0) {
                    return true;
                }
            } catch (error) {
                console.error('检查需求分解结果失败:', error);
            }

            ElMessage.info('未找到需求分解结果，正在进行需求分解...');

            let success = false;
            try {
                const respAnno = await axios.post('api/requirement-decomposition', {
                    projectPath: projectPath.value
                });
                if (respAnno.data && respAnno.data.status === 'success') {
                    success = true;
                }
            } catch (e) {
                console.warn('基于标注的需求分解失败，将尝试自动Markdown分解:', e);
            }

            if (!success) {
                try {
                    const respAuto = await axios.post('api/auto-markdown-split', {
                        projectPath: projectPath.value
                    });
                    if (respAuto.data && respAuto.data.status === 'success') {
                        success = true;
                    }
                } catch (e) {
                    console.error('自动Markdown需求分解失败:', e);
                }
            }

            if (!success) {
                ElMessage.error('需求分解失败，请检查项目文档或标注结果');
                return false;
            }

            await loadAndRenderDocBlocks();

            try {
                const chunksResponse = await axios.get('/api/get-requirement-chunks', {
                    params: { projectPath: projectPath.value }
                });
                const requirements = chunksResponse.data.data || [];
                if (requirements.length > 0) {
                    ElMessage.success('需求分解完成，已生成需求块');
                    return true;
                }
            } catch (error) {
                console.error('需求分解完成后检查结果失败:', error);
            }

            ElMessage.error('需求分解完成但未找到有效需求块，请检查项目配置');
            return false;
        };

        const ensureCodeDecompositionReady = async () => {
            if (projectFiles.value.code_files.length === 0) {
                ElMessage.warning('请先添加代码文件');
                return false;
            }

            try {
                const chunksResponse = await axios.get('/api/get-code-chunks', {
                    params: { projectPath: projectPath.value }
                });
                const codeBlocks = chunksResponse.data.data || [];
                if (codeBlocks.length > 0) {
                    return true;
                }
            } catch (error) {
                console.error('检查代码分解结果失败:', error);
            }

            ElMessage.info('未找到代码分解结果，正在进行代码分解...');

            let success = false;
            try {
                const resp = await axios.post('/api/code-decomposition', {
                    projectPath: projectPath.value
                });
                if (resp.data && resp.data.status === 'success') {
                    success = true;
                }
            } catch (e) {
                console.error('代码分解失败:', e);
            }

            if (!success) {
                ElMessage.error('代码分解失败，请检查项目代码目录');
                return false;
            }

            await loadAndRenderCodeBlocks();

            try {
                const chunksResponse = await axios.get('/api/get-code-chunks', {
                    params: { projectPath: projectPath.value }
                });
                const codeBlocks = chunksResponse.data.data || [];
                if (codeBlocks.length > 0) {
                    ElMessage.success('代码分解完成，已生成代码块');
                    return true;
                }
            } catch (error) {
                console.error('代码分解完成后检查结果失败:', error);
            }

            ElMessage.error('代码分解完成但未找到有效代码块，请检查项目配置');
            return false;
        };

        const ensureDecompositionReady = async () => {
            const reqOk = await ensureRequirementDecompositionReady();
            if (!reqOk) return false;
            const codeOk = await ensureCodeDecompositionReady();
            if (!codeOk) return false;
            return true;
        };

        const stopAutoAlignment = async () => {
            if (!AlignTaskId.value) return;

            try {
                await axios.post(`/api/stop-task/${AlignTaskId.value}`)
                clearInterval(pollingTimer.value)
                pollingTimer.value = null
                isAutoAligning.value = false;
                stopProgress();
                clearReviewTaskState()
            } catch (err) {
                ElMessage.warning(`停止失败: ${err.message}`);
            }
        };

        const getProjectId = () => {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('project_id') || ''
        }

        /**
         * 把当前任务状态持久化到 localStorage
         * 在【启动、切换任务、每次进度更新】时调用
         */
        const saveTaskState = () => {
            const state = {
                projectId: getProjectId(),
                taskId: AlignTaskId.value,
                nextTaskId: nextTaskId.value,
                currentTotal: AlignCurrentTotal.value,
                nextTaskTotal: nextTaskTotal.value,
                title: progressTitle.value,
                current: progressCurrent.value,
                isRunning: isAutoAligning.value,
                timestamp: Date.now()
            }
            localStorage.setItem(STORAGE_ALIGN_KEY(), JSON.stringify(state))
        }

        /**
         * 清理 localStorage (任务完成/失败/过期时调用)
         *
         */
        const clearTaskState = () => {
            localStorage.removeItem(STORAGE_ALIGN_KEY())
        }

        const forceResetState = () => {
            if (pollingTimer.value) {
                clearInterval(pollingTimer.value)
                pollingTimer.value = null
            }
            AlignTaskId.value = ''
            nextTaskId.value = null
            nextTaskTotal.value = 0
            AlignCurrentTotal.value = 0
            isAutoAligning.value = false
            stopProgress()
        }

        /**
         * 页面刷新后恢复任务状态
         * 先读 localStorage, 在调后端 //get-progress/<task_id> 确认Celery任务还活着
         */
        const restoreTaskState = async () => {
            const currentProjectId = getProjectId()

            const raw = localStorage.getItem(STORAGE_ALIGN_KEY())
            if (!raw) return

            let state
            try {
                state = JSON.parse(raw)
            } catch {
                clearTaskState()
                return
            }

            if (state.projectId !== currentProjectId) {
                // clearTaskState()
                return
            }

            // 超过 1 小时的旧状态直接丢弃，防止死任务残留
            if (Date.now() - (state.timestamp || 0) > 3600000) {
                clearTaskState()
                return
            }

            // 恢复变量
            AlignTaskId.value = state.taskId ?? ''
            nextTaskId.value = state.nextTaskId ?? null
            // AlignCurrentTotal.value = state.currentTotal ?? 0
            nextTaskTotal.value = state.nextTaskTotal ?? 0

            if (!state.nextTaskId && (state.nextTaskTotal ?? 0) > 0) {
                AlignCurrentTotal.value = state.nextTaskTotal
            } else {
                AlignCurrentTotal.value = state.currentTotal ?? 0
            }

            if (!AlignTaskId.value) {
                clearTaskState()
                return
            }

            try {
                // 1. 先查当前任务在 Celery 里的真实状态
                const resp = await axios.get(`/get-progress/${AlignTaskId.value}`);
                const current = resp.data.meta?.current;
                const name = resp.data.meta?.name;
                const celeryState = resp.data.state ?? 'PENDING';

                // 2. 根据状态决定怎么恢复
                if (celeryState === 'PENDING' || celeryState === 'PROGRESS') {
                    // 任务还在跑，直接恢复进度条 + 轮询
                    startProgress(state.title || '任务处理中', AlignCurrentTotal.value)
                    updateProgress(current ?? 0, name ?? '')
                    alignmentProgress.value.current = current ?? 0
                    alignmentProgress.value.total = AlignCurrentTotal.value
                    isAutoAligning.value = true

                    saveTaskState() // 重新存一下(刷新时间戳)
                    if (!pollingTimer.value) {
                        pollingTimer.value = setInterval(getProgress, 2000)
                    }
                    return
                }

                if (celeryState === 'SUCCESS') {
                    // 当前任务已完成，看看有没有下一个
                    if (nextTaskId.value) {
                        // 查一下 task2 的状态
                        const resp2 = await axios.get(`/get-progress/${nextTaskId.value}`);
                        const d2Current = resp2.data.meta?.current;
                        const d2Name = resp2.data.meta?.name;
                        const s2 = resp2.data.state ?? 'PENDING';

                        if (s2 === 'PENDING' || s2 === 'PROGRESS') {
                            // task2 还在跑，切换到 task2 恢复
                            AlignTaskId.value = nextTaskId.value
                            nextTaskId.value = null
                            AlignCurrentTotal.value = nextTaskTotal.value > 0
                                ? nextTaskTotal.value
                                : (state.nextTaskTotal ?? state.currentTotal)

                            startProgress('对齐处理', nextTaskTotal.value)
                            updateProgress(d2Current, d2Name)
                            alignmentProgress.value.current = d2Current ?? 0
                            alignmentProgress.value.total = AlignCurrentTotal.value
                            isAutoAligning.value = true

                            saveTaskState()
                            if (!pollingTimer.value) {
                                pollingTimer.value = setInterval(getProgress, 2000)
                            }
                            return
                        }

                        // task2 也结束了 (SUCCESS / FAILURE / REVOKED)
                        clearTaskState()
                        if (s2 === 'SUCCESS') {
                            ElMessageBox.alert('对齐完成!', '提示', {
                            confirmButtonText: '知道了',
                            type: 'success'
                            });
                        } else {
                            ElMessageBox.alert('查询进度失败!', '提示', {
                            confirmButtonText: '知道了',
                            type: 'error'
                            });
                        }
                        return
                    }
                    // 没有下一个，全部完成
                    clearTaskState()
                    return
                }

                // FAILURE / REVOKED / 未知状态
                clearTaskState()
                ElMessageBox.alert('上次任务以失败或取消!', '提示', {
                confirmButtonText: '知道了',
                type: 'error'
                });
            } catch (err) {
                // 后端报错了 (可能是 task_id 已被 Celery 清理)
                clearTaskState()
            }
        }


        // 查询进度
        const getProgress = async () => {
            if (!AlignTaskId.value) {
                clearInterval(pollingTimer.value)
                pollingTimer.value = null
                isAutoAligning.value = false;
                stopProgress();
                clearReviewTaskState()
                return
            }
            pollCount.value++
            if (pollCount.value >= MAX_POLL_COUNT) {
                ElMessage.info('轮询次数已达上限，已停止轮询');
                clearInterval(pollingTimer.value)
                pollingTimer.value = null
                isAutoAligning.value = false;
                stopProgress();
                clearReviewTaskState()
                return
            }
            try {
                const response = await axios.get(`/get-progress/${AlignTaskId.value}`);
                if (response.data.code !== 0) return;

                const current = response.data.meta?.current || 0
                const name = response.data.meta?.name || 'Unknown'
                updateProgress(current, name);

                saveTaskState()

                const state = response.data.state;
                alignmentProgress.value.current = current

                if (state === 'SUCCESS'){
                    if (nextTaskId.value){
                        AlignTaskId.value = nextTaskId.value;
                        nextTaskId.value = null;

                        stopProgress();
                        startProgress('自动对齐 (需求 → 代码)', nextTaskTotal.value, nextTaskCurrent.value)
                        alignmentProgress.value.total = nextTaskTotal.value;
                        alignmentProgress.value.current = nextTaskCurrent.value;

                        saveTaskState()
                        return;
                    }

                    clearInterval(pollingTimer.value)
                    pollingTimer.value = null
                    await fetchAllAlignments();
                    isAutoAligning.value = false;
                    stopProgress();

                    clearTaskState()
//                        ElMessage.success('对齐完成！');
                    ElMessageBox.alert('对齐完成!', '提示', {
                        confirmButtonText: '知道了',
                        type: 'success'
                    });
                    }
                if (state === 'FAILURE'){
                    clearInterval(pollingTimer.value)
                    pollingTimer.value = null
                    await fetchAllAlignments();
                    isAutoAligning.value = false;
                    stopProgress();
                    clearTaskState()
                    ElMessageBox.alert(response.data.message, '提示', {
                        confirmButtonText: '知道了',
                        type: 'error'
                    });
                }



            } catch (error) {
                if (errorCount.value >= errorMax) {
                    clearInterval(pollingTimer.value)
                    pollingTimer.value = null
                    isAutoAligning.value = false;
                    stopProgress();
                    ElMessageBox.alert('查询进度失败!', '提示', {
                            confirmButtonText: '知道了',
                            type: 'error'
                    });
                }
                errorCount.value++

//                ElMessage.warning(`查询进度失败: ${error.message}`);
            }
        }

        const startAutoAlignmentReqToCode = async () => {
            if (isAutoAligning.value) return;
            isAutoAligning.value = true;
            ElMessage.info('开始自动对齐（需求 → 代码）...');

            try {
                const ready = await ensureDecompositionReady();
                if (!ready) {
                    isAutoAligning.value = false;
                    stopProgress();
                    return;
                }
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                 // 0. 获取需求分块
                const chunksResponse = await axios.get('/api/get-requirement-chunks', {
                    params: { projectPath: projectPath.value, projectId: projectId }
                });
                const requirements = chunksResponse.data.data || [];
                const all_align = chunksResponse.data.all_align_count || requirements.length
                const y_align = chunksResponse.data.y_align_count || 0
                if (requirements.length === 0 && y_align !== 0) {
                    ElMessage.warning('已对齐完毕，可重新对齐');
                    isAutoAligning.value = false;
                    return;
                }else if (requirements.length === 0) {
                    ElMessage.warning('未找到需求分块，请检查需求分解结果');
                    isAutoAligning.value = false;
                    return;
                }

                // 1. 代码摘要，先存入数据库
                ElMessage.warning('正在进行代码摘要...');

                const abstractResponse = await axios.post('/api/get-code-abstract', {
                    projectPath: projectPath.value,
                    project_id: projectId,
                    requirements: requirements,
                    y_align: y_align
                });

//                const codeFileAbstract = abstractResponse.data.status === 'success' ? abstractResponse.data.data : {};

                if (abstractResponse.data.status === 'success'){
                    AlignTaskId.value = abstractResponse.data.task1_id;
                    nextTaskId.value = abstractResponse.data.task2_id;
                    nextTaskTotal.value = all_align
                    nextTaskCurrent.value = y_align
                    AlignCurrentTotal.value = projectFiles.value.code_files.length
                    // 初始化进度
                    startProgress('代码摘要', AlignCurrentTotal.value);
                    alignmentProgress.value.total = AlignCurrentTotal.value;
                    alignmentProgress.value.current = 0;

                    saveTaskState()
                    // 开始轮询进度
                    pollingTimer.value = setInterval(getProgress, 2000);
                } else {
                    ElMessage.warning('任务启动失败')
                }

            } catch (error) {
                ElMessage.error(`对齐失败: ${error.message}`);
            } finally {
//                isAutoAligning.value = false;
//                stopProgress();
            }
        };

        const startAutoAlignmentCodeToReq = async () => {
            if (isAutoAligning.value) return;
            isAutoAligning.value = true;
            ElMessage.info('开始自动对齐（代码 → 需求）...');

            try {
                const ready = await ensureDecompositionReady();
                if (!ready) {
                    isAutoAligning.value = false;
                    stopProgress();
                    return;
                }

                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');

                // 1. 获取代码分块
                const chunksResponse = await axios.get('/api/get-code-chunks', {
                    params: { projectPath: projectPath.value, projectId: projectId }
                });
                const codeBlocks = chunksResponse.data.data || [];
                const all_align = chunksResponse.data.all_align_count || codeBlocks.length
                const y_align = chunksResponse.data.y_align_count || 0
                if (codeBlocks.length === 0 && y_align !== 0) {
                    ElMessage.warning('已对齐完毕，可重新对齐');
                    isAutoAligning.value = false;
                    return;
                } else if (codeBlocks.length === 0) {
                    ElMessage.warning('未找到代码分块，请检查代码分解结果');
                    isAutoAligning.value = false;
                    return;
                }


                const abstractResponse = await axios.post('/api/align-code-to-requirement-for', {
                    projectPath: projectPath.value,
                    project_id: projectId,
                    codeBlocks: codeBlocks,
                    y_align: y_align
                });

                // 初始化进度
                startProgress('自动对齐 (代码 → 需求)', all_align, y_align);
                alignmentProgress.value.total = all_align;
                alignmentProgress.value.current = y_align;

                if (abstractResponse.data.status === 'success'){
                    AlignTaskId.value = abstractResponse.data.task_id;
                    AlignCurrentTotal.value = all_align
                    saveTaskState()
                    // 开始轮询进度
                    pollingTimer.value = setInterval(getProgress, 2000);
                } else {
                    ElMessage.warning('任务启动失败')
                }

            } catch (error) {
                ElMessage.error(`对齐失败: ${error.message}`);
            } finally {
//                isAutoAligning.value = false;
//                stopProgress();
            }
        };

        const startAutoAlignmentWithDirection = async (direction) => {
            if (direction === 'reqToCode') {
                await startAutoAlignmentReqToCode();
            } else if (direction === 'codeToReq') {
                await startAutoAlignmentCodeToReq();
            }
        };





        /***********************
         * 状态计算函数
         ***********************/
        const getMatchedAlignmentIdForBlock = (block, type, requireCodeReview = false) => {
            if (!block) return null;
            if (type === 'code' && requireCodeReview) {
                return block.matchedCodeReviewAlignmentId || null;
            }
            return block.matchedAlignmentId || null;
        };

        const getBlockStatus = (block, type, requireCodeReview) => {
            const matchedAlignmentId = getMatchedAlignmentIdForBlock(block, type, requireCodeReview);
            const reviewed = requireCodeReview ? block?.matchedCodeReviewReviewed : block?.matchedAlignmentReviewed;
            if (!matchedAlignmentId) {
                return {
                    status: 'unaligned',
                    text: '未分解',
                    type: 'warning'
                };
            }
            if (reviewed) {
                return {
                    status: 'reviewed',
                    text: '已审查',
                    type: 'success'
                };
            } else {
                return {
                    status: 'unreviewed',
                    text: '未审查',
                    type: 'warning'
                };
            }
        };

        const hasCodeReview = computed(() => {
            return (codeBlocks.value || []).some(block => !!block.matchedCodeReviewAlignmentId) ||
                (currentCodeBlocksForHighlight.value || []).some(block => !!block.matchedCodeReviewAlignmentId);
        })


        const getAlignmentStatus = (alignment) => {
//            const noDoc = !alignment.docRanges || alignment.docRanges.length === 0;
//            const noCode = !alignment.codeRanges || alignment.codeRanges.length === 0;
            if (!alignment.is_alignment) {
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

        const alignType = ref('req2code')

        watch(alignType, (newType) => {
            alignmentPage.value = 1;
            fetchAlignmentSidebarPage(true, newType)
        })
        const sidebarAlignments = computed(() => {
            if (isFiltered.value && filteredAlignments.value) {
                return filteredAlignments.value;
            }
            return sidebarAlignmentItems.value || [];
        });

        /***********************
         * 对齐关系创建
         ***********************/
        const handleDocSelection = async (event) => {
            const selection = window.getSelection();
            //console.log("User selection:", selection ? selection.toString() : 'null');
            if (!selection || selection.toString().trim() === '') return;

            const range = selection.getRangeAt(0);
            const editorDiv = document.querySelector('.content-text-doc');

            if (editorDiv && editorDiv.contains(range.commonAncestorContainer)) {
                const [start, end] = getSourceDocumentRange(editorDiv, range);
                if (end - start > 0) {
                    const docContent = await ensureCurrentRawFileContent('doc');
                    currentSelection.value = {
                        type: 'doc',
                        documentId: selectedDocFile.value,
                        start,
                        end,
                        content: docContent.slice(start, end)
                    };
                    await ensureProjectAlignmentsLoaded();
                    resetManualAlignFromBlock();
                    showAlignmentDialog.value = true;
                    newAlignmentName.value = '';
                }
            }
        };

        const createBlockOnly = async (type) => {
            if (!currentSelection.value) {
                ElMessage.warning('请先选择文本。');
                return;
            }
            const currentCodeContent = type === 'code' ? await ensureCurrentRawFileContent('code') : '';

            const buildBlockDataFromSelection = (selectionType) => {
                let blockData = {};
                if (selectionType === 'doc') {
                    blockData = {
                        name: extractPlainTextFromMarkdown(currentSelection.value.content || '', 40) || '需求块',
                        filename: currentSelection.value.documentId,
                        start: currentSelection.value.start,
                        end: currentSelection.value.end,
                        content: currentSelection.value.content
                    };
                } else if (selectionType === 'code') {
                    const { startLine, endLine } = convertOffsetToLineNumbers(
                        currentCodeContent,
                        currentSelection.value.start,
                        currentSelection.value.end
                    );
                    blockData = {
                        name: getCodeBlockFunctionName({ content: currentSelection.value.content }),
                        file: currentSelection.value.documentId,
                        range: [startLine, endLine],
                        content: currentSelection.value.content
                    };
                }
                return blockData;
            };

            const blockData = buildBlockDataFromSelection(type);
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project_id');

            try {
                const response = await axios.post('/api/add-block', {
                    projectPath: projectPath.value,
                    blockType: type,
                    blockData: blockData,
                    projectId: projectId
                });

                if (response.data.status === 'success') {
                    ElMessage.success(response.data.message);
                    showAlignmentDialog.value = false;
                    showCodeSelectionDialog.value = false;
                    // 刷新块列表 (如果需要)
                    // 暂时没有刷新块列表的API调用，因为块通常是在加载时获取的。
                    // 但为了即时反馈，我们可以在前端手动更新列表，或者重新加载页面
                    // 这里选择简单的提示成功，因为块视图可能需要刷新才能看到。
                } else if (response.data.status === 'warning') {
                    ElMessage.warning(response.data.message);
                } else {
                    ElMessage.error('添加块失败: ' + response.data.message);
                }
            } catch (error) {
                console.error('Error adding block:', error);
                ElMessage.error('添加块失败: ' + (error.response?.data?.message || error.message));
            }
        };

        const buildBlockDataFromCurrentSelection = async () => {
            if (!currentSelection.value) return null;
            const selectionType = currentSelection.value.type === 'code' ? 'code' : 'doc';
            if (selectionType === 'doc') {
                return {
                    blockType: 'doc',
                    blockData: {
                        name: extractPlainTextFromMarkdown(currentSelection.value.content || '', 40) || '需求块',
                        filename: currentSelection.value.documentId,
                        start: currentSelection.value.start,
                        end: currentSelection.value.end,
                        content: currentSelection.value.content
                    }
                };
            }

            const codeFileContent = await ensureCurrentRawFileContent('code');
            const { startLine, endLine } = convertOffsetToLineNumbers(
                codeFileContent,
                currentSelection.value.start,
                currentSelection.value.end
            );
            return {
                blockType: 'code',
                blockData: {
                    name: getCodeBlockFunctionName({ content: currentSelection.value.content }),
                    file: currentSelection.value.documentId,
                    range: [startLine, endLine],
                    content: currentSelection.value.content
                }
            };
        };

        const createAlignment = async () => {
            const id = generateUUIDLike();

            if (!currentSelection.value) {
                ElMessage.warning('请先选择文本。');
                return;
            }
            if (!newAlignmentName.value.trim()) {
                if (currentSelection.value.type === 'code') {
                    // 代码块：直接使用内容的前20个字符
                    newAlignmentName.value = currentSelection.value.content.substring(0, 20).trim();
                    //newAlignmentName.value = currentSelection.value.content.trim();
                } else if (manualAlignFromBlock.value) {
                    newAlignmentName.value = extractPlainTextFromMarkdown(currentSelection.value.content, 20);
                } else {
                    // 需求块：从实际选中的完整parse元素中提取纯文本作为名称
                    const docElement = document.getElementById('doc-content');
                    if (docElement) {
                        const selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            const [startOffset, endOffset] = getSourceDocumentRange(docElement, range);
                            
                            // 从原始文档内容中提取对应范围的文本
                            const docFileContent = await ensureCurrentRawFileContent('doc');
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
            }

            const newAlignment = {
                id: id,
                name: newAlignmentName.value.trim(),
                isReviewed: false,
                reviewThoughts: '',
                docRanges: [],
                codeRanges: [],
                align_type: currentSelection.value.type === 'code' ? 'code2req' : 'req2code'
            };

            if (currentSelection.value.type === 'code') {
                const { start, end, startLine, endLine } = await resolveCodeSelectionRange(currentSelection.value);

                newAlignment.codeRanges.push({
                    documentId: currentSelection.value.documentId,
                    filename: currentSelection.value.documentId,
                    start: start,
                    end: end,
                    startLine: startLine,
                    endLine: endLine,
                    content: currentSelection.value.content
                });
            } else {
                const { start, end, startLine, endLine } = await resolveDocSelectionRange(currentSelection.value);

                newAlignment.docRanges.push({
                    ...currentSelection.value,
                    start: start,
                    end: end,
                    filename: currentSelection.value.documentId, // 添加文件名
                    startLine: startLine, // 添加起始行号
                    endLine: endLine // 添加结束行号
                });
            }

            // 先将当前选中内容保存为块（写入 doc_blocks/code_blocks jsonl）
            if (!manualAlignFromBlock.value) {
                try {

                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    const blockPayload = await buildBlockDataFromCurrentSelection();
                    if (blockPayload) {
                        const blockResp = await axios.post('/api/add-block', {
                            projectPath: projectPath.value,
                            blockType: blockPayload.blockType,
                            blockData: blockPayload.blockData,
                            projectId: projectId
                        });
                        if (blockResp.data?.status === 'error') {
                            ElMessage.error('创建对齐关系前保存块失败: ' + (blockResp.data?.message || '未知错误'));
                            return;
                        }
                    }
                } catch (err) {
                    console.error('创建对齐关系前保存块失败:', err);
                    ElMessage.error('创建对齐关系前保存块失败: ' + (err.response?.data?.message || err.message));
                    return;
                }
            }

            // 更新前端UI
            alignmentResults.value.push(newAlignment);
            showAlignmentDialog.value = false;
            showCodeSelectionDialog.value = false;
            resetManualAlignFromBlock();

            // 发送到后端保存

            // 发送到后端保存
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`,
                    newAlignment
                );

                // 更新所有对齐数据以保持统计信息同步
                await fetchAllAlignments();
                await fetchAlignmentSidebarPage(false, alignType.value);
                await fetchSidebarBlocksPage(false);

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
                await fetchAlignments();
                await fetchAlignmentSidebarPage(false, alignType.value);
            } catch (error) {
                console.error('刷新对齐关系失败:', error);
                ElMessage.error(`刷新失败: ${error.message}`);
            }
        };

        // 同时刷新块列表和对齐关系
        const refreshBlocksAndAlignments = async () => {
             await refreshAlignments();
             await refreshBlocks();
        };

        watch(statusFilters, async () => {
            if (rightSidebarMode.value === 'alignment') {
                await fetchAlignmentSidebarPage(true, alignType.value);
            }
        }, { deep: true });

        watch([viewMode, rightSidebarMode, blockType], async () => {
            currentSelectedBlockIndex.value = -1;
            if (rightSidebarMode.value === 'alignment') {
                await fetchAlignmentSidebarPage(true, alignType.value);
            } else {
                await fetchSidebarBlocksPage(true);
            }
        });

        watch([selectedDocFile, selectedCodeFile], async () => {
            currentDocBlocksForHighlight.value = [];
            currentCodeBlocksForHighlight.value = [];
            if (rightSidebarMode.value === 'alignment') {
                await fetchAlignmentSidebarPage(true, alignType.value);
            } else {
                await fetchSidebarBlocksPage(true);
            }
        });

        const goToAlignmentPage = async (page) => {
            const targetPage = Math.min(Math.max(page, 1), alignmentTotalPages.value);
            if (targetPage === alignmentPage.value) return;
            alignmentPage.value = targetPage;
            if (rightSidebarMode.value === 'alignment') {
                await fetchAlignmentSidebarPage(false, alignType.value);
            }
        };

        const goToBlockPage = async (page) => {
            const totalPages = blockType.value === 'doc' ? docBlockTotalPages.value : codeBlockTotalPages.value;
            const pageRef = blockType.value === 'doc' ? docBlockPage : codeBlockPage;
            const targetPage = Math.min(Math.max(page, 1), totalPages);
            if (targetPage === pageRef.value) return;
            pageRef.value = targetPage;
            if (rightSidebarMode.value === 'block') {
                await fetchSidebarBlocksPage(false);
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
        // 显示全部对齐关系
        const showAllAlignments = () => {
            filteredAlignments.value = null;
            isFiltered.value = false;
        };

        const currentSelectedBlockIndex = ref(-1);

        const getBlockKey = (block, type) => {
            if (!block) return '';
            if (type === 'doc') {
                const filename = block.filename || block.documentId || '';
                return `${filename}:${Number(block.start) || 0}-${Number(block.end) || 0}`;
            }
            const filename = block.file || block.filename || '';
            const startLine = Array.isArray(block.range) ? Number(block.range[0]) || 0 : 0;
            const endLine = Array.isArray(block.range) ? Number(block.range[1]) || 0 : 0;
            return `${filename}:${startLine}-${endLine}`;
        };

        const resetReviewDialogNavigationContext = () => {
            reviewDialogSource.value = 'alignment';
            reviewDialogBlockType.value = null;
            reviewDialogCurrentBlockKey.value = null;
            currentReviewIssueId.value = null;
        };

        const syncReviewDialogContext = ({ source = 'alignment', block = null, blockType = null, issue = null } = {}) => {
            reviewDialogSource.value = source;
            reviewDialogBlockType.value = source === 'block' ? blockType : null;
            reviewDialogCurrentBlockKey.value = source === 'block' ? getBlockKey(block, blockType) : null;
            currentReviewIssueId.value = source === 'issue' ? issue?.id || null : null;
            if (source === 'issue' && issue) {
                selectedIssue.value = issue;
            }
        };

        const scrollToIssueInList = (issueId) => {
            if (!issueId) return;
            nextTick(() => {
                const el = document.getElementById(`issue-row-${issueId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        };

        // 滚动侧边栏到指定块
        const scrollToBlockInSidebar = (index) => {
            currentSelectedBlockIndex.value = index;
            nextTick(() => {
                const el = document.getElementById(`block-item-${index}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        };

        const getAlignmentIndicesForBlock = (alignment, block, type) => {
            let docIndex = 0;
            let codeIndex = 0;
            if (!alignment || !block) return { docIndex, codeIndex };

            if (type === 'doc' && alignment.docRanges) {
                const blockFile = block.filename || block.documentId;
                const blockStart = Number(block.start);
                const blockEnd = Number(block.end);
                const matchedDocIndex = alignment.docRanges.findIndex(range =>
                    getDocRangeFile(range) === blockFile &&
                    Number(range.start) < blockEnd &&
                    Number(range.end) > blockStart
                );
                if (matchedDocIndex !== -1) docIndex = matchedDocIndex;
            }

            if (type === 'code' && alignment.codeRanges) {
                const blockFile = block.file || block.filename;
                const blockStartLine = Array.isArray(block.range) ? Number(block.range[0]) : NaN;
                const blockEndLine = Array.isArray(block.range) ? Number(block.range[1]) : NaN;
                const matchedCodeIndex = alignment.codeRanges.findIndex(range => {
                    const rangeFile = getCodeRangeFile(range);
                    if (rangeFile !== blockFile) return false;

                    const rangeStartLine = Number(range.startLine);
                    const rangeEndLine = Number(range.endLine);
                    if (Number.isFinite(blockStartLine) && Number.isFinite(blockEndLine) &&
                        Number.isFinite(rangeStartLine) && Number.isFinite(rangeEndLine)) {
                        return Math.max(rangeStartLine, blockStartLine) <= Math.min(rangeEndLine, blockEndLine);
                    }

                    return false;
                });
                if (matchedCodeIndex !== -1) codeIndex = matchedCodeIndex;
            }

            return { docIndex, codeIndex };
        };

        // 处理块列表点击
        const handleBlockItemClick = async (block, index) => {
            currentSelectedBlockIndex.value = index;

            let matchedAlignment = findAlignmentForSidebarBlock(block, blockType.value);
            if (!matchedAlignment) {
                const matchedId = getMatchedAlignmentIdForBlock(block, blockType.value);
                if (matchedId) {
                    matchedAlignment = await fetchAlignmentById(matchedId);
                }
            }
            if (matchedAlignment) {
                const { docIndex, codeIndex } = getAlignmentIndicesForBlock(matchedAlignment, block, blockType.value);
                await selectAlignment(matchedAlignment, docIndex, codeIndex);
                scrollToBlockInSidebar(index);
                return;
            }

            if (blockType.value === 'doc') {
                const range = {
                    documentId: block.filename,
                    filename: block.filename,
                    start: block.start,
                    end: block.end
                };

                clearLinkedAll();
                await applyDocYellowRange(range);
                return;
            }

            if (selectedCodeFile.value !== block.file) {
                await fetchFileContent(block.file, 'code');
            }
            await nextTick();

            const content = await ensureCurrentRawFileContent('code');
            if (!content) return;

            const offsets = getOffsetsFromLineRange(content, block.range[0], block.range[1]);
            const range = {
                documentId: block.file,
                filename: block.file,
                start: offsets.start,
                end: offsets.end,
                startLine: block.range[0],
                endLine: block.range[1]
            };

            clearLinkedAll();
            await applyCodeYellowRange(range);
        };

        const getCodeBlockText = (block) => {
            if (!block) return '';
            return (block.code || block.content || '').toString();
        };

        const getCodeBlockFunctionName = (block) => {
            const explicitName = (block?.name || '').toString().trim();
            if (explicitName) return explicitName;
            const text = getCodeBlockText(block);
            if (!text.trim()) return '代码块';
            const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
            const firstMeaningful = lines.find(line =>
                !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')
            );
            const rawName = (firstMeaningful || lines[0] || '代码块').replace(/\s*\{$/, '').trim();
            return rawName.length > 60 ? `${rawName.slice(0, 60)}...` : rawName;
        };

        const getDocBlockDisplayName = (block) => {
            if (!block) return '需求块';
            const explicitName = (block.name || '').toString().trim();
            if (explicitName) return explicitName;
            const extracted = extractPlainTextFromMarkdown(block.content || '', 40);
            return extracted || '需求块';
        };

        const getBlockDisplayName = (block, type) => {
            if (type === 'doc') return getDocBlockDisplayName(block);
            return getCodeBlockFunctionName(block);
        };

        const getBlockMetaText = (block, type) => {
            if (!block) return '';
            if (type === 'doc') {
                return block.filename || block.documentId || '未知文件';
            }
            const filename = block.file || block.filename || '未知文件';
            const startLine = Array.isArray(block.range) ? block.range[0] : '?';
            const endLine = Array.isArray(block.range) ? block.range[1] : '?';
            return `${filename} (${startLine}-${endLine})`;
        };

        const getBlockPreviewText = (block, type) => {
            if (!block) return '无内容';
            const raw = (type === 'code' ? getCodeBlockText(block) : (block.content || '')).toString().trim();
            if (!raw) return '无内容';
            return raw.length > 50 ? `${raw.substring(0, 50)}...` : raw;
        };

        const findAlignmentForSidebarBlock = (block, type, requireCodeReview = false) => {
            if (!block) return null;
            const matchedId = getMatchedAlignmentIdForBlock(block, type, requireCodeReview);
            if (matchedId) {
                return (alignmentResults.value || []).find(alignment => alignment.id === matchedId) ||
                    (sidebarAlignmentItems.value || []).find(alignment => alignment.id === matchedId) ||
                    null;
            }
            if (type === 'doc') {
                const filename = block.filename || block.documentId;
                const start = Number(block.start);
                const end = Number(block.end);
                return alignmentResults.value.find(alignment =>
                    (alignment.docRanges || []).some(docRange =>
                        (docRange.documentId || docRange.filename) === filename &&
                        Number(docRange.start) < end &&
                        Number(docRange.end) > start
                    )
                ) || null;
            }
            const filename = block.file || block.filename;
            const startLine = Array.isArray(block.range) ? Number(block.range[0]) : NaN;
            const endLine = Array.isArray(block.range) ? Number(block.range[1]) : NaN;
            if (requireCodeReview) {
                return alignmentResults.value.find(alignment => alignment.isCodeReview === 1 &&
                    (alignment.codeRanges || []).some(codeRange => {
                        const codeFile = codeRange.documentId || codeRange.filename;
                        if (codeFile !== filename) return false;
                        if (!Number.isNaN(startLine) && !Number.isNaN(endLine) &&
                            codeRange.startLine !== undefined && codeRange.endLine !== undefined) {
    //                        return Math.max(Number(codeRange.startLine), startLine) <= Math.min(Number(codeRange.endLine), endLine);
                            // 精确匹配纯代码审查的alignment数据
                            return Number(codeRange.startLine) === startLine && Number(codeRange.endLine) === endLine;
                        }
                        return false;
                    })
                ) || null;
            }

            return alignmentResults.value.find(alignment =>
                (!requireCodeReview || alignment.isCodeReview === 1) &&
                (alignment.codeRanges || []).some(codeRange => {
                    const codeFile = codeRange.documentId || codeRange.filename;
                    if (codeFile !== filename) return false;
                    if (!Number.isNaN(startLine) && !Number.isNaN(endLine) &&
                        codeRange.startLine !== undefined && codeRange.endLine !== undefined) {
                        return Math.max(Number(codeRange.startLine), startLine) <= Math.min(Number(codeRange.endLine), endLine);
                    }
                    return false;
                })
            ) || null;
        };

        const handleBlockItemContextMenu = async (event, block, index, type) => {
            event.preventDefault();
            await handleBlockItemClick(block, index);
            showBlockContextMenu(event, block, type);
        };

        // 根据事件坐标获取高亮块
        const getHighlightBlockAtEvent = (event) => {
            const x = event.clientX;
            const y = event.clientY;
            
            let container = null;
            if (event.target.closest('.content-text-doc')) {
                container = document.querySelector('.content-text-doc');
            } else if (event.target.closest('.content-text-code')) {
                container = document.querySelector('.content-text-code');
            }
            
            if (!container) return null;

            const highlights = container.querySelectorAll('.highlight-block');
            for (const highlight of highlights) {
                const rect = highlight.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return highlight;
                }
            }
            return null;
        };

        const expandedAlignmentIds = ref([]);

        const toggleAlignmentExpansion = (id) => {
            const idx = expandedAlignmentIds.value.indexOf(id);
            if (idx !== -1) {
                expandedAlignmentIds.value.splice(idx, 1);
            } else {
                expandedAlignmentIds.value.push(id);
            }
        };

        // 处理新高亮块的点击事件
        const handleHighlightBlockClick = async (event) => {
            // 若当前存在真实文本选中，则优先文本操作，不触发块联动跳转
            const selectedText = window.getSelection()?.toString() || '';
            if (selectedText.trim() !== '') {
                return;
            }

            const target = getHighlightBlockAtEvent(event);
            if (!target) return;

            const type = target.getAttribute('data-type');
            const rangeStart = parseInt(target.getAttribute('data-range-start'));
            const rangeEnd = parseInt(target.getAttribute('data-range-end'));
            let matchedBlockSidebarIndex = -1;

            // 块视图联动逻辑
            if (rightSidebarMode.value === 'block') {
                 // 自动切换块类型以匹配点击的块
                 if (blockType.value !== type) {
                     blockType.value = type;
                     await nextTick();
                 }
                 
                 const blocks = displayedBlocks.value;
                 let index = -1;
                 
                 if (type === 'doc') {
                     index = blocks.findIndex(b => 
                         b.filename === selectedDocFile.value && 
                         Math.abs(b.start - rangeStart) < 2 && 
                         Math.abs(b.end - rangeEnd) < 2
                     );
                 } else {
                     // 代码块匹配：将偏移量转换为行号进行比较
                     const codeFileContent = await ensureCurrentRawFileContent('code');
                     const { startLine, endLine } = convertOffsetToLineNumbers(codeFileContent, rangeStart, rangeEnd);
                     
                     index = blocks.findIndex(b => {
                         if (b.file !== selectedCodeFile.value) return false;
                         if (b.range && b.range.length === 2) {
                             // 检查行号范围是否有交集
                             const bStart = b.range[0];
                             const bEnd = b.range[1];
                             return Math.max(bStart, startLine) <= Math.min(bEnd, endLine);
                         }
                         return false;
                     });
                 }
                 
                 if (index !== -1) {
                     scrollToBlockInSidebar(index);
                    matchedBlockSidebarIndex = index;
                 }
            }

            const alignmentIdAttr = target.getAttribute('data-alignment-id') || '';
            const alignmentIds = alignmentIdAttr.split(',').filter(id => id);
            const alignmentId = alignmentIds[0] || null;

            let alignment = null;
            if (alignmentId) {
                alignment = alignmentResults.value.find(a => a.id === alignmentId) || null;
            }

            if (!alignment) {
                if (type === 'code') {
                    alignment = await findAlignmentByCodeRange(rangeStart, rangeEnd);
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
                    getDocRangeFile(r) === selectedDocFile.value &&
                    Math.max(r.start, rangeStart) < Math.min(r.end, rangeEnd)
                );
                if (idx !== -1) docIndex = idx;
            } else if (type === 'code' && alignment.codeRanges) {
                 // Convert clicked range offsets to line numbers for better matching
                 const codeFileContent = await ensureCurrentRawFileContent('code');
                 const { startLine, endLine } = convertOffsetToLineNumbers(codeFileContent, rangeStart, rangeEnd);
                 
                 const idx = alignment.codeRanges.findIndex(r => {
                    if (getCodeRangeFile(r) !== selectedCodeFile.value) return false;
                    
                    // Prioritize line number intersection check
                    if (r.startLine !== undefined && r.endLine !== undefined) {
                        return Math.max(r.startLine, startLine) <= Math.min(r.endLine, endLine);
                    }
                    
                    // Fallback to offset intersection check
                    return Math.max(r.start, rangeStart) < Math.min(r.end, rangeEnd);
                });
                if (idx !== -1) codeIndex = idx;
            }

            await selectAlignment(alignment, docIndex, codeIndex);
            if (rightSidebarMode.value === 'block' && matchedBlockSidebarIndex !== -1) {
                scrollToBlockInSidebar(matchedBlockSidebarIndex);
            }
        };

        // 选中对齐关系的核心逻辑
        const selectAlignment = async (alignment, docIndex = 0, codeIndex = 0) => {
            if (!alignment) return;
            currentSelectedAlignmentId.value = alignment.id;
            currentDocBlockIndex.value = docIndex;
            currentCodeBlockIndex.value = codeIndex;

            // 右键或反向联动时也要确保对应列表项展开
            //if (!expandedAlignmentIds.value.includes(alignment.id)) {
            //    expandedAlignmentIds.value.push(alignment.id);
            //}

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
        const handleAlignmentItemClick = async (alignment) => {
            await selectAlignment(alignment);
        };

        // 滚动侧边栏到指定对齐项
        const scrollToAlignmentInSidebar = (alignmentId) => {
            const element = document.getElementById(`alignment-item-${alignmentId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
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

        const navigateToSpecificBlock = async (alignment, type, index) => {
            // Ensure alignment is selected
            if (currentSelectedAlignmentId.value !== alignment.id) {
                selectAlignment(alignment);
            }

            if (type === 'doc') {
                if (alignment.docRanges && index >= 0 && index < alignment.docRanges.length) {
                    currentDocBlockIndex.value = index;
                    const docRange = alignment.docRanges[index];
                    if (selectedDocFile.value !== docRange.documentId) {
                        await fetchFileContent(docRange.documentId, 'doc');
                    }
                    await nextTick();
                    clearDocYellow();
                    await applyDocYellowRange(docRange);
                }
            } else if (type === 'code') {
                if (alignment.codeRanges && index >= 0 && index < alignment.codeRanges.length) {
                    currentCodeBlockIndex.value = index;
                    const codeRange = alignment.codeRanges[index];
                    if (selectedCodeFile.value !== codeRange.documentId) {
                        await fetchFileContent(codeRange.documentId, 'code');
                    }
                    await nextTick();
                    clearCodeYellow();
                    await applyCodeYellowRange(codeRange);
                }
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
                const container = document.getElementById(`alignment-item-${linkedAlignmentIdPersist}`);
                const el = container?.querySelector('.alignment-list-item') || container;
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
            currentSelectedBlockIndex.value = -1;
            clearLinkedAll();
        };

        const applyAlignmentYellow = (alignmentId) => {
            clearAlignmentYellow();
            const container = document.getElementById(`alignment-item-${alignmentId}`);
            const el = container?.querySelector('.alignment-list-item') || container;
            if (el) {
                el.classList.add('linked-yellow');
                linkedAlignmentIdPersist = alignmentId;
            }
        };

        const applyDocYellowRange = async (docRange) => {
            if (!docRange) return;
            clearDocYellow();
            const candidates = await ensureDocFileAndPageForRange(docRange);
            const target = candidates.find(el => el.classList.contains('highlight-block')) || candidates[0] || null;
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' });
                target.classList.add('linked-yellow');
                linkedDocElement = target;
            }
        };

        const applyCodeYellowRange = async (codeRange) => {
            if (!codeRange) return;
            clearCodeYellow();
            const candidates = await ensureCodeFileForRange(codeRange);
            const target = candidates[0] || null;
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' });
                target.classList.add('linked-yellow');
                linkedCodeElement = target;
            }
        };

        // 对右键命中的当前块做浅黄色高亮（适用于未对齐块）
        const applyCurrentBlockYellow = (target, type) => {
            if (!target) return;
            if (type === 'doc') {
                clearDocYellow();
                target.classList.add('linked-yellow');
                linkedDocElement = target;
            } else if (type === 'code') {
                clearCodeYellow();
                target.classList.add('linked-yellow');
                linkedCodeElement = target;
            }
        };

        // 处理需求高亮块的右键点击事件
        const handleHighlightBlockRightClick = (event) => {
            event.preventDefault(); // 阻止默认右键菜单
            
            const target = getHighlightBlockAtEvent(event);
            if (!target) return;

            const type = target.getAttribute('data-type');
            // 只处理文档类型的高亮块
            if (type !== 'doc') return;

            const rangeStart = parseInt(target.getAttribute('data-range-start'));
            const rangeEnd = parseInt(target.getAttribute('data-range-end'));

            if (isNaN(rangeStart) || isNaN(rangeEnd)) return;

            // 查找与此高亮块对应的对齐关系
            const correspondingAlignment = findAlignmentByDocRange(rangeStart, rangeEnd);
            const block = findDocBlockByRange(rangeStart, rangeEnd);
            
            if (!correspondingAlignment) {
                if (block) {
                    showBlockContextMenu(event, block, 'doc');
                }
                applyCurrentBlockYellow(target, 'doc');
                // 未对齐块在块视图模式下也需要联动跳转并高亮
                handleHighlightBlockClick(event);
                return;
            }

            // 显示块右键菜单
            if (block) {
                showBlockContextMenu(event, block, 'doc');
            }

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
        const handleCodeHighlightBlockRightClick = async (event) => {
            event.preventDefault(); // 阻止默认右键菜单
            
            const target = getHighlightBlockAtEvent(event);
            if (!target) return;

            const type = target.getAttribute('data-type');
            // 只处理代码类型的高亮块
            if (type !== 'code') return;

            const rangeStart = parseInt(target.getAttribute('data-range-start'));
            const rangeEnd = parseInt(target.getAttribute('data-range-end'));

            if (isNaN(rangeStart) || isNaN(rangeEnd)) return;

            await ensureCurrentRawFileContent('code');
            // 查找与此高亮块对应的对齐关系（返回第一个匹配的）
            const correspondingAlignment = await findAlignmentByCodeRange(rangeStart, rangeEnd);
            const block = findCodeBlockByRange(rangeStart, rangeEnd);
            
            if (!correspondingAlignment) {
                if (block) {
                    showBlockContextMenu(event, block, 'code');
                }
                applyCurrentBlockYellow(target, 'code');
                // 未对齐块在块视图模式下也需要联动跳转并高亮
                handleHighlightBlockClick(event);
                return;
            }

            // 显示块右键菜单
            if (block) {
                showBlockContextMenu(event, block, 'code');
            }

            // 同时执行左键点击的功能（代码跳转和对齐关系筛选）
            handleHighlightBlockClick(event);
        };

        const handleAlignmentDirectionSelect = async (direction) => {
            showAlignmentDirectionDialog.value = false;
            if (!direction) return;
            if (alignmentDirectionMode.value === 'auto') {
                try {

                    await doRestartAlignment(direction);
                } catch (error) {
                    if (error !== 'cancel' && error !== 'close') {
                        ElMessage.error(`自动对齐失败: ${error.message}`);
                    }
                }
            } else if (alignmentDirectionMode.value === 'restart') {

                await ElMessageBox.confirm(
                        '这将清除已有的对齐结果，是否继续？',
                        '自动对齐',
                        {
                            confirmButtonText: '继续',
                            cancelButtonText: '取消',
                            type: 'warning'
                        }
                    );
                await doRestartAlignment(direction);
            }
        };

        // 根据代码范围查找对应的对齐关系（返回第一个匹配的）
        const findAlignmentByCodeRange = async (rangeStart, rangeEnd) => {
            // 尝试转换为行号进行查找
            const codeFileContent = await ensureCurrentRawFileContent('code');
            const { startLine, endLine } = convertOffsetToLineNumbers(codeFileContent, rangeStart, rangeEnd);

            return alignmentResults.value.find(alignment => {
                return alignment.codeRanges && alignment.codeRanges.some(codeRange => {
                    if (codeRange.documentId !== selectedCodeFile.value) return false;

                    // 优先使用行号交集判断
                    if (codeRange.startLine !== undefined && codeRange.endLine !== undefined) {
                        return Math.max(codeRange.startLine, startLine) <= Math.min(codeRange.endLine, endLine);
                    }

                    // 降级使用偏移量交集判断
                    return codeRange.end > rangeStart && codeRange.start < rangeEnd;
                });
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
        const handleAlignmentCodeRangeClick = async (codeRange) => {
            const highlightElements = await ensureCodeFileForRange(codeRange);
            scrollToFirstAndHighlightAllCode(highlightElements);
        };

        // 处理对齐结果中需求片段的点击事件（反向映射）
        const handleAlignmentDocRangeClick = async (docRange) => {
            const elements = await ensureDocFileAndPageForRange(docRange);
            scrollToFirstAndHighlightAll(elements);
        };

        // 滚动到第一个筛选结果的代码区域
        const scrollToFirstFilteredCodeRange = async () => {
            if (!filteredAlignments.value || filteredAlignments.value.length === 0) return;
            
            const firstAlignment = filteredAlignments.value[0];
            if (!firstAlignment.codeRanges || firstAlignment.codeRanges.length === 0) return;
            
            const firstCodeRange = firstAlignment.codeRanges[0];
            
            const highlightElements = await ensureCodeFileForRange(firstCodeRange);
            scrollToFirstAndHighlightAllCode(highlightElements);
        };

        // 滚动到第一个筛选结果的文档区域
        const scrollToFirstFilteredDocRange = async () => {
            if (!filteredAlignments.value || filteredAlignments.value.length === 0) return;
            
            const firstAlignment = filteredAlignments.value[0];
            if (!firstAlignment.docRanges || firstAlignment.docRanges.length === 0) return;
            
            const firstDocRange = firstAlignment.docRanges[0];
            
            const elements = await ensureDocFileAndPageForRange(firstDocRange);
            scrollToFirstAndHighlightAll(elements);
        };

        // 处理代码选择
        const handleCodeSelection = async (event) => {
            const selection = window.getSelection();
            //console.log("Code selection:", selection ? selection.toString() : 'null');
            if (!selection || selection.toString().trim() === '') return;

            const range = selection.getRangeAt(0);
            const editorDiv = document.querySelector('.content-text-code');

            if (editorDiv && editorDiv.contains(range.commonAncestorContainer)) {
                const [start, end] = getSourceDocumentRange(editorDiv, range);
                if (end - start > 0) {
                    const codeContent = await ensureCurrentRawFileContent('code');
                    currentSelection.value = {
                        type: 'code',
                        documentId: selectedCodeFile.value,
                        start,
                        end,
                        content: codeContent.slice(start, end)
                    };
                    await ensureProjectAlignmentsLoaded();
                    resetManualAlignFromBlock();
                    showCodeSelectionDialog.value = true;
                    newAlignmentName.value = '';
                }
            }
        };
        
        
        const isSameRangeEntry = (existingRange, nextRange) => {
            if (!existingRange || !nextRange) return false;
            const existingFile = existingRange.documentId || existingRange.filename || '';
            const nextFile = nextRange.documentId || nextRange.filename || '';
            if (existingFile !== nextFile) return false;

            const existingStart = Number(existingRange.start);
            const existingEnd = Number(existingRange.end);
            const nextStart = Number(nextRange.start);
            const nextEnd = Number(nextRange.end);
            if (Number.isFinite(existingStart) && Number.isFinite(existingEnd) &&
                Number.isFinite(nextStart) && Number.isFinite(nextEnd)) {
                return existingStart === nextStart && existingEnd === nextEnd;
            }

            const existingStartLine = Number(existingRange.startLine);
            const existingEndLine = Number(existingRange.endLine);
            const nextStartLine = Number(nextRange.startLine);
            const nextEndLine = Number(nextRange.endLine);
            return Number.isFinite(existingStartLine) && Number.isFinite(existingEndLine) &&
                Number.isFinite(nextStartLine) && Number.isFinite(nextEndLine) &&
                existingStartLine === nextStartLine && existingEndLine === nextEndLine;
        };
        
        // 添加到现有对齐关系
        const addToAlignment = async (alignment) => {
            if (!currentSelection.value || !alignment) return;

            if (currentSelection.value.type === 'code') {
                const { start, end, startLine, endLine } = await resolveCodeSelectionRange(currentSelection.value);

                const codeRange = {
                    documentId: currentSelection.value.documentId,
                    filename: currentSelection.value.documentId, // 文件名
                    start: start,
                    end: end,
                    startLine: startLine, // 起始行号
                    endLine: endLine, // 结束行号
                    content: currentSelection.value.content
                };
                
                if ((alignment.codeRanges || []).some(range => isSameRangeEntry(range, codeRange))) {
                    showCodeSelectionDialog.value = false;
                    resetManualAlignFromBlock();
                    currentSelection.value = null;
                    ElMessage.info('该代码块已存在于当前对齐关系中');
                    return;
                }

                alignment.codeRanges.push(codeRange);
            }

            showCodeSelectionDialog.value = false;
            resetManualAlignFromBlock();
            
            // 保存当前选择信息，因为稍后会清空currentSelection
            const selectionInfo = currentSelection.value;
            currentSelection.value = null;

            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(selectedDocFile.value)}&kind=doc&project_id=${projectId}`,
                    alignment
                );
                
                // 更新所有对齐数据以保持统计信息同步
                await fetchAllAlignments();
                await fetchAlignments();
                await fetchAlignmentSidebarPage(false, alignType.value);
                await fetchSidebarBlocksPage(false);
                
                ElMessage.success('已添加到对齐关系');
            } catch (err) {
                console.error("Error updating alignment:", err);
                ElMessage.error(`更新对齐关系失败: ${err.message}`);
            }
        };

        // 添加需求范围到现有对齐关系
        const addDocToAlignment = async (alignment) => {
            if (!currentSelection.value || !alignment) return;

            const { start, end, startLine, endLine } = await resolveDocSelectionRange(currentSelection.value);

            const docRange = {
                documentId: currentSelection.value.documentId,
                filename: currentSelection.value.documentId, // 文件名
                start: start,
                end: end,
                startLine: startLine, // 起始行号
                endLine: endLine, // 结束行号
                content: currentSelection.value.content
            };
            
            if ((alignment.docRanges || []).some(range => isSameRangeEntry(range, docRange))) {
                showAlignmentDialog.value = false;
                resetManualAlignFromBlock();
                currentSelection.value = null;
                ElMessage.info('该需求块已存在于当前对齐关系中');
                return;
            }

            alignment.docRanges.push(docRange);
            
            showAlignmentDialog.value = false;
            resetManualAlignFromBlock();
            
            // 保存当前选择信息，因为稍后会清空currentSelection
            const selectionInfo = currentSelection.value;
            currentSelection.value = null;

            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(selectedDocFile.value)}&kind=doc&project_id=${projectId}`,
                    alignment
                );
                
                // 更新所有对齐数据以保持统计信息同步
                await fetchAllAlignments();
                await fetchAlignments();
                await fetchAlignmentSidebarPage(false, alignType.value);
                await fetchSidebarBlocksPage(false);
                
                ElMessage.success('已添加到对齐关系');
            } catch (err) {
                console.error("Error updating alignment:", err);
                ElMessage.error(`更新对齐关系失败: ${err.message}`);
            }
        };

        const addToSelectedExistingAlignment = async () => {
            if (!selectedExistingAlignmentId.value) {
                ElMessage.warning('请选择要添加到的对齐关系');
                return;
            }

            const alignment = currentExistingAlignments.value.find(
                item => item.id === selectedExistingAlignmentId.value
            );
            if (!alignment) {
                ElMessage.warning('所选对齐关系不存在，请重新选择');
                return;
            }

            if (currentSelection.value?.type === 'code') {
                await addToAlignment(alignment);
                return;
            }

            await addDocToAlignment(alignment);
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
            selectedFolderHandle: null,
            filterStatuses: ['confirmed', 'false_positive', 'unconfirmed'],  // 状态筛选
            onlySelected: false                                              // 仅导出勾选项
        });

        // 计算当前筛选条件下将导出的问题单数量
        const getExportableIssues = () => {
            let result = [...issues.value];

            // 如果启用"仅导出勾选项"
            if (exportForm.value.onlySelected && selectedIssueIds.value.size > 0) {
                result = result.filter(i => selectedIssueIds.value.has(i.id));
            }

            // 按状态筛选
            const statuses = exportForm.value.filterStatuses || [];
            if (statuses.length > 0) {
                result = result.filter(i => {
                    const s = i.status || 'unconfirmed';
                    return statuses.includes(s);
                });
            }

            return result;
        };

        // 导出数量提示文本
        const getExportCountText = () => {
            const count = getExportableIssues().length;
            const total = issues.value.length;
            if (exportForm.value.onlySelected && selectedIssueIds.value.size > 0) {
                return `当前将导出 ${count} 条问题单（从已勾选的 ${selectedIssueIds.value.size} 条 + 状态筛选得出）。`;
            }
            if (count === total) {
                return `当前将导出全部 ${total} 条问题单。`;
            }
            return `当前将导出 ${count} 条问题单（共 ${total} 条，按状态筛选）。`;
        };

        // 一键导出所有问题单
        const exportAllIssues = async () => {
            if (issues.value.length === 0) {
                ElMessage.warning('没有问题单可导出');
                return;
            }
            // 预设：导出全部，状态全选，不限定勾选
            exportForm.value.filterStatuses = ['confirmed', 'false_positive', 'unconfirmed'];
            exportForm.value.onlySelected = false;
            showExportDialog.value = true;
        };

        // 打开导出对话框（按状态筛选模式）
        const openExportDialog = () => {
            // 默认全选状态，不限定勾选
            if (!exportForm.value.filterStatuses || exportForm.value.filterStatuses.length === 0) {
                exportForm.value.filterStatuses = ['confirmed', 'false_positive', 'unconfirmed'];
            }
            exportForm.value.onlySelected = selectedIssueIds.value.size > 0;
            showExportDialog.value = true;
        };

        // 确认导出
        const confirmExport = async () => {
            try {
                const exportableIssues = getExportableIssues();

                if (exportableIssues.length === 0) {
                    ElMessage.warning('没有符合条件的问题单可导出');
                    return;
                }

                // 调用后端API生成docx文件
                const response = await axios.post('/project/export-issues-download', {
                    issues: exportableIssues,
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
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    // 调用后端API删除项目
                    const response = await axios.delete('/project/delete', {
                        data: {path: projectPath.value, project_id: projectId}
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
        const selectedIssueIds = ref(new Set());

        const isIssueSelected = (issue) => {
            return selectedIssueIds.value.has(issue.id);
        };

        const allIssuesSelected = computed(() => {
            return issues.value.length > 0 && issues.value.every(i => selectedIssueIds.value.has(i.id));
        });

        const someIssuesSelected = computed(() => {
            if (issues.value.length === 0) return false;
            const selectedCount = issues.value.filter(i => selectedIssueIds.value.has(i.id)).length;
            return selectedCount > 0 && selectedCount < issues.value.length;
        });

        const toggleIssueSelection = (issue) => {
            const newSet = new Set(selectedIssueIds.value);
            if (newSet.has(issue.id)) {
                newSet.delete(issue.id);
            } else {
                newSet.add(issue.id);
            }
            selectedIssueIds.value = newSet;
        };

        const selectAllIssues = () => {
            if (allIssuesSelected.value) {
                selectedIssueIds.value = new Set();
            } else {
                selectedIssueIds.value = new Set(issues.value.map(i => i.id));
            }
        };

        const selectIssue = (issue) => {
            selectedIssue.value = issue;
            // 切换多选状态
            toggleIssueSelection(issue);
        };

        const syncIssueStatusLocally = (issueId, newStatus) => {
            const idx = issues.value.findIndex(i => i.id === issueId);
            if (idx > -1) {
                const updatedIssue = { ...issues.value[idx], status: newStatus };
                issues.value.splice(idx, 1, updatedIssue);
                if (selectedIssue.value && selectedIssue.value.id === issueId) {
                    selectedIssue.value = updatedIssue;
                }
                return updatedIssue;
            }

            if (selectedIssue.value && selectedIssue.value.id === issueId) {
                selectedIssue.value = { ...selectedIssue.value, status: newStatus };
                return selectedIssue.value;
            }

            return null;
        };

        const confirmIssue = async () => {
            const selectedIds = Array.from(selectedIssueIds.value);
            if (selectedIds.length === 0) {
                if (!selectedIssue.value) {
                    ElMessage.warning('请先选择一个问题单。');
                    return;
                }
                // 单条确认（向后兼容）
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    const updatedIssue = { ...selectedIssue.value, status: 'confirmed' };
                    const response = await axios.put(
                        `/project/issues/${selectedIssue.value.id}?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`,
                        updatedIssue
                    );

                    if (response.data.status === 'success') {
                        syncIssueStatusLocally(selectedIssue.value.id, 'confirmed');
                    } else {
                        ElMessage.error('确认失败：' + response.data.message);
                    }
                } catch (error) {
                    console.error('Error confirming issue:', error);
                    ElMessage.error('确认失败：' + (error.response?.data?.message || error.message));
                }
                return;
            }

            // 批量确认
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.post(
                    `/project/issues/batch-update?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`,
                    { issue_ids: selectedIds, status: 'confirmed' }
                );

                if (response.data.status === 'success') {
                    selectedIds.forEach(id => syncIssueStatusLocally(id, 'confirmed'));
                    selectedIssueIds.value = new Set();
                    ElMessage.success(`已确认 ${response.data.updated_count} 条问题单`);
                } else {
                    ElMessage.error('批量确认失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error batch confirming issues:', error);
                ElMessage.error('批量确认失败：' + (error.response?.data?.message || error.message));
            }
        };

        // 将选中的问题单标记为误报
        const markFalsePositive = async () => {
            const selectedIds = Array.from(selectedIssueIds.value);
            if (selectedIds.length === 0) {
                if (!selectedIssue.value) {
                    ElMessage.warning('请先选择一个问题单。');
                    return;
                }
                // 单条标记（向后兼容）
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    const updatedIssue = { ...selectedIssue.value, status: 'false_positive' };
                    const response = await axios.put(
                        `/project/issues/${selectedIssue.value.id}?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`,
                        updatedIssue
                    );

                    if (response.data.status === 'success') {
                        syncIssueStatusLocally(selectedIssue.value.id, 'false_positive');
                    } else {
                        ElMessage.error('标记失败：' + response.data.message);
                    }
                } catch (error) {
                    console.error('Error marking false positive:', error);
                    ElMessage.error('标记失败：' + (error.response?.data?.message || error.message));
                }
                return;
            }

            // 批量标记
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.post(
                    `/project/issues/batch-update?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`,
                    { issue_ids: selectedIds, status: 'false_positive' }
                );

                if (response.data.status === 'success') {
                    selectedIds.forEach(id => syncIssueStatusLocally(id, 'false_positive'));
                    selectedIssueIds.value = new Set();
                    ElMessage.success(`已标记 ${response.data.updated_count} 条问题单为误报`);
                } else {
                    ElMessage.error('批量标记失败：' + response.data.message);
                }
            } catch (error) {
                console.error('Error batch marking false positive:', error);
                ElMessage.error('批量标记失败：' + (error.response?.data?.message || error.message));
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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const updatedIssue = { ...issue, status: newStatus };
                const response = await axios.put(
                    `/project/issues/${issue.id}?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`,
                    updatedIssue
                );

                if (response.data.status === 'success') {
                    const syncedIssue = syncIssueStatusLocally(issue.id, newStatus);
                    if (syncedIssue) {
                        issue.status = syncedIssue.status;
                    } else {
                        issue.status = newStatus;
                    }
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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.delete(
                    `/project/issues/${selectedIssue.value.id}?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`
                );

                if (response.data.status === 'success') {
                    const idx = issues.value.findIndex(i => i.id === selectedIssue.value.id);
                    if (idx > -1) issues.value.splice(idx, 1);
                    selectedIssue.value = null;
                    selectedIssueIds.value = new Set();
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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.delete(
                    `/project/issues/${selectedIssue.value.id}?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`
                );

                if (response.data.status === 'success') {
                    const index = issues.value.indexOf(selectedIssue.value);
                    if (index > -1) {
                        issues.value.splice(index, 1);
                    }
                    selectedIssue.value = null;
                    selectedIssueIds.value = new Set();
                    ElMessage.info('问题单已忽略。');
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
        const openAlignmentDirectionDialog = (mode) => {
            alignmentDirectionMode.value = mode;
            showAlignmentDirectionDialog.value = true;
        };

        const toggleAutoAlignment = async () => {

            if (isAutoAligning.value) {
                if (!AlignTaskId.value) return;

                try {
                    await axios.post(`/api/stop-task/${AlignTaskId.value}`)
                    clearInterval(pollingTimer.value)
                    pollingTimer.value = null
                    isAutoAligning.value = false;
                    stopProgress();
                    clearTaskState()
                    ElMessage.info('已停止自动对齐');
                } catch (err) {
                    ElMessage.warning(`停止失败: ${err.message}`);
                }
            } else {
                openAlignmentDirectionDialog('auto');
            }
        };

        const toggleAutoReview = async (reviewType) => {
            if (isAutoReviewing.value) {
                // 停止审查
                await axios.post(`/api/stop-task/${ReviewTaskId.value}`)
                clearInterval(pollingTimerReview.value)
                pollingTimerReview.value = null
                isAutoReviewing.value = false;
                reviewProgress.value = { current: 0, total: 0 };
                // 停止进度显示
                stopProgress();
                clearReviewTaskState()
                ElMessage.info('已停止自动审查');
            } else {

                showReview.value = false;
                // 开始审查
                await startAutoReview(reviewType);
            }
        };

        /***********************
         * 重新对齐和重新审查功能
         ***********************/
        const doRestartAlignment = async (direction) => {
            if (alignmentDirectionMode.value === 'auto') {
                await fetchAlignments();
                await startAutoAlignmentWithDirection(direction);
            } else if (alignmentDirectionMode.value === 'restart') {
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    const response = await axios.post('/api/clear-code-ranges', {
                        projectPath: projectPath.value,
                        project_id: projectId
                    });

                    if (response.data.status === 'success') {
                        removeAllHighlights();
                        await fetchAlignments();
                        await startAutoAlignmentWithDirection(direction);
                    } else {
                        throw new Error(response.data.message || '清除代码范围失败');
                    }
                } catch (error) {
                    console.error('重新对齐失败:', error);
                    ElMessage.error(`重新对齐失败: ${error.message}`);
                }
            }


        };

        const restartAlignment = async () => {
            if (isAutoAligning.value) {
                ElMessage.warning('当前正在自动对齐，请先停止');
                return;
            }
            openAlignmentDirectionDialog('restart');
        };

        const restartReview = async (reviewType) => {
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
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    // 调用后端清除审查结果
                    const response = await axios.post('/api/clear-review-results', {
                        projectPath: projectPath.value,
                        project_id: projectId,
                        reviewType: reviewType || ''
                    });
                    
                    if (response.data.status === 'success') {
                        // 清空前端审查相关状态
                        issues.value = [];
                        selectedIssue.value = null;
                        selectedIssueIds.value = new Set();
                        
                        // 重新获取对齐数据（更新审查状态）
                        // await fetchAllAlignments(); // 移除 fetchAllAlignments 调用
                        await fetchAlignments();
                                                
                        // 开始自动审查
                        await startAutoReview(reviewType);
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
            selectedBlock: null,
            selectedBlockType: null,
        });

        const showContextMenu = (event, alignment, block = null, blockType = null) => {
            // 触发左键选中逻辑
            handleAlignmentItemClick(alignment);

            contextMenu.value.visible = true;
            contextMenu.value.selectedAlignment = alignment;
            contextMenu.value.selectedBlock = block;
            contextMenu.value.selectedBlockType = blockType;

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

        const showBlockContextMenu = (event, block, blockType) => {
            contextMenu.value.visible = true;
            contextMenu.value.selectedAlignment = null;
            contextMenu.value.selectedBlock = block;
            contextMenu.value.selectedBlockType = blockType;

            nextTick(() => {
                const menuElement = document.querySelector('.context-menu');
                if (!menuElement) return;

                const menuRect = menuElement.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                let left = event.clientX;
                let top = event.clientY;

                if (left + menuRect.width > viewportWidth) {
                    left = event.clientX - menuRect.width;
                }
                if (top + menuRect.height > viewportHeight) {
                    top = event.clientY - menuRect.height;
                }

                contextMenu.value.left = Math.max(0, left);
                contextMenu.value.top = Math.max(0, top);
            });

            document.addEventListener('click', hideContextMenu);
        };

        const hideContextMenu = () => {
            contextMenu.value.visible = false;
            //contextMenu.value.selectedAlignment = null;
            //contextMenu.value.selectedBlock = null;
            //contextMenu.value.selectedBlockType = null;
            // 移除监听器，避免内存泄漏
            document.removeEventListener('click', hideContextMenu);
        };

        const getAlignmentDirectionByType = (alignment) => {
            return alignment?.align_type === 'code2req' ? 'code-to-doc' : 'doc-to-code';
        };

        const refreshAlignmentAndBlockViews = async (blockTypeForMenu = null) => {
            await fetchAllAlignments();
            await fetchAlignments();
            await fetchAlignmentSidebarPage(false, alignType.value);
            await fetchSidebarBlocksPage(false);

            if (blockTypeForMenu === 'doc') {
                await loadAndRenderDocBlocks(true);
            } else if (blockTypeForMenu === 'code') {
                await loadAndRenderCodeBlocks(true);
            }
        };

        const requestClearAlignmentTarget = async (alignmentId) => {
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project_id');
            const response = await axios.post('/api/clear-alignment-target', {
                projectPath: projectPath.value,
                alignmentId,
                project_id: projectId
            });
            if (response.data?.status !== 'success') {
                throw new Error(response.data?.message || '清空手动对齐失败');
            }
            return response.data.data || null;
        };

        const clearAlignmentTargetFromContextMenu = async () => {
            const alignment = contextMenu.value.selectedAlignment;
            if (!alignment) return;

            const targetLabel = alignment.align_type === 'code2req' ? '需求块' : '代码块';
            try {
                await ElMessageBox.confirm(
                    `确定要删除 "${alignment.name}" 中的${targetLabel}吗？删除后会保留源块，并清空该条对齐关系的审查结果。`,
                    '删除对齐结果',
                    {
                        confirmButtonText: '确定',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }
                );
                await requestClearAlignmentTarget(alignment.id);
                hideContextMenu();
                await refreshAlignmentAndBlockViews(alignment.align_type === 'code2req' ? 'doc' : 'code');
                ElMessage.success('已删除对齐结果结果');
            } catch (error) {
                if (error === 'cancel' || error === 'close') return;
                ElMessage.error(`删除对齐结果失败: ${error.message}`);
            }
        };

        const restartSelectedAlignmentFromContextMenu = async () => {
            const alignment = contextMenu.value.selectedAlignment;
            if (!alignment) return;
            try {
                await ElMessageBox.confirm(
                    `确定要重新对齐 "${alignment.name}" 吗？这会先清空目标侧块与审查结果，再按当前方向重新对齐。`,
                    '重新对齐',
                    {
                        confirmButtonText: '确定',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }
                );
                const clearedAlignmentData = await requestClearAlignmentTarget(alignment.id);
                hideContextMenu();
                await performSingleAlignment(
                    {
                        ...alignment,
                        ...(clearedAlignmentData || {}),
                        isReviewed: false,
                        reviewThoughts: ''
                    },
                    getAlignmentDirectionByType(alignment),
                    ''
                );
            } catch (error) {
                if (error === 'cancel' || error === 'close') return;
                ElMessage.error(`重新对齐失败: ${error.message}`);
            }
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
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    await axios.post(
                        `/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(selectedDocFile.value)}&kind=doc&project_id=${projectId}`,
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

            ElMessageBox.confirm(`确定要取消对齐关系 "${alignmentToDelete.name}" 吗？`, '取消对齐', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(async () => {
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    await axios.delete(`/project/alignment?path=${encodeURIComponent(projectPath.value)}&id=${alignmentToDelete.id}&project_id=${projectId}`);
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
                        
                        ElMessage.info('对齐关系已取消。');
                    }
                } catch (err) {
                    console.error("Error deleting alignment:", err);
                    ElMessage.error(`删除失败: ${err.message}`);
                }
            }).catch(() => { });
        };
        
        
        //==========调整提示词的功能=============
        
         // 执行操作（使用 currentPrompt）
        async function SetPrompt() {
          // 1. 先弹出提示词设置对话框
          showPromptDialog.value = true
          // 2. 加载默认提示词
          await loadDefaultPrompt()
        }
        
        // 可选：在组件挂载时自动恢复
        onMounted(() => {
          // 如果需要默认页是“对齐”，可以设置
          innerActiveA.value = 'req-code-align'
          innerActiveB.value = 'req-code-align-kbs'
          loadDefaultPrompt()
          // restoreTaskState()
          // restoreReviewTaskState()

          //读取localStorage 里存的是哪个项目
          const alignRaw = localStorage.getItem(STORAGE_ALIGN_KEY())
          const reviewRaw = localStorage.getItem(STORAGE_REVIEW_KEY())
          let savedProjectId = ''
          if (alignRaw || reviewRaw) {
            try {
                const state = JSON.parse(alignRaw) || JSON.parse(reviewRaw)
                savedProjectId = state.projectId || ''
            } catch {}
          }

          const currentProjectId = getProjectId()

          //如果项目变了, 强制清掉上一个项目的定时器和状态
          if (savedProjectId && savedProjectId !== currentProjectId) {
            forceResetState()
            forceResetReviewState()
            // clearTaskState()
          }
          // 恢复当前项目的任务
          restoreTaskState()
          restoreReviewTaskState()
        })

        onBeforeUnmount(() => {
         // 页面关闭时清理轮询
         if (pollingTimer.value){
             clearInterval(pollingTimer.value)
             pollingTimer.value = null
             clearInterval(pollingTimerReview.value)
             pollingTimerReview.value = null
         }
        })

        // 从后端加载
        const loadDefaultPrompt = async () => {
          const normalizePrompt = (value) => (typeof value === 'string' ? value : '')
          try {
            const res = await axios.get('/get_prompts')
            //console.log(res)
            const data = await res.data
            const req2Code = normalizePrompt(data.Req2CodeAlign)
            const code2Req = normalizePrompt(data.Code2ReqAlign)
            const review = normalizePrompt(data.review)
            const reviewCode = normalizePrompt(data.reviewCode)
            const req2CodeKbs = normalizePrompt(data.Req2CodeAlignKbs)
            const code2ReqKbs = normalizePrompt(data.Code2ReqAlignKbs)
            const reviewKbs = normalizePrompt(data.reviewKbs)
            const reviewCodeKbs = normalizePrompt(data.reviewCodeKbs)

            if (req2Code) defaultReq2CodeAlignPrompt.value = req2Code
            if (code2Req) defaultCode2ReqAlignPrompt.value = code2Req
            if (review) defaultReviewPrompt.value = review
            if (reviewCode) defaultCodeReviewPrompt.value = reviewCode
            if (req2CodeKbs) defaultReq2CodeAlignPromptKbs.value = req2CodeKbs
            if (code2ReqKbs) defaultCode2ReqAlignPromptKbs.value = code2ReqKbs
            if (reviewKbs) defaultReviewPromptKbs.value = reviewKbs
            if (reviewCodeKbs) defaultCodeReviewPromptKbs.value = reviewCodeKbs

            currentReq2CodeAlignPrompt.value = req2Code || defaultReq2CodeAlignPrompt.value
            currentCode2ReqAlignPrompt.value = code2Req || defaultCode2ReqAlignPrompt.value
            currentReviewPrompt.value = review || defaultReviewPrompt.value
            currentCodeReviewPrompt.value = reviewCode || defaultReviewPrompt.value
            currentReq2CodeAlignPromptKbs.value = req2CodeKbs || defaultReq2CodeAlignPromptKbs.value
            currentCode2ReqAlignPromptKbs.value = code2ReqKbs || defaultCode2ReqAlignPromptKbs.value
            currentReviewPromptKbs.value = reviewKbs || defaultReviewPromptKbs.value
            currentCodeReviewPromptKbs.value = reviewCodeKbs || defaultCodeReviewPromptKbs.value
          } catch (err) {
            console.error('Error loading prompts:', err)
            currentReq2CodeAlignPrompt.value = defaultReq2CodeAlignPrompt.value
            currentCode2ReqAlignPrompt.value = defaultCode2ReqAlignPrompt.value
            currentReviewPrompt.value = defaultReviewPrompt.value
            currentCodeReviewPrompt.value = defaultCodeReviewPrompt.value
            currentReq2CodeAlignPromptKbs.value = defaultReq2CodeAlignPromptKbs.value
            currentCode2ReqAlignPromptKbs.value = defaultCode2ReqAlignPromptKbs.value
            currentReviewPromptKbs.value = defaultReviewPromptKbs.value
            currentCodeReviewPromptKbs.value = defaultCodeReviewPromptKbs.value
          }
        }

        // 恢复默认（调用后端 API）
        const restorePromptDefault = async () => {
          const outerTab = outerActive.value
          let tab = ''
          if (outerTab === 'moduleA') {
            tab = innerActiveA.value
          } else {
            tab = innerActiveB.value
          }
          try {
            const res = await fetch('/restore_default', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tab })
            })
            const data = await res.json()

            // 根据当前 tab 更新对应输入框
            if (tab === 'req-code-align') {
              currentReq2CodeAlignPrompt.value = data.default_prompt
            } 
            else if (tab === 'code-req-align'){
              currentCode2ReqAlignPrompt.value = data.default_prompt
            }
            else if (tab === 'review') {
              currentReviewPrompt.value = data.default_prompt
            }
            else if (tab === 'review-code') {
              currentCodeReviewPrompt.value = data.default_prompt
            }
            else if (tab === 'req-code-align-kbs'){
              currentReq2CodeAlignPromptKbs.value = data.default_prompt
            }
            else if (tab === 'code-req-align-kbs'){
              currentCode2ReqAlignPromptKbs.value = data.default_prompt
            }
            else if (tab === 'review-kbs'){
              currentReviewPromptKbs.value = data.default_prompt
            }
            else if (tab === 'review-code-kbs'){
              currentCodeReviewPromptKbs.value = data.default_prompt
            }

            ElMessage.success('已恢复默认提示词')
          } catch (err) {
            ElMessage.error('恢复失败')
          }
        }
        
        // 保存
        const savePrompt = async () => {
          const outerTab = outerActive.value
          let tab = ''
          if (outerTab === 'moduleA') {
            tab = innerActiveA.value
          } else {
            tab = innerActiveB.value
          }
          //const content = tab === 'req-code-align' ? currentReq2CodeAlignPrompt.value : currentCode2ReqAlignPrompt : currentReviewPrompt.value
          let content = ''
          if (tab === 'req-code-align') {
              content = currentReq2CodeAlignPrompt.value
            } 
            else if (tab === 'code-req-align'){
              content = currentCode2ReqAlignPrompt.value
            }
            else if (tab === 'review'){
              content = currentReviewPrompt.value
            }
            else if (tab === 'review-code'){
              content = currentCodeReviewPrompt.value
            }
            else if (tab === 'req-code-align-kbs'){
              content = currentReq2CodeAlignPromptKbs.value
            }
            else if (tab === 'code-req-align-kbs'){
              content = currentCode2ReqAlignPromptKbs.value
            }
            else if (tab === 'review-kbs'){
              content = currentReviewPromptKbs.value
            }
            else if (tab === 'review-code-kbs'){
              content = currentCodeReviewPromptKbs.value
            }

          try {
            const res = await fetch('/save_prompt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ outerTab, tab, content })
            })
            
            
            // 检查响应是否成功
            if (!res.ok) {
              throw new Error(`请求失败! status: ${res.status}`)
            }
            
            const data = await res.json()
              if (data && data.error) {
                throw new Error(data.error)
              }
            ElMessage.success('保存成功')
          } catch (err) {
            console.error('错误详情：', err)
            ElMessage.error('保存失败')
          }
        }
        
        // 打开弹窗
        const openPromptDialog = () => {
          showPromptDialog.value = true
          loadDefaultPrompt()
        }

        // 关闭弹窗
        const closePromptModal = () => {
          showPromptDialog.value = false
        }  
        //=====================================================
        
        
        //==========调整附加的对齐提示词的功能=============
        
        // 复制预设文字
        const copyAndClose = (text) => {
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
              .then(() => {
                ElMessage.success('已复制: ' + text)
              })
              .catch(() => {
                // 降级
                const input = document.createElement('input')
                input.value = text
                document.body.appendChild(input)
                input.select()
                document.execCommand('copy')
                document.body.removeChild(input)
                ElMessage.success('已复制: ' + text)
              })
          } else {
            // 降级
            const input = document.createElement('input')
            input.value = text
            document.body.appendChild(input)
            input.select()
            document.execCommand('copy')
            document.body.removeChild(input)
            ElMessage.success('已复制: ' + text)
          }
        }
        
        
        // 执行对齐操作（使用 currentPrompt）
        async function PromptAlignment() {
          // 1. 先弹出提示词设置对话框
          showAlignPromptDialog.value = true
          // 2. 加载默认提示词
          //await loadDefaultAlignPrompt()
        }
        
        
        // 备用，可改成从后端加载
         const loadDefaultAlignPrompt = async () => {
          try {
            AddAlignPrompt.value = "现在的对齐结果是错误的"
          } catch (err) {
            console.error('Error loading prompts:', err)
          }
        }

        // 关闭对话框
        function closeAlignPromptModal() {
          showAlignPromptDialog.value = false
        }

        // 执行对齐（在应用后）
        async function executeAlignment() {
          // 1. 获取用户的输入
          const userPrompt= AddAlignPrompt.value;
          // 
          await closeAlignPromptModal()
          // 2. 执行对齐逻辑
          await singleAlignment(userPrompt)
        }
        //=======================
        
        // 单独对齐功能
        const singleAlignment = async (userPrompt) => {
            if (!contextMenu.value.selectedAlignment) return;
            const alignment = contextMenu.value.selectedAlignment;
            ElMessageBox({
                title:'选择对齐方向',
                message: `对齐操作将清除"${alignment.name}" 当前已有的对齐和审查结果。\n\n请选择以哪一方为基准进行对齐：`,
                showCancelButton: true,
                confirmButtonText: '代码 -> 需求',
                cancelButtonText: '需求 -> 代码',
                distinguishCancelAndClose: true,
                type: 'warning',
                closeOnClickModal: true,
                closeOnPressEscape: true
            })
            .then(async ()=>{
                await performSingleAlignment(alignment, 'code-to-doc', userPrompt);
            })
            .catch(async (action) =>{
                if(action === 'cancel'){
                    await performSingleAlignment(alignment, 'doc-to-code', userPrompt);
                }
            });
        };

        // 执行单独对齐
        const performSingleAlignment = async (alignment, direction, userPrompt) => {
            try {
                
                const ready = await ensureDecompositionReady();
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                if (!ready) return;

                if (alignment.isReviewed) {
                    await axios.post('/api/clear-alignment-review', {
                        projectPath: projectPath.value,
                        alignmentId: alignment.id,
                        project_id: projectId
                    });
                }

                const updatedAlignment = {
                    ...alignment,
                    isReviewed: false,
                    reviewThoughts: ''
                };
                // 需求-代码方向
                if (direction === 'doc-to-code') {
                    //console.log("用户输入的提示词是：", userPrompt)
                    //return;
                    // 0. 代码摘要，先存入数据库
                    ElMessage.warning('正在进行代码摘要...');
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    const abstractResponse = await axios.get('/api/get-code-abstract', {
                        params: { projectPath: projectPath.value, project_id: projectId }
                    });
                    const codeFileAbstract = abstractResponse.data.status === 'success' ? abstractResponse.data.data : {};
                    
                    // 1. 调用后端对齐接口
                    const alignResponse = await axios.post('/api/align-requirement-to-project-addprompt', {
                        docRanges: updatedAlignment.docRanges || [],
                        codeRanges: updatedAlignment.codeRanges || [],
                        codeFileAbstract: codeFileAbstract,
                        projectPath: projectPath.value,
                        userInputPrompt: userPrompt,  //增加用户的输入作为提示词
                        project_id: projectId
                    });
                    
                    /* const alignResponse = await axios.post('/api/align-requirement-to-project', {
                        docRanges: updatedAlignment.docRanges || [],
                        projectPath: projectPath.value
                    }); */
                    
                    
                    if (!alignResponse.data || alignResponse.data.status !== 'success') {
                        throw new Error(alignResponse.data?.message || '需求 → 代码 对齐失败');
                    }
                    updatedAlignment.codeRanges = alignResponse.data.codeRanges || [];
                }
                // 代码-需求方向
                else {
                    //console.log("用户输入的提示词是：", userPrompt)
                    const alignResponse = await axios.post('/api/align-code-to-requirement-addprompt', {
                        codeRanges: updatedAlignment.codeRanges || [],
                        projectPath: projectPath.value,
                        userInputPrompt: userPrompt,  //增加用户的输入作为提示词
                        project_id: projectId,
                        docRanges: updatedAlignment.docRanges || [],
                    });
                    if (!alignResponse.data || alignResponse.data.status !== 'success') {
                        throw new Error(alignResponse.data?.message || '代码 → 需求 对齐失败');
                    }
                    updatedAlignment.docRanges = alignResponse.data.docRanges || [];
                }
                //urlParams = new URLSearchParams(window.location.search);
                //project_Id = urlParams.get('project_id');
                // 状态改为已对齐
                updatedAlignment.is_alignment = 1
                await axios.post(`/project/alignments?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`, updatedAlignment);
                console.error('projectId:', projectId);
                // 刷新对齐数据
                await refreshAlignmentAndBlockViews(direction === 'doc-to-code' ? 'code' : 'doc');
                refreshFilteredAlignments();
                
//                ElMessage.success(`"${alignment.name}" 对齐完成！`);
                ElMessageBox.alert(`"${alignment.name}" 对齐完成！`, '提示', {
                        confirmButtonText: '知道了',
                        type: 'success'
                    });
            } catch (error) {
                console.error('单独对齐失败:', error);
//                ElMessage.error(`对齐失败: ${error.message}`);
                ElMessageBox.alert(`对齐失败: ${error.message}`, '提示', {
                        confirmButtonText: '知道了',
                        type: 'error'
                    });
            }
        };
        
        
        //==========调整附加的审查提示词的功能=============
        
        // 执行审查操作（使用 currentPrompt）
        async function PromptReview() {
          // 1. 先弹出提示词设置对话框
          showReviewPromptDialog.value = true
          // 2. 加载默认提示词
           //await loadDefaultReviewPrompt()
        }
        
        // 备用，可改成从后端加载
         const loadDefaultReviewPrompt = async () => {
          try {
            AddReviewPrompt.value = "现在的审查结果是错误的"
          } catch (err) {
            console.error('Error loading prompts:', err)
          }
        }

        // 关闭对话框
        function closeReviewPromptModal() {
          showReviewPromptDialog.value = false
        }

        // 执行审查（在应用后）
        async function executeReview(promptType) {
          // 1. 获取用户的输入
          const userPrompt= AddReviewPrompt.value;

          // 2. 执行对齐逻辑
          await singleReview(userPrompt, promptType)

          // 3. 关闭弹窗
          showSingleReview.value = false
        }
        //=======================
        
        
        // 单独审查功能
        const singleReview = async (userPrompt, promptType) => {
            if (!contextMenu.value.selectedAlignment) return;
                const alignment = contextMenu.value.selectedAlignment;
            if (!promptType){
                // 检查是否有代码对齐
                if (!alignment.codeRanges || alignment.codeRanges.length === 0) {
                    ElMessage.warning('该对齐关系还没有代码对齐，请先进行对齐');
                    return;
                }
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
                        const urlParams = new URLSearchParams(window.location.search);
                        const projectId = urlParams.get('project_id');
                        // First clear previous review results for this alignment
                        const resp = await axios.post('/api/clear-alignment-review', {
                            projectPath: projectPath.value,
                            docFile: selectedDocFile.value,
                            alignmentId: alignment.id,
                            project_id: projectId
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
                        await performSingleReview(alignment, userPrompt, promptType);
                    } catch (err) {
                        console.error('清理并重新审查失败:', err);
                        ElMessage.error(`清理或重新审查失败: ${err.message}`);
                    }
                }).catch(() => {});
            } else {
                await performSingleReview(alignment, userPrompt, promptType);
            }
        };

        // 执行单独审查
        const performSingleReview = async (alignment, userPrompt, promptType) => {
            try {
                ElMessage.info(`开始为 "${alignment.name}" 进行审查...`);
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                // 调用后端审查API
                await axios.post('/api/review-alignment-addprompt', {
                    projectPath: projectPath.value,
                    docFile: selectedDocFile.value,
                    alignment: alignment,
                    project_id: projectId,
                    userInputPrompt: userPrompt, //增加用户的输入作为提示词
                    promptType: promptType
                });
                
                
               /*  await axios.post('/api/review-alignment', {
                    projectPath: projectPath.value,
                    docFile: selectedDocFile.value,
                    alignment: alignment
                }); */
                
                // 刷新对齐数据
                await fetchAlignments();
                await fetchAllAlignments();
                await fetchIssues();
                
                //ElMessage.success(`"${alignment.name}" 审查完成！`);
                ElMessageBox.alert(`"${alignment.name}" 审查完成！`, '提示', {
                        confirmButtonText: '知道了',
                        type: 'success'
                    });
            } catch (error) {
                console.error('单独审查失败:', error);
//                ElMessage.error(`审查失败: ${error.message}`);
                ElMessageBox.alert(`审查失败: ${error.message}`, '提示', {
                        confirmButtonText: '知道了',
                        type: 'error'
                    });
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
                        const urlParams = new URLSearchParams(window.location.search);
                        const projectId = urlParams.get('project_id');
                        await axios.delete(`/project/alignment?path=${encodeURIComponent(projectPath.value)}&id=${alignment.id}&project_id=${projectId}`);
                        alignmentResults.value.splice(idx, 1);
                        await fetchAlignments(); // Fetch alignments again to sync state
                    } catch (err) {
                        console.error("Error deleting alignment:", err);
                        ElMessage.error(`删除失败: ${err.message}`);
                    }
                }
            } else {
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    await axios.post(
                        `/project/alignments?path=${encodeURIComponent(projectPath.value)}&file=${encodeURIComponent(selectedDocFile.value)}&kind=doc&project_id=${projectId}`,
                        alignment
                    );
                    // 重新获取对齐关系以更新状态
                    await fetchAlignments();
                } catch (err) {
                    console.error("Error updating alignment:", err);
                    ElMessage.error(`更新失败: ${err.message}`);
                }
            }
            
            // 重新渲染块，以更新颜色（从对齐色变回分解色）
            if (type === 'doc') {
                await loadAndRenderDocBlocks(true); // Force reload to refresh highlights
            } else {
                await loadAndRenderCodeBlocks(true); // Force reload to refresh highlights
            }
            
            // 刷新筛选状态下的对齐列表
            // refreshFilteredAlignments();
        };

        const findDocBlockByRange = (rangeStart, rangeEnd) => {
            return (currentDocBlocksForHighlight.value || []).find(block =>
                block.filename === selectedDocFile.value &&
                block.start === rangeStart &&
                block.end === rangeEnd
            ) || null;
        };

        const findCodeBlockByRange = (rangeStart, rangeEnd) => {
            return (currentCodeBlocksForHighlight.value || []).find(block => {
                if (block.file !== selectedCodeFile.value) return false;
                if (!Array.isArray(block.range) || block.range.length !== 2) return false;
                const offsets = getOffsetsFromLineRange(selectedCodeRawContent.value || '', block.range[0], block.range[1]);
                return offsets.start === rangeStart && offsets.end === rangeEnd;
            }) || null;
        };

        const alignBlockFromContextMenu = async () => {
            const block = contextMenu.value.selectedBlock;
            const blockTypeForMenu = contextMenu.value.selectedBlockType;
            if (!block || !blockTypeForMenu) return;

            const id = generateUUIDLike();
            const newAlignment = {
                id: id,
                name: getBlockDisplayName(block, blockTypeForMenu),
                isReviewed: false,
                reviewThoughts: '',
                docRanges: [],
                codeRanges: []
            };

            if (blockTypeForMenu === 'doc') {
                const content = block.content || '';
                const docContent = await ensureCurrentRawFileContent('doc');
                const { startLine, endLine } = convertOffsetToLineNumbers(
                    docContent,
                    block.start,
                    block.end
                );
                newAlignment.docRanges.push({
                    documentId: block.filename,
                    filename: block.filename,
                    start: block.start,
                    end: block.end,
                    content: content,
                    startLine: startLine,
                    endLine: endLine
                });
            } else {
                const content = await ensureCurrentRawFileContent('code');
                const startLine = block.range[0];
                const endLine = block.range[1];
                const offsets = getOffsetsFromLineRange(content, startLine, endLine);
                newAlignment.codeRanges.push({
                    documentId: block.file,
                    filename: block.file,
                    start: offsets.start,
                    end: offsets.end,
                    startLine: startLine,
                    endLine: endLine,
                    content: block.code || block.content || ''
                });
            }

            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                await axios.post(
                    `/project/alignments?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`,
                    newAlignment
                );
                hideContextMenu();
                await refreshAlignmentAndBlockViews(blockTypeForMenu);

                // 复用已有单条对齐流程：需求块默认需求->代码，代码块默认代码->需求
                const direction = blockTypeForMenu === 'doc' ? 'doc-to-code' : 'code-to-doc';
                await performSingleAlignment(newAlignment, direction, '');
            } catch (error) {
                console.error('块对齐失败:', error);
                ElMessage.error(`块对齐失败: ${error.message}`);
            }
        };

        const manualAlignBlockFromContextMenu = async () => {
            const block = contextMenu.value.selectedBlock;
            const blockTypeForMenu = contextMenu.value.selectedBlockType;
            if (!block || !blockTypeForMenu) {
                ElMessage.warning('请从需求块或代码块上使用手动对齐');
                hideContextMenu();
                return;
            }

            try {
                if (blockTypeForMenu === 'doc') {
                    currentSelection.value = {
                        type: 'doc',
                        documentId: block.filename || block.documentId,
                        start: Number(block.start),
                        end: Number(block.end),
                        startLine: Number(block.startLine),
                        endLine: Number(block.endLine),
                        content: block.content || ''
                    };
                    manualAlignFromBlock.value = true;
                    newAlignmentName.value = '';
                    await ensureProjectAlignmentsLoaded();
                    hideContextMenu();
                    showAlignmentDialog.value = true;
                    return;
                }

                const range = Array.isArray(block.range) ? block.range : [];
                const selection = {
                    type: 'code',
                    documentId: block.file || block.filename,
                    start: Number(block.start),
                    end: Number(block.end),
                    startLine: Number(range[0] ?? block.startLine),
                    endLine: Number(range[1] ?? block.endLine),
                    content: block.code || block.content || ''
                };

                if (!(Number.isFinite(selection.start) && Number.isFinite(selection.end))) {
                    const codeFileContent = await getSelectionRawContent(selection);
                    const offsets = getOffsetsFromLineRange(codeFileContent, selection.startLine, selection.endLine);
                    selection.start = offsets.start;
                    selection.end = offsets.end;
                }

                currentSelection.value = selection;
                manualAlignFromBlock.value = true;
                newAlignmentName.value = '';
                await ensureProjectAlignmentsLoaded();
                hideContextMenu();
                showCodeSelectionDialog.value = true;
            } catch (error) {
                console.error('打开手动对齐弹窗失败:', error);
                ElMessage.error(`打开手动对齐弹窗失败: ${error.message}`);
            }
        };

        const deleteBlockFromContextMenu = async () => {
            const block = contextMenu.value.selectedBlock;
            const blockTypeForMenu = contextMenu.value.selectedBlockType;
            if (!block || !blockTypeForMenu) return;

            try {
                await ElMessageBox.confirm(
                    `确定删除当前${blockTypeForMenu === 'doc' ? '需求' : '代码'}块吗？`,
                    '删除块',
                    {
                        confirmButtonText: '删除',
                        cancelButtonText: '取消',
                        type: 'warning',
                        confirmButtonClass: 'el-button--danger'
                    }
                );

                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.post('/api/delete-block', {
                    projectPath: projectPath.value,
                    blockType: blockTypeForMenu,
                    blockData: block,
                    project_id: projectId
                });

                if (response.data.status === 'success') {
                    hideContextMenu();
                    await refreshAlignmentAndBlockViews(blockTypeForMenu);
                    ElMessage.success(response.data.message || '删除成功');
                } else {
                    ElMessage.warning(response.data.message || '删除失败');
                }
            } catch (error) {
                if (error === 'cancel' || error === 'close') return;
                console.error('删除块失败:', error);
                ElMessage.error(`删除块失败: ${error.message}`);
            }
        };

        const renameBlockFromContextMenu = async () => {
            const block = contextMenu.value.selectedBlock;
            const blockTypeForMenu = contextMenu.value.selectedBlockType;
            if (!block || !blockTypeForMenu) return;

            try {
                const result = await ElMessageBox.prompt(
                    `请输入新的${blockTypeForMenu === 'doc' ? '需求块' : '代码块'}名称`,
                    '重命名块',
                    {
                        confirmButtonText: '确定',
                        cancelButtonText: '取消',
                        inputValue: getBlockDisplayName(block, blockTypeForMenu),
                        inputValidator: (value) => {
                            if (!value || !value.trim()) return '名称不能为空';
                            return true;
                        }
                    }
                );

                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.post('/api/rename-block', {
                    projectPath: projectPath.value,
                    blockType: blockTypeForMenu,
                    blockData: block,
                    name: result.value.trim(),
                    project_id: projectId
                });

                if (response.data.status !== 'success') {
                    throw new Error(response.data.message || '重命名失败');
                }

                hideContextMenu();
                if (blockTypeForMenu === 'doc') {
                    await loadAndRenderDocBlocks(true);
                } else {
                    await loadAndRenderCodeBlocks(true);
                }
                await fetchSidebarBlocksPage(false);
                ElMessage.success('块重命名成功');
            } catch (error) {
                if (error === 'cancel' || error === 'close') return;
                ElMessage.error(`块重命名失败: ${error.message}`);
            }
        };

        const getCodeReviewAlignmentIdForBlock = (block) => {
            if (!block) return null;
            return block.matchedCodeReviewAlignmentId || null;
        };

        const getCodeReviewAlignmentForBlock = async (block) => {
            const alignmentId = getCodeReviewAlignmentIdForBlock(block);
            if (!alignmentId) return null;
            return await fetchAlignmentById(alignmentId);
        };

        const reviewBlockFromContextMenu = async () => {
            if (contextMenu.value.selectedBlockType !== 'code') return;
            const block = contextMenu.value.selectedBlock;
            const alignment = await getCodeReviewAlignmentForBlock(block);
            if (!alignment) {
                ElMessage.warning('当前代码块暂无可审查的对齐关系');
                return;
            }
            contextMenu.value.selectedAlignment = alignment;
            hideContextMenu();
            PromptReview();
        };

        const showBlockReviewResultFromContextMenu = async () => {
            if (contextMenu.value.selectedBlockType !== 'code') return;
            const block = contextMenu.value.selectedBlock;
            const alignment = await getCodeReviewAlignmentForBlock(block);
            if (!alignment) {
                ElMessage.warning('当前代码块暂无可查看详情的审查结果');
                return;
            }
            syncReviewDialogContext({
                source: 'block',
                block,
                blockType: contextMenu.value.selectedBlockType
            });
            currentSelectedBlockIndex.value = displayedBlocks.value.findIndex(
                item => getBlockKey(item, contextMenu.value.selectedBlockType) === getBlockKey(block, contextMenu.value.selectedBlockType)
            );
            selectedReviewAlignment.value = alignment;
            showReviewDialog.value = true;
            hideContextMenu();
        };

        
        
        const showReviewResult = () => {
            syncReviewDialogContext({ source: 'alignment' });
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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.post('/project/issue/update', {
                    path: projectPath.value,
                    issueId: issue.id,
                    description: issue.description,
                    level: issue.level,
                    project_id: projectId
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
                    const urlParams = new URLSearchParams(window.location.search);
                    const projectId = urlParams.get('project_id');
                    const response = await axios.delete(
                        `/project/issues/${issue.id}?path=${encodeURIComponent(projectPath.value)}&project_id=${projectId}`
                    );

                    if (response.data.status === 'success') {
                        const idx = issues.value.findIndex(i => i.id === issue.id);
                        if (idx > -1) {
                            issues.value.splice(idx, 1);
                        }
                        if (selectedIssue.value && selectedIssue.value.id === issue.id) {
                            selectedIssue.value = null;
                            selectedIssueIds.value = new Set();
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

        // const showIssueDetail = async (issue) => {
            // if (!issue) return;

            // try {
                // const targetAlignment = await fetchAlignmentById(issue.alignmentId);
                // if (targetAlignment) {
                    // selectedReviewAlignment.value = targetAlignment;
                    // showReviewDialog.value = true;
                // } else {
                    // ElMessage.warning(`未找到ID为 ${issue.alignmentId} 的对齐关系`);
                // }
            // } catch (error) {
                // console.error('加载对齐关系详情失败:', error);
                // ElMessage.error(`加载失败: ${error.message}`);
            // }
        // };
        
        const showIssueDetail = async (issue) => {
            if (!issue) return;

            try {
                const targetAlignment = await fetchAlignmentById(issue.alignmentId);
                if (targetAlignment) {
                    syncReviewDialogContext({ source: 'issue', issue });
                    selectedReviewAlignment.value = targetAlignment;
                    showReviewDialog.value = true;
                    scrollToIssueInList(issue.id);
                } else {
                    ElMessage.warning(`未找到ID为 ${issue.alignmentId} 的对齐关系`);
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
            await fetchAlignmentSidebarPage(true, alignType.value);
            await fetchIssues();
            
            // 添加点击高亮需求片段的事件监听器
            const docPanel = document.querySelector('.content-text-doc');
            if (docPanel) {
                docPanel.addEventListener('dblclick', handleHighlightBlockClick);
                docPanel.addEventListener('contextmenu', handleHighlightBlockRightClick);
            }
            
            // 添加点击高亮代码片段的事件监听器
            const codePanel = document.querySelector('.content-text-code');
            if (codePanel) {
                codePanel.addEventListener('dblclick', handleHighlightBlockClick);
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
            codePageRanges.value = [];
            currentCodePage.value = 1;
            codePageStartLine.value = 1;
            selectedDocRawContent.value = '';
            selectedCodeRawContent.value = '';
            docPageRanges.value = [];
            currentDocPage.value = 1;

            // 对齐与审查状态
            alignmentResults.value = [];
            allAlignments.value = {};
            filteredAlignments.value = null;
            isFiltered.value = false;
            currentSelection.value = null;
            resetManualAlignFromBlock();
            newAlignmentName.value = '';

            // 问题单
            issues.value = [];
            selectedIssue.value = null;
            selectedIssueIds.value = new Set();

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
            resetReviewDialogNavigationContext();
            
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
        //const generateReverseRequirement = async () => {
        //    if (!selectedReviewAlignment.value) {
			
		const clearReverseRequirementState = () => {
            currentReverseRequirement.value = null;
            currentFlowchart.value = null;
            reverseError.value = null;
        };
        const renderMermaidFlowchart = async (mermaidCode) => {
            if (!mermaidCode) return;
            await nextTick();
            try {
                const element = document.getElementById('mermaid-flowchart');
                if (element) {
                    element.innerHTML = '';
                    const { svg } = await mermaid.render(`mermaid-graph-${Date.now()}`, mermaidCode);
                    element.innerHTML = svg;
                }
            } catch (mermaidError) {
                console.error('Mermaid渲染错误:', mermaidError);
                reverseError.value = 'Mermaid图表渲染失败: ' + mermaidError.message;
            }
        };
        const loadReverseRequirementCache = async (alignment = selectedReviewAlignment.value) => {
            if (!alignment) {
                clearReverseRequirementState();
                return;
            }
            const requestSeq = ++reverseRequestSeq;
            clearReverseRequirementState();
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');
                const response = await axios.post('/api/generate-reverse-requirement', {
                    alignment_id: alignment.id,
                    project_id: projectId,
                    cacheOnly: true
                });
                if (
                    requestSeq !== reverseRequestSeq ||
                    !showReviewDialog.value ||
                    !selectedReviewAlignment.value ||
                    selectedReviewAlignment.value.id !== alignment.id
                ) {
                    return;
                }
                if (response.data.status === 'success' && response.data.cached) {
                    currentReverseRequirement.value = response.data.generatedRequirement;
                    if (response.data.mermaidCode) {
                        currentFlowchart.value = response.data.mermaidCode.replace(/\\n/g, '\n').trim();
                        await renderMermaidFlowchart(currentFlowchart.value);
                    }
                }
            } catch (error) {
                if (requestSeq !== reverseRequestSeq) return;
                console.error('加载需求反生成缓存失败:', error);
                reverseError.value = '加载需求反生成缓存失败';
            }
        };
        const generateReverseRequirement = async (options = {}) => {
            const { forceRegenerate = false } = options;
            const alignment = selectedReviewAlignment.value;
            if (!alignment) {
                ElMessage.error('未选择对齐关系');
                return;
            }
            
			const requestSeq = ++reverseRequestSeq;
            isGeneratingReverse.value = true;
            clearReverseRequirementState();

            try {
                // 构建需求和代码内容
                const docRanges = alignment.docRanges || [];
                const codeRanges = alignment.codeRanges || [];
                
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
                const urlParams = new URLSearchParams(window.location.search);
                const projectId = urlParams.get('project_id');

                // 获取当前选中对齐块的id
                const alignId = selectedReviewAlignment.value.id
                const response = await axios.post('/api/generate-reverse-requirement', {
                    alignment_id: alignment.id,
					requirementContent: requirementContent,
                    codeContent: codeContent,
                    project_id: projectId,
                    forceRegenerate: forceRegenerate
                });
				
				if (
                    requestSeq !== reverseRequestSeq ||
                    !showReviewDialog.value ||
                    !selectedReviewAlignment.value ||
                    selectedReviewAlignment.value.id !== alignment.id
                ) {
                    return;
                }

                if (response.data.status === 'success') {
                    currentReverseRequirement.value = response.data.generatedRequirement;
                    
                    // 如果同时返回了流程图，也设置流程图
                    if (response.data.mermaidCode) {
                        let mermaidCode = response.data.mermaidCode.replace(/\\n/g, '\n').trim();
                        currentFlowchart.value = mermaidCode;
                        
                        await renderMermaidFlowchart(mermaidCode);
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
                if (requestSeq === reverseRequestSeq) {
                    isGeneratingReverse.value = false;
                }
            }
        };

        const regenerateReverseRequirement = () => {
            generateReverseRequirement({ forceRegenerate: true });
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

        // 点击目录项，平滑滚动到对应代码块
        const scrollToRange = (index) => {

            // console.log('scrollToRange被调用，index=',index)
            if (index == null) return
            const el = document.getElementById('range-' + index)
            // console.log('查到的元素，el=',el)
            // console.log('sectionRef.value', sectionRef.value)
            if (el && sectionRef.value) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start'})
                activeRangeId.value = String(index)
            } else {
                console.log('条件不满足, el 或 sectionRef.value为空')
            }
        }

        const initScrollListener = () => {

            if (!sectionRef.value) return

            const container = sectionRef.value
            const ranges = document.querySelectorAll('.code-range')
            if (!ranges.length) return

            if (container._scrollHandler) {
                container.removeEventListener('scroll', container._scrollHandler)
            }

            const onScroll = () => {
                const containerTop = container.scrollTop
                const containerCenter = containerTop + container.clientHeight / 2

                let closestId = null
                let minDistance = Infinity
                for (const range of ranges) {
                    const rangeTop = range.offsetTop
                    const rangeCenter = rangeTop + range.clientHeight / 2
                    const distance = Math.abs(rangeCenter - containerCenter)

                    if (distance < minDistance) {
                        minDistance = distance
                        closestId = range.id.replace('range-', '')
                    }
                }

                if (closestId !== null){
                    activeRangeId.value = String(closestId)
                }
            }
            container.addEventListener('scroll', onScroll)
            container._scrollHandler = onScroll
        }

        watch(() => selectedReviewAlignment.value?.codeRanges, (newVal) => {
            if (newVal && newVal.length > 0){
                setTimeout(() => {
                    initScrollListener()
                }, 300)




            }
        }, { deep: true})


        onMounted(() => {
            if (selectedReviewAlignment.value?.codeRanges?.length > 0){
                nextTick(() => initScrollListener())
            }
        })

        onUnmounted(() => {
            const container = sectionRef.value
            if (container && container._onScroll){
                container.removeEventListener('scroll', container._onScroll)
            }
        })



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

        const navigateReviewAlignment = async (step) => {
            if (!selectedReviewAlignment.value) return;
            const currentList = sidebarAlignmentItems.value || [];
            const currentIndex = currentList.findIndex(a => a.id === selectedReviewAlignment.value.id);
            if (currentIndex === -1) return;

            let newIndex = currentIndex + step;
            if (newIndex < 0) {
                ElMessage.info('已经是当前页的第一个对齐结果了');
                return;
            }
            if (newIndex >= currentList.length) {
                ElMessage.info('已经是当前页的最后一个对齐结果了');
                return;
            }

            const nextAlignment = currentList[newIndex];
            selectedReviewAlignment.value = nextAlignment;
            syncReviewDialogContext({ source: 'alignment' });
            clearReverseRequirementState();
            // 同步更新外部选中状态
            await handleAlignmentItemClick(nextAlignment);
            if (activeReviewTab.value === 'requirement-reverse') {
                loadReverseRequirementCache(nextAlignment);
            }
        };

        const navigateReviewBlock = async (step) => {
            const blockListType = reviewDialogBlockType.value || blockType.value;
            if (blockListType !== 'code') {
                ElMessage.info('当前块类型不支持查看审查详情');
                return;
            }

            const currentBlocks = (blockListType === 'doc' ? docBlocks.value : codeBlocks.value) || [];
            if (!currentBlocks.length) return;

            const currentIndex = currentBlocks.findIndex(
                block => getBlockKey(block, blockListType) === reviewDialogCurrentBlockKey.value
            );
            if (currentIndex === -1) return;

            for (let newIndex = currentIndex + step; newIndex >= 0 && newIndex < currentBlocks.length; newIndex += step) {
                const nextBlock = currentBlocks[newIndex];
                const nextAlignment = await getCodeReviewAlignmentForBlock(nextBlock);
                if (!nextAlignment) {
                    continue;
                }

                syncReviewDialogContext({
                    source: 'block',
                    block: nextBlock,
                    blockType: blockListType
                });
                selectedReviewAlignment.value = nextAlignment;
                clearReverseRequirementState();
                currentSelectedBlockIndex.value = newIndex;
                scrollToBlockInSidebar(newIndex);
                await handleAlignmentItemClick(nextAlignment);
                if (activeReviewTab.value === 'requirement-reverse') {
                    loadReverseRequirementCache(nextAlignment);
                }
                return;
            }

            ElMessage.info(step < 0 ? '已经是当前块列表中第一个有审查结果的代码块了' : '已经是当前块列表中最后一个有审查结果的代码块了');
        };

        const navigateReviewIssue = async (step) => {
            const currentIssues = issues.value || [];
            if (!currentIssues.length || !currentReviewIssueId.value) return;

            const currentIndex = currentIssues.findIndex(issue => issue.id === currentReviewIssueId.value);
            if (currentIndex === -1) return;

            const newIndex = currentIndex + step;
            if (newIndex < 0) {
                ElMessage.info('已经是当前问题单列表的第一个问题单了');
                return;
            }
            if (newIndex >= currentIssues.length) {
                ElMessage.info('已经是当前问题单列表的最后一个问题单了');
                return;
            }

            const nextIssue = currentIssues[newIndex];
            const nextAlignment = await fetchAlignmentById(nextIssue.alignmentId);
            if (!nextAlignment) {
                ElMessage.warning(`未找到ID为 ${nextIssue.alignmentId} 的对齐关系`);
                return;
            }

            syncReviewDialogContext({ source: 'issue', issue: nextIssue });
            selectedReviewAlignment.value = nextAlignment;
            clearReverseRequirementState();
            scrollToIssueInList(nextIssue.id);
            await handleAlignmentItemClick(nextAlignment);
            if (activeReviewTab.value === 'requirement-reverse') {
                loadReverseRequirementCache(nextAlignment);
            }
        };

        const navigateReviewDetail = async (step) => {
            if (reviewDialogSource.value === 'block') {
                await navigateReviewBlock(step);
                return;
            }
            if (reviewDialogSource.value === 'issue') {
                await navigateReviewIssue(step);
                return;
            }
            await navigateReviewAlignment(step);
        };

        /***********************
         * 监听器
         ***********************/
        // 监听选项卡切换，当切换到需求反生成选项卡时自动发送请求
        watch(activeReviewTab, (newTab, oldTab) => {
            if (newTab === 'requirement-reverse' && selectedReviewAlignment.value) {
                loadReverseRequirementCache(selectedReviewAlignment.value);
            }
        });

        // 监听问题单详情弹窗关闭事件，重置选项卡到第一个选项
        watch(showReviewDialog, (newValue, oldValue) => {
            if (oldValue === true && newValue === false) {
                // 弹窗从打开状态变为关闭状态，重置选项卡
                activeReviewTab.value = 'issues';
                reverseRequestSeq += 1;
                isGeneratingReverse.value = false;
                clearReverseRequirementState();
                resetReviewDialogNavigationContext();
            }
        });

        // ============================================================
        // [RAG 模块] 知识库管理逻辑
        // ============================================================

        // --- 1. 状态定义 ---
        const showCreateKBDialog = ref(false); // 新建弹窗显示状态
        const isBuildingKB = ref(false);       // 构建按钮Loading状态
        
        // 新建表单数据
        const kbCreationForm = ref({
            name: '',
            type: 'rule', // 默认选中'编程规则'
            file: null,
            fileName: ''
        });

        // ============================================================
        // 知识库审查与入库逻辑
        // ============================================================
        const showImportReviewDialog = ref(false);
        const importStep = ref(0);
        const importDocType = ref('issue');
        
        // 文件源相关
        const fileSourceMode = ref('server'); // 'server' or 'local'
        const serverFileList = ref([]);
        const selectedServerFile = ref('');
        const importFileList = ref([]); // 本地上传文件列表

        // 审查相关
        const previewTableData = ref([]);
        const selectedReviewItems = ref([]);
        const targetKbName = ref('');

        const importMode = ref('new');
        const selectedExistingKb = ref('');

        // 计算属性：当前类型可用于追加的知识库
        const existingKbsForAppend = computed(() => {
            let targetType = importDocType.value === 'history_align' ? 'align' : importDocType.value;
            return kbAppList.value.filter(kb => kb.type === targetType);
        });

        // 去除空格
        watch(targetKbName, (newVal) => {
            if (newVal && newVal.indexOf(' ') !== -1) {
                targetKbName.value = newVal.replace(/\s+/g, '');
            }
        });
        
        // 状态
        const isUploading = ref(false);
        const isCommitting = ref(false);
        const reviewTableRef = ref(null);

        // 详情弹窗
        const showDetailDialog = ref(false);
        const currentDetailItem = ref(null);
        
        // 监听文档类型变化，不再赋予默认硬编码名字，只清空当前输入
        watch(importDocType, (newVal) => {
            targetKbName.value = '';
            selectedExistingKb.value = '';
        }, { immediate: true });

        const loadInitData = async () => {
            if (!isDirectImportMode.value) {
                importStep.value = 0;
                importFileList.value = [];
                previewTableData.value = [];
            }
            await fetchServerFiles(); 
            await fetchKbAppData();
        };
        
        // 获取服务器 testdata 文件列表
        const fetchServerFiles = async () => {
            try {
                const res = await axios.get('/api/list-testdata');
                if (res.data.status === 'success') {
                    serverFileList.value = res.data.files;
                }
            } catch (e) { console.error(e); }
        };

        // 2. 本地文件选择回调
        const handleImportFileChange = (file, fileList) => {
            if (fileList.length > 1) fileList.splice(0, 1);
            importFileList.value = fileList;
        };

        // 3. 开始解析
        const startPreview = async () => {
            const formData = new FormData();
            formData.append('doc_type', importDocType.value);
            
            if (fileSourceMode.value === 'server') {
                if (!selectedServerFile.value) {
                    ElMessage.warning('请选择一个服务器文件');
                    return;
                }
                formData.append('use_server_file', 'true');
                formData.append('filename', selectedServerFile.value);
            } else {
                if (importFileList.value.length === 0) {
                    ElMessage.warning('请先选择本地文件');
                    return;
                }
                formData.append('use_server_file', 'false');
                formData.append('file', importFileList.value[0].raw);
            }
            
            isUploading.value = true;
            try {
                const response = await axios.post('/preview', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (response.data.status === 'success') {
                    previewTableData.value = response.data.data;
                    
                    if (previewTableData.value.length === 0) {
                        ElMessage.warning("未解析到有效数据，请检查文档格式或选择正确的文档类型");
                    } else {
                        importStep.value = 1; 
                        // 自动全选
                        await nextTick();
                        if (reviewTableRef.value) {
                            reviewTableRef.value.toggleAllSelection();
                        }
                    }
                } else {
                    ElMessage.error(`解析失败: ${response.data.message}`);
                }
            } catch (error) {
                console.error(error);
                ElMessage.error('请求发生错误');
            } finally {
                isUploading.value = false;
            }
        };

        // 4. 查看详情
        const viewDetail = (row) => {
            currentDetailItem.value = row;
            showDetailDialog.value = true;
        };

        // 5. 提交入库
        const handleReviewSelectionChange = (val) => {
            selectedReviewItems.value = val;
        };

        const submitToKb = async () => {
            let finalKbName = '';
            
            if (importMode.value === 'new') {
                if (!targetKbName.value) {
                    ElMessage.warning('请输入新知识库名称');
                    return;
                }
                finalKbName = targetKbName.value;
            } else {
                if (!selectedExistingKb.value) {
                    ElMessage.warning('请选择要追加的知识库');
                    return;
                }
                finalKbName = selectedExistingKb.value;
            }

            isCommitting.value = true;
            try {
                // 调用新增加的独立 API，专门处理项目视图下的内存条目入库
                const response = await axios.post('/api/rag/add_items', {
                    kbName: finalKbName,
                    kbType: importDocType.value,
                    append: importMode.value === 'append',
                    items: selectedReviewItems.value, // 前端选中的条目数组
                    projectPath: projectPath.value
                });

                if (response.data.status === 'success') {
                    ElMessage.success(response.data.message || '入库成功！');
                    showImportReviewDialog.value = false;
                    // 刷新左侧边栏弹窗中的知识库列表
                    await fetchKbAppData(); 
                } else {
                    ElMessage.error(`入库失败: ${response.data.message}`);
                }
            } catch (error) {
                ElMessage.error('入库请求出错');
                console.error(error);
            } finally {
                isCommitting.value = false;
            }
        };
        
        // 标记是否为“直接导入模式”（用于隐藏文件上传步骤）
        const isDirectImportMode = ref(false);

        /**
         * 通用函数：将内存数据填入审查弹窗
         * @param {Array} rawDataList - 待入库的数据列表
         * @param {String} dataType - 数据类型 ('history_align' | 'issue' | 'rule')
         */
        const openReviewDialogWithData = async (rawDataList, dataType) => {
            if (!rawDataList || rawDataList.length === 0) {
                ElMessage.warning('没有有效数据可供入库');
                return;
            }

            await fetchKbAppData();

            // 1. 开启直接模式
            isDirectImportMode.value = true;
            importDocType.value = dataType; // 设置类型，会自动触发 targetKbName 的 watch 更新

            // 2. 格式化数据（适配表格显示）
            const formattedData = rawDataList.map(item => {
                let id = item.id || `auto_${Date.now()}`;
                let summary = '';
                let content = '';

                if (dataType === 'history_align') {
                    // === 格式化：对齐结果 ===
                    summary = item.name || '未命名对齐项';
                    // 拼接 Doc + Code 作为检索内容
                    const docText = (item.docRanges || []).map(r => r.content).join('\n');
                    const codeText = (item.codeRanges || []).map(r => r.content).join('\n');
                    content = `【需求描述】\n${docText}\n\n【实现代码】\n${codeText}`;
                } 
                else if (dataType === 'issue') {
                    // === 格式化：问题单 ===
                    id = item.id || `issue_${Date.now()}`;
                    summary = item.summary || item.title || '审查发现的问题';
                    // 构造标准的问题单内容格式
                    content = item.content || item.description || '';
                    if (!content && item.review_comments) {
                         content = `【问题描述】\n${item.review_comments}\n\n【关联对齐项】\n${item.name || '未知'}`;
                    }
                }

                return {
                    id: id,
                    summary: summary.substring(0, 80) + (summary.length > 80 ? '...' : ''),
                    content: content,
                    full_data: item, // 保留原始数据
                    type: dataType === 'history_align' ? '历史对齐' : '问题单'
                };
            });

            // 3. 填充数据并跳转
            previewTableData.value = formattedData;
            importStep.value = 1;
            showImportReviewDialog.value = true;

            nextTick(() => {
                if (reviewTableRef.value) {
                    reviewTableRef.value.toggleAllSelection();
                }
            });
        };

        // --- 按钮事件 1：对齐结果入库 ---
        const addAlignmentToKB = async () => {
            if (!selectedReviewAlignment.value) return;
            await openReviewDialogWithData([selectedReviewAlignment.value], 'history_align');
        };

        // --- 按钮事件 2：问题单入库 (支持多条) ---
        const addIssueToKB = async () => {
            const item = selectedReviewAlignment.value;
            if (!item) return;
            
            // 尝试获取该对齐项下所有的已生成问题单
            const existingIssues = getIssuesByAlignmentId(item.id);
            let targetIssuesList = [];

            if (existingIssues && existingIssues.length > 0) {
                // 【修改点】Case A: 遍历所有问题单，全部加入列表
                targetIssuesList = existingIssues.map(issue => ({
                    // 构造符合入库弹窗的数据结构
                    id: issue.displayId || `issue_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    summary: issue.summary,
                    content: issue.description, // 使用问题单里的描述作为主要内容
                    
                    // 构造 full_data (用于 metadata)
                    desc: issue.description,
                    opinion: '待人工处理',
                    trace_id: item.id,
                    severity: issue.level,
                    status: issue.status
                }));
            } else {
                // Case B: 没有现成的问题单，使用审查意见构造一个默认的
                targetIssuesList.push({
                    id: `issue_${item.id}`,
                    summary: `审查问题: ${item.name || '未知需求'}`,
                    content: item.review_comments 
                            ? `【审查意见】\n${item.review_comments}` 
                            : `【问题描述】\n(请在此处补充详细问题描述...)\n\n【关联对齐项】\n${item.name || '未知'}`,
                    desc: item.review_comments || '',
                    opinion: '待处理',
                    trace_id: item.id
                });
            }

            // 打开入库弹窗，传入所有问题单
            await openReviewDialogWithData(targetIssuesList, 'issue');
        };
        /***********************
         * 暴露到模板
         ***********************/
        return {
            alignType,

            sectionRef,
            tocRef,
            activeRangeId,
            scrollToRange,
            isTocCollapsed,
            projectName,
            projectFiles,
            selectedDocFile,
            selectedCodeFile,
            selectedDocContent,
            selectedCodeContent,
            selectedDocRawContent,
            selectedCodeRawContent,
            currentDocPage,
            totalDocPages,
            goToDocFirstPage,
            goToDocPrevPage,
            goToDocNextPage,
            goToDocLastPage,
            currentCodePage,
            codePageStartLine,
            totalCodePages,
            goToCodeFirstPage,
            goToCodePrevPage,
            goToCodeNextPage,
            goToCodeLastPage,
            alignmentPage,
            alignmentTotal,
            alignmentTotalPages,
            docBlockPage,
            docBlockTotal,
            docBlockTotalPages,
            codeBlockPage,
            codeBlockTotal,
            codeBlockTotalPages,
            goToAlignmentPage,
            goToBlockPage,
            handleDocSelection,
            showAlignmentDialog,
            showAlignmentDirectionDialog,
            currentSelection,
            newAlignmentName,
            createAlignment,
            createBlockOnly,
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
            restartSelectedAlignmentFromContextMenu,
            clearAlignmentTargetFromContextMenu,
            alignBlockFromContextMenu,
            manualAlignBlockFromContextMenu,
            renameBlockFromContextMenu,
            reviewBlockFromContextMenu,
            showBlockReviewResultFromContextMenu,
            deleteBlockFromContextMenu,
            renameAlignment,
            deleteAlignment,
            removeRange,
            getBlockStatus,
            hasCodeReview,
            getAlignmentStatus,
            handleCodeSelection,
            addToAlignment,
            addDocToAlignment,
            addToSelectedExistingAlignment,
            showCodeSelectionDialog,
            existingAlignTab,
            existingAlignmentsReq2Code,
            existingAlignmentsCode2Req,
            selectedExistingAlignmentId,
            manualAlignFromBlock,
            resetManualAlignFromBlock,
            removeFile,
            
            dialogParseDocMethodVisible, 
            parseDocMethod,
            handleConfirmParseDocMethod,
			
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
            handleAlignmentDirectionSelect,

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
            exportAllIssues,
            openExportDialog,
            getExportCountText,
            deleteProject,
            // 导出表单相关
            showExportDialog,
            exportForm,
            confirmExport,
            exportResults,
            // 审查结果弹窗
            SetPrompt,
            showPromptDialog,
            outerActive,
            innerActiveA,
            innerActiveB,
            currentReq2CodeAlignPrompt,
            currentCode2ReqAlignPrompt,
            showReview,
            showSingleReview,
            showRestartReview,
            reviewMode,
            reviewModeKbs,
            currentReviewPrompt,
            currentCodeReviewPrompt,
            currentReq2CodeAlignPromptKbs,
            currentCode2ReqAlignPromptKbs,
            currentReviewPromptKbs,
            currentCodeReviewPromptKbs,
            restorePromptDefault,
            savePrompt,
            openPromptDialog,
            loadDefaultPrompt,
            closePromptModal,//设置提示词
            copyAndClose,
            PromptAlignment,
            AddAlignPrompt,
            showAlignPromptDialog,
            closeAlignPromptModal,
            executeAlignment,//对齐
            PromptReview,
            loadDefaultAlignPrompt,
            showReviewPromptDialog,
            singleReview,
            AddReviewPrompt,
            closeReviewPromptModal,
            executeReview,//审查
            showReviewDialog,
            loadDefaultReviewPrompt,
            selectedReviewAlignment,
            currentReviewIssueId,
            showReviewResult,
            navigateReviewDetail,
            getIssueById,
            getIssuesByAlignmentId,

            // 问题单相关
            selectedIssue,
            selectIssue,
            selectedIssueIds,
            isIssueSelected,
            allIssuesSelected,
            someIssuesSelected,
            toggleIssueSelection,
            selectAllIssues,
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
            rightSidebarMode,
            blockType,
            displayedBlocks,
            refreshBlocks,
            refreshBlocksAndAlignments,
            currentSelectedBlockIndex,
            handleBlockItemClick,
            handleBlockItemContextMenu,
            getBlockDisplayName,
            getBlockMetaText,
            getBlockPreviewText,
            statusFilters,
            sidebarAlignments,
            expandedAlignmentIds,
            toggleAlignmentExpansion,
            removeRange,
            navigateToSpecificBlock,
            
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
            navigateReviewAlignment,
            
            // 行号生成
            getLineNumbers,
            
            // 进度显示相关
            showProgress,
            progressTitle,
            currentProcessingFile,
            progressCurrent,
            progressTotal,
            progressPercentage,

            refreshAlignments,
            
            // RAG 相关
            showCreateKBDialog, // 弹窗状态
            kbCreationForm,     // 表单数据
            isBuildingKB,       // 构建Loading
            
            // 知识库审查相关导出
            showImportReviewDialog,
            importStep,
            importDocType,
            fileSourceMode,
            serverFileList,
            selectedServerFile,
            importFileList,
            previewTableData,
            selectedReviewItems,
            targetKbName,
            importMode,
            selectedExistingKb,
            existingKbsForAppend,
            isUploading,
            isCommitting,
            reviewTableRef,
            showDetailDialog,
            currentDetailItem,
            
            openImportReviewDialog: () => { showImportReviewDialog.value = true; }, // Simple open trigger
            loadInitData,
            fetchServerFiles,
            handleImportFileChange,
            startPreview,
            viewDetail,
            handleReviewSelectionChange,
            submitToKb,

            // KB App State
            showKbAppDialog,
            kbAppList,
            kbAppSearch,
            kbAppFilterType,
            selectedKbAppItems,
            isSavingKbApp,
            filteredKbAppList,
            areAllFilteredKbAppsSelected,
            hasAnyFilteredKbAppsSelected,
            openKbAppDialog,
            fetchKbAppData,
            isKbSelected,
            toggleKbSelection,
            selectAllFilteredKbApps,
            clearAllFilteredKbAppsSelection,
            saveKbAppSelection,
            getKbColor,
            getKbTypeName,
            formatRelativeTime,

            isDirectImportMode,
            addAlignmentToKB,
            addIssueToKB,
            handleDeleteBlock,
			
			
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
