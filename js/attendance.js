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
                if (currentTimeMinutes > fiveOneMinutes) {
                    return 'ALREADY_FINISHED_TODAY'; // Past 5:01 PM today, no more actions
                }
                // Clocked out today but it's still before 5:01 PM, allow Clock In again
                return 'CLOCK_OUT'; 
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
    // OPT: Use cached email (set at login) instead of hitting auth endpoint on every call
    const email = window.userEmail;
    if (!email) return;

    const role = (window.currentUserRole || '').toString().toLowerCase().trim();
    const isAdmin = role === 'admin';
    const isEmployeeOrStudent = (role === 'employee' || role === 'student' || role === 'staff');
    const btnIn = document.getElementById('btn-clockin');
    const btnOut = document.getElementById('btn-clockout-nav') || document.getElementById('btn-clockout');
    const userDisplay = document.getElementById('user-display-name');

    // Handle user name display for all non-drivers
    if (userDisplay) {
        if (isAdmin || isEmployeeOrStudent) {
            userDisplay.style.display = 'inline-block';
            const name = window.currentDriverNameRef || email.split('@')[0];
            userDisplay.textContent = name.toUpperCase();
        } else {
            userDisplay.style.display = 'none';
        }
    }

    if (isAdmin) {
        if (btnIn) btnIn.style.display = 'none';
        if (btnOut) btnOut.style.display = 'none';
        return;
    }

    // For non-admins (employees/students), ensure buttons are visible and proceed with clock logic
    if (isEmployeeOrStudent) {
        // showView already handles base display: inline-flex, but we can ensure it here
        if (btnIn && btnIn.style.display === 'none') btnIn.style.display = 'inline-flex';
        if (btnOut && btnOut.style.display === 'none') btnOut.style.display = 'inline-flex';
    } else {
        // If it's a driver or unknown, hide everything
        if (btnIn) btnIn.style.display = 'none';
        if (btnOut) btnOut.style.display = 'none';
        return;
    }

    const lastState = await window.getLastAttendanceState(email);
    
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

/**
 * Flexible time parser to handle various AM/PM formats (AM, PM, a.m., p.m., etc.)
 */
function parseFlexibleTime(timeStr, baseDateStr) {
    if (!timeStr) return new Date();
    
    // Clean string: "05:15 p. m." -> "05:15 pm"
    const clean = timeStr.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const isPM = clean.includes('pm') || clean.includes('p m');
    const isAM = clean.includes('am') || clean.includes('a m');
    
    // Extract numbers
    const timePart = clean.replace(/[ap] m|[ap]m/g, '').trim();
    let [hours, minutes] = timePart.split(':').map(Number);
    if (isNaN(hours)) hours = 0;
    if (isNaN(minutes)) minutes = 0;
    
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
    
    const [y, m, d] = baseDateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d, hours, minutes, 0);
    return date;
}

// --- NEW: ADMIN CAPABILITIES ---

/**
 * Allows an admin to manually clock out an employee who forgot to do so.
 */
window.adminClockOut = async function(driverName, userEmail, viewDate) {
    const role = (window.currentUserRole || '').toLowerCase().trim();
    if (role !== 'admin') {
        alert("Only admins can perform manual clock outs.");
        return;
    }
    
    if (!confirm(`Force Clock Out for ${driverName} on ${viewDate}?`)) return;

    try {
        const now = new Date();
        const defaultTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeStr = prompt("Enter Clock Out Time (Example: 05:30 PM or 5:30 p.m.):", defaultTime);
        if (timeStr === null) return;

        const clockOutTimestamp = parseFlexibleTime(timeStr, viewDate);

        const { error } = await window.db.from('activity_logs').insert([{
            user_email: userEmail.trim(),
            action_type: 'CLOCK_OUT',
            details: 'Admin Manual Clock Out',
            view_date: viewDate,
            driver_name: driverName.toString().trim(),
            created_at: clockOutTimestamp.toISOString()
        }]);

        if (error) throw error;
        
        alert(`Successfully clocked out ${driverName}`);
        await window.loadAttendanceData(true);
        if (window.updateAttendanceButtons) await window.updateAttendanceButtons();
    } catch (err) {
        console.error("Admin Clock Out Error:", err);
        alert(`Error: ${err.message}`);
    }
};

/**
 * Allows an admin to edit the timestamp of a specific clock-in or clock-out log.
 */
window.editAttendanceLog = async function(logId, currentDate, currentTime) {
    const role = (window.currentUserRole || '').toLowerCase().trim();
    if (role !== 'admin') {
        alert("Only admins can edit logs.");
        return;
    }

    const newDateTimePrompt = prompt("Edit Log Time (YYYY-MM-DD HH:MM AM/PM):", `${currentDate} ${currentTime}`);
    if (!newDateTimePrompt) return;

    try {
        console.log(`Attempting to edit log ${logId} with: ${newDateTimePrompt}`);
        
        // Separate date and time parts
        const parts = newDateTimePrompt.trim().split(/\s+/);
        if (parts.length < 2) throw new Error("Invalid format. Use: YYYY-MM-DD HH:MM AM/PM");
        
        const datePart = parts[0];
        const timeStr = parts.slice(1).join(' ');
        
        const finalDate = parseFlexibleTime(timeStr, datePart);
        
        if (isNaN(finalDate.getTime())) throw new Error("Invalid date/time result");

        console.log("Final ISO string to send:", finalDate.toISOString());

        // Strategy: Direct UPDATE (Assumes Admin RLS policy is enabled in Supabase)
        const { data, error } = await window.db.from('activity_logs')
            .update({
                created_at: finalDate.toISOString(),
                view_date: datePart
            })
            .eq('id', logId)
            .select();

        if (error) throw error;
        
        if (!data || data.length === 0) {
            throw new Error("No records were updated. Check if the ID exists or if you have permissions (did you run the SQL code in Supabase?).");
        }

        alert("Log successfully updated!");
        await window.loadAttendanceData(true); // Refresh the table
    } catch (err) {
        console.error("Edit Error:", err);
        alert(`Error editing log: ${err.message || JSON.stringify(err)}`);
    }
};

window.openFullEditModal = function(employee, email, dateStr, inId, inTimeStr, outId, outTimeStr) {
    // Remove existing modal if any
    const existing = document.getElementById('att-full-edit-modal');
    if (existing) existing.remove();

    const convertTo24h = (time12h) => {
        if (!time12h || time12h === '---' || time12h.includes('SYSTEM')) return '';
        const match = time12h.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return '';
        let h = parseInt(match[1], 10);
        const m = match[2];
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return `${h.toString().padStart(2, '0')}:${m}`;
    };

    const in24 = convertTo24h(inTimeStr);
    const out24 = convertTo24h(outTimeStr);

    const safeEmployee = employee.replace(/'/g, "&#39;");
    const safeEmail = email.replace(/'/g, "&#39;");

    const modalHtml = `
    <div id="att-full-edit-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center;">
        <div style="background:white; padding:20px; border-radius:8px; width:400px; max-width:90%; box-shadow:0 4px 6px rgba(0,0,0,0.1); font-family: 'Inter', sans-serif;">
            <h3 style="margin-top:0; color:#1e293b; font-weight:800; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">Edit Attendance</h3>
            <p style="color:#64748b; font-size:0.9rem;"><strong>Employee:</strong> ${safeEmployee}</p>
            <div style="margin-bottom:15px;">
                <label style="display:block; font-weight:700; margin-bottom:5px; color:#334155;">Date</label>
                <input type="date" id="edit-att-date" value="${dateStr}" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block; font-weight:700; margin-bottom:5px; color:#166534;">Time In</label>
                <input type="time" id="edit-att-in" value="${in24}" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block; font-weight:700; margin-bottom:5px; color:#9a3412;">Time Out</label>
                <input type="time" id="edit-att-out" value="${out24}" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top: 20px;">
                <button onclick="document.getElementById('att-full-edit-modal').remove()" style="padding:8px 15px; background:#e2e8f0; color:#475569; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Cancel</button>
                <button id="btn-save-att-edit" style="padding:8px 15px; background:#2563eb; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Save Changes</button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('btn-save-att-edit').onclick = async () => {
        const newDate = document.getElementById('edit-att-date').value;
        const newIn = document.getElementById('edit-att-in').value;
        const newOut = document.getElementById('edit-att-out').value;

        if (!newDate) return alert("Date is required.");

        try {
            document.getElementById('btn-save-att-edit').disabled = true;
            document.getElementById('btn-save-att-edit').textContent = 'Saving...';

            const formatISO = (datePart, time24) => {
                if (!time24) return null;
                const d = new Date(datePart + 'T' + time24 + ':00');
                return d.toISOString();
            };

            const newInISO = formatISO(newDate, newIn);
            const newOutISO = formatISO(newDate, newOut);

            const inIdClean = (inId !== 'null' && inId !== 'undefined' && inId) ? inId : null;
            const outIdClean = (outId !== 'null' && outId !== 'undefined' && outId) ? outId : null;

            // Handle Time In
            if (inIdClean && newIn) {
                await window.db.from('activity_logs').update({ created_at: newInISO, view_date: newDate }).eq('id', inIdClean);
            } else if (!inIdClean && newIn) {
                await window.db.from('activity_logs').insert([{
                    user_email: email, driver_name: employee, action_type: 'CLOCK_IN',
                    details: 'Manual Entry (Admin)', view_date: newDate, created_at: newInISO
                }]);
            } else if (inIdClean && !newIn) {
                await window.db.from('activity_logs').delete().eq('id', inIdClean);
            }

            // Handle Time Out
            if (outIdClean && newOut) {
                await window.db.from('activity_logs').update({ created_at: newOutISO, view_date: newDate }).eq('id', outIdClean);
            } else if (!outIdClean && newOut) {
                await window.db.from('activity_logs').insert([{
                    user_email: email, driver_name: employee, action_type: 'CLOCK_OUT',
                    details: 'Manual Entry (Admin)', view_date: newDate, created_at: newOutISO
                }]);
            } else if (outIdClean && !newOut) {
                await window.db.from('activity_logs').delete().eq('id', outIdClean);
            }

            document.getElementById('att-full-edit-modal').remove();
            await window.loadAttendanceData(true);
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
            document.getElementById('btn-save-att-edit').disabled = false;
            document.getElementById('btn-save-att-edit').textContent = 'Save Changes';
        }
    };
};

window.handleClockIn = async function() {
    if (!window.db) return alert("Database not connected");

    // OPT: Use cached email to skip auth.getSession() query
    let email = window.userEmail;
    if (!email) {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session) return alert("You must be logged in.");
        email = session.user.email;
    }

    const btn = document.getElementById('btn-clockin');

    // Check state first to be safe
    const lastState = await window.getLastAttendanceState(email);
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

        // OPT: Use cached driver name, only query profiles as fallback
        let driverName = window.currentDriverNameRef || window.currentUserName || null;
        if (!driverName) {
            const { data: profile } = await window.db.from('profiles')
                .select('driver_name_ref, full_name, name')
                .eq('email', email)
                .single();
            if (profile) {
                driverName = profile.driver_name_ref || profile.full_name || profile.name;
            }
        }
        if (!driverName) driverName = email.split('@')[0];

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

    // OPT: Use cached email to skip auth.getSession() query
    let email = window.userEmail;
    if (!email) {
        const { data: { session } } = await window.db.auth.getSession();
        if (!session) return alert("You must be logged in.");
        email = session.user.email;
    }

    const btn = document.getElementById('btn-clockout-nav') || document.getElementById('btn-clockout');

    // Check state first
    const lastState = await window.getLastAttendanceState(email);
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

        // OPT: Use cached driver name, only query profiles as fallback
        let driverName = window.currentDriverNameRef || window.currentUserName || null;
        if (!driverName) {
            const { data: profile } = await window.db.from('profiles')
                .select('driver_name_ref, full_name, name')
                .eq('email', email)
                .single();
            if (profile) {
                driverName = profile.driver_name_ref || profile.full_name || profile.name;
            }
        }
        if (!driverName) driverName = email.split('@')[0];

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
        if (btn) btn.disabled = false;
    }
};

window.currentAttendanceData = null;
window.loadAttendanceData = async function(force = false) {
    if (!window.db) return;
    
    // Cache: Avoid reloading if data is already loaded in memory, unless forced (e.g. after edit/delete/filter change)
    if (!force && window.currentAttendanceData !== null) {
        return;
    }

    try {
        const tbody = document.getElementById('attendance-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>';

        const startDate = document.getElementById('att-start-date')?.value || '';
        const endDate = document.getElementById('att-end-date')?.value || '';
        const filterEmployee = document.getElementById('att-filter-employee')?.value || '';

        const role = (window.currentUserRole || '').toLowerCase().trim();
        const isAdmin = role === 'admin';
        const isStaff = role === 'employee' || role === 'student' || role === 'staff';
        const userEmail = (window.userEmail || '').toLowerCase().trim();

        let query = window.db.from('activity_logs')
            .select('id, user_email, action_type, details, view_date, driver_name, created_at')
            .in('action_type', ['CLOCK_IN', 'CLOCK_OUT'])
            .order('created_at', { ascending: true });

        // SECURITY: If not admin, only show your own logs
        if (!isAdmin && userEmail) {
            query = query.eq('user_email', userEmail);
        }

        // Apply filters - Default to last 90 days if no dates provided
        if (startDate && startDate.trim() !== '') {
            query = query.gte('view_date', startDate);
        } else {
            // Default: 30 days ago (Reduced from 90 to save Disk IO)
            const d = new Date();
            d.setDate(d.getDate() - 30);
            query = query.gte('view_date', d.toISOString().split('T')[0]);
        }
        
        if (endDate && endDate.trim() !== '') {
            query = query.lte('view_date', endDate);
        }
        if (filterEmployee) {
            if (filterEmployee.includes('@')) {
                query = query.eq('user_email', filterEmployee);
            } else {
                query = query.eq('driver_name', filterEmployee);
            }
        }

        query = query.limit(1000); // Safety limit

        const { data, error } = await query;
        if (error) throw error;

        window.currentAttendanceData = data;

        // --- POPULATE EMPLOYEE FILTER (Only if admin) ---
        const employeeSelect = document.getElementById('att-filter-employee');
        if (employeeSelect) {
            if (!isAdmin) {
                employeeSelect.parentElement.parentElement.style.display = 'none'; // Hide the whole group
            } else {
                employeeSelect.parentElement.parentElement.style.display = 'flex';
            }
        }

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No records found.</td></tr>';
            return;
        }

        // Logic to pair IN/OUT logs into sessions
        const employeeSessions = {}; // Store active session per employee
        const allSessions = [];

        data.forEach(log => {
            const lookupEmail = (log.user_email || '').toString().toLowerCase().trim();
            const employee = (window.globalUserNameMap && window.globalUserNameMap[lookupEmail]) 
                ? window.globalUserNameMap[lookupEmail] 
                : (log.driver_name || 'Unknown');
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
            
            const lookupKey = (s.email || '').toString().toLowerCase().trim();
            const rate = HOURLY_RATES[lookupKey] || 0;
            s.pay = s.hours * rate;
            
            if (s.hours > 0 && rate === 0 && s.email) {
                console.warn(`No hourly rate found for: "${lookupKey}"`);
            }

            if (s.employee) {
                if (!payrollSummary[s.employee]) {
                    payrollSummary[s.employee] = { hours: 0, pay: 0, email: s.email };
                }
                payrollSummary[s.employee].hours += s.hours;
                payrollSummary[s.employee].pay += s.pay;
            }
        });

        // Render Summary Cards if Admin or Employee
        const summaryEl = document.getElementById('attendance-summary');
        if (summaryEl) {
            if ((isAdmin || isStaff) && Object.keys(payrollSummary).length > 0) {
                summaryEl.style.display = 'grid';
                summaryEl.innerHTML = '';
                Object.entries(payrollSummary).forEach(([name, data]) => {
                    const safeName = name.replace(/'/g, "\\'");
                    const safeEmail = (data.email || '').replace(/'/g, "\\'");
                    
                    const card = document.createElement('div');
                    card.style.cssText = 'background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; border-top: 4px solid #10b981; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);';
                    
                    // Show "Mark as Paid" only for admins
                    const payBtn = isAdmin ? `
                        <button
                            onclick="window.payEmployee('${safeName}', '${safeEmail}', ${data.pay.toFixed(2)})"
                            style="width: 100%; padding: 10px; background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; border-radius: 8px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s;"
                            onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                            <i class="fas fa-money-check-alt"></i> MARK AS PAID
                        </button>
                    ` : '';

                    card.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                            <span style="font-size: 0.65rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">${isAdmin ? 'Employee Total' : 'My Summary'}</span>
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
                        ${payBtn}
                    `;
                    summaryEl.appendChild(card);
                });
            } else {
                summaryEl.style.display = 'none';
            }
        }

        // --- PAYROLL PAYMENT FUNCTION ---
        window.payEmployee = async function(employeeName, employeeEmail, amount) {
            const role = (window.currentUserRole || '').toLowerCase().trim();
            if (role === 'student') {
                alert("Students cannot register payments.");
                return;
            }
            const today = new Date().toISOString().split('T')[0];
            const startDate = document.getElementById('att-start-date')?.value || '';
            const endDate = document.getElementById('att-end-date')?.value || '';
            const periodLabel = (startDate && endDate) ? `${startDate} to ${endDate}` : today;

            const confirmMsg = `Register salary payment of $${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} for ${employeeName}?\n\nThis will create an expense record in Expense Management.`;
            if (!confirm(confirmMsg)) return;

            try {
                // --- DUPLICATE CHECK ---
                const fullNote = `Period: ${periodLabel} | Email: ${employeeEmail}`;
                const { data: existing, error: checkError } = await window.db.from('expenses')
                    .select('id')
                    .eq('category', 'Payroll')
                    .eq('description', `Salary Payment - ${employeeName}`)
                    .eq('note', fullNote);

                if (checkError) throw checkError;

                if (existing && existing.length > 0) {
                    alert(`ERROR: Ya existe un registro de pago para ${employeeName} en el periodo ${periodLabel} en el módulo de Gastos.\n\nNo se creará un duplicado.`);
                    return;
                }
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
            
            // --- ACTIVE SESSION HIGHLIGHT ---
            const isActive = s.outTime === '---' && s.inTime !== '---';
            if (isActive) {
                tr.style.background = '#f0fdf4'; // Light green
                tr.style.borderLeft = '4px solid #22c55e'; // Green indicator
            }

            const dParts = s.date.split('-');
            const dateStr = dParts.length === 3 ? `${dParts[1]}/${dParts[2]}/${dParts[0]}` : s.date;

            const safeEmp = s.employee ? s.employee.replace(/'/g, "\\'") : '';
            const safeEmail = s.email ? s.email.replace(/'/g, "\\'") : '';
            const safeInTime = s.inTime ? s.inTime.replace(/'/g, "\\'") : '';
            const safeOutTime = s.outTime ? s.outTime.replace(/'/g, "\\'") : '';

            if (isAdmin) {
                tr.style.cursor = 'pointer';
                tr.classList.add('hover-row');
                tr.onclick = (e) => {
                    // Prevent triggering if clicking action buttons like delete
                    if (e.target.closest('button')) return;
                    window.openFullEditModal(s.employee, s.email, s.date, s.inId, s.inTime, s.outId, s.outTime);
                };
            }

            const clockOutBtn = (isAdmin && !s.outId && s.inId) ? 
                '<button onclick="adminClockOut(\'' + safeEmp + '\', \'' + safeEmail + '\', \'' + s.date + '\')" style="margin-left:8px; background:#fef3c7; border:1px solid #f59e0b; color:#92400e; cursor:pointer; font-size:0.6rem; padding:2px 5px; border-radius:4px; font-weight:800; vertical-align:middle;" title="Force Clock Out">CLOCK OUT</button>' : '';

            const payCell = isAdmin ? 
                '<td style="color:#059669; font-weight:800;">$' + (s.pay || 0).toFixed(2) + '</td>' : 
                '<td class="admin-only">---</td>';

            const actionCell = isAdmin ? `
                <td style="text-align:center;">
                    <button onclick="deleteAttendanceSession('${s.inId}', '${s.outId}')" class="btn-manage-inline" style="background:#fee2e2; color:#ef4444; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            ` : '<td></td>';

            const inTimeHtml = isActive ? 
                `<span style="display:flex; align-items:center; gap:5px; color:#16a34a; font-weight:900;"><i class="fas fa-circle" style="font-size:0.5rem; animation: pulse 1.5s infinite;"></i> ${s.inTime} <span style="background:#22c55e; color:white; font-size:0.6rem; padding:2px 4px; border-radius:4px; margin-left:4px;">LIVE</span></span>` : 
                (s.inTime || '---');

            tr.innerHTML = `
                <td><strong>${dateStr}</strong></td>
                <td><strong style="color:#1e293b;">${s.employee || '---'}</strong></td>
                <td style="position:relative;">${inTimeHtml}</td>
                <td>${s.inLoc || '---'}</td>
                <td style="position:relative;">
                    <span style="color:#9a3412; font-weight:bold;">${s.outTime || '---'}</span>
                    ${clockOutBtn}
                </td>
                <td>${s.outLoc || '---'}</td>
                <td><span style="font-weight:700;">${(s.hours || 0).toFixed(2)}</span></td>
                ${payCell}
                ${actionCell}
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
    const role = (window.currentUserRole || '').toLowerCase().trim();
    if (role === 'student') {
        alert("Students cannot delete attendance records.");
        return;
    }
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
            await window.loadAttendanceData(true);
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
    
    const hasFilters = (startInput && startInput.value) || (endInput && endInput.value) || (empInput && empInput.value);
    if (!hasFilters) return;

    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    if (empInput) empInput.value = '';
    
    // Refresh only when filters are actually cleared to update the view
    window.loadAttendanceData(true);
};

window.populateAttendanceEmployeeFilter = async function() {
    const sel = document.getElementById('att-filter-employee');
    if (!sel) return;
    
    try {
        const { data, error } = await window.db.from('profiles')
            .select('driver_name_ref, email')
            .in('role', ['admin', 'ADMIN', 'employee', 'EMPLOYEE', 'staff', 'STAFF', 'user', 'student', 'STUDENT']);
        
        if (error) throw error;
        
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">All Employees</option>';
        
        if (!window.globalUserNameMap) window.globalUserNameMap = {};

        const employeeList = [];

        if (data) {
            data.forEach(p => {
                const name = p.driver_name_ref || (p.email ? p.email.split('@')[0].toUpperCase() : 'Unknown');
                if (name && p.email) {
                    const emailKey = p.email.toString().toLowerCase().trim();
                    window.globalUserNameMap[emailKey] = name;
                    employeeList.push({ name, email: emailKey });
                }
            });
        }
        
        // Remove duplicates where friendly name or email is identical
        const uniqueList = [];
        const seenEmails = new Set();
        employeeList.forEach(item => {
            if (!seenEmails.has(item.email)) {
                seenEmails.add(item.email);
                uniqueList.push(item);
            }
        });

        // Sort by friendly name
        uniqueList.sort((a, b) => a.name.localeCompare(b.name));

        const allowedNames = ['YARISELIS', 'ISABELLA', 'ANTHONY'];
        uniqueList.forEach(emp => {
            const upperName = emp.name.toUpperCase().trim();
            if (allowedNames.includes(upperName)) {
                const opt = document.createElement('option');
                opt.value = emp.email;
                opt.textContent = emp.name;
                sel.appendChild(opt);
            }
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
        // Wait for DB and for a role that isn't the initial null or default 'user' if possible
        // But if it's 'user' and stays 'user' after a while, we proceed.
        if (window.db && window.currentUserRole) {
            // If it's still the default 'user', we wait up to 3 seconds for a potential 'admin' update
            if (window.currentUserRole === 'user' && !window._roleWaitStarted) {
                window._roleWaitStarted = Date.now();
                return;
            }
            if (window.currentUserRole === 'user' && (Date.now() - window._roleWaitStarted < 3000)) {
                return;
            }

            clearInterval(checkButtons);
            window.updateAttendanceButtons();
            window.populateAttendanceEmployeeFilter().then(() => {
                window.loadAttendanceData(true);
            });
            
            // OPT: Increased from 60s to 5 min — updateAttendanceButtons now uses cached email
            // and only hits activity_logs (LIMIT 1), so it's cheap but still frequent enough.
            setInterval(() => {
                window.updateAttendanceButtons();
            }, 300000);
        }
    }, 500);

    // Default range REMOVED as per user request to see all records by default
    const startInput = document.getElementById('att-start-date');
    const endInput = document.getElementById('att-end-date');
    if (startInput && endInput) {
        startInput.value = '';
        endInput.value = '';
    }
});
