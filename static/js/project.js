// 当前活动视图
let activeView = 'statsView';

// 初始化视图
function initViews() {
    console.log('Initializing views...');
    document.getElementById('statsView').style.display = 'block';
}

// 切换视图
function switchView(viewName) {
    // Hide all views
    document.getElementById('statsView').style.display = 'none';
    document.getElementById('alignmentView').style.display = 'none';

    // Show the selected view
    const viewElement = document.getElementById(viewName + 'View');
    if (viewName === 'stats') {
        viewElement.style.display = 'block'; // 项目视图 uses block
    } else {
        viewElement.style.display = 'flex'; // Other views use flex
    }
    activeView = viewName + 'View';

    // Update button active state
    document.getElementById('statsButton').classList.remove('active');
    document.getElementById('alignmentButton').classList.remove('active');
    document.getElementById(viewName + 'Button').classList.add('active');
}

// 预览和导出功能（占位实现）
function previewPanel() {
    alert('预览功能将在后续实现');
}

function exportPanel() {
    alert('导出功能将在后续实现');
}

// 初始化
window.addEventListener('DOMContentLoaded', initViews);

const { createApp, ref, watch, nextTick } = Vue;
const { ElButton, ElMessage } = ElementPlus;
const app = createApp({
  delimiters: ['${', '}'],
    setup() {
        return {
        };
  }
});

app.use(ElementPlus);
app.mount('#app');