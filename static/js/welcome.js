// Vue 和 ElementPlus 相关代码
const { createApp, ref, reactive, watch } = Vue;
const { ElButton, ElMessage, ElDialog, ElForm, ElFormItem, ElInput, ElIcon } = ElementPlus;

// 导航切换功能
const navItems = document.querySelectorAll('.nav-item');
const sections = {
    'start': document.getElementById('start-section'),
    'semi-auto': document.getElementById('semi-auto-section')
};

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const sectionId = item.getAttribute('data-section');
        
        // 更新活动导航项
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // 显示对应内容区域
        Object.values(sections).forEach(section => {
            section.style.display = 'none';
        });
        sections[sectionId].style.display = 'block';
    });
});

// 初始化：设置第一个导航项为活动状态
document.querySelector('.nav-item').click();

// 格式化时间
const formatRelativeTime = (isoString) => {
    const now = new Date();
    const past = new Date(isoString);
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) return '刚刚';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}分钟前`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}小时前`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return '昨天';
    if (diffInDays < 30) return `${diffInDays}天前`;
    
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths}个月前`;
    
    return `${Math.floor(diffInMonths/12)}年前`;
};

const app = createApp({
    delimiters: ['${', '}'],
    setup() {
        const showNewProjForm = ref(false);
        const creationType = ref('blank'); // 'blank' 或 'folder'
        const isCreating = ref(false);

        const projectForm = reactive({
            projectName: '',
            projectLocation: '',
        });
        
        const recentProjects = ref([]);
        const showImportDialog = ref(false);
        const importPath = ref('');
        const isImporting = ref(false);

        const fetchRecentProjects = async () => {
            try {
                const response = await axios.get('/project/history');
                recentProjects.value = response.data;
            } catch (error) {
                console.error("无法加载项目历史:", error);
                ElMessage.error('加载项目历史失败！');
            }
        };

        const openProject = async (project) => {
            try {
                // 通知后端此项目被打开，以更新时间戳
                await axios.post('/project/open', { name: project.name, path: project.path });
                // 跳转到项目页面
                window.location.href = `/project?name=${encodeURIComponent(project.name)}&path=${encodeURIComponent(project.path)}`;
            } catch (error) {
                ElMessage.error(`打开项目失败: ${error.response?.data?.message || error.message}`);
            }
        };

        // 监视文件夹路径变化，如果项目名称为空，则自动填充
        watch(() => projectForm.projectLocation, (newPath) => {
            if (creationType.value === 'folder' && newPath) {
                // 尝试从路径中提取最后一个部分作为默认项目名
                const pathParts = newPath.replace(/\\/g, '/').split('/');
                const folderName = pathParts.pop() || pathParts.pop(); // 处理末尾的斜杠
                if (folderName) {
                    projectForm.projectName = folderName;
                }
            }
        });
        
        const handleNewProject = () => {
            isCreating.value = true;
            let payload = {
                creationType: creationType.value,
                projectName: projectForm.projectName,
                projectLocation: projectForm.projectLocation,
            };

            // 前端校验
            if (!payload.projectLocation) {
                ElMessage.error(creationType.value === 'blank' ? '项目存放位置不能为空！' : '项目文件夹路径不能为空！');
                isCreating.value = false;
                return;
            }
            if (!payload.projectName) {
                 ElMessage.error('项目名称不能为空！');
                 isCreating.value = false;
                 return;
            }

            axios.post('/project/create', payload)
                .then(response => {
                    if (response.data.status === 'success') {
                        ElMessage({
                            message: '项目创建成功！',
                            type: 'success',
                        });
                        showNewProjForm.value = false;
                        // 刷新或跳转到项目页面
                        window.location.href = `/project?name=${projectForm.projectName}&path=${response.data.project_path}`;
                    }
                })
                .catch(error => {
                    ElMessage({
                        message: `创建失败: ${error.response?.data?.message || error.message}`,
                        type: 'error',
                        duration: 5000
                    });
                })
                .finally(() => {
                    isCreating.value = false;
                });
        };

        const openNewProjectDialog = () => {
            // 重置表单状态
            creationType.value = 'blank';
            projectForm.projectName = '';
            projectForm.projectLocation = '';
            showNewProjForm.value = true;
        };

        // 导入项目对话框相关逻辑
        const openImportDialog = () => {
            importPath.value = ''; // 清空上次输入
            showImportDialog.value = true;
        };

        const handleImportProject = () => {
            if (!importPath.value) {
                ElMessage.error('项目文件夹路径不能为空！');
                return;
            }
            isImporting.value = true;
            
            axios.post('/project/import', { path: importPath.value })
                .then(response => {
                    if (response.data.status === 'success') {
                        showImportDialog.value = false;
                        ElMessage.success('项目验证成功，正在打开...');
                        // 直接调用现有的 openProject 函数，它会处理历史记录更新和页面跳转
                        openProject(response.data.project);
                    }
                })
                .catch(error => {
                    ElMessage.error(`导入失败: ${error.response?.data?.message || error.message}`);
                })
                .finally(() => {
                    isImporting.value = false;
                });
        };

        // --- 页面加载时执行 ---
        fetchRecentProjects();

        return {
            showNewProjForm,
            creationType,
            projectForm,
            isCreating,
            recentProjects,
            handleNewProject,
            openNewProjectDialog,
            formatRelativeTime,
            openProject,
            showImportDialog,
            importPath,
            isImporting,
            openImportDialog,
            handleImportProject,
        };
    }
});

app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.mount('#app');