// ============= GLOBAL DEĞİŞKENLER =============
let currentEditExamId = null;
let currentMixOptions = {};
let finalMixResults = null;
let currentSimulation = null;
let pendingEdits = [];
let currentExamPdfs = {}; // PDF'ler için: { "9": {file: File, name: "dosya.pdf"} }
const hourNames = {
    1: '1. Ders (08:30-09:10)',
    2: '2. Ders (09:20-10:00)',
    3: '3. Ders (10:10-10:50)',
    4: '4. Ders (11:00-11:40)',
    5: '5. Ders (12:00-12:40)',
    6: '6. Ders (12:50-13:30)',
    7: '7. Ders (13:40-14:20)',
    8: '8. Ders (14:30-15:10)'
};

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

function getHourName(hour) {
    return hourNames[hour] || hour + '. Ders';
}

window.refreshExams = function() {
    loadExams();
    showToast('Sınav listesi yenilendi', 'info');
};

// ============= SINAV CRUD =============
async function loadExams() {
    try {
        const res = await fetch('/api/exams');
        if (!res.ok) throw new Error('Sınavlar yüklenemedi');
        const exams = await res.json();
        const tbody = document.querySelector('#examsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (exams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Henüz sınav bulunmuyor. Yeni sınav ekleyin veya Excel yükleyin.</td></tr>';
            return;
        }
        
        exams.forEach(e => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${e.id}</td>
                <td><strong>${escapeHtml(e.exam_name)}</strong></td>
                <td>${e.exam_date}</td>
                <td>${hourNames[e.exam_hour] || e.exam_hour + '. Ders'}</td>
                <td>${e.selected_classes.map(c => `<span class="badge bg-info selected-class-badge me-1">${escapeHtml(c)}</span>`).join('')}</td>
                <td>${e.created_at ? new Date(e.created_at).toLocaleDateString('tr-TR') : '-'}</td>
                <td class="table-actions">
                    <i class="bi bi-pencil-square text-warning" onclick="editExam(${e.id})" title="Düzenle" style="cursor:pointer"></i>
                    <i class="bi bi-trash3 text-danger" onclick="deleteExam(${e.id})" title="Sil" style="cursor:pointer"></i>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('loadExams hatası:', error);
        showToast('Sınavlar yüklenirken hata oluştu', 'danger');
    }
}

async function loadUniqueClassesForExam() {
    try {
        const res = await fetch('/api/classes/unique');
        if (!res.ok) throw new Error('Sınıflar yüklenemedi');
        const classes = await res.json();
        const container = document.getElementById('classCheckboxList');
        if (!container) return;
        
        if (classes.length === 0) {
            container.innerHTML = '<div class="text-warning">⚠️ Henüz sınıf eklenmemiş. Önce sınıf ekleyin veya Excel yükleyin.</div>';
            return;
        }
        container.innerHTML = '';
        classes.forEach(c => {
            const div = document.createElement('div');
            div.className = 'class-checkbox-item form-check';
            div.innerHTML = `
                <input type="checkbox" class="form-check-input" value="${escapeHtml(c.sinif)}" id="class_${c.sinif}">
                <label class="form-check-label" for="class_${c.sinif}">
                    ${escapeHtml(c.sinif)} (${c.duzey}. Sınıf)
                </label>
            `;
            container.appendChild(div);
        });
        
        // ============= YENİ: Sınıf seçimlerini dinle =============
        const checkboxes = document.querySelectorAll('#classCheckboxList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.removeEventListener('change', updateDynamicPdfAreas);
            cb.addEventListener('change', updateDynamicPdfAreas);
        });
        
        // ============= YENİ: Mevcut seçili sınıflar varsa PDF alanlarını güncelle =============
        updateDynamicPdfAreas();
        
    } catch (error) {
        console.error('loadUniqueClassesForExam hatası:', error);
    }
}


// ============= SINIF DÜZEYİNE GÖRE DİNAMİK PDF ALANLARI =============
function updateDynamicPdfAreas() {
    const checkboxes = document.querySelectorAll('#classCheckboxList input[type="checkbox"]:checked');
    const selectedLevels = new Set();
    
    checkboxes.forEach(cb => {
        const sinif = cb.value;
        const level = sinif.replace(/[^0-9]/g, '');
        if (level) selectedLevels.add(level);
    });
    
    const container = document.getElementById('dynamicPdfAreas');
    if (!container) return;
    
    if (selectedLevels.size === 0) {
        container.innerHTML = '<div class="text-muted text-center py-2">Sınıf seçtiğinizde burada PDF ekleme alanları görünecektir.</div>';
        return;
    }
    
    const sortedLevels = Array.from(selectedLevels).sort();
    
    let html = '<div class="row">';
    sortedLevels.forEach(level => {
        const pdfKey = `pdf_${level}`;
        // Mevcut PDF kontrolü - DÜZELTİLDİ
        const existingPdf = currentExamPdfs[level];
        const hasPdf = existingPdf && existingPdf.name && existingPdf.name.length > 0;
        const pdfName = hasPdf ? existingPdf.name : '';
        
        console.log(`${level}. sınıf PDF durumu:`, { hasPdf, pdfName, currentExamPdfs }); // Debug için
        
        html += `
            <div class="col-md-6 mb-2">
                <div class="card pdf-card">
                    <div class="card-header py-1 bg-info text-white d-flex justify-content-between align-items-center">
                        <strong>📄 ${level}. Sınıf PDF'i</strong>
                        ${hasPdf && currentEditExamId ? `<button type="button" class="btn btn-sm btn-danger" onclick="deleteLevelPdf('${level}')" title="PDF'i Sil"><i class="bi bi-trash"></i></button>` : ''}
                    </div>
                    <div class="card-body py-2">
                        <input type="file" class="form-control form-control-sm" id="${pdfKey}" accept=".pdf" onchange="handleLevelPdfChange('${level}', this)">
                        <div id="${pdfKey}_status" class="small mt-1">
                            ${hasPdf ? 
                                `<span class="text-success"><i class="bi bi-check-circle-fill"></i> <strong>PDF Mevcut:</strong> ${pdfName}
                                    <a href="/api/exam/${currentEditExamId}/pdf/${level}" target="_blank" class="ms-2 btn btn-sm btn-outline-primary">📄 Görüntüle</a>
                                </span>` : 
                                `<span class="text-muted"><i class="bi bi-info-circle"></i> Henüz PDF seçilmedi - Yeni PDF yükleyebilirsiniz</span>`}
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

window.handleLevelPdfChange = function(level, input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.pdf')) {
        showToast('Sadece PDF dosyaları yüklenebilir!', 'danger');
        input.value = '';
        return;
    }
    
    // Mevcut PDF varsa uyar
    if (currentExamPdfs[level] && currentExamPdfs[level].name) {
        if (!confirm(`${level}. sınıf için mevcut PDF var. Üzerine yazmak istediğinize emin misiniz?\n\nMevcut PDF: ${currentExamPdfs[level].name}`)) {
            input.value = '';
            return;
        }
    }
    
    currentExamPdfs[level] = { 
        file: file, 
        name: file.name,
        exists: false  // Yeni yüklenecek, eski silinecek
    };
    
    const statusDiv = document.getElementById(`pdf_${level}_status`);
    if (statusDiv) {
        statusDiv.innerHTML = `<span class="text-warning"><i class="bi bi-hourglass-split"></i> Yüklenmeye hazır: ${file.name} (mevcut PDF değiştirilecek)</span>`;
    }
};

async function loadExistingPdfsForExam(examId) {
    if (!examId) return;
    
    try {
        const res = await fetch(`/api/exam/${examId}/pdfs`);
        if (res.ok) {
            const pdfs = await res.json();
            console.log('API\'den gelen PDFler:', pdfs);
            
            // currentExamPdfs'i temizle
            currentExamPdfs = {};
            
            // Gelen PDF'leri currentExamPdfs'e aktar
            if (pdfs && typeof pdfs === 'object') {
                for (const [level, filename] of Object.entries(pdfs)) {
                    if (filename) {
                        currentExamPdfs[level] = {
                            name: filename,
                            file: null
                        };
                        console.log(`PDF eklendi: ${level}. sınıf -> ${filename}`);
                    }
                }
            }
            
            // PDF alanlarını güncelle (BU ÇOK ÖNEMLİ)
            updateDynamicPdfAreas();
            
        } else {
            console.log('PDF getirme hatası:', res.status);
        }
    } catch (error) {
        console.error('PDF yükleme hatası:', error);
    }
}

async function uploadLevelPdfs(examId) {
    if (!examId) {
        console.error('uploadLevelPdfs: examId yok!');
        return;
    }
    
    for (const [level, pdfData] of Object.entries(currentExamPdfs)) {
        const file = pdfData.file;
        
        if (file) {
            const formData = new FormData();
            formData.append('pdf_file', file);
            formData.append('level', level);
            
            try {
                console.log(`PDF yükleniyor: ${level}. sınıf -> ${file.name}`);
                const response = await fetch(`/api/exam/${examId}/pdf`, {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log(`${level}. sınıf PDF yüklendi:`, result.filename);
                    // Yüklendikten sonra dosya referansını güncelle
                    currentExamPdfs[level] = { name: result.filename, file: null };
                } else {
                    const error = await response.json();
                    console.error(`${level}. sınıf PDF yükleme hatası:`, error);
                    showToast(`${level}. sınıf PDF yüklenemedi: ${error.error}`, 'danger');
                }
            } catch (error) {
                console.error(`${level}. sınıf PDF yükleme hatası:`, error);
                showToast(`${level}. sınıf PDF yüklenirken hata oluştu`, 'danger');
            }
        }
    }
    
    // Son durumu güncelle
    updateDynamicPdfAreas();
}


window.openAddExamModal = function() {
    currentEditExamId = null;
    currentExamPdfs = {};  // PDF'leri sıfırla
    
    document.getElementById('examModalTitle').innerText = 'Yeni Sınav Oluştur';
    document.getElementById('examId').value = '';
    document.getElementById('examName').value = '';
    document.getElementById('examDate').value = '';
    document.getElementById('examHour').value = '';
    
    // Sınıf seçimlerini temizle
    const checkboxes = document.querySelectorAll('#classCheckboxList input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    
    // Dinamik PDF alanlarını sıfırla
    const container = document.getElementById('dynamicPdfAreas');
    if (container) {
        container.innerHTML = '<div class="text-muted text-center py-2">Sınıf seçtiğinizde burada PDF ekleme alanları görünecektir.</div>';
    }
    
    // Sınıfları yükle
    loadUniqueClassesForExam();
    
    // Sınıf seçimlerini dinle
    setTimeout(() => {
        const classCheckboxes = document.querySelectorAll('#classCheckboxList input[type="checkbox"]');
        classCheckboxes.forEach(cb => {
            cb.removeEventListener('change', updateDynamicPdfAreas);
            cb.addEventListener('change', updateDynamicPdfAreas);
        });
    }, 100);
    
    const modalEl = document.getElementById('examModal');
    if (modalEl) new bootstrap.Modal(modalEl).show();
};

window.editExam = async function(id) {
    try {
        currentEditExamId = id;
        currentExamPdfs = {};
        document.getElementById('examModalTitle').innerText = 'Sınav Düzenle';
        
        // 1. Sınav bilgilerini al
        const res = await fetch(`/api/exam/${id}`);
        if (!res.ok) throw new Error('Sınav bilgisi alınamadı');
        const exam = await res.json();
        
        document.getElementById('examId').value = exam.id;
        document.getElementById('examName').value = exam.exam_name;
        document.getElementById('examDate').value = exam.exam_date;
        document.getElementById('examHour').value = exam.exam_hour;
        
        // 2. Sınıfları yükle
        await loadUniqueClassesForExam();
        
        // 3. Sınıfları işaretle
        const checkboxes = document.querySelectorAll('#classCheckboxList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if (exam.selected_classes && exam.selected_classes.includes(cb.value)) {
                cb.checked = true;
            }
        });
        
        // 4. PDF'leri yükle (BEKLE)
        await loadExistingPdfsForExam(id);
        
        // 5. Modalı göster
        const modalEl = document.getElementById('examModal');
        if (modalEl) new bootstrap.Modal(modalEl).show();
        
    } catch (error) {
        console.error('editExam hatası:', error);
        showToast('Sınav bilgisi yüklenirken hata oluştu', 'danger');
    }
};

// Kaydet butonu
// Kaydet butonu
// Kaydet butonu - DÜZELTİLMİŞ VERSİYON
const saveExamBtn = document.getElementById('saveExamBtn');
if (saveExamBtn) {
    // Eski listener'ı kaldır
    const newSaveBtn = saveExamBtn.cloneNode(true);
    saveExamBtn.parentNode.replaceChild(newSaveBtn, saveExamBtn);
    
    newSaveBtn.addEventListener('click', async () => {
        const examName = document.getElementById('examName')?.value || '';
        const examDate = document.getElementById('examDate')?.value || '';
        const examHour = document.getElementById('examHour')?.value || '';
        
        const checkboxes = document.querySelectorAll('#classCheckboxList input[type="checkbox"]:checked');
        const selectedClasses = Array.from(checkboxes).map(cb => cb.value);
        
        if (!examName || !examDate || !examHour || selectedClasses.length === 0) {
            showToast('Lütfen tüm alanları doldurun ve en az bir sınıf seçin!', 'danger');
            return;
        }
        
        const data = {
            exam_name: examName,
            exam_date: examDate,
            exam_hour: parseInt(examHour),
            selected_classes: selectedClasses
        };
        
        let url = '/api/exam';
        let method = 'POST';
        let examId = currentEditExamId;
        
        if (currentEditExamId) {
            url = `/api/exam/${currentEditExamId}`;
            method = 'PUT';
        }
        
        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (res.ok) {
                const result = await res.json();
                // Yeni sınav ID'sini al (POST ise result.id, PUT ise currentEditExamId)
                examId = result.id || currentEditExamId;
                
                // PDF'leri yükle - SADECE yeni sınav oluşturulduysa veya mevcut PDF varsa
                if (examId && Object.keys(currentExamPdfs).length > 0) {
                    await uploadLevelPdfs(examId);
                }
                
                showToast(currentEditExamId ? 'Sınav güncellendi' : 'Sınav oluşturuldu');
                const modal = bootstrap.Modal.getInstance(document.getElementById('examModal'));
                if (modal) modal.hide();
                
                // Sınav listesini yenile
                loadExams();
                
                // Yeni sınav oluşturulduysa currentExamPdfs'i temizle
                if (!currentEditExamId) {
                    currentExamPdfs = {};
                }
                
            } else {
                const error = await res.json();
                showToast(error.error || 'Hata oluştu', 'danger');
            }
        } catch (error) {
            console.error('saveExam hatası:', error);
            showToast('Kaydetme hatası', 'danger');
        }
    });
}

window.deleteExam = async function(id) {
    if (!confirm('Bu sınavı silmek istediğinize emin misiniz?')) return;
    
    try {
        const res = await fetch(`/api/exam/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Sınav silindi');
            loadExams();
        } else {
            showToast('Silme işlemi başarısız', 'danger');
        }
    } catch (error) {
        console.error('deleteExam hatası:', error);
        showToast('Silme hatası', 'danger');
    }
};

window.deleteAllExams = async function() {
    if (!confirm('TÜM SINAVLAR silinecek! Bu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?')) return;
    
    try {
        const res = await fetch('/api/exams/delete_all', { method: 'DELETE' });
        const result = await res.json();
        
        if (result.success) {
            showToast(result.message, 'success');
            loadExams();
            finalMixResults = null;
            const mixResults = document.getElementById('mixResults');
            if (mixResults) mixResults.style.display = 'none';
        } else {
            showToast('Silme hatası: ' + (result.error || 'Bilinmeyen hata'), 'danger');
        }
    } catch (error) {
        console.error('deleteAllExams hatası:', error);
        showToast('Silme hatası: ' + error.message, 'danger');
    }
};

// ============= EXCEL SINAV YÜKLEME =============
const uploadExamForm = document.getElementById('uploadExamForm');
if (uploadExamForm) {
    uploadExamForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        const resultDiv = document.getElementById('uploadExamResult');
        
        submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Yükleniyor...';
        submitBtn.disabled = true;
        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<div class="alert alert-info">Sınavlar yükleniyor, lütfen bekleyin...</div>';
        }
        
        try {
            const response = await fetch('/upload_exams_excel', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success && resultDiv) {
                let html = `
                    <div class="alert alert-success">
                        <h6><i class="bi bi-check-circle"></i> ${result.message}</h6>
                        <p>Başarıyla eklenen: ${result.success_count} sınav</p>
                        ${result.skipped_count > 0 ? `<p>Boş satır atlanan: ${result.skipped_count}</p>` : ''}
                        ${result.error_count > 0 ? `<p class="text-danger">Hatalı: ${result.error_count} sınav</p>` : ''}
                    </div>
                `;
                
                if (result.new_exams && result.new_exams.length > 0) {
                    html += `<div class="card mt-2"><div class="card-header bg-success text-white">Eklenen Sınavlar</div><div class="card-body p-0"><table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr><th>Ders</th><th>Tarih</th><th>Saat</th><th>Sınıflar</th></tr></thead><tbody>`;
                    result.new_exams.forEach(exam => {
                        html += `<tr><td>${escapeHtml(exam.name)}</td><td>${exam.date}</td><td>${exam.hour}. Ders</td><td>${exam.classes.join(', ')}</td></tr>`;
                    });
                    html += `</tbody></table></div></div>`;
                }
                
                if (result.errors && result.errors.length > 0) {
                    html += `<div class="alert alert-warning mt-2"><h6><i class="bi bi-exclamation-triangle"></i> Hatalar:</h6><ul class="mb-0">${result.errors.slice(0, 10).map(err => `<li>${escapeHtml(err)}</li>`).join('')}</ul></div>`;
                }
                
                resultDiv.innerHTML = html;
                loadExams();
                
                if (result.success_count > 0) {
                    setTimeout(() => {
                        const modal = bootstrap.Modal.getInstance(document.getElementById('uploadExamModal'));
                        if (modal) modal.hide();
                        if (resultDiv) resultDiv.style.display = 'none';
                        e.target.reset();
                    }, 3000);
                }
            } else if (resultDiv) {
                resultDiv.innerHTML = `<div class="alert alert-danger">❌ Hata: ${result.error || 'Bilinmeyen hata'}</div>`;
            }
        } catch (error) {
            console.error('uploadExam hatası:', error);
            if (resultDiv) {
                resultDiv.innerHTML = `<div class="alert alert-danger">❌ Bağlantı hatası: ${error.message}</div>`;
            }
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ============= KARMA MODAL =============
window.openMixModal = async function(isSimulation = false) {
    showToast('Karma seçenekleri yükleniyor...', 'info');
    
    try {
        const res = await fetch('/api/mix_options');
        if (!res.ok) throw new Error('Karma seçenekleri yüklenemedi');
        const data = await res.json();
        
        if (data.message) {
            showToast(data.message, 'warning');
        }
        
        // Sınav gruplarını göster
        const examGroupsDiv = document.getElementById('examGroupsList');
        if (examGroupsDiv) {
            if (data.exam_groups && data.exam_groups.length > 0) {
                const groupsHtml = data.exam_groups.map((group, idx) => `
                    <div class="card mb-2">
                        <div class="card-body">
                            <div class="form-check">
                                <input class="form-check-input" type="radio" name="examGroup" value='${JSON.stringify(group)}' id="group_${idx}">
                                <label class="form-check-label" for="group_${idx}">
                                    <strong>📅 ${group.date} - ${getHourName(group.hour)}</strong><br>
                                    <span class="text-muted">Sınavlar: ${group.exams.join(', ')}</span><br>
                                    <span class="text-muted">Katılan Sınıflar: ${group.classes.join(', ')}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                `).join('');
                examGroupsDiv.innerHTML = groupsHtml;
            } else {
                examGroupsDiv.innerHTML = '<div class="alert alert-warning">Henüz sınav bulunmuyor. Önce sınav ekleyin.</div>';
            }
        }
        
        // Salon kapasitelerini göster
        const roomCapacitiesDiv = document.getElementById('roomCapacities');
        if (roomCapacitiesDiv) {
            if (data.class_capacities && Object.keys(data.class_capacities).length > 0) {
                const capacitiesHtml = Object.entries(data.class_capacities)
                    .map(([sinif, kapasite]) => `<span class="badge bg-secondary me-1 mb-1">${escapeHtml(sinif)}: ${kapasite} kişi</span>`)
                    .join('');
                roomCapacitiesDiv.innerHTML = capacitiesHtml;
            } else {
                roomCapacitiesDiv.innerHTML = '<span class="text-muted">Henüz sınıf bulunmuyor.</span>';
            }
        }
        
        // Karma seçeneklerini oluştur
        const mixOptionsDiv = document.getElementById('mixOptionsContainer');
        if (mixOptionsDiv && data.mix_options) {
            const optionsHtml = buildAdvancedMixOptionsForm(data.mix_options);
            mixOptionsDiv.innerHTML = optionsHtml;
            initializeMixOptions(data.mix_options);
        }
        
        const mixResultsDiv = document.getElementById('mixResults');
        if (mixResultsDiv) mixResultsDiv.style.display = 'none';
        
        const simulateBtn = document.getElementById('simulateBtn');
        const executeBtn = document.getElementById('executeMixBtn');
        if (simulateBtn) simulateBtn.style.display = isSimulation ? 'block' : 'none';
        if (executeBtn) executeBtn.style.display = isSimulation ? 'none' : 'block';
        
        const modalEl = document.getElementById('mixModal');
        if (modalEl) new bootstrap.Modal(modalEl).show();
        
    } catch (error) {
        console.error('openMixModal hatası:', error);
        showToast('Karma sayfası açılırken hata oluştu: ' + error.message, 'danger');
    }
};

function buildAdvancedMixOptionsForm(options) {
    let html = '';
    for (let [key, option] of Object.entries(options)) {
        html += `<div class="col-md-6 mb-3">`;
        
        if (option.type === 'boolean') {
            html += `
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="mix_${key}" ${option.default ? 'checked' : ''}>
                    <label class="form-check-label" for="mix_${key}">
                        <strong>${escapeHtml(option.label)}</strong>
                    </label>
                    <div class="small text-muted">${escapeHtml(option.description || '')}</div>
                </div>
            `;
        } else if (option.type === 'select') {
            html += `
                <label class="form-label"><strong>${escapeHtml(option.label)}</strong></label>
                <select class="form-select" id="mix_${key}">
                    ${option.options.map(opt => `<option value="${opt.value}" ${opt.value === option.default ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
                </select>
                <div class="small text-muted">${escapeHtml(option.description || '')}</div>
            `;
        } else if (option.type === 'slider') {
            html += `
                <label class="form-label"><strong>${escapeHtml(option.label)}: <span id="${key}_value">${option.default}</span>%</strong></label>
                <input type="range" class="form-range" id="mix_${key}" min="${option.min}" max="${option.max}" value="${option.default}" oninput="document.getElementById('${key}_value').innerText = this.value">
                <div class="small text-muted">${escapeHtml(option.description || '')}</div>
            `;
        }
        html += `</div>`;
    }
    return html;
}

function initializeMixOptions(options) {
    currentMixOptions = {};
    for (let [key, option] of Object.entries(options)) {
        const element = document.getElementById(`mix_${key}`);
        if (element) {
            if (option.type === 'boolean') {
                currentMixOptions[key] = element.checked;
                element.addEventListener('change', (e) => { currentMixOptions[key] = e.target.checked; });
            } else if (option.type === 'select') {
                currentMixOptions[key] = element.value;
                element.addEventListener('change', (e) => { currentMixOptions[key] = e.target.value; });
            } else if (option.type === 'slider') {
                currentMixOptions[key] = parseInt(element.value);
                element.addEventListener('input', (e) => { currentMixOptions[key] = parseInt(e.target.value); });
            }
        }
    }
}

// ============= SİMÜLASYON =============
window.simulateMix = async function() {
    const selectedRadio = document.querySelector('input[name="examGroup"]:checked');
    if (!selectedRadio) {
        showToast('Lütfen bir sınav grubu seçin!', 'warning');
        return;
    }
    
    const selectedGroup = JSON.parse(selectedRadio.value);
    const simulateBtn = document.getElementById('simulateBtn');
    const originalText = simulateBtn.innerHTML;
    simulateBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Simüle ediliyor...';
    simulateBtn.disabled = true;
    
    try {
        const res = await fetch('/api/simulate_mix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mix_options: currentMixOptions, selected_group: selectedGroup })
        });
        
        if (!res.ok) throw new Error('Sunucu hatası');
        const result = await res.json();
        
        if (result.success) {
            displaySimulationResults(result);
            showToast('Simülasyon tamamlandı', 'success');
        } else {
            showToast('Simülasyon hatası: ' + (result.error || 'Bilinmeyen hata'), 'danger');
        }
    } catch (error) {
        console.error('simulateMix hatası:', error);
        showToast('Simülasyon başarısız: ' + error.message, 'danger');
    } finally {
        simulateBtn.innerHTML = originalText;
        simulateBtn.disabled = false;
    }
};

function displaySimulationResults(result) {
    let html = `<div class="alert alert-success"><h6>Simülasyon Özeti</h6><p>Toplam Öğrenci: ${result.summary?.total_students || 0}</p><p>Toplam Salon: ${result.summary?.total_rooms || 0}</p></div>`;
    
    if (result.summary?.distribution) {
        html += `<div class="row mb-3">`;
        for (const [room, data] of Object.entries(result.summary.distribution)) {
            const percent = data.capacity ? (data.total / data.capacity * 100).toFixed(1) : 0;
            html += `<div class="col-md-3 mb-2"><div class="card"><div class="card-body p-2"><strong>🏠 ${escapeHtml(room)}</strong><br>${data.total}/${data.capacity} (${percent}%)<div class="progress mt-1" style="height:5px"><div class="progress-bar bg-success" style="width:${percent}%"></div></div></div></div></div>`;
        }
        html += `</div>`;
    }
    
    html += `<div class="table-responsive"><table class="table table-sm table-bordered"><thead class="table-light"><tr><th>#</th><th>Ad Soyad</th><th>Sınıf</th><th>Sınav</th><th>Salon</th></tr></thead><tbody>`;
    
    if (result.assignments && result.assignments.length > 0) {
        result.assignments.slice(0, 20).forEach((item, idx) => {
            html += `<tr><td>${idx+1}</td><td>${escapeHtml(item.student?.ad_soyad || '-')}</td><td>${escapeHtml(item.student?.sinif || '-')}</td><td><span class="badge bg-info">${escapeHtml(item.exam_name || '-')}</span></td><td><span class="badge bg-primary">${escapeHtml(item.room || '-')}</span></td></tr>`;
        });
    } else {
        html += '<tr><td colspan="5" class="text-center">Öğrenci bulunamadı</td></tr>';
    }
    html += `</tbody></table></div>`;
    
    document.getElementById('mixResultsContent').innerHTML = html;
    document.getElementById('mixResults').style.display = 'block';
    currentSimulation = result.full_result;
}

// ============= KARMA İŞLEMİ =============
window.executeMix = async function() {
    console.log('executeMix fonksiyonu çağrıldı');
    
    // Önce sınavların varlığını kontrol et
    try {
        const examRes = await fetch('/api/exams');
        const exams = await examRes.json();
        
        if (!exams || exams.length === 0) {
            showToast('Sistemde hiç sınav bulunmuyor. Önce sınav ekleyin!', 'warning');
            return;
        }
    } catch (error) {
        console.error('Sınav kontrol hatası:', error);
        showToast('Sınavlar kontrol edilemedi', 'danger');
        return;
    }
    
    if (!confirm('Tüm sınav grupları için karma işlemi yapılacak. Devam etmek istediğinize emin misiniz?')) return;
    
    const mixBtn = document.getElementById('executeMixBtn');
    const originalText = mixBtn.innerHTML;
    mixBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Karma yapılıyor...';
    mixBtn.disabled = true;
    
    try {
        const res = await fetch('/api/mix_exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mix_options: currentMixOptions })
        });
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Sunucu hatası: ${res.status}`);
        }
        
        const result = await res.json();
        
        if (result.success) {
            if (result.results && result.results.length > 0) {
                displayFinalResults(result.results);
                showToast(result.message, 'success');
            } else {
                showToast('Karma yapılacak sınav grubu bulunamadı!', 'warning');
            }
        } else {
            showToast('Karma hatası: ' + (result.error || 'Bilinmeyen hata'), 'danger');
        }
    } catch (error) {
        console.error('executeMix hatası:', error);
        showToast('Karma işlemi başarısız: ' + error.message, 'danger');
    } finally {
        mixBtn.innerHTML = originalText;
        mixBtn.disabled = false;
    }
};

function displayFinalResults(results) {
    finalMixResults = results;
    
    // Varsayılan roomLayouts oluştur
    const defaultLayouts = {};
    results.forEach(group => {
        if (group.mixed_students) {
            group.mixed_students.forEach(student => {
                const room = student.room;
                if (!defaultLayouts[room]) {
                    defaultLayouts[room] = {
                        layoutType: 'single',
                        rowCount: 8,
                        seatsPerRow: 4,
                        seatOrder: 'sequential',
                        showTeacherDesk: true,
                        students: []
                    };
                }
                defaultLayouts[room].students.push(student);
            });
        }
    });
    
    // Her salondaki öğrencileri sıra numarasına göre sırala
    for (const room in defaultLayouts) {
        defaultLayouts[room].students.sort((a, b) => (a.seat || 0) - (b.seat || 0));
    }
    
    const mixData = {
        results: results,
        roomLayouts: defaultLayouts,
        timestamp: new Date().toISOString(),
        version: '1.0'
    };
    
    sessionStorage.setItem('mixResults', JSON.stringify(mixData));
    
    showToast('Karma tamamlandı! Düzenleme sayfasına yönlendiriliyorsunuz...', 'success');
    setTimeout(() => {
        window.location.href = '/mix-editor';
    }, 1500);
}

// ============= MANUEL DÜZENLEME =============
window.enableManualEdit = function() {
    const table = document.querySelector('#mixResultsContent table');
    if (!table) {
        showToast('Önce bir karma işlemi yapın', 'warning');
        return;
    }
    
    pendingEdits = [];
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach((row, idx) => {
        const roomCell = row.cells[6];
        const examCell = row.cells[5];
        
        if (roomCell) {
            const currentRoom = roomCell.innerText.trim();
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm';
            select.style.width = '100px';
            const rooms = [...new Set(Array.from(table.querySelectorAll('tbody tr')).map(r => r.cells[6]?.innerText.trim()))];
            rooms.forEach(room => {
                const option = document.createElement('option');
                option.value = room;
                option.text = room;
                if (room === currentRoom) option.selected = true;
                select.appendChild(option);
            });
            select.onchange = (e) => { pendingEdits.push({ row: idx, field: 'room', newValue: e.target.value }); };
            roomCell.innerHTML = '';
            roomCell.appendChild(select);
        }
        
        if (examCell) {
            const currentExam = examCell.innerText.trim();
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm';
            select.style.width = '120px';
            const exams = [...new Set(Array.from(table.querySelectorAll('tbody tr')).map(r => r.cells[5]?.innerText.trim()))];
            exams.forEach(exam => {
                const option = document.createElement('option');
                option.value = exam;
                option.text = exam;
                if (exam === currentExam) option.selected = true;
                select.appendChild(option);
            });
            select.onchange = (e) => { pendingEdits.push({ row: idx, field: 'exam', newValue: e.target.value }); };
            examCell.innerHTML = '';
            examCell.appendChild(select);
        }
    });
    
    const btnContainer = document.createElement('div');
    btnContainer.className = 'btn-group-custom mt-3';
    btnContainer.id = 'editButtons';
    btnContainer.innerHTML = `<button class="btn btn-success" onclick="saveManualEdits()"><i class="bi bi-save"></i> Kaydet</button><button class="btn btn-secondary" onclick="cancelManualEdits()"><i class="bi bi-x-circle"></i> İptal</button>`;
    
    const existingBtns = document.querySelector('#mixResultsContent .btn-group-custom');
    if (existingBtns) {
        existingBtns.insertAdjacentElement('afterend', btnContainer);
        existingBtns.style.display = 'none';
    } else {
        document.getElementById('mixResultsContent').appendChild(btnContainer);
    }
    
    showToast('Düzenleme modu aktif', 'info');
};

window.cancelManualEdits = function() {
    const editButtons = document.getElementById('editButtons');
    if (editButtons) editButtons.remove();
    const pdfButtons = document.querySelector('#mixResultsContent .btn-group-custom');
    if (pdfButtons) pdfButtons.style.display = 'flex';
    displayFinalResults(finalMixResults);
    showToast('Düzenleme iptal edildi', 'info');
};

window.saveManualEdits = async function() {
    if (pendingEdits.length === 0) {
        showToast('Değişiklik yok', 'info');
        return;
    }
    showToast('Değişiklikler kaydediliyor...', 'info');
    
    const res = await fetch('/api/mix_assignments/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits: pendingEdits })
    });
    
    if (res.ok) {
        showToast('Değişiklikler kaydedildi', 'success');
        pendingEdits = [];
        const editButtons = document.getElementById('editButtons');
        if (editButtons) editButtons.remove();
        const pdfButtons = document.querySelector('#mixResultsContent .btn-group-custom');
        if (pdfButtons) pdfButtons.style.display = 'flex';
        if (finalMixResults) displayFinalResults(finalMixResults);
    } else {
        showToast('Kaydetme hatası', 'danger');
    }
};

// ============= PDF RAPORLARI =============
window.generateStudentPDF = async function() {
    if (!finalMixResults) { showToast('Önce bir karma işlemi yapın', 'warning'); return; }
    showToast('Öğrenci PDF\'i hazırlanıyor...', 'info');
    
    const response = await fetch('/api/report/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_groups: finalMixResults })
    });
    
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ogrenci_sinav_programi.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('PDF indiriliyor', 'success');
    } else {
        showToast('PDF oluşturulamadı', 'danger');
    }
};

window.generateAdminPDF = async function() {
    if (!finalMixResults) { showToast('Önce bir karma işlemi yapın', 'warning'); return; }
    showToast('İdareci PDF\'i hazırlanıyor...', 'info');
    
    const response = await fetch('/api/report/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_results: finalMixResults })
    });
    
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'idareci_raporu.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('PDF indiriliyor', 'success');
    } else {
        showToast('PDF oluşturulamadı', 'danger');
    }
};

window.generateTeacherPDF = async function() {
    if (!finalMixResults) { showToast('Önce bir karma işlemi yapın', 'warning'); return; }
    showToast('Öğretmen PDF\'i hazırlanıyor...', 'info');
    
    const response = await fetch('/api/report/teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_results: finalMixResults })
    });
    
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ogretmen_kagit_dagitim.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('PDF indiriliyor', 'success');
    } else {
        showToast('PDF oluşturulamadı', 'danger');
    }
};

window.generateSupervisorPDFForSelected = async function() {
    if (!finalMixResults || finalMixResults.length === 0) {
        showToast('Önce bir karma işlemi yapın', 'warning');
        return;
    }
    
    if (finalMixResults.length === 1) {
        await generateSupervisorPDF(finalMixResults[0]);
    } else {
        let groupOptions = '';
        finalMixResults.forEach((group, idx) => {
            groupOptions += `<div class="form-check mb-2"><input class="form-check-input" type="radio" name="pdfGroup" value="${idx}" id="group_${idx}"><label class="form-check-label" for="group_${idx}"><strong>${group.date} - ${getHourName(group.hour)}</strong><br><span class="text-muted">Sınavlar: ${group.exams.join(', ')}</span></label></div>`;
        });
        
        document.getElementById('groupSelectBody').innerHTML = groupOptions;
        const modal = new bootstrap.Modal(document.getElementById('groupSelectModal'));
        modal.show();
        
        const confirmBtn = document.getElementById('confirmGroupSelectBtn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        newConfirmBtn.addEventListener('click', async () => {
            const selected = document.querySelector('#groupSelectBody input[name="pdfGroup"]:checked');
            if (selected) {
                await generateSupervisorPDF(finalMixResults[parseInt(selected.value)]);
                modal.hide();
            } else {
                showToast('Lütfen bir grup seçin', 'warning');
            }
        });
    }
};

window.generateSupervisorPDF = async function(examGroup) {
    showToast('Gözetmen PDF\'i hazırlanıyor...', 'info');
    
    const response = await fetch('/api/report/supervisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_group: examGroup })
    });
    
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gozetmen_raporu_${examGroup.date}_${examGroup.hour}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('PDF indiriliyor', 'success');
    } else {
        showToast('PDF oluşturulamadı', 'danger');
    }
};

// ============= SAYFA YÜKLENİNCE =============
document.addEventListener('DOMContentLoaded', function() {
    console.log('Sayfa yüklendi, sınavlar yükleniyor...');
    loadExams();
    loadUniqueClassesForExam();
});



// ============= SALON BAZLI PDF =============
window.generateRoomPDF = async function() {
    if (!finalMixResults) { 
        showToast('Önce bir karma işlemi yapın', 'warning'); 
        return; 
    }
    showToast('Salon bazlı PDF hazırlanıyor...', 'info');
    
    try {
        const response = await fetch('/api/report/room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exam_results: finalMixResults })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'salon_bazli_oturma_plani.pdf';
            a.click();
            window.URL.revokeObjectURL(url);
            showToast('Salon PDF indiriliyor', 'success');
        } else {
            const error = await response.text();
            showToast('PDF oluşturulamadı: ' + error, 'danger');
        }
    } catch (error) {
        console.error('generateRoomPDF hatası:', error);
        showToast('PDF oluşturma hatası: ' + error.message, 'danger');
    }
};


window.deleteLevelPdf = async function(level) {
    if (!currentEditExamId) {
        showToast('Sınav kaydedilmeden PDF silinemez', 'warning');
        return;
    }
    
    const pdfName = currentExamPdfs[level]?.name || 'bilinmeyen';
    if (!confirm(`${level}. sınıf PDF'ini silmek istediğinize emin misiniz?\n\nPDF: ${pdfName}`)) return;
    
    try {
        const res = await fetch(`/api/exam/${currentEditExamId}/pdf/${level}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            // currentExamPdfs'ten kaldır
            delete currentExamPdfs[level];
            
            // PDF alanını güncelle
            updateDynamicPdfAreas();
            
            showToast(`${level}. sınıf PDF silindi`, 'success');
        } else {
            const error = await res.json();
            showToast(error.error || 'PDF silinirken hata oluştu', 'danger');
        }
    } catch (error) {
        console.error('deleteLevelPdf hatası:', error);
        showToast('PDF silme hatası', 'danger');
    }
};
console.log('exams.js tamamen yüklendi');