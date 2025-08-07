// Vue 和 ElementPlus 相关代码
const { createApp, ref, watch } = Vue;
const { ElButton, ElMessage } = ElementPlus;

const app = createApp({
  delimiters: ['${', '}'],
  setup() {
      const showNewProjForm = ref(false);
      const projectName = ref('');
      const projectPath = ref(null);

      const handleNewProject = () => {
          showNewProjForm.value = false;
          payload = {
              projectName: projectName.value,
              projectLocation: projectPath.value
          };
          axios.post('/project/create', payload)
              .then(response => {
                  if (response.data.status === 'success') {
                      ElMessage({
                          message: '创建项目成功！',
                          type: 'success',
                          duration: 3000
                      });
                      window.location.href = `/project?name=${projectName.value}`;
                  }
              })
              .catch(error => {
                  ElMessage({
                      message: '创建项目失败: ' + (error.response?.data?.message || error.message),
                      type: 'error',
                      duration: 3000
                  });
              });
      };

      const handleOpenProject = () => { 
            // 这里可以实现打开项目的逻辑
            ElMessage({
                message: '打开项目功能将在后续实现',
                type: 'info',
                duration: 3000
            });
      }

    return {
        showNewProjForm,
        projectName,
        projectPath,
        handleNewProject,
        handleOpenProject
    };
  }
});

app.use(ElementPlus);
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.mount('#app');

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
