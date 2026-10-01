let currentEditStudentId = null;

async function loadStudents() {
    const res = await fetch('/api/students');
    const students = await res.json();
    const tbody = document.querySelector('#studentsTable tbody');
    tbody.innerHTML = '';
    students.forEach(s => {
        const row = `
            <tr>
                <td>${s.id}</td>
                <td>${s.ad_soyad}</td>
                <td>${s.numara}</td>
                <td>${s.sinif}</td>
                <td>${s.duzey}</td>
                <td>${s.cinsiyet}</td>
                <td class="table-actions">
                    <i class="bi bi-pencil-square text-warning" onclick="editStudent(${s.id}, '${s.ad_soyad}', '${s.numara}', '${s.sinif}', ${s.duzey}, '${s.cinsiyet}')"></i>
                    <i class="bi bi-trash3 text-danger" onclick="deleteStudent(${s.id})"></i>
                </td>
            </tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

window.editStudent = (id, ad, numara, sinif, duzey, cinsiyet) => {
    currentEditStudentId = id;
    document.getElementById('studentId').value = id;
    document.getElementById('studentAdSoyad').value = ad;
    document.getElementById('studentNumara').value = numara;
    document.getElementById('studentSinif').value = sinif;
    document.getElementById('studentDuzey').value = duzey;
    document.getElementById('studentCinsiyet').value = cinsiyet;
    new bootstrap.Modal(document.getElementById('studentModal')).show();
};

window.openAddStudentModal = () => {
    currentEditStudentId = null;
    document.getElementById('studentId').value = '';
    document.getElementById('studentAdSoyad').value = '';
    document.getElementById('studentNumara').value = '';
    document.getElementById('studentSinif').value = '';
    document.getElementById('studentDuzey').value = '';
    document.getElementById('studentCinsiyet').value = 'Erkek';
    new bootstrap.Modal(document.getElementById('studentModal')).show();
};

document.getElementById('saveStudentBtn').onclick = async () => {
    const data = {
        ad_soyad: document.getElementById('studentAdSoyad').value,
        numara: document.getElementById('studentNumara').value,
        sinif: document.getElementById('studentSinif').value,
        duzey: parseInt(document.getElementById('studentDuzey').value),
        cinsiyet: document.getElementById('studentCinsiyet').value
    };
    let url = '/api/student', method = 'POST';
    if (currentEditStudentId) { 
        url = `/api/student/${currentEditStudentId}`; 
        method = 'PUT'; 
    }
    const res = await fetch(url, { 
        method, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(data) 
    });
    if (res.ok) { 
        showToast('Öğrenci kaydedildi'); 
        bootstrap.Modal.getInstance(document.getElementById('studentModal')).hide(); 
        loadStudents(); 
    } else {
        const error = await res.json();
        showToast(error.error || 'Hata oluştu', 'danger');
    }
};

window.deleteStudent = async (id) => { 
    if(confirm('Bu öğrenciyi silmek istediğinize emin misiniz?')) {
        await fetch(`/api/student/${id}`, {method:'DELETE'}); 
        loadStudents(); 
        showToast('Öğrenci silindi');
    }
};

document.getElementById('deleteAllStudentsBtn').onclick = async () => { 
    if(confirm('Tüm öğrenciler silinecek! Bu işlem geri alınamaz.')) {
        await fetch('/api/students/delete_all', {method:'DELETE'}); 
        loadStudents();
        showToast('Tüm öğrenciler silindi');
    }
};

loadStudents();