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

// 项目功能
function handleNewProject() {
    alert('新建项目功能：开始导入需求文档和代码');
    // 实际实现中，这里应该跳转到新建项目页面
}

// 打开项目功能
function openProject(projectId) {
    // 模拟跳转到项目视图
    window.location.href = `/project?id=${projectId}`;
}

// 初始化：设置第一个导航项为活动状态
document.querySelector('.nav-item').click();