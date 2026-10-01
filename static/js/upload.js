document.getElementById('uploadForm').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Yükleniyor...';
    submitBtn.disabled = true;
    
    const res = await fetch('/upload_excel', { method: 'POST', body: formData });
    const result = await res.json();
    const div = document.getElementById('uploadResult');
    
    if (result.success) { 
        div.innerHTML = `<div class="alert alert-success">✅ ${result.message}</div>`;
        showToast(result.message, 'success');
        setTimeout(() => div.innerHTML = '', 5000);
        e.target.reset();
    } else {
        div.innerHTML = `<div class="alert alert-danger">❌ Hata: ${result.error}</div>`;
        showToast('Yükleme hatası: ' + result.error, 'danger');
    }
    
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
};