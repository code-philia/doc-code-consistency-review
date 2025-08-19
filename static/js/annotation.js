import { regularizeFileContent, normalizePath, renderMarkdown, formatCodeWithLineNumbers, getSourceDocumentRange } from './utils.js';
import { Annotation, DocumentRange, CodeRange, File } from './type.js';

const { createApp, ref, onMounted, nextTick } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;

const app = createApp({
    delimiters: ['${', '}'],
    setup() {
        const docFiles = ref([]);
        const codeFiles = ref([]);

        const selectedDocFile = ref('');
        const selectedCodeFile = ref('');
        const selectedDocRawContent = ref('');
        const selectedCodeRawContent = ref('');
        const selectedDocContent = ref('');
        const selectedCodeContent = ref('');
        const renderError = ref('');

        const docUpload = ref(null);
        const codeUpload = ref(null);
        const docFolderUpload = ref(null);
        const codeFolderUpload = ref(null);

        const annotations = ref([]);
        const showAnnotationDialog = ref(false);
        const currentSelection = ref(null);
        const newAnnotation = ref(new Annotation());
        const selectedAnnotation = ref(null);
        const editingAnnotation = ref(false);
        const annotationName = ref('');

        const showSettingsDialog = ref(false);
        const settingsForm = ref({
            workDirectory: ''
        });

        const saveSettings = () => {
            // 规范化路径
            if (settingsForm.value.workDirectory) {
                settingsForm.value.workDirectory = normalizePath(settingsForm.value.workDirectory);
            }
            showSettingsDialog.value = false;
            ElMessage.success('设置已保存');
        };

        function getPathSeparator() {
            // 根据路径特征判断系统类型
            if (settingsForm.value.workDirectory && settingsForm.value.workDirectory.includes('\\')) {
                return '\\'; // Windows
            }
            return '/'; // Unix/Mac (默认)
        }

        /***********************
         * 增删和选择文件
         ***********************/
        // 上传文件（单个文件或从文件夹）
        const handleFileUpload = (event, fileList, fileType) => {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            const workDir = settingsForm.value.workDirectory || '';
            const separator = getPathSeparator();

            files.forEach(file => {
                const localPath = workDir ? `${workDir}${separator}${file.name}` : file.name;

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawContent = e.target.result;
                    const content = regularizeFileContent(rawContent, fileType);
                    let renderedDocument = '';
                    try {
                        if (fileType === 'doc') {
                            renderedDocument = await renderMarkdown(content);
                        } else if (fileType === 'code') {
                            renderedDocument = formatCodeWithLineNumbers(content);
                        }
                    } catch (e) {
                        renderError.value = e.message;
                        renderedDocument = '<div class="render-error">渲染失败，请检查源文件格式。</div>';
                        console.error(e);
                    }

                    const newFile = new File(
                        file.name,
                        content,
                        renderedDocument,
                        fileType,
                        localPath,
                        new Date(file.lastModified).toISOString()
                    );

                    fileList.value.push(newFile);
                    event.target.value = '';
                    ElMessage.success(`${fileType === 'doc' ? '文档' : '代码'} "${file.name}" 上传成功`);

                    if (fileType === 'doc') {
                        selectDocFile(newFile);
                    } else {
                        selectCodeFile(newFile);
                    }
                };
                reader.readAsText(file);
            });
        };
        const handleFolderUpload = async (event, fileList, fileType, validExtensions) => {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            const workDir = settingsForm.value.workDirectory || '';
            const separator = getPathSeparator();

            // 过滤有效文件
            const validFiles = files.filter(file => {
                const ext = file.name.split('.').pop().toLowerCase();
                return validExtensions.includes(ext);
            });

            if (validFiles.length === 0) {
                ElMessage.warning(`没有找到有效的${fileType === 'doc' ? '文档' : '代码'}文件`);
                return;
            }

            // 批量处理文件
            for (const file of validFiles) {
                const localPath = workDir ? `${workDir}${separator}${file.name}` : file.name;

                await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const rawContent = e.target.result;
                        const content = regularizeFileContent(rawContent, fileType);
                        let renderedDocument = '';

                        try {
                            if (fileType === 'doc') {
                                renderedDocument = await renderMarkdown(content);
                            } else if (fileType === 'code') {
                                renderedDocument = formatCodeWithLineNumbers(content);
                            }
                        } catch (e) {
                            renderError.value = e.message;
                            renderedDocument = '<div class="render-error">渲染失败，请检查源文件格式。</div>';
                            console.error(e);
                        }

                        const newFile = new File(
                            file.name,
                            content,
                            renderedDocument,
                            fileType,
                            localPath,
                            new Date(file.lastModified).toISOString()
                        );

                        fileList.value.push(newFile);
                        resolve();
                    };
                    reader.readAsText(file);
                });
            }

            event.target.value = '';
            ElMessage.success(`已上传 ${validFiles.length} 个${fileType === 'doc' ? '文档' : '代码'}文件`);

            // 自动选择第一个文件
            if (fileType === 'doc' && fileList.value.length > 0) {
                selectDocFile(fileList.value[0]);
            } else if (fileType === 'code' && fileList.value.length > 0) {
                selectCodeFile(fileList.value[0]);
            }
        };

        const handleDocUpload = (event) => handleFileUpload(event, docFiles, 'doc');
        const handleCodeUpload = (event) => handleFileUpload(event, codeFiles, 'code');
        const handleDocFolderUpload = (event) => {
            handleFolderUpload(
                event,
                docFiles,
                'doc',
                ['doc', 'docx', 'md', 'txt'] // 支持的文档扩展名
            );
        };
        const handleCodeFolderUpload = (event) => {
            handleFolderUpload(
                event,
                codeFiles,
                'code',
                ['c', 'cpp', 'h', 'js', 'py', 'java', 'html', 'css'] // 支持的代码扩展名
            );
        };

        const triggerDocUpload = () => docUpload.value.click();
        const triggerCodeUpload = () => codeUpload.value.click();
        const triggerDocFolderUpload = () => docFolderUpload.value.click();
        const triggerCodeFolderUpload = () => codeFolderUpload.value.click();

        // 选择文件
        const selectDocFile = (file) => {
            selectedDocFile.value = file.name;
            selectedDocRawContent.value = file.content;
            selectedDocContent.value = file.renderedDocument || '';
        };

        const selectCodeFile = (file) => {
            selectedCodeFile.value = file.name;
            selectedCodeRawContent.value = file.content;
            selectedCodeContent.value = file.renderedDocument || '';
        };

        // 删除文件
        const removeFile = (index, fileList, selectedFileName, selectedFileContent, fileType) => {
            const fileName = fileList.value[index].name;
            ElMessageBox.confirm(`确定要删除${fileType} "${fileName}" 吗?`, '确认删除', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                if (selectedFileName.value === fileName) {
                    selectedFileName.value = '';
                    selectedFileContent.value = '';
                }
                fileList.value.splice(index, 1);
                ElMessage.success(`${fileType} "${fileName}" 已删除`);
            }).catch(() => { });
        };

        const removeDocFile = (index) => removeFile(index, docFiles, selectedDocFile, selectedDocContent, '需求文档');
        const removeCodeFile = (index) => removeFile(index, codeFiles, selectedCodeFile, selectedCodeContent, '代码文件');

        /***********************
         * 标注方法
         ***********************/
        // 处理文档选择
        const handleDocSelection = (event) => {
            const selection = window.getSelection();
            if (!selection || selection.toString().trim() === '') {
                currentSelection.value = null;
                return;
            }

            const range = selection.getRangeAt(0);
            const editorDiv = document.querySelector('.content-text-doc');

            if (editorDiv && editorDiv instanceof HTMLElement) {
                const [start, end] = getSourceDocumentRange(editorDiv, range);
                if (end - start > 0) {
                    currentSelection.value = {
                        type: 'doc',
                        documentId: selectedDocFile.value,
                        start,
                        end,
                        content: selectedDocRawContent.value.slice(start, end)
                    };
                    showAnnotationDialog.value = true;
                }
            }
        };

        // 处理代码选择
        const handleCodeSelection = (event) => {
            const selection = window.getSelection();
            if (!selection || selection.toString().trim() === '') {
                currentSelection.value = null;
                return;
            }
            const range = selection.getRangeAt(0);
            const editorDiv = document.querySelector('.content-text-code');

            if (editorDiv && editorDiv instanceof HTMLElement) {
                const [start, end] = getSourceDocumentRange(editorDiv, range);
                if (end - start > 0) {
                    currentSelection.value = {
                        type: 'code',
                        documentId: selectedCodeFile.value,
                        start,
                        end,
                        content: selectedCodeRawContent.value.slice(start, end)
                    };
                    showAnnotationDialog.value = true;
                }
            }
        };

        // 创建新标注
        const createAnnotation = () => {
            if (!currentSelection.value) return;

            const annotation = new Annotation();
            annotation.category = annotationName.value || "新标注";

            if (currentSelection.value.type === 'doc') {
                annotation.docRanges.push(
                    new DocumentRange(
                        currentSelection.value.documentId,
                        currentSelection.value.start,
                        currentSelection.value.end,
                        currentSelection.value.content
                    )
                );
            } else {
                annotation.codeRanges.push(
                    new CodeRange(
                        currentSelection.value.documentId,
                        currentSelection.value.start,
                        currentSelection.value.end,
                        currentSelection.value.content
                    )
                );
            }

            annotations.value.push(annotation);
            annotationName.value = '';
            showAnnotationDialog.value = false;
            currentSelection.value = null;

            ElMessage.success('标注创建成功');
        };

        // 添加到现有标注
        const addToAnnotation = (annotation) => {
            if (!currentSelection.value || !annotation) return;

            if (currentSelection.value.type === 'doc') {
                annotation.docRanges.push(
                    new DocumentRange(
                        currentSelection.value.documentId,
                        currentSelection.value.start,
                        currentSelection.value.end,
                        currentSelection.value.content
                    )
                );
            } else {
                annotation.codeRanges.push(
                    new CodeRange(
                        currentSelection.value.documentId,
                        currentSelection.value.start,
                        currentSelection.value.end,
                        currentSelection.value.content
                    )
                );
            }

            annotation.updateTime = new Date().toISOString();
            showAnnotationDialog.value = false;
            currentSelection.value = null;

            ElMessage.success('已添加到标注');
        };

        // 编辑标注名称
        const editAnnotation = (annotation) => {
            selectedAnnotation.value = annotation;
            annotationName.value = annotation.category;
            editingAnnotation.value = true;
        };

        // 保存标注名称
        const saveAnnotationName = () => {
            if (selectedAnnotation.value) {
                selectedAnnotation.value.category = annotationName.value;
                selectedAnnotation.value.updateTime = new Date().toISOString();
                editingAnnotation.value = false;
                ElMessage.success('标注名称已更新');
            }
        };

        // 删除标注
        const removeAnnotation = (index) => {
            ElMessageBox.confirm('确定要删除此标注吗?', '确认删除', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                annotations.value.splice(index, 1);
                ElMessage.success('标注已删除');
            }).catch(() => { });
        };

        // 删除标注中的范围
        const removeRange = (annotation, type, index) => {
            if (type === 'doc') {
                annotation.docRanges.splice(index, 1);
            } else {
                annotation.codeRanges.splice(index, 1);
            }

            annotation.updateTime = new Date().toISOString();

            // 如果标注中没有范围了，删除整个标注
            if (annotation.docRanges.length === 0 && annotation.codeRanges.length === 0) {
                const idx = annotations.value.indexOf(annotation);
                if (idx !== -1) {
                    annotations.value.splice(idx, 1);
                    ElMessage.success('标注已删除');
                }
            } else {
                ElMessage.success('范围已删除');
            }
        };

        /***********************
         * 滚动定位方法
         ***********************/
        // 跳转到标注范围
        const gotoRange = (range, type) => {
            if (type === 'doc') {
                // 切换到对应的文档
                const docFile = docFiles.value.find(f => f.name === range.documentId);
                if (docFile) {
                    if (selectedDocFile.value !== docFile.name) {
                        selectDocFile(docFile);
                    }

                    // 滚动到指定位置
                    nextTick(() => {
                        scrollDocToOffset(range.start);
                    });
                }
            } else if (type === 'code') {
                // 切换到对应的代码文件
                const codeFile = codeFiles.value.find(f => f.name === range.documentId);
                if (codeFile) {
                    if (selectedCodeFile.value !== codeFile.name) {
                        selectCodeFile(codeFile);
                    }

                    // 滚动到指定位置
                    nextTick(() => {
                        scrollCodeToOffset(range.start);
                    });
                }
            }
        };

        /****************************
         * 保存、导入、导出标注
         ****************************/
        const handleNewTask = async () => {
            if (annotations.value.length > 0 || docFiles.value.length > 0 || codeFiles.value.length > 0) {
                try {
                    await ElMessageBox.confirm('当前有未保存的标注，是否先保存?', '新建任务', {
                        confirmButtonText: '保存并新建',
                        cancelButtonText: '不保存',
                        type: 'warning',
                        distinguishCancelAndClose: true,
                        showClose: false
                    });
                    // 用户选择保存
                    handleExportAnnotations();
                    resetTask();
                } catch (error) {
                    if (error === 'cancel') {
                        // 用户选择不保存
                        resetTask();
                    }
                }
            } else {
                resetTask();
            }
        };

        const resetTask = () => {
            annotations.value = [];
            docFiles.value = [];
            codeFiles.value = [];
            selectedDocFile.value = '';
            selectedCodeFile.value = '';
            selectedDocContent.value = '';
            selectedCodeContent.value = '';
            renderError.value = '';
            annotationName.value = '';
            ElMessage.success('已创建新任务');
        };

        const handleImportAnnotations = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const data = JSON.parse(event.target.result);

                        // 验证数据格式
                        if (!data.annotations || !data.docFiles || !data.codeFiles) {
                            throw new Error('无效的标注文件格式');
                        }

                        // 重置当前状态
                        resetTask();

                        // 导入文档文件
                        for (const fileData of data.docFiles) {
                            docFiles.value.push(new File(
                                fileData.name,
                                fileData.content,
                                fileData.renderedDocument,
                                'doc',
                                fileData.localPath || fileData.name,
                                fileData.lastModified
                            ));
                        }

                        // 导入代码文件
                        for (const fileData of data.codeFiles) {
                            codeFiles.value.push(new File(
                                fileData.name,
                                fileData.content,
                                fileData.renderedDocument,
                                'code',
                                fileData.localPath || fileData.name,
                                fileData.lastModified
                            ));
                        }

                        // 导入标注
                        for (const annoData of data.annotations) {
                            const annotation = new Annotation();
                            annotation.id = annoData.id || crypto.randomUUID();
                            annotation.category = annoData.category;
                            annotation.updateTime = annoData.updateTime;

                            // 导入文档范围
                            for (const rangeData of annoData.docRanges) {
                                annotation.docRanges.push(new DocumentRange(
                                    rangeData.documentId,
                                    rangeData.start,
                                    rangeData.end,
                                    rangeData.content
                                ));
                            }

                            // 导入代码范围
                            for (const rangeData of annoData.codeRanges) {
                                annotation.codeRanges.push(new CodeRange(
                                    rangeData.documentId,
                                    rangeData.start,
                                    rangeData.end,
                                    rangeData.content
                                ));
                            }

                            annotations.value.push(annotation);
                        }

                        // 自动选择第一个文档和代码文件
                        if (docFiles.value.length > 0) {
                            selectDocFile(docFiles.value[0]);
                        }
                        if (codeFiles.value.length > 0) {
                            selectCodeFile(codeFiles.value[0]);
                        }

                        ElMessage.success('标注导入成功');
                    } catch (error) {
                        console.error('导入失败:', error);
                        ElMessage.error(`导入失败: ${error.message}`);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };

        const handleExportAnnotations = () => {
            // 准备导出数据
            const exportData = {
                annotations: annotations.value.map(anno => ({
                    id: anno.id,
                    category: anno.category,
                    docRanges: anno.docRanges.map(range => ({
                        documentId: range.documentId,
                        start: range.start,
                        end: range.end,
                        content: range.content,
                    })),
                    codeRanges: anno.codeRanges.map(range => ({
                        documentId: range.documentId,
                        start: range.start,
                        end: range.end,
                        content: range.content
                    })),
                    updateTime: anno.updateTime
                })),
                docFiles: docFiles.value.map(file => ({
                    id: file.id,
                    name: file.name,
                    content: file.content,
                    type: file.type,
                    renderedDocument: file.renderedDocument,
                    lastModified: file.lastModified,
                    localPath: file.localPath
                })),
                codeFiles: codeFiles.value.map(file => ({
                    id: file.id,
                    name: file.name,
                    content: file.content,
                    type: file.type,
                    renderedDocument: file.renderedDocument,
                    lastModified: file.lastModified,
                    localPath: file.localPath
                }))
            };

            // 创建下载链接
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;



            // 生成文件名：标注项目_当前时间.json
            let defaultFilename = '标注项目';
            const now = new Date();
            const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
            a.download = `${defaultFilename}_${dateStr}.json`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            ElMessage.success('标注导出成功');
        };

        // 初始化事件监听
        onMounted(() => {
            const docPanel = document.querySelector('.content-text-doc');
            if (docPanel) {
                docPanel.addEventListener('mouseup', handleDocSelection);
            }

            const codePanel = document.querySelector('.content-text-code');
            if (codePanel) {
                codePanel.addEventListener('mouseup', handleCodeSelection);
            }
        });

        return {
            showSettingsDialog, settingsForm, saveSettings,
            docFiles, codeFiles,
            selectedDocFile, selectedCodeFile,
            selectedDocContent, selectedCodeContent,
            renderError,
            docFolderUpload,
            codeFolderUpload,
            triggerDocFolderUpload,
            triggerCodeFolderUpload,
            handleDocFolderUpload,
            handleCodeFolderUpload,
            docUpload, codeUpload,
            triggerDocUpload, triggerCodeUpload,
            handleDocUpload, handleCodeUpload,
            selectDocFile, selectCodeFile,
            removeDocFile, removeCodeFile,
            annotations,
            currentSelection,
            showAnnotationDialog,
            newAnnotation,
            selectedAnnotation,
            editingAnnotation,
            annotationName,
            createAnnotation,
            addToAnnotation,
            editAnnotation,
            saveAnnotationName,
            removeAnnotation,
            removeRange,
            formatDate: (dateStr) => {
                const date = new Date(dateStr);
                return date.toLocaleString();
            },
            gotoRange,
            handleNewTask, handleImportAnnotations, handleExportAnnotations,
        };
    }
});

/****************************
 * 应用挂载
 ****************************/
app.use(ElementPlus);
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}
app.mount('#app');