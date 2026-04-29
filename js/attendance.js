// Attendance Tracking Logic
window.handleClockIn = async function() {
    if (!db) return alert("Database not connected");

    const { data: { session } } = await db.auth.getSession();
    if (!session) return alert("You must be logged in.");

    // Prevent double clicking
    const btn = document.getElementById('btn-clockin');
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

        const { data, error } = await query;
        if (error) throw error;

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No records found.</td></tr>';
            return;
        }

        // Group by Date + Employee
        const sessions = {};
        data.forEach(log => {
            const date = log.view_date;
            const employee = log.driver_name || 'Unknown';
            const key = `${date}_${employee}`;

            if (!sessions[key]) {
                sessions[key] = { date, employee, inTime: null, inLoc: null, outTime: null, outLoc: null };
            }

            const timeStr = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const gpsInfo = (log.details || '').replace('GPS: ', '');
            let locationHtml = gpsInfo;
            if (gpsInfo !== 'No GPS Data' && gpsInfo.includes(',')) {
                locationHtml = `<a href="https://www.google.com/maps/search/?api=1&query=${gpsInfo}" target="_blank" style="color:#1e40af; text-decoration:underline;">Map</a>`;
            }

            if (log.action_type === 'CLOCK_IN') {
                sessions[key].inTime = timeStr;
                sessions[key].inLoc = locationHtml;
            } else {
                sessions[key].outTime = timeStr;
                sessions[key].outLoc = locationHtml;
            }
        });

        // Render sorted by date descending
        const sortedKeys = Object.keys(sessions).sort().reverse();
        sortedKeys.forEach(key => {
            const s = sessions[key];
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
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Failed to load attendance:", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Failed to load data.</td></tr>';
    }
};

window.resetAttendanceFilters = function() {
    const startInput = document.getElementById('att-start-date');
    const endInput = document.getElementById('att-end-date');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    
    // Reload everything
    window.loadAttendanceData();
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

    // Default range REMOVED as per user request to see all records by default
    const startInput = document.getElementById('att-start-date');
    const endInput = document.getElementById('att-end-date');
    if (startInput && endInput) {
        startInput.value = '';
        endInput.value = '';
    }
});
