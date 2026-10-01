// ============= GLOBAL DEĞİŞKENLER =============
let mixData = null;
let currentRoom = null;
let draggedItem = null;
let selectedSeat = null;
let roomLayouts = {};
let showTeacherDesk = true;

// ============= SAYFA YÜKLENİNCE =============
document.addEventListener('DOMContentLoaded', function() {
    const storedData = sessionStorage.getItem('mixResults');
    if (storedData) {
        try {
            const parsed = JSON.parse(storedData);
            mixData = parsed.mixData || parsed;
            roomLayouts = parsed.roomLayouts || {};
            loadRoomsList();
            updateRoomCount();
        } catch(e) {
            console.error('SessionStorage parse hatası:', e);
        }
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const dataParam = urlParams.get('data');
        if (dataParam) {
            try {
                mixData = JSON.parse(decodeURIComponent(dataParam));
                loadRoomsList();
                updateRoomCount();
            } catch(e) {
                console.error('URL parse hatası:', e);
            }
        } else {
            document.getElementById('noRoomSelected').innerHTML = `
                <i class="bi bi-exclamation-triangle fs-1 text-danger"></i>
                <p class="mt-3">Karma verisi bulunamadı! Önce sınav yönetiminden karma işlemi yapın.</p>
                <a href="/exams" class="btn btn-primary">Sınav Yönetimine Git</a>
            `;
        }
    }
});

function updateRoomCount() {
    const roomCount = document.getElementById('roomCount');
    if (roomCount && mixData && mixData.results) {
        const rooms = getAllRooms();
        roomCount.innerText = rooms.length;
    }
}

function getAllRooms() {
    const rooms = new Set();
    if (mixData && mixData.results) {
        mixData.results.forEach(group => {
            if (group.distribution) {
                Object.keys(group.distribution).forEach(room => rooms.add(room));
            }
        });
    }
    return Array.from(rooms);
}

function loadRoomsList() {
    if (!mixData || !mixData.results) {
        const stored = sessionStorage.getItem('mixResults');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                mixData = parsed.mixData || parsed;
                roomLayouts = parsed.roomLayouts || {};
            } catch(e) {
                console.error('SessionStorage parse hatası:', e);
            }
        }
    }
    
    if (!mixData || !mixData.results) {
        document.getElementById('roomsList').innerHTML = '<div class="text-center text-muted py-3">Karma verisi bulunamadı!</div>';
        return;
    }
    
    const roomsList = document.getElementById('roomsList');
    roomsList.innerHTML = '';
    
    const allRooms = getAllRooms();
    
    if (allRooms.length === 0) {
        roomsList.innerHTML = '<div class="text-center text-muted py-3">Salon bulunamadı!</div>';
        return;
    }
    
    allRooms.sort().forEach(room => {
        let totalStudents = 0;
        let capacity = 0;
        
        mixData.results.forEach(group => {
            if (group.distribution && group.distribution[room]) {
                totalStudents += group.distribution[room].total;
                capacity = group.distribution[room].capacity;
            }
        });
        
        const percent = capacity ? (totalStudents / capacity * 100).toFixed(1) : 0;
        
        const roomCard = document.createElement('div');
        roomCard.className = 'room-card card';
        roomCard.setAttribute('data-room', room);
        roomCard.onclick = () => selectRoom(room);
        roomCard.innerHTML = `
            <div class="card-body p-2">
                <div class="d-flex justify-content-between align-items-center">
                    <strong><i class="bi bi-door-closed"></i> ${room}</strong>
                    <span class="badge ${totalStudents === capacity ? 'bg-danger' : 'bg-success'}">
                        ${totalStudents}/${capacity}
                    </span>
                </div>
                <div class="progress mt-1" style="height: 4px;">
                    <div class="progress-bar bg-success" style="width: ${percent}%"></div>
                </div>
                <div class="small text-muted mt-1">
                    <i class="bi bi-people"></i> ${totalStudents} öğrenci
                </div>
            </div>
        `;
        roomsList.appendChild(roomCard);
        
        if (!roomLayouts[room]) {
            roomLayouts[room] = {
                layoutType: 'single',
                rowCount: Math.ceil(totalStudents / 4) || 4,
                seatsPerRow: 4,
                seatOrder: 'sequential',
                showTeacherDesk: true,
                students: []
            };
            
            mixData.results.forEach(group => {
                if (group.mixed_students) {
                    group.mixed_students.forEach(student => {
                        if (student.room === room) {
                            roomLayouts[room].students.push(student);
                        }
                    });
                }
            });
            roomLayouts[room].students.sort((a, b) => (a.seat || 0) - (b.seat || 0));
        }
    });
}

function selectRoom(room) {
    currentRoom = room;
    
    document.querySelectorAll('.room-card').forEach(card => {
        card.classList.remove('active');
        if (card.getAttribute('data-room') === room) {
            card.classList.add('active');
        }
    });
    
    document.getElementById('currentRoomName').innerText = room;
    
    const roomStudents = [];
    mixData.results.forEach(group => {
        if (group.mixed_students) {
            group.mixed_students.forEach(student => {
                if (student.room === room) {
                    roomStudents.push({
                        ...student,
                        groupDate: group.date,
                        groupHour: group.hour
                    });
                }
            });
        }
    });
    
    roomStudents.sort((a, b) => (a.seat || 0) - (b.seat || 0));
    
    if (!roomLayouts[room]) {
        roomLayouts[room] = {
            layoutType: 'single',
            rowCount: Math.ceil(roomStudents.length / 4) || 4,
            seatsPerRow: 4,
            seatOrder: 'sequential',
            showTeacherDesk: true,
            students: roomStudents
        };
    } else {
        roomLayouts[room].students = roomStudents;
    }
    
    document.getElementById('layoutType').value = roomLayouts[room].layoutType;
    document.getElementById('rowCount').value = roomLayouts[room].rowCount;
    document.getElementById('seatsPerRow').value = roomLayouts[room].seatsPerRow;
    document.getElementById('seatOrder').value = roomLayouts[room].seatOrder;
    document.getElementById('showTeacherDesk').checked = roomLayouts[room].showTeacherDesk !== false;
    showTeacherDesk = roomLayouts[room].showTeacherDesk !== false;
    
    document.getElementById('studentCount').innerText = roomStudents.length + ' öğrenci';
    
    renderSeatGrid();
}

function renderSeatGrid() {
    if (!currentRoom || !roomLayouts[currentRoom]) return;
    
    const layout = roomLayouts[currentRoom];
    const students = layout.students;
    const rowCount = parseInt(layout.rowCount) || 8;
    const seatsPerRow = parseInt(layout.seatsPerRow) || 4;
    const seatOrder = layout.seatOrder || 'sequential';
    const layoutType = layout.layoutType || 'single';
    const showTeacher = layout.showTeacherDesk !== false;
    
    const seatGrid = document.getElementById('seatGrid');
    const noRoomDiv = document.getElementById('noRoomSelected');
    
    if (!seatGrid) return;
    
    seatGrid.style.display = 'grid';
    seatGrid.style.gap = '12px';
    noRoomDiv.style.display = 'none';
    
    if (showTeacher) {
        seatGrid.style.gridTemplateRows = `auto repeat(${rowCount}, auto)`;
        if (layoutType === 'paired') {
            seatGrid.style.gridTemplateColumns = `repeat(${seatsPerRow}, minmax(140px, 1fr))`;
        } else {
            seatGrid.style.gridTemplateColumns = `repeat(${seatsPerRow}, minmax(130px, 1fr))`;
        }
    } else {
        seatGrid.style.gridTemplateRows = `repeat(${rowCount}, auto)`;
        if (layoutType === 'paired') {
            seatGrid.style.gridTemplateColumns = `repeat(${seatsPerRow}, minmax(140px, 1fr))`;
        } else {
            seatGrid.style.gridTemplateColumns = `repeat(${seatsPerRow}, minmax(130px, 1fr))`;
        }
    }
    
    seatGrid.innerHTML = '';
    
    if (showTeacher) {
        const teacherDesk = document.createElement('div');
        teacherDesk.className = 'teacher-desk';
        teacherDesk.style.gridRow = '1';
        teacherDesk.style.gridColumn = '1';
        teacherDesk.style.width = '100%';
        teacherDesk.innerHTML = `
            <i class="bi bi-person-badge"></i>
            <span>ÖĞRETMEN</span>
        `;
        seatGrid.appendChild(teacherDesk);
        
        for (let col = 2; col <= seatsPerRow; col++) {
            const emptyTop = document.createElement('div');
            emptyTop.style.gridRow = '1';
            emptyTop.style.gridColumn = `${col}`;
            emptyTop.style.visibility = 'hidden';
            seatGrid.appendChild(emptyTop);
        }
    }
    
    const totalSeats = rowCount * seatsPerRow;
    const seatNumbers = generateSeatNumbers(totalSeats, rowCount, seatsPerRow, seatOrder);
    
    let globalStudentIndex = 0;
    const startRow = showTeacher ? 2 : 1;
    
    for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < seatsPerRow; col++) {
            const absoluteIndex = row * seatsPerRow + col;
            const seatNum = seatNumbers[absoluteIndex];
            const gridRow = startRow + row;
            const gridCol = col + 1;
            
            if (layoutType === 'paired' && globalStudentIndex < students.length) {
                const pairedDiv = document.createElement('div');
                pairedDiv.className = 'seat-card paired';
                pairedDiv.style.gridRow = `${gridRow}`;
                pairedDiv.style.gridColumn = `${gridCol}`;
                pairedDiv.style.display = 'flex';
                pairedDiv.style.flexDirection = 'row';
                pairedDiv.style.padding = '0';
                pairedDiv.style.overflow = 'hidden';
                
                if (globalStudentIndex < students.length) {
                    const leftStudent = students[globalStudentIndex];
                    const leftSeat = createPairedSeat(leftStudent, seatNum, globalStudentIndex);
                    pairedDiv.appendChild(leftSeat);
                    globalStudentIndex++;
                }
                
                if (globalStudentIndex < students.length) {
                    const rightStudent = students[globalStudentIndex];
                    const rightSeat = createPairedSeat(rightStudent, seatNum + 1, globalStudentIndex);
                    pairedDiv.appendChild(rightSeat);
                    globalStudentIndex++;
                }
                
                while (pairedDiv.children.length < 2) {
                    const emptyPaired = document.createElement('div');
                    emptyPaired.className = 'paired-seat empty-seat';
                    emptyPaired.style.flex = '1';
                    emptyPaired.style.padding = '10px';
                    emptyPaired.style.display = 'flex';
                    emptyPaired.style.alignItems = 'center';
                    emptyPaired.style.justifyContent = 'center';
                    emptyPaired.innerHTML = '<span class="text-muted">🚫 Boş</span>';
                    pairedDiv.appendChild(emptyPaired);
                }
                
                seatGrid.appendChild(pairedDiv);
                
            } else if (globalStudentIndex < students.length) {
                const student = students[globalStudentIndex];
                const seatCard = createSeatCardElement(student, seatNum, globalStudentIndex);
                seatCard.style.gridRow = `${gridRow}`;
                seatCard.style.gridColumn = `${gridCol}`;
                seatGrid.appendChild(seatCard);
                globalStudentIndex++;
                
            } else {
                const emptySeat = createEmptySeatElement(seatNum);
                emptySeat.style.gridRow = `${gridRow}`;
                emptySeat.style.gridColumn = `${gridCol}`;
                seatGrid.appendChild(emptySeat);
            }
        }
    }
    
    updateLayoutPreview();
}

function generateSeatNumbers(totalSeats, rows, cols, order) {
    const seatNumbers = [];
    
    if (order === 'sequential') {
        for (let i = 1; i <= totalSeats; i++) seatNumbers.push(i);
    } else if (order === 'snake') {
        for (let row = 0; row < rows; row++) {
            if (row % 2 === 0) {
                for (let col = 1; col <= cols; col++) {
                    seatNumbers.push(row * cols + col);
                }
            } else {
                for (let col = cols; col >= 1; col--) {
                    seatNumbers.push(row * cols + col);
                }
            }
        }
    } else if (order === 'reverse') {
        for (let i = totalSeats; i >= 1; i--) seatNumbers.push(i);
    }
    
    return seatNumbers;
}

function createPairedSeat(student, seatNum, index) {
    const seat = document.createElement('div');
    seat.className = 'paired-seat';
    seat.style.flex = '1';
    seat.style.padding = '10px';
    seat.style.borderRight = '1px solid #ddd';
    seat.style.cursor = 'grab';
    seat.style.position = 'relative';
    
    const genderClass = student.student?.cinsiyet === 'Erkek' ? 'male' : 'female';
    const genderIcon = student.student?.cinsiyet === 'Erkek' ? '👨' : '👩';
    
    seat.innerHTML = `
        <div class="seat-number">${seatNum}</div>
        <div class="drag-handle">⋮⋮</div>
        <div class="student-name">${escapeHtml(student.student?.ad_soyad || '-')}</div>
        <div class="student-class">${escapeHtml(student.student?.sinif || '-')}</div>
        <div class="student-gender ${genderClass}">${genderIcon} ${student.student?.cinsiyet || '-'}</div>
    `;
    seat.setAttribute('data-student-index', index);
    seat.setAttribute('data-seat', seatNum);
    setupDragDropForPaired(seat, index);
    seat.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSeat(seat, student, index);
    });
    return seat;
}

function createSeatCardElement(student, seatNum, index) {
    const div = document.createElement('div');
    div.className = 'seat-card';
    
    const genderClass = student.student?.cinsiyet === 'Erkek' ? 'male' : 'female';
    const genderIcon = student.student?.cinsiyet === 'Erkek' ? '👨' : '👩';
    
    div.innerHTML = `
        <div class="seat-number">${seatNum}</div>
        <div class="drag-handle">⋮⋮</div>
        <div class="student-name">${escapeHtml(student.student?.ad_soyad || '-')}</div>
        <div class="student-class">${escapeHtml(student.student?.sinif || '-')}</div>
        <div class="student-gender ${genderClass}">${genderIcon} ${student.student?.cinsiyet || '-'}</div>
        <div class="student-exam">${escapeHtml(student.exam_name || '-')}</div>
    `;
    div.setAttribute('data-student-index', index);
    div.setAttribute('data-seat', seatNum);
    setupDragDrop(div, index);
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSeat(div, student, index);
    });
    return div;
}

function createEmptySeatElement(seatNum) {
    const div = document.createElement('div');
    div.className = 'seat-card empty-seat';
    div.setAttribute('data-empty', 'true');
    div.setAttribute('data-seat', seatNum);
    div.innerHTML = `
        <div class="seat-number">${seatNum}</div>
        <div class="student-name text-muted">🚫 Boş Koltuk</div>
    `;
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('click', () => selectEmptySeat(div, seatNum));
    return div;
}

function setupDragDrop(element, index) {
    element.setAttribute('draggable', 'true');
    element.addEventListener('dragstart', (e) => handleDragStart(e, index));
    element.addEventListener('dragend', handleDragEnd);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);
}

function setupDragDropForPaired(element, index) {
    element.setAttribute('draggable', 'true');
    element.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        dragSourceIndex = index;
        e.dataTransfer.setData('text/plain', index);
        e.dataTransfer.effectAllowed = 'move';
        element.classList.add('dragging');
    });
    element.addEventListener('dragend', (e) => {
        element.classList.remove('dragging');
        dragSourceIndex = null;
    });
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
    });
    element.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragSourceIndex === null) return;
        
        const students = roomLayouts[currentRoom].students;
        if (dragSourceIndex !== index && index < students.length) {
            [students[dragSourceIndex], students[index]] = [students[index], students[dragSourceIndex]];
            students.forEach((student, idx) => { student.seat = idx + 1; });
            renderSeatGrid();
            showToast('Öğrenciler yer değiştirildi', 'success');
        }
        dragSourceIndex = null;
    });
}

let dragSourceIndex = null;

function handleDragStart(e, index) {
    dragSourceIndex = index;
    e.dataTransfer.setData('text/plain', index);
    e.dataTransfer.effectAllowed = 'move';
    e.target.closest('.seat-card')?.classList.add('dragging');
}

function handleDragEnd(e) {
    const card = e.target.closest('.seat-card');
    if (card) card.classList.remove('dragging');
    dragSourceIndex = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.seat-card, .paired-seat');
    if (target && !target.classList.contains('dragging')) {
        target.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const target = e.target.closest('.seat-card, .paired-seat');
    if (target) target.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    const targetCard = e.target.closest('.seat-card, .paired-seat');
    if (targetCard) {
        const parentPaired = targetCard.closest('.paired');
        if (parentPaired) {
            const allSeats = Array.from(parentPaired.querySelectorAll('.paired-seat'));
            const targetIndex = targetCard.getAttribute('data-student-index');
            if (targetIndex !== null && dragSourceIndex !== null && targetIndex != dragSourceIndex) {
                const students = roomLayouts[currentRoom].students;
                [students[dragSourceIndex], students[targetIndex]] = [students[targetIndex], students[dragSourceIndex]];
                students.forEach((student, idx) => { student.seat = idx + 1; });
                renderSeatGrid();
                showToast('Öğrenciler yer değiştirildi', 'success');
            }
        } else {
            targetCard.classList.remove('drag-over');
            const targetIndex = targetCard.getAttribute('data-student-index');
            const isEmptyTarget = targetCard.classList.contains('empty-seat');
            const students = roomLayouts[currentRoom].students;
            
            if (isEmptyTarget && dragSourceIndex !== null) {
                const targetSeat = parseInt(targetCard.getAttribute('data-seat'));
                const movedStudent = students[dragSourceIndex];
                students.splice(dragSourceIndex, 1);
                students.splice(targetSeat - 1, 0, movedStudent);
                students.forEach((student, idx) => { student.seat = idx + 1; });
                renderSeatGrid();
                showToast('Öğrenci taşındı', 'success');
            } else if (targetIndex !== null && dragSourceIndex !== null && targetIndex != dragSourceIndex) {
                [students[dragSourceIndex], students[targetIndex]] = [students[targetIndex], students[dragSourceIndex]];
                students.forEach((student, idx) => { student.seat = idx + 1; });
                renderSeatGrid();
                showToast('Öğrenciler yer değiştirildi', 'success');
            }
        }
    }
    dragSourceIndex = null;
}

let selectedSeatElement = null;

function selectSeat(element, student, index) {
    if (selectedSeatElement) selectedSeatElement.classList.remove('selected');
    selectedSeatElement = element;
    selectedSeatElement.classList.add('selected');
    selectedSeat = { element, student, index };
    showStudentDetail(student);
}

function selectEmptySeat(element, seatNumber) {
    if (selectedSeatElement) selectedSeatElement.classList.remove('selected');
    selectedSeatElement = element;
    selectedSeatElement.classList.add('selected');
    selectedSeat = { element, seatNumber, isEmpty: true };
}

function showStudentDetail(student) {
    const modalBody = document.getElementById('studentDetailBody');
    modalBody.innerHTML = `
        <table class="table table-bordered">
            <tr><th>Ad Soyad</th><td><b>${escapeHtml(student.student?.ad_soyad || '-')}</b></td></tr>
            <tr><th>Okul No</th><td>${escapeHtml(student.student?.numara || '-')}</td></tr>
            <tr><th>Sınıf</th><td>${escapeHtml(student.student?.sinif || '-')}</td></tr>
            <tr><th>Cinsiyet</th><td>${student.student?.cinsiyet === 'Erkek' ? '👨 Erkek' : '👩 Kız'}</td></tr>
            <tr><th>Sınav</th><td>${escapeHtml(student.exam_name || '-')}</td></tr>
            <tr><th>Sıra No</th><td><b>${student.seat || '-'}</b></td></tr>
            <tr><th>Salon</th><td>${escapeHtml(student.room || '-')}</td></tr>
        </table>
    `;
    new bootstrap.Modal(document.getElementById('studentDetailModal')).show();
}

function moveStudentToEmpty() {
    if (!selectedSeat || !selectedSeat.isEmpty && selectedSeat.element) {
        if (selectedSeat && !selectedSeat.isEmpty) {
            const emptySeats = document.querySelectorAll('.empty-seat:not(.paired)');
            if (emptySeats.length > 0) {
                const firstEmpty = emptySeats[0];
                const targetSeat = parseInt(firstEmpty.getAttribute('data-seat'));
                const students = roomLayouts[currentRoom].students;
                const movedStudent = students[selectedSeat.index];
                students.splice(selectedSeat.index, 1);
                students.splice(targetSeat - 1, 0, movedStudent);
                students.forEach((student, idx) => { student.seat = idx + 1; });
                renderSeatGrid();
                showToast('Öğrenci boş koltuğa taşındı', 'success');
                bootstrap.Modal.getInstance(document.getElementById('studentDetailModal'))?.hide();
            } else {
                showToast('Boş koltuk bulunamadı!', 'warning');
            }
        }
    }
}

function changeLayoutType() {
    if (!currentRoom) return;
    const newLayoutType = document.getElementById('layoutType').value;
    roomLayouts[currentRoom].layoutType = newLayoutType;
    
    if (newLayoutType === 'paired') {
        const currentSeats = roomLayouts[currentRoom].seatsPerRow;
        if (currentSeats > 6) {
            roomLayouts[currentRoom].seatsPerRow = 4;
            document.getElementById('seatsPerRow').value = 4;
        }
    }
    renderSeatGrid();
}

function updateSeatLayout() {
    if (!currentRoom) return;
    roomLayouts[currentRoom].rowCount = parseInt(document.getElementById('rowCount').value);
    roomLayouts[currentRoom].seatsPerRow = parseInt(document.getElementById('seatsPerRow').value);
    roomLayouts[currentRoom].seatOrder = document.getElementById('seatOrder').value;
    renderSeatGrid();
}

function toggleTeacherDesk() {
    if (!currentRoom) return;
    roomLayouts[currentRoom].showTeacherDesk = document.getElementById('showTeacherDesk').checked;
    renderSeatGrid();
}

function updateLayoutPreview() {
    const layout = roomLayouts[currentRoom];
    if (!layout) return;
    
    const totalSeats = layout.rowCount * layout.seatsPerRow;
    const studentCount = layout.students.length;
    const emptySeats = totalSeats - studentCount;
    
    const preview = document.getElementById('layoutPreview');
    if (preview) {
        preview.innerHTML = `
            <i class="bi bi-grid"></i> ${layout.rowCount} sıra × ${layout.seatsPerRow} koltuk = ${totalSeats} koltuk | 
            <span class="text-success">👥 ${studentCount} dolu</span> | 
            <span class="text-muted">🚫 ${emptySeats} boş</span>
        `;
    }
}

function saveCurrentLayout() {
    if (!currentRoom) {
        showToast('Lütfen bir salon seçin', 'warning');
        return;
    }
    updateMixDataWithCurrentLayouts();
    showToast('Düzen kaydedildi', 'success');
}

function resetRoomLayout() {
    if (!currentRoom || !confirm('Bu salonun düzenini sıfırlamak istediğinize emin misiniz?')) return;
    
    const originalStudents = [];
    mixData.results.forEach(group => {
        if (group.mixed_students) {
            group.mixed_students.forEach(student => {
                if (student.room === currentRoom) {
                    originalStudents.push({ ...student });
                }
            });
        }
    });
    originalStudents.sort((a, b) => (a.seat || 0) - (b.seat || 0));
    
    roomLayouts[currentRoom].students = originalStudents;
    renderSeatGrid();
    showToast('Düzen sıfırlandı', 'success');
}

function autoArrangeSeats() {
    if (!currentRoom) return;
    
    const students = roomLayouts[currentRoom].students;
    const layoutType = roomLayouts[currentRoom].layoutType;
    
    if (layoutType === 'paired') {
        // Çiftli sıra için özel düzenleme
        const arranged = arrangeForPairedSeats(students);
        roomLayouts[currentRoom].students = arranged;
        arranged.forEach((student, idx) => { student.seat = idx + 1; });
        renderSeatGrid();
        
        // Kontrol mesajı
        let sameLevelCount = 0;
        for (let i = 0; i < arranged.length; i += 2) {
            if (i + 1 < arranged.length) {
                const level1 = arranged[i].student?.sinif?.replace(/[^0-9]/g, '');
                const level2 = arranged[i+1].student?.sinif?.replace(/[^0-9]/g, '');
                if (level1 === level2) sameLevelCount++;
            }
        }
        
        if (sameLevelCount === 0) {
            showToast('Çiftli sıra düzeni: Tüm masalarda farklı sınıflar yan yana!', 'success');
        } else {
            showToast(`Çiftli sıra düzeni: ${sameLevelCount} masada aynı sınıf yan yana (manuel düzeltebilirsiniz)`, 'warning');
        }
    } else {
        // Tekli sıra için normal düzenleme (kız-erkek dönüşümlü)
        const females = students.filter(s => s.student?.cinsiyet === 'Kız');
        const males = students.filter(s => s.student?.cinsiyet === 'Erkek');
        
        const arranged = [];
        const maxLen = Math.max(females.length, males.length);
        
        for (let i = 0; i < maxLen; i++) {
            if (i < females.length) arranged.push(females[i]);
            if (i < males.length) arranged.push(males[i]);
        }
        
        roomLayouts[currentRoom].students = arranged;
        arranged.forEach((student, idx) => { student.seat = idx + 1; });
        renderSeatGrid();
        showToast('Tekli sıra düzeni: Kız-Erkek dönüşümlü', 'success');
    }
}

// Çiftli sıra için özel düzenleme - farklı sınıflar yan yana gelsin
function arrangeForPairedSeats(students) {
    if (students.length === 0) return students;
    
    // Öğrencileri sınıf düzeyine göre grupla
    const levelGroups = {};
    students.forEach(student => {
        const level = student.student?.sinif?.replace(/[^0-9]/g, '') || '0';
        if (!levelGroups[level]) levelGroups[level] = [];
        levelGroups[level].push(student);
    });
    
    // Her grubu karıştır
    for (const level in levelGroups) {
        levelGroups[level] = shuffleArray(levelGroups[level]);
    }
    
    // Düzeyleri listele
    const levels = Object.keys(levelGroups).sort();
    if (levels.length === 1) {
        // Sadece tek düzey varsa normal karıştır
        return shuffleArray(students);
    }
    
    // Farklı düzeyleri dönüşümlü olarak yerleştir
    const arranged = [];
    let maxLen = Math.max(...levels.map(l => levelGroups[l].length));
    
    for (let i = 0; i < maxLen; i++) {
        for (const level of levels) {
            if (i < levelGroups[level].length) {
                arranged.push(levelGroups[level][i]);
            }
        }
    }
    
    // Çiftli sıra için: 2'li gruplar halinde kontrol et
    // Her masada 2 kişi olacak, aynı düzey aynı masada olmasın
    const finalArranged = [];
    for (let i = 0; i < arranged.length; i += 2) {
        if (i + 1 < arranged.length) {
            const firstLevel = arranged[i].student?.sinif?.replace(/[^0-9]/g, '') || '0';
            const secondLevel = arranged[i+1].student?.sinif?.replace(/[^0-9]/g, '') || '0';
            
            if (firstLevel === secondLevel) {
                // Aynı düzey yan yana gelmiş, değiştir
                let swapped = false;
                for (let j = i + 2; j < arranged.length; j++) {
                    const candidateLevel = arranged[j].student?.sinif?.replace(/[^0-9]/g, '') || '0';
                    if (candidateLevel !== firstLevel) {
                        // Farklı düzey bulundu, takas et
                        [arranged[i+1], arranged[j]] = [arranged[j], arranged[i+1]];
                        swapped = true;
                        break;
                    }
                }
                if (!swapped && i + 2 < arranged.length) {
                    // Hiç farklı yoksa, sonraki ile takas et
                    [arranged[i+1], arranged[i+2]] = [arranged[i+2], arranged[i+1]];
                }
            }
            finalArranged.push(arranged[i], arranged[i+1]);
        } else {
            // Tek sayıda öğrenci kaldı
            finalArranged.push(arranged[i]);
        }
    }
    
    return finalArranged;
}

// Yardımcı: Diziyi karıştır
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}




// ============= JSON İŞLEMLERİ =============
function exportToJSON() {
    if (!mixData || !mixData.results) {
        showToast('Kaydedilecek karma verisi yok!', 'warning');
        return;
    }
    
    updateMixDataWithCurrentLayouts();
    
    const exportData = {
        mixData: mixData,
        roomLayouts: roomLayouts,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };
    
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kelebek_karma_${new Date().toISOString().slice(0,19)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('JSON dışa aktarıldı', 'success');
}

function importFromJSON(input) {
    const file = input.files[0];
    if (!file) return;
    
    showToast('JSON içe aktarılıyor...', 'info');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            
            if (!imported.mixData || !imported.roomLayouts) {
                showToast('Geçersiz JSON formatı! mixData ve roomLayouts eksik.', 'danger');
                return;
            }
            
            mixData = imported.mixData;
            roomLayouts = imported.roomLayouts;
            
            sessionStorage.setItem('mixResults', JSON.stringify(mixData));
            
            loadRoomsList();
            updateRoomCount();
            
            if (currentRoom && roomLayouts[currentRoom]) {
                renderSeatGrid();
            } else if (Object.keys(roomLayouts).length > 0) {
                const firstRoom = Object.keys(roomLayouts)[0];
                selectRoom(firstRoom);
            }
            
            showToast('JSON başarıyla içe aktarıldı!', 'success');
            
        } catch (error) {
            console.error('JSON parse hatası:', error);
            showToast('JSON ayrıştırma hatası: ' + error.message, 'danger');
        }
    };
    
    reader.onerror = function() {
        showToast('Dosya okuma hatası!', 'danger');
    };
    
    reader.readAsText(file);
    input.value = '';
}

function updateMixDataWithCurrentLayouts() {
    if (!mixData || !mixData.results) return;
    
    for (const [room, layout] of Object.entries(roomLayouts)) {
        if (layout.students && layout.students.length > 0) {
            mixData.results.forEach(group => {
                if (group.mixed_students) {
                    group.mixed_students.forEach(student => {
                        if (student.room === room) {
                            const updatedStudent = layout.students.find(s => 
                                s.student?.numara === student.student?.numara
                            );
                            if (updatedStudent) {
                                student.seat = updatedStudent.seat;
                                student.room = updatedStudent.room;
                            }
                        }
                    });
                    
                    group.mixed_students.sort((a, b) => (a.seat || 0) - (b.seat || 0));
                }
            });
        }
    }
    
    sessionStorage.setItem('mixResults', JSON.stringify(mixData));
}






async function generateSupervisorPDFFromScreen() {
    if (!currentRoom) {
        showToast('Lütfen bir salon seçin', 'warning');
        return;
    }
    
    showToast('Gözetmen PDF\'i hazırlanıyor...', 'info');
    
    const roomName = currentRoom;
    const seatGrid = document.getElementById('seatGrid');
    
    // PDF için özel div oluştur (A4 boyutunda)
    const printDiv = document.createElement('div');
    printDiv.style.width = '210mm';
    printDiv.style.minHeight = '297mm';
    printDiv.style.padding = '10mm';
    printDiv.style.backgroundColor = 'white';
    printDiv.style.boxSizing = 'border-box';
    printDiv.style.fontFamily = 'Arial, sans-serif';
    
    // Başlık
    const titleDiv = document.createElement('div');
    titleDiv.style.textAlign = 'center';
    titleDiv.style.marginBottom = '15px';
    titleDiv.style.padding = '8px';
    titleDiv.style.backgroundColor = '#1a5276';
    titleDiv.style.color = 'white';
    titleDiv.style.borderRadius = '8px';
    titleDiv.innerHTML = `<h2 style="margin:0; font-size:18pt;">SALON: ${roomName}</h2>`;
    printDiv.appendChild(titleDiv);
    
    // Bilgi satırı
    const infoDiv = document.createElement('div');
    infoDiv.style.textAlign = 'center';
    infoDiv.style.marginBottom = '15px';
    infoDiv.style.fontSize = '11pt';
    infoDiv.innerHTML = `
        Tarih: ${new Date().toLocaleDateString('tr-TR')} | 
        Toplam Öğrenci: ${roomLayouts[currentRoom]?.students?.length || 0}
    `;
    printDiv.appendChild(infoDiv);
    
    // Oturma planını klonla
    const gridClone = seatGrid.cloneNode(true);
    gridClone.style.display = 'grid';
    gridClone.style.gap = '8px';
    gridClone.style.width = '100%';
    gridClone.style.margin = '0 auto';
    
    // Grid stilini al
    const gridStyle = window.getComputedStyle(seatGrid);
    const colCount = gridStyle.gridTemplateColumns.split(' ').length;
    gridClone.style.gridTemplateColumns = `repeat(${colCount}, minmax(80px, 1fr))`;
    
    // Tüm kartları düzenle (A4'e sığacak şekilde küçült)
    const allCards = gridClone.querySelectorAll('.seat-card, .teacher-desk, .paired-seat');
    allCards.forEach(card => {
        card.style.border = '1px solid #999';
        card.style.borderRadius = '6px';
        card.style.padding = '6px';
        card.style.backgroundColor = 'white';
        card.style.fontSize = '9pt';
        card.style.minHeight = '60px';
    });
    
    // Öğretmen masası
    const teacherDesk = gridClone.querySelector('.teacher-desk');
    if (teacherDesk) {
        teacherDesk.style.background = 'linear-gradient(135deg, #8B4513, #A0522D)';
        teacherDesk.style.color = 'white';
        teacherDesk.style.fontSize = '11pt';
        teacherDesk.style.minHeight = '70px';
    }
    
    // Çiftli sıra düzeni için özel
    const pairedSeats = gridClone.querySelectorAll('.paired-seat');
    pairedSeats.forEach(seat => {
        seat.style.padding = '6px';
        seat.style.borderRight = '1px solid #ddd';
    });
    
    printDiv.appendChild(gridClone);
    
    // İmza satırı
    const signatureDiv = document.createElement('div');
    signatureDiv.style.marginTop = '20px';
    signatureDiv.style.textAlign = 'center';
    signatureDiv.style.paddingTop = '15px';
    signatureDiv.style.borderTop = '1px solid #ccc';
    signatureDiv.style.fontSize = '10pt';
    signatureDiv.innerHTML = 'Öğretmen İmza: ____________________';
    printDiv.appendChild(signatureDiv);
    
    // PDF oluştur
    document.body.appendChild(printDiv);
    
    try {
        const { jsPDF } = window.jspdf;
        const canvas = await html2canvas(printDiv, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 190;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        const pdf = new jsPDF('p', 'mm', 'a4');
        pdf.addImage(imgData, 'JPEG', 10, 10, imgWidth, imgHeight);
        
        // ============= SINAV KAĞITLARI (ARKALI ÖNLÜ İÇİN) =============
        // Boş sayfa ekle (arkalı önlü için)
        pdf.addPage();
        
        const students = roomLayouts[currentRoom]?.students || [];
        const sortedStudents = [...students].sort((a, b) => (a.seat || 0) - (b.seat || 0));
        
        for (let i = 0; i < sortedStudents.length; i++) {
            const student = sortedStudents[i];
            const studentInfo = student.student;
            const level = studentInfo?.sinif?.replace(/[^0-9]/g, '') || '?';
            const examName = student.exam_name || 'Sınav';
            
            showToast(`Öğrenci ${i+1}/${sortedStudents.length} (${level}. sınıf) sınav kağıdı ekleniyor...`, 'info');
            
            const examPdfBlob = await getExamPdfForLevel(examName, level);
            
            if (examPdfBlob && examPdfBlob.size > 0) {
                const pdfBytes = await examPdfBlob.arrayBuffer();
                const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
                const pageCount = pdfDoc.numPages;
                
                for (let p = 1; p <= pageCount; p++) {
                    const page = await pdfDoc.getPage(p);
                    const viewport = page.getViewport({ scale: 1.5 });
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const context = canvas.getContext('2d');
                    
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    
                    const imgData = canvas.toDataURL('image/jpeg', 0.9);
                    const imgWidth = 190;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 10, 10, imgWidth, imgHeight);
                }
                
                // Sayfa sayısı tek ise boş sayfa ekle
                if (pageCount % 2 === 1) {
                    pdf.addPage();
                }
                
            } else {
                // PDF yoksa uyarı sayfası
                pdf.addPage();
                pdf.setFontSize(14);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(200, 0, 0);
                pdf.text('Sınav Kağıdı Bulunamadı!', 105, 140, { align: 'center' });
                pdf.setFontSize(11);
                pdf.setTextColor(0, 0, 0);
                pdf.text(`${level}. sınıf ${examName} sınav kağıdı yüklenmemiş.`, 105, 160, { align: 'center' });
                pdf.addPage();
            }
            
            await new Promise(r => setTimeout(r, 50));
        }
        
        pdf.save(`gozetmen_${roomName}_${new Date().toISOString().slice(0,19)}.pdf`);
        showToast(`PDF oluşturuldu! ${sortedStudents.length} öğrenci`, 'success');
        
    } catch (error) {
        console.error('PDF hatası:', error);
        showToast('PDF oluşturulamadı: ' + error.message, 'danger');
    } finally {
        document.body.removeChild(printDiv);
    }
}

// ============= GÖZETMEN RAPORU SAYFASI OLUŞTUR =============
async function createSupervisorPage(roomName, seatGrid) {
    const div = document.createElement('div');
    div.style.width = '800px';
    div.style.padding = '20px';
    div.style.backgroundColor = 'white';
    div.style.fontFamily = 'Arial, sans-serif';
    
    const titleDiv = document.createElement('div');
    titleDiv.style.textAlign = 'center';
    titleDiv.style.marginBottom = '20px';
    titleDiv.style.padding = '10px';
    titleDiv.style.backgroundColor = '#1a5276';
    titleDiv.style.color = 'white';
    titleDiv.style.borderRadius = '10px';
    titleDiv.innerHTML = `<h2 style="margin:0">SALON: ${roomName}</h2>`;
    div.appendChild(titleDiv);
    
    // Grid'i klonla
    const gridClone = seatGrid.cloneNode(true);
    gridClone.style.display = 'grid';
    gridClone.style.gap = '12px';
    gridClone.style.margin = '0 auto';
    gridClone.style.width = '100%';
    
    // Tüm kartları düzenle
    const allCards = gridClone.querySelectorAll('.seat-card, .teacher-desk, .paired-seat');
    allCards.forEach(card => {
        card.style.border = '2px solid #ddd';
        card.style.borderRadius = '8px';
        card.style.padding = '8px';
        card.style.backgroundColor = 'white';
        card.style.fontSize = '12px';
    });
    
    const teacherDesk = gridClone.querySelector('.teacher-desk');
    if (teacherDesk) {
        teacherDesk.style.background = 'linear-gradient(135deg, #8B4513, #A0522D)';
        teacherDesk.style.color = 'white';
    }
    
    div.appendChild(gridClone);
    
    const signature = document.createElement('div');
    signature.style.marginTop = '30px';
    signature.style.textAlign = 'center';
    signature.style.paddingTop = '20px';
    signature.style.borderTop = '1px solid #ccc';
    signature.innerHTML = '<p>Öğretmen İmza: ____________________</p>';
    div.appendChild(signature);
    
    return div;
}

async function getExamPdfForLevel(examName, level) {
    try {
        console.log('PDF aranıyor:', examName, level);
        
        const examsRes = await fetch('/api/exams');
        const exams = await examsRes.json();
        console.log('Tüm sınavlar:', exams);
        
        const exam = exams.find(e => e.exam_name === examName);
        console.log('Bulunan sınav:', exam);
        
        if (!exam || !exam.id) {
            console.error(`Sınav bulunamadı: ${examName}`);
            return null;
        }
        
        const pdfRes = await fetch(`/api/exam/${exam.id}/pdf/${level}`);
        console.log('PDF yanıtı:', pdfRes.status);
        
        if (pdfRes.ok) {
            return await pdfRes.blob();
        } else {
            console.error(`PDF bulunamadı: ${examName} - ${level}. sınıf`);
            return null;
        }
    } catch (error) {
        console.error('PDF getirme hatası:', error);
        return null;
    }
}

// ============= HIZLI TEK ÖĞRENCİ SINAV KAĞIDI (PDF'i canvas'a çiz) =============
async function createSingleStudentExamPaperFast(roomName, level, examName, studentInfo, seatNumber) {
    const div = document.createElement('div');
    div.style.width = '800px';
    div.style.backgroundColor = 'white';
    div.style.margin = '0';
    div.style.padding = '0';
    
    // Sınav kağıdı PDF'ini al
    const examPdfBlob = await getExamPdfForLevel(examName, level);
    
    if (examPdfBlob) {
        // PDF'i yükle ve canvas'a çiz
        const pdfUrl = URL.createObjectURL(examPdfBlob);
        
        // pdf.js kullanarak PDF'i canvas'a çiz
        const { pdfjsLib } = window;
        
        if (!pdfjsLib) {
            console.error('pdf.js yüklü değil!');
            return createErrorPage(level, examName, 'PDF.js yüklü değil');
        }
        
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        // İlk sayfayı al
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        
        // Canvas oluştur
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        
        const context = canvas.getContext('2d');
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        div.appendChild(canvas);
        URL.revokeObjectURL(pdfUrl);
        
    } else {
        // PDF yoksa uyarı göster
        return createErrorPage(level, examName, 'Sınav kağıdı PDF\'i bulunamadı');
    }
    
    return div;
}

// Hata sayfası oluştur
function createErrorPage(level, examName, errorMessage) {
    const div = document.createElement('div');
    div.style.width = '800px';
    div.style.height = '297mm';
    div.style.backgroundColor = 'white';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.flexDirection = 'column';
    div.style.fontFamily = 'Arial, sans-serif';
    div.innerHTML = `
        <div style="text-align: center; padding: 50px; border: 2px dashed #ccc; border-radius: 10px; margin: 20px;">
            <i class="bi bi-exclamation-triangle" style="font-size: 48px; color: #ffc107;"></i>
            <h4>Sınav Kağıdı PDF'i Bulunamadı</h4>
            <p>${escapeHtml(level)}. sınıf ${escapeHtml(examName)} sınav kağıdı yüklenmemiş.</p>
            <p class="small">Lütfen sınav yönetiminden PDF yükleyin.</p>
        </div>
    `;
    return div;
}



async function generateRoomPDFFromScreen() {
    showToast('Tüm salonlar için PDF hazırlanıyor...', 'info');
    
    const { jsPDF } = window.jspdf;
    let pdf = null;
    let isFirstPage = true;
    
    const rooms = document.querySelectorAll('.room-card');
    
    for (const roomCard of rooms) {
        const roomName = roomCard.getAttribute('data-room');
        if (!roomName) continue;
        
        roomCard.click();
        await new Promise(r => setTimeout(r, 500));
        
        const seatGrid = document.getElementById('seatGrid');
        
        // A4 boyutunda div oluştur
        const printDiv = document.createElement('div');
        printDiv.style.width = '210mm';
        printDiv.style.minHeight = '297mm';
        printDiv.style.padding = '10mm';
        printDiv.style.backgroundColor = 'white';
        printDiv.style.boxSizing = 'border-box';
        
        // Başlık
        const titleDiv = document.createElement('div');
        titleDiv.style.textAlign = 'center';
        titleDiv.style.marginBottom = '15px';
        titleDiv.style.padding = '8px';
        titleDiv.style.backgroundColor = '#1a5276';
        titleDiv.style.color = 'white';
        titleDiv.style.borderRadius = '8px';
        titleDiv.innerHTML = `<h2 style="margin:0; font-size:18pt;">SALON: ${roomName}</h2>`;
        printDiv.appendChild(titleDiv);
        
        // Oturma planını klonla
        const gridClone = seatGrid.cloneNode(true);
        gridClone.style.display = 'grid';
        gridClone.style.gap = '8px';
        gridClone.style.width = '100%';
        
        const gridStyle = window.getComputedStyle(seatGrid);
        const colCount = gridStyle.gridTemplateColumns.split(' ').length;
        gridClone.style.gridTemplateColumns = `repeat(${colCount}, minmax(80px, 1fr))`;
        
        const allCards = gridClone.querySelectorAll('.seat-card, .teacher-desk, .paired-seat');
        allCards.forEach(card => {
            card.style.border = '1px solid #999';
            card.style.borderRadius = '6px';
            card.style.padding = '6px';
            card.style.backgroundColor = 'white';
            card.style.fontSize = '9pt';
            card.style.minHeight = '60px';
        });
        
        const teacherDesk = gridClone.querySelector('.teacher-desk');
        if (teacherDesk) {
            teacherDesk.style.background = 'linear-gradient(135deg, #8B4513, #A0522D)';
            teacherDesk.style.color = 'white';
        }
        
        printDiv.appendChild(gridClone);
        
        document.body.appendChild(printDiv);
        
        const canvas = await html2canvas(printDiv, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 190;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (isFirstPage) {
            pdf = new jsPDF('p', 'mm', 'a4');
            isFirstPage = false;
        } else {
            pdf.addPage();
        }
        pdf.addImage(imgData, 'JPEG', 10, 10, imgWidth, imgHeight);
        
        document.body.removeChild(printDiv);
    }
    
    if (pdf) {
        pdf.save(`tum_salonlar_${new Date().toISOString().slice(0,19)}.pdf`);
        showToast('Tüm salon PDF\'leri oluşturuldu', 'success');
    } else {
        showToast('PDF oluşturulamadı', 'danger');
    }
}

// ============= RAPOR PDF'LERİ =============
async function generatePDF(endpoint, data, filename) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`${filename} hatası:`, error);
        return false;
    }
}

async function generateStudentPDF() {
    if (!mixData) { showToast('Karma verisi yok', 'warning'); return; }
    updateMixDataWithCurrentLayouts();
    showToast('Öğrenci PDF hazırlanıyor...', 'info');
    await generatePDF('/api/report/student', { exam_groups: mixData.results }, 'ogrenci_sinav_programi.pdf');
}

async function generateAdminPDF() {
    if (!mixData) { showToast('Karma verisi yok', 'warning'); return; }
    updateMixDataWithCurrentLayouts();
    showToast('İdareci PDF hazırlanıyor...', 'info');
    await generatePDF('/api/report/admin', { exam_results: mixData.results }, 'idareci_raporu.pdf');
}

async function generateTeacherPDF() {
    if (!mixData) { showToast('Karma verisi yok', 'warning'); return; }
    updateMixDataWithCurrentLayouts();
    showToast('Öğretmen PDF hazırlanıyor...', 'info');
    await generatePDF('/api/report/teacher', { exam_results: mixData.results }, 'ogretmen_kagit_dagitim.pdf');
}

async function generateAllPDFs() {
    showToast('Tüm PDF\'ler hazırlanıyor...', 'info');
    updateMixDataWithCurrentLayouts();
    await generateStudentPDF();
    await generateAdminPDF();
    await generateTeacherPDF();
    showToast('Tüm rapor PDF\'leri indirildi', 'success');
}

// ============= YARDIMCI FONKSİYONLAR =============
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function showToast(message, type = 'success') {
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '1100';
        document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0 show`;
    toast.role = 'alert';
    toast.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(message)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Window fonksiyonları
window.generateStudentPDF = generateStudentPDF;
window.generateAdminPDF = generateAdminPDF;
window.generateTeacherPDF = generateTeacherPDF;
window.generateSupervisorPDFForSelected = generateSupervisorPDFFromScreen;
window.generateRoomPDF = generateRoomPDFFromScreen;
window.generateAllPDFs = generateAllPDFs;
window.exportToJSON = exportToJSON;
window.importFromJSON = importFromJSON;
window.saveCurrentLayout = saveCurrentLayout;
window.autoArrangeSeats = autoArrangeSeats;
window.resetRoomLayout = resetRoomLayout;
window.changeLayoutType = changeLayoutType;
window.updateSeatLayout = updateSeatLayout;
window.toggleTeacherDesk = toggleTeacherDesk;
window.moveStudentToEmpty = moveStudentToEmpty;









// ============= SINAV KAĞITLARINI OLUŞTUR (ÖĞRENCİ BAZLI) =============
async function createExamPapersForRoom(roomName) {
    const examPapers = [];
    
    // Bu salondaki öğrencileri sıra sırasına göre al
    const roomStudents = roomLayouts[currentRoom]?.students || [];
    
    // Öğrencileri sıra numarasına göre sırala
    const sortedStudents = [...roomStudents].sort((a, b) => (a.seat || 0) - (b.seat || 0));
    
    // Her öğrenci için ayrı sınav kağıdı oluştur
    for (let i = 0; i < sortedStudents.length; i++) {
        const student = sortedStudents[i];
        const studentInfo = student.student;
        const level = studentInfo?.sinif?.replace(/[^0-9]/g, '') || '?';
        const examName = student.exam_name || 'Sınav';
        const seatNumber = student.seat || i + 1;
        
        const paperDiv = await createSingleStudentExamPaper(
            roomName, 
            level, 
            examName, 
            studentInfo,
            seatNumber
        );
        examPapers.push(paperDiv);
    }
    
    return examPapers;
}

// ============= TEK ÖĞRENCİ İÇİN SINAV KAĞIDI SAYFASI OLUŞTUR =============
async function createSingleStudentExamPaper(roomName, level, examName, studentInfo, seatNumber) {
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.padding = '20px';
    div.style.backgroundColor = 'white';
    div.style.minHeight = '297mm'; // A4 boyutu
    div.style.boxSizing = 'border-box';
    div.style.pageBreakAfter = 'always';
    
    // Öğrenci bilgisi ve salon başlığı
    const headerDiv = document.createElement('div');
    headerDiv.style.textAlign = 'center';
    headerDiv.style.marginBottom = '20px';
    headerDiv.style.padding = '15px';
    headerDiv.style.backgroundColor = '#2e86c1';
    headerDiv.style.color = 'white';
    headerDiv.style.borderRadius = '10px';
    headerDiv.innerHTML = `
        <h2>${escapeHtml(roomName)} SALONU</h2>
        <h3>${escapeHtml(level)}. SINIF ${escapeHtml(examName)} SINAVI</h3>
        <div style="display: flex; justify-content: center; gap: 20px; margin-top: 10px;">
            <div><strong>Sıra No:</strong> ${seatNumber}</div>
            <div><strong>Öğrenci:</strong> ${escapeHtml(studentInfo?.ad_soyad || '-')}</div>
            <div><strong>Sınıf:</strong> ${escapeHtml(studentInfo?.sinif || '-')}</div>
            <div><strong>Okul No:</strong> ${escapeHtml(studentInfo?.numara || '-')}</div>
        </div>
    `;
    div.appendChild(headerDiv);
    
    // Sınav kağıdı PDF'ini al (varsa)
    const examPdfBlob = await getExamPdfForLevel(examName, level);
    
    if (examPdfBlob) {
        // PDF varsa, onu sayfaya yerleştir
        const pdfUrl = URL.createObjectURL(examPdfBlob);
        const embedDiv = document.createElement('div');
        embedDiv.style.width = '100%';
        embedDiv.style.height = 'auto';
        embedDiv.style.marginTop = '20px';
        embedDiv.innerHTML = `
            <embed src="${pdfUrl}" type="application/pdf" width="100%" height="500px" style="border: none;">
        `;
        div.appendChild(embedDiv);
    } else {
        // PDF yoksa uyarı göster
        const warningDiv = document.createElement('div');
        warningDiv.style.textAlign = 'center';
        warningDiv.style.padding = '50px';
        warningDiv.style.border = '2px dashed #ccc';
        warningDiv.style.borderRadius = '10px';
        warningDiv.style.marginTop = '20px';
        warningDiv.style.backgroundColor = '#f8f9fa';
        warningDiv.innerHTML = `
            <i class="bi bi-exclamation-triangle" style="font-size: 48px; color: #ffc107;"></i>
            <h4>Sınav Kağıdı PDF'i Bulunamadı</h4>
            <p>${escapeHtml(level)}. sınıf ${escapeHtml(examName)} sınav kağıdı yüklenmemiş.</p>
            <p class="small">Lütfen sınav yönetiminden PDF yükleyin.</p>
        `;
        div.appendChild(warningDiv);
    }
    
    // Sayfa numarası (isteğe bağlı)
    const pageNumDiv = document.createElement('div');
    pageNumDiv.style.textAlign = 'center';
    pageNumDiv.style.marginTop = '20px';
    pageNumDiv.style.fontSize = '10px';
    pageNumDiv.style.color = '#999';
    pageNumDiv.innerHTML = '---';
    div.appendChild(pageNumDiv);
    
    return div;
}




// ============= PDF'İN TÜM SAYFALARINI CANVAS'A ÇEVİR =============
async function pdfToCanvasArray(pdfBlob) {
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const canvases = [];
    
    try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        
        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            const context = canvas.getContext('2d');
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            canvases.push(canvas);
        }
        
        URL.revokeObjectURL(pdfUrl);
        return canvases;
        
    } catch (error) {
        console.error('PDF dönüştürme hatası:', error);
        URL.revokeObjectURL(pdfUrl);
        return [];
    }
}

// ============= TEK ÖĞRENCİ İÇİN PDF SAYFALARINI İÇEREN DIV OLUŞTUR =============
async function createStudentExamPages(level, examName) {
    const container = document.createElement('div');
    container.style.backgroundColor = 'white';
    
    const examPdfBlob = await getExamPdfForLevel(examName, level);
    
    if (examPdfBlob && examPdfBlob.size > 0) {
        const canvases = await pdfToCanvasArray(examPdfBlob);
        
        for (const canvas of canvases) {
            const pageDiv = document.createElement('div');
            pageDiv.style.width = '800px';
            pageDiv.style.margin = '0';
            pageDiv.style.padding = '0';
            pageDiv.style.backgroundColor = 'white';
            pageDiv.style.pageBreakAfter = 'always';
            
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            pageDiv.appendChild(canvas);
            container.appendChild(pageDiv);
        }
    } else {
        // PDF yoksa hata sayfası
        const errorDiv = document.createElement('div');
        errorDiv.style.width = '800px';
        errorDiv.style.height = '297mm';
        errorDiv.style.backgroundColor = 'white';
        errorDiv.style.display = 'flex';
        errorDiv.style.alignItems = 'center';
        errorDiv.style.justifyContent = 'center';
        errorDiv.style.flexDirection = 'column';
        errorDiv.style.fontFamily = 'Arial, sans-serif';
        errorDiv.innerHTML = `
            <div style="text-align: center; padding: 50px; border: 2px dashed #ccc; border-radius: 10px; margin: 20px;">
                <i class="bi bi-exclamation-triangle" style="font-size: 48px; color: #ffc107;"></i>
                <h4>Sınav Kağıdı PDF'i Bulunamadı</h4>
                <p>${escapeHtml(level)}. sınıf ${escapeHtml(examName)} sınav kağıdı yüklenmemiş.</p>
            </div>
        `;
        container.appendChild(errorDiv);
    }
    
    return container;
}




// PDF.js ile sayfa al
async function getPDFPageAsImage(pdfBlob, pageNum) {
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    URL.revokeObjectURL(pdfUrl);
    
    return canvas;
}
console.log('mix_editor.js tamamen yüklendi');