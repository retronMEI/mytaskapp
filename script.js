// --- START OF FILE script.js (ガントチャート機能追加・完全版) ---

document.addEventListener('DOMContentLoaded', () => {
    // ------------------- !! ここを自分の設定に書き換える !! -------------------
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_AUTH_DOMAIN",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_STORAGE_BUCKET",
        messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
        appId: "YOUR_APP_ID"
    };
    // -------------------------------------------------------------------------

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    let tasks = [];
    let currentUser = null;
    let unsubscribeTasks = null;
    let userSettings = {}; 
    let gantt = null; // 【新規】ガントチャートのインスタンス

    // DOM Elements
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    // ... (既存のDOM要素) ...
    const overlay = document.getElementById('overlay');
    const deleteCompletedBtn = document.getElementById('delete-completed-btn');

    // 【新規】表示モード関連
    const viewMatrixBtn = document.getElementById('view-matrix-btn');
    const viewGanttBtn = document.getElementById('view-gantt-btn');
    const matrixView = document.getElementById('matrix-view');
    const ganttView = document.getElementById('gantt-view');
    
    // 【新規】ガントチャート関連
    const addToGanttBtn = document.getElementById('add-to-gantt-btn');
    const ganttModal = document.getElementById('gantt-modal');
    const closeGanttModalBtn = document.getElementById('close-gantt-modal-btn');
    const datelessTaskList = document.getElementById('dateless-task-list');
    const ganttTaskForm = document.getElementById('gantt-task-form');
    const ganttTaskId = document.getElementById('gantt-task-id');
    const ganttTaskTitle = document.getElementById('gantt-task-title');
    const ganttStartDate = document.getElementById('gantt-start-date');
    const ganttDueDate = document.getElementById('gantt-due-date');

    // (設定パネル関連のDOM要素は変更なし)

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
            // ... (変更なし) ...
        }
    });
    // ... (loginForm, logoutBtnの処理は変更なし) ...


    // =================================================================
    //  表示モード切り替え
    // =================================================================
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


    // =================================================================
    //  設定 (Settings)
    // =================================================================
    // (設定関連の関数、イベントリスナーは全て変更なし)


    // =================================================================
    //  タスク関連 (大幅に変更)
    // =================================================================
    
    function listenForTasks() {
        if (unsubscribeTasks) unsubscribeTasks();
        // 【変更】並び替えのために order でソート
        unsubscribeTasks = db.collection('tasks')
            .where('userId', '==', currentUser.uid)
            .orderBy('order', 'asc') // 変更点
            .onSnapshot(querySnapshot => {
                tasks = [];
                querySnapshot.forEach(doc => {
                    tasks.push({ id: doc.id, ...doc.data() });
                });
                renderTasks();
                renderGanttChart(); // データ更新時にガントチャートも更新
            }, error => {
                // ... (エラー処理は変更なし) ...
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
        
        // (日付表示のHTML生成部分は変更なし)

        li.innerHTML = `...`; // (innerHTMLの生成部分は変更なし)

        // (チェックボックス、クリックイベントは変更なし)
        
        return li;
    }
    
    // 【変更】D&D並び替えロジック
    document.querySelectorAll('.quadrant').forEach(quadrant => {
        quadrant.addEventListener('dragover', e => {
            e.preventDefault();
            const draggingEl = document.querySelector('.dragging');
            if (!draggingEl) return;
            
            const afterElement = getDragAfterElement(quadrant.querySelector('.task-list'), e.clientY);
            const list = quadrant.querySelector('.task-list');
            
            if (afterElement == null) {
                list.appendChild(draggingEl);
            } else {
                list.insertBefore(draggingEl, afterElement);
            }
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
            
            // ドロップされた位置から新しいorder値を計算
            const afterElement = getDragAfterElement(quadrant.querySelector('.task-list'), e.clientY);
            const taskListInNewQuadrant = tasks.filter(t => t.quadrant === newQuadrantId && t.id !== taskId);
            
            let newOrder;
            const afterElId = afterElement ? afterElement.id : null;
            const afterElIndex = taskListInNewQuadrant.findIndex(t => t.id === afterElId);

            if (afterElId == null) { // リストの最後にドロップ
                const lastTask = taskListInNewQuadrant[taskListInNewQuadrant.length - 1];
                newOrder = (lastTask ? lastTask.order : 0) + 1000;
            } else if (afterElIndex === 0) { // リストの最初にドロップ
                newOrder = taskListInNewQuadrant[0].order / 2;
            } else { // リストの中間にドロップ
                const prevTask = taskListInNewQuadrant[afterElIndex - 1];
                const nextTask = taskListInNewQuadrant[afterElIndex];
                newOrder = (prevTask.order + nextTask.order) / 2;
            }
            
            db.collection('tasks').doc(taskId).update({ quadrant: newQuadrantId, order: newOrder });
        });
    });
    
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // --- タスクパネルの保存処理を変更 ---
    taskForm.addEventListener('submit', e => {
        e.preventDefault();
        const taskData = {
            title: taskTitleInput.value.trim(),
            // ... (memo, dueDate, startDate, quadrant, userId は変更なし) ...
        };

        if (editingTaskId) {
            db.collection('tasks').doc(editingTaskId).update(taskData);
        } else {
            // 【変更】orderフィールドを追加
            taskData.completed = false;
            taskData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            taskData.order = Date.now(); // 新規タスクは現在の時刻をorder値とする
            db.collection('tasks').add(taskData);
        }
        closeTaskPanel();
    });

    // (その他のタスクパネル関連の関数は変更なし)

    // =================================================================
    //  ガントチャート関連
    // =================================================================
    
    function renderGanttChart() {
        if (!ganttView.style.display || ganttView.style.display === 'none') return;
    
        const ganttTasks = tasks
            .filter(task => task.startDate && task.dueDate)
            .map(task => ({
                id: task.id,
                name: task.title,
                start: task.startDate,
                end: task.dueDate,
                progress: task.completed ? 100 : 0,
                custom_class: `bar-${task.quadrant}`
            }));
    
        const ganttContainer = document.getElementById('gantt-chart');
        ganttContainer.innerHTML = ''; // 描画前にクリア
    
        if (ganttTasks.length === 0) {
            ganttContainer.innerHTML = '<p>ガントチャートに表示できるタスクがありません。</p>';
            return;
        }
    
        gantt = new Gantt("#gantt-chart", ganttTasks, {
            on_click: (task) => {
                const originalTask = tasks.find(t => t.id === task.id);
                if (originalTask) openTaskPanel(originalTask);
            },
            on_date_change: (task, start, end) => {
                const startDateStr = start.toISOString().split('T')[0];
                const endDateStr = end.toISOString().split('T')[0];
                db.collection('tasks').doc(task.id).update({ startDate: startDateStr, dueDate: endDateStr });
            },
            language: 'ja'
        });
    }

    // --- ガントチャート追加モーダル ---
    addToGanttBtn.addEventListener('click', () => {
        datelessTaskList.innerHTML = '';
        const datelessTasks = tasks.filter(t => !t.startDate || !t.dueDate);
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
    });

    closeGanttModalBtn.addEventListener('click', () => {
        ganttModal.style.display = 'none';
        ganttTaskForm.reset();
    });
    
    ganttTaskForm.addEventListener('submit', e => {
        e.preventDefault();
        const taskId = ganttTaskId.value;
        const startDate = ganttStartDate.value;
        const dueDate = ganttDueDate.value;

        if (!taskId) {
            alert('タスクを選択してください。');
            return;
        }
        db.collection('tasks').doc(taskId).update({ startDate, dueDate });
        closeGanttModalBtn.click();
    });


    // (その他のヘルパー関数などは変更なし)

});
