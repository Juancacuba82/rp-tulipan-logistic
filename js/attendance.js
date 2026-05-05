// Attendance Tracking Logic
window.getLastAttendanceState = async function(email) {
    if (!window.db) return null;
    try {
        const { data, error } = await window.db.from('activity_logs')
            .select('action_type, created_at, view_date')
            .eq('user_email', email)
            .in('action_type', ['CLOCK_IN', 'CLOCK_OUT'])
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        if (data.length === 0) return null;

        const last = data[0];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
        const fiveOneMinutes = 17 * 60 + 1; // 17:01 (05:01 PM)

        const isToday = (last.view_date === todayStr);

        if (last.action_type === 'CLOCK_IN') {
            if (isToday) {
                if (currentTimeMinutes > fiveOneMinutes) {
                    return 'ALREADY_FINISHED_TODAY'; // Past 5:01 PM today, no more actions
                }
                return 'CLOCK_IN';
            } else {
                // Last was CLOCK_IN yesterday or before, allow new CLOCK_IN today
                return 'CLOCK_OUT'; 
            }
        } else if (last.action_type === 'CLOCK_OUT') {
            if (isToday) {
                return 'ALREADY_FINISHED_TODAY'; // Already clocked out today, no more actions
            }
            return 'CLOCK_OUT'; // Last was yesterday or before, allow CLOCK_IN today
        }

        return last.action_type;
    } catch (err) {
        console.error("Error getting attendance state:", err);
        return null;
    }
};

window.updateAttendanceButtons = async function() {
    const { data: { session } } = await window.db.auth.getSession();
    if (!session) return;
    
    const lastState = await window.getLastAttendanceState(session.user.email);
    const btnIn = document.getElementById('btn-clockin');
    const btnOut = document.getElementById('btn-clockout-nav') || document.getElementById('btn-clockout');
    
    if (btnIn) {
        btnIn.disabled = (lastState === 'CLOCK_IN' || lastState === 'ALREADY_FINISHED_TODAY');
        btnIn.style.opacity = btnIn.disabled ? '0.5' : '1';
        
        if (lastState === 'ALREADY_FINISHED_TODAY') {
            btnIn.title = 'Shift finished for today. See you tomorrow!';
        } else {
            btnIn.title = btnIn.disabled ? 'Already Clocked In' : 'Click to Clock In';
        }
    }
    if (btnOut) {
        btnOut.disabled = (lastState === 'CLOCK_OUT' || lastState === 'ALREADY_FINISHED_TODAY' || !lastState);
        btnOut.style.opacity = btnOut.disabled ? '0.5' : '1';
        
        if (lastState === 'ALREADY_FINISHED_TODAY') {
            btnOut.title = 'Shift finished for today.';
        } else {
            btnOut.title = btnOut.disabled ? 'Not Clocked In' : 'Click to Clock Out';
        }
    }
};

window.handleClockIn = async function() {
    if (!window.db) return alert("Database not connected");

    const { data: { session } } = await window.db.auth.getSession();
    if (!session) return alert("You must be logged in.");

    const btn = document.getElementById('btn-clockin');
    
    // Check state first to be safe
    const lastState = await window.getLastAttendanceState(session.user.email);
    if (lastState === 'CLOCK_IN') {
        alert("You are already Clocked In. You must Clock Out before Clocking In again.");
        if (btn) btn.disabled = true;
        return;
    }
    if (lastState === 'ALREADY_FINISHED_TODAY') {
        alert("Your shift has already finished for today. You cannot Clock In again until tomorrow.");
        if (btn) btn.disabled = true;
        return;
    }

    if (btn) btn.disabled = true;

    try {
        // Attempt to get location
        let position = null;
        if (navigator.geolocation) {
            position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    maximumAge: 0,
                    enableHighAccuracy: true
                });
            }).catch(e => {
                console.warn("Geolocation denied or failed:", e);
                return null;
            });
        }

        let gpsData = 'No GPS Data';
        if (position) {
            gpsData = `${position.coords.latitude}, ${position.coords.longitude}`;
        }

        const now = new Date();
        const viewDate = now.toISOString().split('T')[0];
        
        // Get user profile info
        const user = session.user;
        const email = user.email;
        let driverName = email.split('@')[0];
        
        const { data: profile } = await window.db.from('profiles').select('*').eq('id', user.id).single();
        if (profile) {
            driverName = profile.driver_name_ref || profile.full_name || profile.name || driverName;
        }

        // Direct insert so we can catch any RLS errors
        const { error } = await window.db.from('activity_logs').insert([{
            user_email: email.trim(),
            action_type: 'CLOCK_IN',
            details: `GPS: ${gpsData}`,
            view_date: viewDate,
            driver_name: driverName.toString().trim()
        }]);

        if (error) {
            throw error;
        }
        
        alert(`Successfully Clocked In at ${now.toLocaleTimeString()}\nLocation: ${gpsData}`);
        await window.updateAttendanceButtons(); // Update buttons immediately
    } catch (err) {
        console.error("Clock In Error:", err);
        alert(`Error during Clock In: ${err.message || JSON.stringify(err)}\nPlease try again or contact support.`);
        if (btn) btn.disabled = false;
    }
};

window.handleClockOut = async function() {
    if (!window.db) return alert("Database not connected");

    const { data: { session } } = await window.db.auth.getSession();
    if (!session) return alert("You must be logged in.");

    const btn = document.getElementById('btn-clockout');

    // Check state first
    const lastState = await window.getLastAttendanceState(session.user.email);
    if (lastState === 'CLOCK_OUT' || !lastState) {
        alert("You are not currently Clocked In.");
        if (btn) btn.disabled = true;
        return;
    }
    if (lastState === 'ALREADY_FINISHED_TODAY') {
        alert("Your shift has already finished for today.");
        if (btn) btn.disabled = true;
        return;
    }

    if (btn) btn.disabled = true;

    try {
        let position = null;
        if (navigator.geolocation) {
            position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    maximumAge: 0,
                    enableHighAccuracy: true
                });
            }).catch(e => {
                console.warn("Geolocation denied or failed:", e);
                return null;
            });
        }

        let gpsData = 'No GPS Data';
        if (position) {
            gpsData = `${position.coords.latitude}, ${position.coords.longitude}`;
        }

        const now = new Date();
        const viewDate = now.toISOString().split('T')[0];
        
        const user = session.user;
        const email = user.email;
        let driverName = email.split('@')[0];
        
        const { data: profile } = await window.db.from('profiles').select('*').eq('id', user.id).single();
        if (profile) {
            driverName = profile.driver_name_ref || profile.full_name || profile.name || driverName;
        }

        const { error } = await window.db.from('activity_logs').insert([{
            user_email: email.trim(),
            action_type: 'CLOCK_OUT',
            details: `GPS: ${gpsData}`,
            view_date: viewDate,
            driver_name: driverName.toString().trim()
        }]);

        if (error) throw error;
        
        alert(`Successfully Clocked Out at ${now.toLocaleTimeString()}\nLocation: ${gpsData}`);
        await window.updateAttendanceButtons(); // Update buttons immediately
    } catch (err) {
        console.error("Clock Out Error:", err);
        alert(`Error during Clock Out: ${err.message || JSON.stringify(err)}`);
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.loadAttendanceData = async function() {
    if (!window.db) return;
    
    const tbody = document.getElementById('attendance-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    const startDate = document.getElementById('att-start-date').value;
    const endDate = document.getElementById('att-end-date').value;
    const filterEmployee = document.getElementById('att-filter-employee')?.value || '';
    
    try {
        let query = window.db.from('activity_logs')
            .select('*')
            .in('action_type', ['CLOCK_IN', 'CLOCK_OUT'])
            .order('created_at', { ascending: true });

        // Apply filters only if they have a non-empty value
        if (startDate && startDate.trim() !== '') {
            query = query.gte('view_date', startDate);
        }
        if (endDate && endDate.trim() !== '') {
            query = query.lte('view_date', endDate);
        }
        if (filterEmployee) {
            query = query.eq('driver_name', filterEmployee);
        }

        const { data, error } = await query;
        if (error) throw error;

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>';
            return;
        }

        // Logic to pair IN/OUT logs into sessions
        const employeeSessions = {}; // Store active session per employee
        const allSessions = [];

        data.forEach(log => {
            const employee = log.driver_name || 'Unknown';
            const type = log.action_type;
            const date = log.view_date;
            const timeStr = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const gpsInfo = (log.details || '').replace('GPS: ', '');
            let locationHtml = gpsInfo;
            if (gpsInfo !== 'No GPS Data' && gpsInfo.includes(',')) {
                locationHtml = `<a href="https://www.google.com/maps/search/?api=1&query=${gpsInfo}" target="_blank" style="color:#1e40af; text-decoration:underline;">Map</a>`;
            }

            if (type === 'CLOCK_IN') {
                // If they clock in, we start a new session entry
                const newSession = {
                    date,
                    employee,
                    email: (log.user_email || '').toLowerCase().trim(), // Capture email for name lookup
                    inTime: timeStr,
                    inLoc: locationHtml,
                    inId: log.id, // Capture ID for deletion
                    inTimestamp: new Date(log.created_at).getTime(),
                    outTime: '---',
                    outLoc: '---',
                    outId: null,
                    outTimestamp: null,
                    timestamp: new Date(log.created_at).getTime()
                };
                allSessions.push(newSession);
                employeeSessions[employee] = newSession; // Track this as the "latest" for this employee
            } else if (type === 'CLOCK_OUT') {
                // Find the latest open session for this employee to close it
                const session = employeeSessions[employee];
                if (session && session.outTime === '---') {
                    session.outTime = timeStr;
                    session.outLoc = locationHtml;
                    session.outId = log.id; // Capture ID
                    session.outTimestamp = new Date(log.created_at).getTime();
                } else {
                    // Orphaned Clock Out
                    allSessions.push({
                        date,
                        employee,
                        email: (log.user_email || '').toLowerCase().trim(),
                        inTime: '---',
                        inLoc: '---',
                        inId: null,
                        inTimestamp: null,
                        outTime: timeStr,
                        outLoc: locationHtml,
                        outId: log.id,
                        outTimestamp: new Date(log.created_at).getTime(),
                        timestamp: new Date(log.created_at).getTime()
                    });
                }
            }
        });

        // --- NEW: AUTO-EXIT LOGIC FOR DISPLAY ---
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentTimeMin = now.getHours() * 60 + now.getMinutes();
        const fiveOneMin = 17 * 60 + 1; // 05:01 PM

        allSessions.forEach(s => {
            if (s.outTime === '---' && s.inTime !== '---') {
                const isPastDay = s.date < todayStr;
                const isTodayPastFive = (s.date === todayStr && currentTimeMin > fiveOneMin);
                
                if (isPastDay || isTodayPastFive) {
                    s.outTime = '05:01 PM';
                    s.outLoc = '<span style="color:#64748b; font-style:italic; font-size:0.7rem;">SYSTEM AUTO-EXIT</span>';
                    // Create a virtual out timestamp for 05:01 PM on that specific date
                    // Use the date from the session and append 17:01
                    const virtualOut = new Date(`${s.date}T17:01:00`);
                    s.outTimestamp = virtualOut.getTime();
                }
            }
        });

        // --- NEW: PAYROLL CALCULATION ---
        const HOURLY_RATES = {
            'garridoyariselis@gmail.com': 25.00,
            'rptulipantransport@gmail.com': 17.50
        };

        const payrollSummary = {}; // employeeName -> { hours, pay, email }

        allSessions.forEach(s => {
            if (s.inTimestamp && s.outTimestamp) {
                const diffMs = s.outTimestamp - s.inTimestamp;
                s.hours = diffMs > 0 ? (diffMs / (1000 * 60 * 60)) : 0;
            } else {
                s.hours = 0;
            }
            
            const rate = HOURLY_RATES[s.email] || 0;
            s.pay = s.hours * rate;

            if (s.employee) {
                if (!payrollSummary[s.employee]) {
                    payrollSummary[s.employee] = { hours: 0, pay: 0, email: s.email };
                }
                payrollSummary[s.employee].hours += s.hours;
                payrollSummary[s.employee].pay += s.pay;
            }
        });

        // Render Summary Cards if Admin
        const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
        const summaryEl = document.getElementById('attendance-summary');
        if (summaryEl) {
            if (isAdmin && Object.keys(payrollSummary).length > 0) {
                summaryEl.style.display = 'grid';
                summaryEl.innerHTML = '';
                Object.entries(payrollSummary).forEach(([name, data]) => {
                    const safeName = name.replace(/'/g, "\\'");
                    const safeEmail = (data.email || '').replace(/'/g, "\\'");
                    const card = document.createElement('div');
                    card.style.cssText = 'background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; border-top: 4px solid #10b981; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);';
                    card.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                            <span style="font-size: 0.65rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Employee Total</span>
                            <i class="fas fa-money-check-alt" style="color: #10b981;"></i>
                        </div>
                        <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b; font-weight: 900;">${name}</h3>
                        <p style="margin: 2px 0 10px; font-size: 0.7rem; color: #94a3b8;">${data.email || 'No email'}</p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-top: 1px solid #f1f5f9; padding-top: 10px; margin-bottom: 14px;">
                            <div>
                                <span style="display: block; font-size: 0.6rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Total Hours</span>
                                <span style="font-size: 1.2rem; font-weight: 900; color: #1e293b;">${data.hours.toFixed(2)}</span>
                            </div>
                            <div>
                                <span style="display: block; font-size: 0.6rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Est. Payment</span>
                                <span style="font-size: 1.2rem; font-weight: 900; color: #059669;">$${data.pay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        <button
                            onclick="window.payEmployee('${safeName}', '${safeEmail}', ${data.pay.toFixed(2)})"
                            style="width: 100%; padding: 10px; background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; border-radius: 8px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s;"
                            onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                            <i class="fas fa-hand-holding-usd"></i> MARK AS PAID
                        </button>
                    `;
                    summaryEl.appendChild(card);
                });
            } else {
                summaryEl.style.display = 'none';
            }
        }

        // --- PAYROLL PAYMENT FUNCTION ---
        window.payEmployee = async function(employeeName, employeeEmail, amount) {
            const today = new Date().toISOString().split('T')[0];
            const startDate = document.getElementById('att-start-date')?.value || '';
            const endDate = document.getElementById('att-end-date')?.value || '';
            const periodLabel = (startDate && endDate) ? `${startDate} to ${endDate}` : today;

            const confirmMsg = `Register salary payment of $${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} for ${employeeName}?\n\nThis will create an expense record in Expense Management.`;
            if (!confirm(confirmMsg)) return;

            try {
                const expenseObj = {
                    date: today,
                    category: 'Payroll',
                    description: `Salary Payment - ${employeeName}`,
                    amount: parseFloat(amount),
                    note: `Period: ${periodLabel} | Email: ${employeeEmail}`
                };

                const { error } = await window.db.from('expenses').insert([expenseObj]);
                if (error) throw error;

                alert(`✅ Payment of $${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} registered for ${employeeName}.\n\nYou can find it in Expense Management.`);
            } catch (err) {
                console.error('Error registering salary payment:', err);
                alert('Failed to register payment: ' + (err.message || JSON.stringify(err)));
            }
        };
        
        // Render sorted by timestamp descending
        allSessions.sort((a, b) => b.timestamp - a.timestamp);
        
        allSessions.forEach(s => {
            const tr = document.createElement('tr');
            
            const dParts = s.date.split('-');
            const dateStr = dParts.length === 3 ? `${dParts[1]}/${dParts[2]}/${dParts[0]}` : s.date;

            tr.innerHTML = `
                <td><strong>${dateStr}</strong></td>
                <td><strong style="color:#1e293b;">${s.employee}</strong></td>
                <td><span style="color:#166534; font-weight:bold;">${s.inTime || '---'}</span></td>
                <td>${s.inLoc || '---'}</td>
                <td><span style="color:#9a3412; font-weight:bold;">${s.outTime || '---'}</span></td>
                <td>${s.outLoc || '---'}</td>
                <td><span style="font-weight:700;">${s.hours ? s.hours.toFixed(2) : '---'}</span></td>
                ${isAdmin ? `<td style="color:#059669; font-weight:800;">$${(s.pay || 0).toFixed(2)}</td>` : '<td class="admin-only">---</td>'}
                ${isAdmin ? `
                    <td style="text-align:center;">
                        <button onclick="deleteAttendanceSession('${s.inId}', '${s.outId}')" class="btn-manage-inline" style="background:#fee2e2; color:#ef4444; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                ` : '<td></td>'}
            `;
            const lookupEmail = (s.email || '').toString().toLowerCase().trim();
            const loggedByName = (window.globalUserNameMap && window.globalUserNameMap[lookupEmail]) ? window.globalUserNameMap[lookupEmail] : s.employee;
            tr.title = `Logged by: ${loggedByName}`;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Failed to load attendance:", err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Failed to load data.</td></tr>';
    }
};

window.deleteAttendanceSession = async function(inId, outId) {
    if (!confirm("Are you sure you want to delete this attendance session?")) return;
    
    // Clean up IDs - they might come as literal strings 'null' or 'undefined' from the HTML template
    const cleanIn = (inId && inId !== 'null' && inId !== 'undefined' && inId !== '') ? inId : null;
    const cleanOut = (outId && outId !== 'null' && outId !== 'undefined' && outId !== '') ? outId : null;

    const idsToDelete = [];
    if (cleanIn) idsToDelete.push(cleanIn);
    if (cleanOut) idsToDelete.push(cleanOut);

    if (idsToDelete.length === 0) {
        alert("Error: No valid IDs found to delete.");
        return;
    }

    console.log("Attempting to delete IDs:", idsToDelete);

    try {
        // Use .select() to verify what was actually deleted
        const { data, error } = await window.db.from('activity_logs')
            .delete()
            .in('id', idsToDelete)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            alert("Warning: No records were deleted from the database.\n\nPossible reasons:\n1. The records were already deleted.\n2. Database permissions (RLS) prevent you from deleting these logs.\n3. The ID column name is incorrect (unlikely).");
        } else {
            alert(`Successfully deleted ${data.length} record(s).`);
            await window.loadAttendanceData();
            if (window.updateAttendanceButtons) await window.updateAttendanceButtons();
        }
    } catch (err) {
        console.error("Error deleting attendance:", err);
        alert("Failed to delete record: " + (err.message || JSON.stringify(err)));
    }
};

window.resetAttendanceFilters = function() {
    const startInput = document.getElementById('att-start-date');
    const endInput = document.getElementById('att-end-date');
    const empInput = document.getElementById('att-filter-employee');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    if (empInput) empInput.value = '';
    
    // Reload everything
    window.loadAttendanceData();
};

window.populateAttendanceEmployeeFilter = async function() {
    const sel = document.getElementById('att-filter-employee');
    if (!sel) return;
    
    try {
        const { data, error } = await window.db.from('profiles')
            .select('*')
            .in('role', ['admin', 'ADMIN', 'employee', 'EMPLOYEE', 'staff', 'STAFF', 'user']);
        
        if (error) throw error;
        
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">All Employees</option>';
        
        const names = new Set();
        if (!window.globalUserNameMap) window.globalUserNameMap = {};

        if (data) {
            data.forEach(p => {
                const name = p.driver_name_ref || p.full_name || p.name;
                if (name) {
                    names.add(name);
                    if (p.email) {
                        const key = p.email.toString().toLowerCase().trim();
                        window.globalUserNameMap[key] = name;
                    }
                }
            });
        }
        
        Array.from(names).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
        });
        
        if (currentVal) sel.value = currentVal;
    } catch (err) {
        console.error("Error populating attendance employee filter:", err);
    }
};

// Hook into app initialization or view changes to show/hide the admin card
document.addEventListener('DOMContentLoaded', () => {
    // Check if the user is admin periodically to show the attendance card (since auth loads async)
    const interval = setInterval(() => {
        if (window.currentUserRole) {
            clearInterval(interval);
            const normalizedRole = (window.currentUserRole || '').toString().toLowerCase().trim();
            if (normalizedRole === 'admin') {
                const card = document.getElementById('card-attendance');
                if (card) {
                    card.style.display = 'flex';
                }
            }
        }
    }, 500);

    // Initial button state check
    const checkButtons = setInterval(() => {
        if (window.db && window.currentUserRole) {
            clearInterval(checkButtons);
            window.updateAttendanceButtons();
            window.populateAttendanceEmployeeFilter();
            
            // Re-check buttons every minute to enforce 05:01 PM cutoff live
            setInterval(() => {
                window.updateAttendanceButtons();
            }, 60000);
        }
    }, 1000);

    // Default range REMOVED as per user request to see all records by default
    const startInput = document.getElementById('att-start-date');
    const endInput = document.getElementById('att-end-date');
    if (startInput && endInput) {
        startInput.value = '';
        endInput.value = '';
    }
});
