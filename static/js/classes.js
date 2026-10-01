let currentEditClassId = null;

async function loadClasses() {
    const res = await fetch('/api/classes');
    const classes = await res.json();
    const tbody = document.querySelector('#classesTable tbody');
    tbody.innerHTML = '';
    classes.forEach(c => {
        const row = `
            <tr>
                <td>${c.id}</td>
                <td>${c.sinif}</td>
                <td>${c.duzey}</td>
                <td>${c.kapasite}</td>
                <td>
                    <i class="bi bi-pencil-square text-warning" onclick="editClass(${c.id}, '${c.sinif}', ${c.duzey}, ${c.kapasite})"></i>
                    <i class="bi bi-trash3 text-danger" onclick="deleteClass(${c.id})"></i>
                </td>
            </tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

window.editClass = (id, sinif, duzey, kapasite) => {
    currentEditClassId = id;
    document.getElementById('classId').value = id;
    document.getElementById('className').value = sinif;
    document.getElementById('classLevel').value = duzey;
    document.getElementById('classCapacity').value = kapasite;
    new bootstrap.Modal(document.getElementById('classModal')).show();
};

window.openAddClassModal = () => {
    currentEditClassId = null;
    document.getElementById('classId').value = '';
    document.getElementById('className').value = '';
    document.getElementById('classLevel').value = '';
    document.getElementById('classCapacity').value = '';
    new bootstrap.Modal(document.getElementById('classModal')).show();
};

document.getElementById('saveClassBtn').onclick = async () => {
    const data = { 
        sinif: document.getElementById('className').value, 
        duzey: parseInt(document.getElementById('classLevel').value), 
        kapasite: parseInt(document.getElementById('classCapacity').value) 
    };
    let url = '/api/class', method = 'POST';
    if (currentEditClassId) { 
        url = `/api/class/${currentEditClassId}`; 
        method = 'PUT'; 
    }
    const res = await fetch(url, { 
        method, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(data) 
    });
    if (res.ok) { 
        showToast('Sınıf kaydedildi'); 
        bootstrap.Modal.getInstance(document.getElementById('classModal')).hide(); 
        loadClasses(); 
    } else {
        const error = await res.json();
        showToast(error.error || 'Hata oluştu (aynı sınıf adı olabilir)', 'danger');
    }
};

window.deleteClass = async (id) => { 
    if(confirm('Bu sınıf ve içindeki tüm öğrenciler silinecek! Bu işlem geri alınamaz.')) {
        await fetch(`/api/class/${id}`, {method:'DELETE'}); 
        loadClasses(); 
        showToast('Sınıf ve öğrencileri silindi');
    }
};

document.getElementById('deleteAllClassesBtn').onclick = async () => { 
    if(confirm('Tüm sınıflar ve öğrenciler silinecek! Bu işlem geri alınamaz.')) {
        await fetch('/api/classes/delete_all', {method:'DELETE'}); 
        loadClasses();
        showToast('Tüm sınıflar ve öğrenciler silindi');
    }
};

loadClasses();