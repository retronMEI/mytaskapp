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

    // Firebase初期化
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    let tasks = [];
    let currentUser = null;
    let unsubscribeTasks = null; // リアルタイムリスナーの解除用

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
    // ... 他のDOM要素も必要に応じて取得 ...
    
    // --- 認証状態の監視 ---
    auth.onAuthStateChanged(user => {
        if (user) {
            // ログイン済み
            currentUser = user;
            loginContainer.style.display = 'none';
            appContainer.style.display = 'block';
            fab.style.display = 'block';
            userEmailDisplay.textContent = currentUser.email;
            listenForTasks();
        } else {
            // ログアウト済み
            currentUser = null;
            loginContainer.style.display = 'flex';
            appContainer.style.display = 'none';
            fab.style.display = 'none';
            if (unsubscribeTasks) unsubscribeTasks(); // リスナーを解除
        }
    });

    // --- イベントリスナー ---
    loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        // エラーメッセージを一旦リセット
        loginError.textContent = '';

        auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                console.error("ログインエラー:", error.code); // 開発用にコンソールにエラーコードを出力
                let message = 'ログインに失敗しました。';
                switch (error.code) {
                    case 'auth/invalid-email':
                        message = '無効なメールアドレス形式です。';
                        break;
                    case 'auth/user-not-found':
                        message = 'このメールアドレスは登録されていません。';
                        break;
                    case 'auth/wrong-password':
                        message = 'パスワードが間違っています。';
                        break;
                    case 'auth/too-many-requests':
                        message = '試行回数が多すぎます。後でもう一度お試しください。';
                        break;
                    default:
                        message = 'エラーが発生しました。時間をおいて再度お試しください。';
                }
                loginError.textContent = message;
            });
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });

    // --- タスクデータのリアルタイム監視 ---
    function listenForTasks() {
        if (unsubscribeTasks) unsubscribeTasks(); // 古いリスナーを解除

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
            });
    }

    // --- タスク描画 ---
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
        
        li.innerHTML = `
            <div class="task-item-content">
                <div class="task-main">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                    <div class="task-details">
                        <div class="task-title">${escapeHTML(task.title)}</div>
                        ${task.memo ? `<div class="task-memo">${escapeHTML(task.memo)}</div>` : ''}
                    </div>
                </div>
                ${task.dueDate ? `<div class="task-meta"><span class="due-date ${getDueDateClass(task.dueDate)}">${task.dueDate}</span></div>` : ''}
            </div>
        `;

        li.querySelector('.task-checkbox').addEventListener('change', () => {
            db.collection('tasks').doc(task.id).update({ completed: !task.completed });
        });
        li.addEventListener('click', e => { if (e.target.type !== 'checkbox') openTaskPanel(task); });
        // Drag & Drop event listeners should be added here
        return li;
    }

    // --- タスクパネル操作 ---
    let editingTaskId = null;
    const panelTitle = document.getElementById('panel-title');
    const taskIdInput = document.getElementById('task-id-input');
    const taskTitleInput = document.getElementById('task-title-input');
    const taskMemoInput = document.getElementById('task-memo-input');
    const dueDateInput = document.getElementById('task-due-date-input');
    const quadrantTabs = document.querySelector('.quadrant-tabs');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const overlay = document.getElementById('overlay');
    
    fab.addEventListener('click', () => openTaskPanel());
    closePanelBtn.addEventListener('click', closeTaskPanel);
    overlay.addEventListener('click', closeTaskPanel);
    
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
        overlay.classList.remove('is-open');
    }

    // --- タスクの保存/更新 ---
    taskForm.addEventListener('submit', e => {
        e.preventDefault();
        const taskData = {
            title: taskTitleInput.value.trim(),
            memo: taskMemoInput.value.trim(),
            dueDate: dueDateInput.value,
            quadrant: quadrantTabs.querySelector('.active').dataset.value,
            userId: currentUser.uid
        };

        if (editingTaskId) {
            // 更新
            db.collection('tasks').doc(editingTaskId).update(taskData);
        } else {
            // 新規作成
            taskData.completed = false;
            taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            db.collection('tasks').add(taskData);
        }
        closeTaskPanel();
    });

    // --- 完了済みタスクの削除 ---
    document.getElementById('delete-completed-btn').addEventListener('click', () => {
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

    // --- ヘルパー関数 ---
    function escapeHTML(str) {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }
    
    function getDueDateClass(dueDateStr) {
        if (!dueDateStr) return '';
        const today = new Date(); today.setHours(0,0,0,0);
        const dueDate = new Date(dueDateStr);
        if (dueDate < today) return 'overdue';
        return '';
    }
});
