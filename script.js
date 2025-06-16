// --- START OF FILE script.js (最終修正・完全版) ---

document.addEventListener('DOMContentLoaded', () => {
    // ------------------- !! ここを自分の設定に書き換える !! -------------------
    const firebaseConfig = {
      apiKey: "AIzaSyA3t3i36UNhyLXQMImx9QckMAvbJMFUtMc",
      authDomain: "my-task-app-e7811.firebaseapp.com",
      projectId: "my-task-app-e7811",
      storageBucket: "my-task-app-e7811.firebasestorage.app",
      messagingSenderId: "73821534483",
      appId: "1:73821534483:web:bd073665ecba1eae91c2e6"
    };
    // -------------------------------------------------------------------------

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    let tasks = [];
    let currentUser = null;
    let unsubscribeTasks = null;
    let userSettings = {}; 
    let gantt = null; 

    // DOM Elements
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const userEmailDisplay = document.getElementById('user-email-display');
    const logoutBtn = document.getElementById('logout-btn');
    const fab = document.getElementById('fab-add-task');
    const taskPanel = document.getElementById('task-panel');
    const taskForm = document.getElementById('task-form');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const panelTitle = document.getElementById('panel-title');
    const taskTitleInput = document.getElementById('task-title-input');
    const taskMemoInput = document.getElementById('task-memo-input');
    const dueDateInput = document.getElementById('task-due-date-input');
    const startDateInput = document.getElementById('task-start-date-input');
    const quadrantTabs = document.querySelector('.quadrant-tabs');
    const overlay = document.getElementById('overlay');
    const deleteCompletedBtn = document.getElementById('delete-completed-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const dueDatePositionSetting = document.getElementById('due-date-position-setting');
    const deadlineDaysInput = document.getElementById('deadline-days-input');
    const deadlineColorInput = document.getElementById('deadline-color-input');
    const viewMatrixBtn = document.getElementById('view-matrix-btn');
    const viewGanttBtn = document.getElementById('view-gantt-btn');
    const matrixView = document.getElementById('matrix-view');
    const ganttView = document.getElementById('gantt-view');
    const addToGanttBtn = document.getElementById('add-to-gantt-btn');
    const ganttModal = document.getElementById('gantt-modal');
    const closeGanttModalBtn = document.getElementById('close-gantt-modal-btn');
    const datelessTaskList = document.getElementById('dateless-task-list');
    const ganttTaskForm = document.getElementById('gantt-task-form');
    const ganttTaskId = document.getElementById('gantt-task-id');
    const ganttTaskTitle = document.getElementById('gantt-task-title');
    const ganttStartDate = document.getElementById('gantt-start-date');
    const ganttDueDate = document.getElementById('gantt-due-date');

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            loginContainer.style.display = 'none';
            appContainer.style.display = 'block';
            fab.style.display = 'block';
            userEmailDisplay.textContent = currentUser.email;
            loadSettings(); 
            listenForTasks();
        } else {
            currentUser = null;
            loginContainer.style.display = 'flex';
            appContainer.style.display = 'none';
            fab.style.display = 'none';
            if (unsubscribeTasks) unsubscribeTasks();
        }
    });

    loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        loginError.textContent = '';
        auth.signInWithEmailAndPassword(email, password).catch(error => {
            console.error("ログインエラー:", error.code);
            let message = 'ログインに失敗しました。';
            switch (error.code) {
                case 'auth/invalid-email': message = '無効なメールアドレス形式です。'; break;
                case 'auth/user-not-found': message = 'このメールアドレスは登録されていません。'; break;
                case 'auth/wrong-password': message = 'パスワードが間違っています。'; break;
                case 'auth/too-many-requests': message = '試行回数が多すぎます。後でもう一度お試しください。'; break;
                default: message = 'エラーが発生しました。時間をおいて再度お試しください。';
            }
            loginError.textContent = message;
        });
    });

    logoutBtn.addEventListener('click', () => auth.signOut());

    viewMatrixBtn.addEventListener('click', () => switchView('matrix'));
    viewGanttBtn.addEventListener('click', () => switchView('gantt'));

    function switchView(viewName) {
        if (viewName === 'matrix') {
            matrixView.style.display = 'block';
            ganttView.style.display = 'none';
            viewMatrixBtn.classList.add('active');
            viewGanttBtn.classList.remove('active');
        } else {
            matrixView.style.display = 'none';
            ganttView.style.display = 'block';
            viewMatrixBtn.classList.remove('active');
            viewGanttBtn.classList.add('active');
            renderGanttChart();
        }
    }

    const defaultSettings = { dueDatePosition: 'bottom', deadlineDays: 3, deadlineColor: '#f1c40f' };

    function loadSettings() {
        const savedSettings = localStorage.getItem(`settings_${currentUser.uid}`);
        userSettings = savedSettings ? JSON.parse(savedSettings) : { ...defaultSettings };
        applySettingsToApp();
    }

    function saveAndApplySettings() {
        userSettings.dueDatePosition = dueDatePositionSetting.querySelector('.active').dataset.value;
        userSettings.deadlineDays = parseInt(deadlineDaysInput.value, 10);
        userSettings.deadlineColor = deadlineColorInput.value;
        localStorage.setItem(`settings_${currentUser.uid}`, JSON.stringify(userSettings));
        applySettingsToApp();
        closeSettingsPanel();
        renderTasks(); 
    }

    function applySettingsToApp() {
        document.body.classList.toggle('view-inline', userSettings.dueDatePosition === 'inline');
        document.documentElement.style.setProperty('--warning-color', userSettings.deadlineColor);
    }
    
    function openSettingsPanel() {
        dueDatePositionSetting.querySelector('.active')?.classList.remove('active');
        dueDatePositionSetting.querySelector(`[data-value="${userSettings.dueDatePosition}"]`).classList.add('active');
        deadlineDaysInput.value = userSettings.deadlineDays;
        deadlineColorInput.value = userSettings.deadlineColor;
        settingsPanel.style.display = 'block';
        overlay.classList.add('is-open');
    }

    function closeSettingsPanel() {
        settingsPanel.style.display = 'none';
        if (!taskPanel.classList.contains('is-open')) {
            overlay.classList.remove('is-open');
        }
    }

    settingsBtn.addEventListener('click', openSettingsPanel);
    closeSettingsBtn.addEventListener('click', closeSettingsPanel);
    saveSettingsBtn.addEventListener('click', saveAndApplySettings);
    
    dueDatePositionSetting.addEventListener('click', e => {
        if(e.target.matches('.setting-tab')) {
            dueDatePositionSetting.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
        }
    });

    let isDragging = false;
    let offset = { x: 0, y: 0 };
    const settingsHeader = document.getElementById('settings-panel-header');
    settingsHeader.addEventListener('mousedown', e => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        isDragging = true;
        offset = { x: settingsPanel.offsetLeft - e.clientX, y: settingsPanel.offsetTop - e.clientY };
        settingsHeader.style.cursor = 'grabbing';
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        settingsHeader.style.cursor = 'move';
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        e.preventDefault();
        settingsPanel.style.left = (e.clientX + offset.x) + 'px';
        settingsPanel.style.top = (e.clientY + offset.y) + 'px';
    });

    function listenForTasks() {
        if (unsubscribeTasks) unsubscribeTasks();
        unsubscribeTasks = db.collection('tasks').where('userId', '==', currentUser.uid).orderBy('order', 'asc').onSnapshot(querySnapshot => {
            tasks = [];
            querySnapshot.forEach(doc => { tasks.push({ id: doc.id, ...doc.data() }); });
            renderTasks();
            if (gantt) renderGanttChart(); 
        }, error => {
            console.error("タスクの取得に失敗しました:", error);
            if (error.code === 'failed-precondition' && error.message.includes('index')) {
                const link = error.message.match(/https?:\/\/[^\s]+/);
                if (link) { loginError.innerHTML = `タスクの取得に失敗しました。データベースのインデックスが必要です。<a href="${link[0]}" target="_blank">こちらをクリックしてインデックスを作成してください。</a>`; }
            }
        });
    }

    function renderTasks() {
        document.querySelectorAll('.task-list').forEach(list => list.innerHTML = '');
        tasks.forEach(task => {
            const list = document.querySelector(`#${task.quadrant} .task-list`);
            if (list) list.appendChild(createTaskElement(task));
        });
    }

    function createTaskElement(task) {
        const li = document.createElement('li');
        li.id = task.id;
        li.className = `task-item ${task.completed ? 'completed' : ''}`;
        li.draggable = true;
        li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', task.id); setTimeout(() => li.classList.add('dragging'), 0); });
        li.addEventListener('dragend', () => { li.classList.remove('dragging'); });
        const startDateHTML = task.startDate ? `<span class="start-date">▶ ${task.startDate}</span>` : '';
        const dueDateHTML = task.dueDate ? `<span class="due-date ${getDueDateClass(task.dueDate)}">🏁 ${task.dueDate}</span>` : '';
        const metaHTML = (startDateHTML || dueDateHTML) ? `<div class="task-meta">${startDateHTML}${dueDateHTML}</div>` : '';
        li.innerHTML = `<div class="task-item-content"><div class="task-main"><input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}><div class="task-details"><div class="task-title">${escapeHTML(task.title)}</div>${task.memo ? `<div class="task-memo">${escapeHTML(task.memo)}</div>` : ''}</div></div>${metaHTML}</div>`;
        li.querySelector('.task-checkbox').addEventListener('change', () => { db.collection('tasks').doc(task.id).update({ completed: !task.completed }); });
        li.addEventListener('click', e => { if (!e.target.closest('.task-checkbox')) openTaskPanel(task); });
        return li;
    }
    
    document.querySelectorAll('.quadrant').forEach(quadrant => {
        quadrant.addEventListener('dragover', e => {
            e.preventDefault();
            const draggingEl = document.querySelector('.dragging');
            if (!draggingEl) return;
            const afterElement = getDragAfterElement(quadrant.querySelector('.task-list'), e.clientY);
            const list = quadrant.querySelector('.task-list');
            if (afterElement == null) { list.appendChild(draggingEl); } else { list.insertBefore(draggingEl, afterElement); }
            quadrant.classList.add('drag-over');
        });
        quadrant.addEventListener('dragleave', () => { quadrant.classList.remove('drag-over'); });
        quadrant.addEventListener('drop', e => {
            e.preventDefault();
            quadrant.classList.remove('drag-over');
            const taskId = e.dataTransfer.getData('text/plain');
            const newQuadrantId = quadrant.dataset.quadrantId;
            const afterElement = getDragAfterElement(quadrant.querySelector('.task-list'), e.clientY);
            const tasksInNewQuadrant = tasks.filter(t => t.quadrant === newQuadrantId && t.id !== taskId);
            let newOrder;
            const afterElId = afterElement ? afterElement.id : null;
            const afterElIndex = tasksInNewQuadrant.findIndex(t => t.id === afterElId);
            if (afterElId == null) { const lastTask = tasksInNewQuadrant[tasksInNewQuadrant.length - 1]; newOrder = (lastTask ? lastTask.order : 0) + 1000; } 
            else if (afterElIndex === 0) { newOrder = tasksInNewQuadrant[0].order / 2; } 
            else { const prevTask = tasksInNewQuadrant[afterElIndex - 1]; const nextTask = tasksInNewQuadrant[afterElIndex]; newOrder = (prevTask.order + nextTask.order) / 2; }
            db.collection('tasks').doc(taskId).update({ quadrant: newQuadrantId, order: newOrder });
        });
    });
    
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; } 
            else { return closest; }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    let editingTaskId = null;
    fab.addEventListener('click', () => openTaskPanel());
    closePanelBtn.addEventListener('click', closeTaskPanel);
    overlay.addEventListener('click', () => { closeTaskPanel(); closeSettingsPanel(); closeGanttModal(); });
    quadrantTabs.addEventListener('click', e => {
        if (e.target.matches('.quadrant-tab')) {
            quadrantTabs.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
        }
    });

    function openTaskPanel(task = null) {
        taskForm.reset();
        quadrantTabs.querySelector('.active')?.classList.remove('active');
        if (task) {
            editingTaskId = task.id;
            panelTitle.textContent = 'タスクを編集';
            taskTitleInput.value = task.title;
            taskMemoInput.value = task.memo || '';
            dueDateInput.value = task.dueDate || '';
            startDateInput.value = task.startDate || '';
            quadrantTabs.querySelector(`[data-value="${task.quadrant}"]`).classList.add('active');
        } else {
            editingTaskId = null;
            panelTitle.textContent = '新しいタスク';
            quadrantTabs.querySelector('[data-value="q1"]').classList.add('active');
        }
        taskPanel.classList.add('is-open');
        overlay.classList.add('is-open');
    }

    function closeTaskPanel() {
        taskPanel.classList.remove('is-open');
        if ((!settingsPanel.style.display || settingsPanel.style.display === 'none') && (!ganttModal.style.display || ganttModal.style.display === 'none')) {
            overlay.classList.remove('is-open');
        }
    }

    taskForm.addEventListener('submit', e => {
        e.preventDefault();
        const taskData = {
            title: taskTitleInput.value.trim(), memo: taskMemoInput.value.trim(), dueDate: dueDateInput.value,
            startDate: startDateInput.value, quadrant: quadrantTabs.querySelector('.active').dataset.value, userId: currentUser.uid
        };
        if (editingTaskId) { db.collection('tasks').doc(editingTaskId).update(taskData); } 
        else {
            taskData.completed = false;
            taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const lastTask = tasks.length > 0 ? tasks[tasks.length - 1] : null;
            taskData.order = (lastTask ? lastTask.order : Date.now()) + 1000;
            db.collection('tasks').add(taskData);
        }
        closeTaskPanel();
    });

    deleteCompletedBtn.addEventListener('click', () => {
        const completedTasks = tasks.filter(t => t.completed);
        if (completedTasks.length === 0) return alert('完了済みのタスクがありません。');
        if (confirm(`${completedTasks.length}件の完了済みタスクを削除しますか？`)) {
            const batch = db.batch();
            completedTasks.forEach(task => { batch.delete(db.collection('tasks').doc(task.id)); });
            batch.commit();
        }
    });

    function renderGanttChart() {
        if (!ganttView.style.display || ganttView.style.display === 'none') return;
        const ganttTasks = tasks.filter(task => task.startDate && task.dueDate).map(task => ({
            id: task.id, name: task.title, start: task.startDate, end: task.dueDate,
            progress: task.completed ? 100 : 0, custom_class: `bar-${task.quadrant} ${task.completed ? 'bar-completed' : ''}`
        }));
        const ganttContainer = document.getElementById('gantt-chart');
        ganttContainer.innerHTML = ''; 
        if (ganttTasks.length === 0) { ganttContainer.innerHTML = '<p>ガントチャートに表示できるタスクがありません。</p>'; return; }
        gantt = new Gantt("#gantt-chart", ganttTasks, {
            on_click: (task) => { const originalTask = tasks.find(t => t.id === task.id); if (originalTask) openTaskPanel(originalTask); },
            on_date_change: (task, start, end) => {
                const startDateStr = start.toISOString().split('T')[0];
                const endDateStr = end.toISOString().split('T')[0];
                db.collection('tasks').doc(task.id).update({ startDate: startDateStr, dueDate: endDateStr });
            },
            language: 'ja'
        });
    }

    addToGanttBtn.addEventListener('click', () => {
        datelessTaskList.innerHTML = '';
        const datelessTasks = tasks.filter(t => !t.startDate || !t.dueDate);
        // 【修正】HTMLタグが混入していた箇所を修正
        if (datelessTasks.length === 0) { 
            alert('日付が未設定のタスクはありません。');
            return;
        }
        datelessTasks.forEach(task => {
            const li = document.createElement('li');
            li.textContent = task.title;
            li.dataset.taskId = task.id;
            li.addEventListener('click', () => {
                datelessTaskList.querySelector('.selected')?.classList.remove('selected');
                li.classList.add('selected');
                ganttTaskId.value = task.id;
                ganttTaskTitle.value = task.title;
            });
            datelessTaskList.appendChild(li);
        });
        ganttModal.style.display = 'flex';
        overlay.classList.add('is-open');
    });

    function closeGanttModal() {
        ganttModal.style.display = 'none';
        ganttTaskForm.reset();
        if (!taskPanel.classList.contains('is-open') && (!settingsPanel.style.display || settingsPanel.style.display === 'none')) {
            overlay.classList.remove('is-open');
        }
    }

    closeGanttModalBtn.addEventListener('click', closeGanttModal);
    
    ganttTaskForm.addEventListener('submit', e => {
        e.preventDefault();
        const taskId = ganttTaskId.value;
        const startDate = ganttStartDate.value;
        const dueDate = ganttDueDate.value;
        if (!taskId) { alert('タスクを選択してください。'); return; }
        db.collection('tasks').doc(taskId).update({ startDate, dueDate });
        closeGanttModal();
    });

    function escapeHTML(str) {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }
    
    function getDueDateClass(dueDateStr) {
        if (!dueDateStr) return '';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(dueDateStr);
        if (dueDate < today) return 'overdue';
        const deadline = new Date(today);
        deadline.setDate(today.getDate() + userSettings.deadlineDays);
        if (dueDate <= deadline) return 'warning';
        return '';
    }
});
