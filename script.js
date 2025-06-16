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
    const overlay = document.getElementById('overlay');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const dueDatePositionSetting = document.getElementById('due-date-position-setting');
    const deadlineDaysInput = document.getElementById('deadline-days-input');
    const deadlineColorInput = document.getElementById('deadline-color-input');
    const deleteCompletedBtn = document.getElementById('delete-completed-btn');

    // =================================================================
    //  初期化と認証
    // =================================================================
    
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
        auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
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


    // =================================================================
    //  設定 (Settings)
    // =================================================================
    
    const defaultSettings = {
        dueDatePosition: 'bottom',
        deadlineDays: 3,
        deadlineColor: '#f1c40f'
    };

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
        offset = {
            x: settingsPanel.offsetLeft - e.clientX,
            y: settingsPanel.offsetTop - e.clientY
        };
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


    // =================================================================
    //  タスク関連
    // =================================================================
    
    function listenForTasks() {
        if (unsubscribeTasks) unsubscribeTasks();
        unsubscribeTasks = db.collection('tasks')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .onSnapshot(querySnapshot => {
                tasks = [];
                querySnapshot.forEach(doc => {
                    tasks.push({ id: doc.id, ...doc.data() });
                });
                renderTasks();
            }, error => {
                console.error("タスクの取得に失敗しました:", error);
                if (error.code === 'failed-precondition') {
                    const link = error.message.match(/https?:\/\/[^\s]+/);
                    if (link) {
                       loginError.innerHTML = `タスクの取得に失敗しました。データベースのインデックスが必要です。<a href="${link[0]}" target="_blank">こちらをクリックしてインデックスを作成してください。</a>`;
                    }
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
        
        li.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', task.id);
            setTimeout(() => li.classList.add('dragging'), 0);
        });
        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
        });
        
        const startDateHTML = task.startDate ? `<span class="start-date">▶ ${task.startDate}</span>` : '';
        const dueDateHTML = task.dueDate ? `<span class="due-date ${getDueDateClass(task.dueDate)}">🏁 ${task.dueDate}</span>` : '';
        const metaHTML = (startDateHTML || dueDateHTML) ? `<div class="task-meta">${startDateHTML}${dueDateHTML}</div>` : '';
        
        li.innerHTML = `
            <div class="task-item-content">
                <div class="task-main">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                    <div class="task-details">
                        <div class="task-title">${escapeHTML(task.title)}</div>
                        ${task.memo ? `<div class="task-memo">${escapeHTML(task.memo)}</div>` : ''}
                    </div>
                </div>
                ${metaHTML}
            </div>
        `;

        li.querySelector('.task-checkbox').addEventListener('change', () => {
            db.collection('tasks').doc(task.id).update({ completed: !task.completed });
        });
        li.addEventListener('click', e => { if (e.target.type !== 'checkbox') openTaskPanel(task); });
        
        return li;
    }
    
    document.querySelectorAll('.quadrant').forEach(quadrant => {
        quadrant.addEventListener('dragover', e => {
            e.preventDefault();
            quadrant.classList.add('drag-over');
        });
        quadrant.addEventListener('dragleave', () => {
            quadrant.classList.remove('drag-over');
        });
        quadrant.addEventListener('drop', e => {
            e.preventDefault();
            quadrant.classList.remove('drag-over');
            const taskId = e.dataTransfer.getData('text/plain');
            const newQuadrantId = quadrant.dataset.quadrantId;
            const task = tasks.find(t => t.id === taskId);
            if (task && task.quadrant !== newQuadrantId) {
                db.collection('tasks').doc(taskId).update({ quadrant: newQuadrantId });
            }
        });
    });

    let editingTaskId = null;
    const panelTitle = document.getElementById('panel-title');
    const taskTitleInput = document.getElementById('task-title-input');
    const taskMemoInput = document.getElementById('task-memo-input');
    const dueDateInput = document.getElementById('task-due-date-input');
    const startDateInput = document.getElementById('task-start-date-input');
    const quadrantTabs = document.querySelector('.quadrant-tabs');
    const closePanelBtn = document.getElementById('close-panel-btn');
    
    fab.addEventListener('click', () => openTaskPanel());
    closePanelBtn.addEventListener('click', closeTaskPanel);
    
    overlay.addEventListener('click', () => {
        closeTaskPanel();
        closeSettingsPanel();
    });
    
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
        if (!settingsPanel.style.display || settingsPanel.style.display === 'none') {
            overlay.classList.remove('is-open');
        }
    }

    taskForm.addEventListener('submit', e => {
        e.preventDefault();
        const taskData = {
            title: taskTitleInput.value.trim(),
            memo: taskMemoInput.value.trim(),
            dueDate: dueDateInput.value,
            startDate: startDateInput.value,
            quadrant: quadrantTabs.querySelector('.active').dataset.value,
            userId: currentUser.uid
        };

        if (editingTaskId) {
            db.collection('tasks').doc(editingTaskId).update(taskData);
        } else {
            taskData.completed = false;
            taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            db.collection('tasks').add(taskData);
        }
        closeTaskPanel();
    });

    deleteCompletedBtn.addEventListener('click', () => {
        const completedTasks = tasks.filter(t => t.completed);
        if (completedTasks.length === 0) return alert('完了済みのタスクがありません。');
        if (confirm(`${completedTasks.length}件の完了済みタスクを削除しますか？`)) {
            const batch = db.batch();
            completedTasks.forEach(task => {
                batch.delete(db.collection('tasks').doc(task.id));
            });
            batch.commit();
        }
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
