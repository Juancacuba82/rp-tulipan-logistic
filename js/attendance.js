// Attendance Tracking Logic
window.getLastAttendanceState = async function(email) {
    if (!db) return null;
    try {
        const { data, error } = await db.from('activity_logs')
            .select('action_type')
            .eq('user_email', email)
            .in('action_type', ['CLOCK_IN', 'CLOCK_OUT'])
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        return data.length > 0 ? data[0].action_type : null;
    } catch (err) {
        console.error("Error getting attendance state:", err);
        return null;
    }
};

window.updateAttendanceButtons = async function() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;
    
    const lastState = await window.getLastAttendanceState(session.user.email);
    const btnIn = document.getElementById('btn-clockin');
    const btnOut = document.getElementById('btn-clockout');
    
    if (btnIn) {
        btnIn.disabled = (lastState === 'CLOCK_IN');
        btnIn.style.opacity = btnIn.disabled ? '0.5' : '1';
        btnIn.title = btnIn.disabled ? 'Already Clocked In' : 'Click to Clock In';
    }
    if (btnOut) {
        btnOut.disabled = (lastState === 'CLOCK_OUT' || !lastState);
        btnOut.style.opacity = btnOut.disabled ? '0.5' : '1';
        btnOut.title = btnOut.disabled ? 'Not Clocked In' : 'Click to Clock Out';
    }
};

window.handleClockIn = async function() {
    if (!db) return alert("Database not connected");

    const { data: { session } } = await db.auth.getSession();
    if (!session) return alert("You must be logged in.");

    const btn = document.getElementById('btn-clockin');
    
    // Check state first to be safe
    const lastState = await window.getLastAttendanceState(session.user.email);
    if (lastState === 'CLOCK_IN') {
        alert("You are already Clocked In. You must Clock Out before Clocking In again.");
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
        
        const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
        if (profile) {
            driverName = profile.driver_name_ref || profile.full_name || profile.name || driverName;
        }

        // Direct insert so we can catch any RLS errors
        const { error } = await db.from('activity_logs').insert([{
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
    if (!db) return alert("Database not connected");

    const { data: { session } } = await db.auth.getSession();
    if (!session) return alert("You must be logged in.");

    const btn = document.getElementById('btn-clockout');

    // Check state first
    const lastState = await window.getLastAttendanceState(session.user.email);
    if (lastState === 'CLOCK_OUT' || !lastState) {
        alert("You are not currently Clocked In.");
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
        
        const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
        if (profile) {
            driverName = profile.driver_name_ref || profile.full_name || profile.name || driverName;
        }

        const { error } = await db.from('activity_logs').insert([{
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
    if (!db) return;
    
    const tbody = document.getElementById('attendance-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    const startDate = document.getElementById('att-start-date').value;
    const endDate = document.getElementById('att-end-date').value;
    const filterEmployee = document.getElementById('att-filter-employee')?.value || '';
    
    try {
        let query = db.from('activity_logs')
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
                    email: log.user_email, // Capture email for name lookup
                    inTime: timeStr,
                    inLoc: locationHtml,
                    inId: log.id, // Capture ID for deletion
                    outTime: '---',
                    outLoc: '---',
                    outId: null,
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
                } else {
                    // Orphaned Clock Out
                    allSessions.push({
                        date,
                        employee,
                        inTime: '---',
                        inLoc: '---',
                        inId: null,
                        outTime: timeStr,
                        outLoc: locationHtml,
                        outId: log.id,
                        timestamp: new Date(log.created_at).getTime()
                    });
                }
            }
        });

        // Render sorted by timestamp descending
        allSessions.sort((a, b) => b.timestamp - a.timestamp);
        const isAdmin = (window.currentUserRole || '').toString().toLowerCase().trim() === 'admin';
        
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
        const { data, error } = await db.from('activity_logs')
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
        const { data, error } = await db.from('profiles').select('*');
        
        if (error) throw error;
        
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">All Employees</option>';
        
        const names = new Set();
        if (!window.globalUserNameMap) window.globalUserNameMap = {};

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
        if (window.db) {
            clearInterval(checkButtons);
            window.updateAttendanceButtons();
            window.populateAttendanceEmployeeFilter();
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
