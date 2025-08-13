// ========================
// Vue & ElementPlus 初始化
// ========================
const { createApp, ref, reactive, watch } = Vue;
const { ElMessage } = ElementPlus;

// ========================
// 工具函数
// ========================
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

    return `${Math.floor(diffInMonths / 12)}年前`;
};

// ========================
// Vue 应用
// ========================
const app = createApp({
    delimiters: ['${', '}'],
    setup() {
        // ====== 状态 ======
        const showNewProjForm = ref(false);
        const creationType = ref('blank');
        const isCreating = ref(false);

        const projectForm = reactive({
            projectName: '',
            projectLocation: '',
        });

        const recentProjects = ref([]);
        const showImportDialog = ref(false);
        const importPath = ref('');
        const isImporting = ref(false);

        // ====== 方法 ======
        const fetchRecentProjects = async () => {
            try {
                const res = await axios.get('/project/history');
                recentProjects.value = res.data;
            } catch (err) {
                console.error('无法加载项目历史:', err);
                ElMessage.error('加载项目历史失败！');
            }
        };

        const openProject = async (project) => {
            try {
                await axios.post('/project/open', { name: project.name, path: project.path });
                window.location.href = `/project?name=${encodeURIComponent(project.name)}&path=${encodeURIComponent(project.path)}`;
            } catch (err) {
                ElMessage.error(`打开项目失败: ${err.response?.data?.message || err.message}`);
            }
        };

        const handleNewProject = () => {
            isCreating.value = true;
            const payload = {
                creationType: creationType.value,
                projectName: projectForm.projectName,
                projectLocation: projectForm.projectLocation,
            };

            // 校验
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
                .then(res => {
                    if (res.data.status === 'success') {
                        ElMessage.success('项目创建成功！');
                        showNewProjForm.value = false;
                        window.location.href = `/project?name=${projectForm.projectName}&path=${res.data.project_path}`;
                    }
                })
                .catch(err => {
                    ElMessage.error(`创建失败: ${err.response?.data?.message || err.message}`);
                })
                .finally(() => {
                    isCreating.value = false;
                });
        };

        const openNewProjectDialog = () => {
            creationType.value = 'blank';
            projectForm.projectName = '';
            projectForm.projectLocation = '';
            showNewProjForm.value = true;
        };

        const openImportDialog = () => {
            importPath.value = '';
            showImportDialog.value = true;
        };

        const handleImportProject = () => {
            if (!importPath.value) {
                ElMessage.error('项目文件夹路径不能为空！');
                return;
            }
            isImporting.value = true;

            axios.post('/project/import', { path: importPath.value })
                .then(res => {
                    if (res.data.status === 'success') {
                        showImportDialog.value = false;
                        ElMessage.success('项目验证成功，正在打开...');
                        openProject(res.data.project);
                    }
                })
                .catch(err => {
                    ElMessage.error(`导入失败: ${err.response?.data?.message || err.message}`);
                })
                .finally(() => {
                    isImporting.value = false;
                });
        };

        // ====== 监听 ======
        watch(() => projectForm.projectLocation, (newPath) => {
            if (creationType.value === 'folder' && newPath) {
                const pathParts = newPath.replace(/\\/g, '/').split('/');
                const folderName = pathParts.pop() || pathParts.pop();
                if (folderName) {
                    projectForm.projectName = folderName;
                }
            }
        });

        // ====== 初始化 ======
        fetchRecentProjects();

        // ====== 暴露到模板 ======
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

// 注册 ElementPlus
app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, comp);
}
app.mount('#app');


// ========================
// DOM 相关（导航切换）
// ========================
const navItems = document.querySelectorAll('.nav-item');
const sections = {
    'start': document.getElementById('start-section'),
    'semi-auto': document.getElementById('semi-auto-section'),
    'annotation': document.getElementById('annotation-section'),
};

navItems.forEach(item => {
    console.log(`注册导航项: ${item.textContent.trim()}`);
    item.addEventListener('click', () => {
        console.log(`切换到 ${item.textContent.trim()} 区域`);

        const sectionId = item.getAttribute('data-section');
        
        // 更新导航状态
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // 切换内容区
        Object.values(sections).forEach(section => {
            section.style.display = 'none';
        });
        if (sections[sectionId]) {
            sections[sectionId].style.display = 'block';
        }
    });
});

// 默认点击第一个
document.querySelector('.nav-item')?.click();
