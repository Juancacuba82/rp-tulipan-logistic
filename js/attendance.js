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
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.loadAttendanceData = async function() {
    if (!db) return;
    
    const tbody = document.getElementById('attendance-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    const startDate = document.getElementById('att-start-date').value;
    const endDate = document.getElementById('att-end-date').value;
    
    try {
        let query = db.from('activity_logs')
            .select('*')
            .eq('action_type', 'CLOCK_IN')
            .order('created_at', { ascending: false });

        if (startDate) {
            query = query.gte('view_date', startDate);
        }
        if (endDate) {
            query = query.lte('view_date', endDate);
        }

        const { data, error } = await query;
        if (error) throw error;

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>';
            return;
        }

        data.forEach(log => {
            const tr = document.createElement('tr');
            
            const dt = new Date(log.created_at);
            const mm = String(dt.getMonth() + 1).padStart(2, '0');
            const dd = String(dt.getDate()).padStart(2, '0');
            const yyyy = dt.getFullYear();
            const dateStr = `${mm}/${dd}/${yyyy}`;
            const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const gpsInfo = (log.details || '').replace('GPS: ', '');
            let locationHtml = gpsInfo;
            if (gpsInfo !== 'No GPS Data' && gpsInfo.includes(',')) {
                locationHtml = `<a href="https://www.google.com/maps/search/?api=1&query=${gpsInfo}" target="_blank" style="color:#1e40af; text-decoration:underline;">View on Map</a>`;
            }

            tr.innerHTML = `
                <td><strong>${dateStr}</strong> <span style="color:#64748b; font-size:0.85rem;">${timeStr}</span></td>
                <td><strong style="color:#1e293b;">${log.driver_name || 'Unknown'}</strong></td>
                <td>${log.user_email || ''}</td>
                <td><span style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.75rem;">CLOCK IN</span></td>
                <td>${locationHtml}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Failed to load attendance:", err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Failed to load data.</td></tr>';
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

    // Default range to last 30 days
    const startInput = document.getElementById('att-start-date');
    const endInput = document.getElementById('att-end-date');
    if (startInput && endInput) {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const formatDate = (date) => {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        startInput.value = formatDate(thirtyDaysAgo);
        endInput.value = formatDate(today);
    }
});
