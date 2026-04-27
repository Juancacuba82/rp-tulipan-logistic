/**
 * js/tasks.js - RP Tulipan Logistic
 * Task Management for Employees and Admins
 */

(function() {
    let currentTasks = [];
    let employeeProfiles = [];

    // --- INITIALIZATION ---
    window.loadTasksData = async function() {
        if (!db) return;
        try {
            const role = (window.currentUserRole || 'user').toLowerCase();
            const email = window.userEmail;
            
            let query = db.from('tasks').select('*').eq('is_deleted', false);
            
            // If employee or user, only show tasks assigned to them
            if (role !== 'admin') {
                query = query.eq('assigned_to_email', email);
            }
            
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            
            currentTasks = data || [];
            renderTasksTable();
            populateEmployeeDropdown();
        } catch (err) {
            console.error("Error loading tasks:", err);
        }
    };

    // --- RENDER LOGIC ---
    function renderTasksTable() {
        const body = document.getElementById('tasks-body');
        const countEl = document.getElementById('tasks-count-display');
        if (!body) return;
        
        body.innerHTML = '';
        if (countEl) countEl.textContent = currentTasks.length;
        
        currentTasks.forEach(task => {
            const tr = document.createElement('tr');
            const isCompleted = task.status === 'COMPLETED';
            
            // MM/DD/YYYY Formatting
            const createdDate = new Date(task.created_at);
            const formattedCreated = `${createdDate.getMonth() + 1}/${createdDate.getDate()}/${createdDate.getFullYear()}`;
            
            let formattedCompleted = '---';
            if (isCompleted && task.completed_at) {
                const compDate = new Date(task.completed_at);
                formattedCompleted = `${compDate.getMonth() + 1}/${compDate.getDate()}/${compDate.getFullYear()} ${compDate.getHours()}:${compDate.getMinutes().toString().padStart(2, '0')}`;
            }

            // Status Badge Class
            const badgeClass = isCompleted ? 'inv-badge-green' : 'inv-badge-blue';
            const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
            
            tr.innerHTML = `
                <td>${formattedCreated}</td>
                <td style="font-weight: 800; color: #1e40af;">${task.title}</td>
                <td style="font-size: 0.8rem; color: #475569; max-width: 250px;">${task.description || '---'}</td>
                <td style="font-weight: 700;">${task.assigned_to || task.assigned_to_email}</td>
                <td><span class="inv-badge ${badgeClass}">${task.status}</span></td>
                <td>${formattedCompleted}</td>
                <td>
                    <div style="display: flex; gap: 8px; align-items: center; justify-content: center; min-height: 40px;">
                        ${!isCompleted ? `
                            <button onclick="markTaskDone('${task.id}')" class="btn-manage-inline" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                <i class="fas fa-check"></i> DONE
                            </button>
                        ` : ''}
                        ${isAdmin ? `
                            <button onclick="deleteTask('${task.id}')" class="btn-manage-inline" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            `;
            body.appendChild(tr);
        });
    }

    // --- ACTIONS ---
    window.addTask = async function() {
        const title = document.getElementById('task-title').value.trim();
        const desc = document.getElementById('task-desc').value.trim();
        const assigneeEl = document.getElementById('task-assignee');
        const assigneeEmail = assigneeEl.value;
        const assigneeName = assigneeEl.options[assigneeEl.selectedIndex]?.text || '';

        if (!title || !assigneeEmail) {
            alert("Please provide a title and assign an employee.");
            return;
        }

        const btn = document.getElementById('btn-save-task');
        btn.disabled = true;
        btn.textContent = "SAVING...";

        try {
            const { error } = await db.from('tasks').insert([{
                title: title,
                description: desc,
                assigned_to: assigneeName,
                assigned_to_email: assigneeEmail,
                created_by: window.userEmail,
                status: 'PENDING'
            }]);

            if (error) throw error;

            // Reset form
            document.getElementById('task-title').value = '';
            document.getElementById('task-desc').value = '';
            document.getElementById('task-assignee').value = '';
            
            await loadTasksData();
            if (window.showToast) window.showToast("Task created successfully!", "success");
        } catch (err) {
            console.error("Error adding task:", err);
            alert("Error creating task. Make sure the 'tasks' table exists in Supabase.");
        } finally {
            btn.disabled = false;
            btn.textContent = "CREATE TASK";
        }
    };

    window.markTaskDone = async function(id) {
        if (!confirm("Mark this task as completed?")) return;
        try {
            const { error } = await db.from('tasks').update({
                status: 'COMPLETED',
                completed_at: new Date().toISOString()
            }).eq('id', id);

            if (error) throw error;
            await loadTasksData();
            if (window.showToast) window.showToast("Task marked as done!", "success");
        } catch (err) {
            console.error("Error updating task:", err);
        }
    };

    window.deleteTask = async function(id) {
        if (window.currentUserRole !== 'admin') {
            alert("Only admins can delete tasks.");
            return;
        }
        if (!confirm("Are you sure you want to delete this task?")) return;
        
        try {
            const { error } = await db.from('tasks').update({ is_deleted: true }).eq('id', id);
            if (error) throw error;
            await loadTasksData();
        } catch (err) {
            console.error("Error deleting task:", err);
        }
    };

    async function populateEmployeeDropdown() {
        const sel = document.getElementById('task-assignee');
        if (!sel) return;
        
        try {
            console.log("Fetching employees for dropdown...");
            // Use only 'email' and 'role' to avoid errors if name columns don't exist
            const { data, error } = await db.from('profiles')
                .select('email, role')
                .in('role', ['admin', 'ADMIN', 'employee', 'EMPLOYEE', 'staff', 'STAFF', 'user']);
            
            if (error) {
                console.error("Supabase Error fetching employees:", error);
                sel.innerHTML = `<option value="">Error: ${error.message}</option>`;
                return;
            }
            
            employeeProfiles = data || [];
            console.log("Employees found:", employeeProfiles.length);
            
            if (employeeProfiles.length === 0) {
                sel.innerHTML = '<option value="">No employees found</option>';
                return;
            }

            const currentVal = sel.value;
            sel.innerHTML = '<option value="" disabled selected>Select Employee...</option>';
            
            employeeProfiles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.email;
                opt.textContent = p.email; // Use email as the label to be safe
                sel.appendChild(opt);
            });
            
            if (currentVal) sel.value = currentVal;
        } catch (err) {
            console.error("Critical Error fetching employees for tasks:", err);
            sel.innerHTML = '<option value="">Critical Error Loading</option>';
        }
    }

})();
