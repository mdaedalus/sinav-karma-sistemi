# -*- coding: utf-8 -*-
"""
Kelebek Sınav Sistemi
Sınav karma ve oturma planı yönetim sistemi

Geliştirici: Emin Neşat Gürses
"""

from flask import Flask, render_template, request, jsonify, send_file
from datetime import datetime
from collections import defaultdict
from io import BytesIO
import pandas as pd
import os
import sqlite3
import json
import random
import sys

# ReportLab - PDF oluşturma
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, Paragraph, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# ============= UYGULAMA YAPILANDIRMASI =============

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['DATABASE'] = 'database.db'
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32 MB

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'exam_pdfs'), exist_ok=True)


# ============= YARDIMCI FONKSİYONLAR =============

def get_db():
    """Veritabanı bağlantısı döndür"""
    return sqlite3.connect(app.config['DATABASE'])


def escape_html(text):
    """ReportLab Paragraph için HTML escape"""
    if not text:
        return ''
    return (str(text)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&apos;'))


# ============= VERİTABANI BAŞLATMA =============

def init_db():
    """Veritabanı tablolarını oluştur"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Sınıflar tablosu
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sinif TEXT UNIQUE,
            duzey INTEGER,
            kapasite INTEGER
        )
    ''')
    
    # Öğrenciler tablosu
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ad_soyad TEXT,
            numara TEXT UNIQUE,
            sinif TEXT,
            duzey INTEGER,
            cinsiyet TEXT
        )
    ''')
    
    # Sınavlar tablosu
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_name TEXT NOT NULL,
            exam_date TEXT NOT NULL,
            exam_hour INTEGER NOT NULL,
            selected_classes TEXT NOT NULL,
            exam_pdf TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()


init_db()


# ============= SAYFA YÖNLENDİRMELERİ =============

@app.route('/')
def index():
    return render_template('index.html', active_page='index')


@app.route('/students')
def students_page():
    return render_template('students.html', active_page='students')


@app.route('/classes')
def classes_page():
    return render_template('classes.html', active_page='classes')


@app.route('/exams')
def exams_page():
    return render_template('exams.html', active_page='exams')


@app.route('/upload')
def upload_page():
    return render_template('upload.html', active_page='upload')


@app.route('/mix-editor')
def mix_editor():
    return render_template('mix_editor.html', active_page='mix_editor')


# ============= ÖĞRENCİ API'leri =============

@app.route('/api/students')
def get_students():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, ad_soyad, numara, sinif, duzey, cinsiyet FROM students ORDER BY sinif, ad_soyad")
    students = [{
        'id': row[0], 'ad_soyad': row[1], 'numara': row[2],
        'sinif': row[3], 'duzey': row[4], 'cinsiyet': row[5]
    } for row in cursor.fetchall()]
    conn.close()
    return jsonify(students)


@app.route('/api/student/<int:id>', methods=['PUT'])
def update_student(id):
    data = request.json
    conn = get_db()
    conn.execute(
        "UPDATE students SET ad_soyad=?, numara=?, sinif=?, duzey=?, cinsiyet=? WHERE id=?",
        (data['ad_soyad'], data['numara'], data['sinif'], data['duzey'], data['cinsiyet'], id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/student/<int:id>', methods=['DELETE'])
def delete_student(id):
    conn = get_db()
    conn.execute("DELETE FROM students WHERE id=?", (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/students/delete_all', methods=['DELETE'])
def delete_all_students():
    conn = get_db()
    conn.execute("DELETE FROM students")
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/student', methods=['POST'])
def add_student():
    data = request.json
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO students (ad_soyad, numara, sinif, duzey, cinsiyet) VALUES (?, ?, ?, ?, ?)",
            (data['ad_soyad'], data['numara'], data['sinif'], data['duzey'], data['cinsiyet'])
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Bu numara zaten kayıtlı'}), 400


# ============= SINIF API'leri =============

@app.route('/api/classes')
def get_classes():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, sinif, duzey, kapasite FROM classes ORDER BY duzey, sinif")
    classes = [{
        'id': row[0], 'sinif': row[1], 'duzey': row[2], 'kapasite': row[3]
    } for row in cursor.fetchall()]
    conn.close()
    return jsonify(classes)


@app.route('/api/classes/unique')
def get_unique_classes():
    """Benzersiz sınıf isimleri (sınav seçimi için)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT sinif, duzey FROM classes ORDER BY duzey, sinif")
    classes = [{'sinif': row[0], 'duzey': row[1]} for row in cursor.fetchall()]
    conn.close()
    return jsonify(classes)


@app.route('/api/class/<int:id>', methods=['PUT'])
def update_class(id):
    data = request.json
    conn = get_db()
    conn.execute(
        "UPDATE classes SET sinif=?, duzey=?, kapasite=? WHERE id=?",
        (data['sinif'], data['duzey'], data['kapasite'], id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/class/<int:id>', methods=['DELETE'])
def delete_class(id):
    conn = get_db()
    conn.execute("DELETE FROM students WHERE sinif IN (SELECT sinif FROM classes WHERE id=?)", (id,))
    conn.execute("DELETE FROM classes WHERE id=?", (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/classes/delete_all', methods=['DELETE'])
def delete_all_classes():
    conn = get_db()
    conn.execute("DELETE FROM students")
    conn.execute("DELETE FROM classes")
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/class', methods=['POST'])
def add_class():
    data = request.json
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO classes (sinif, duzey, kapasite) VALUES (?, ?, ?)",
            (data['sinif'], data['duzey'], data['kapasite'])
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Bu sınıf zaten var'}), 400


# ============= SINAV API'leri =============

@app.route('/api/exams', methods=['GET'])
def get_exams():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, exam_name, exam_date, exam_hour, selected_classes, created_at 
        FROM exams ORDER BY exam_date DESC, exam_hour
    """)
    exams = []
    for row in cursor.fetchall():
        exams.append({
            'id': row[0],
            'exam_name': row[1],
            'exam_date': row[2],
            'exam_hour': row[3],
            'selected_classes': row[4].split(','),
            'created_at': row[5]
        })
    conn.close()
    return jsonify(exams)


@app.route('/api/exam/<int:id>', methods=['GET'])
def get_exam(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, exam_name, exam_date, exam_hour, selected_classes FROM exams WHERE id=?",
        (id,)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        return jsonify({
            'id': row[0],
            'exam_name': row[1],
            'exam_date': row[2],
            'exam_hour': row[3],
            'selected_classes': row[4].split(',')
        })
    return jsonify({'error': 'Sınav bulunamadı'}), 404


@app.route('/api/exam', methods=['POST'])
def add_exam():
    data = request.json
    exam_name = data.get('exam_name')
    exam_date = data.get('exam_date')
    exam_hour = data.get('exam_hour')
    selected_classes = data.get('selected_classes', [])
    
    if not exam_name or not exam_date or not exam_hour or not selected_classes:
        return jsonify({'error': 'Tüm alanları doldurunuz'}), 400
    
    classes_str = ','.join(selected_classes)
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO exams (exam_name, exam_date, exam_hour, selected_classes) VALUES (?, ?, ?, ?)",
            (exam_name, exam_date, exam_hour, classes_str)
        )
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()
        return jsonify({'success': True, 'message': 'Sınav başarıyla oluşturuldu', 'id': new_id})
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exam/<int:id>', methods=['PUT'])
def update_exam(id):
    data = request.json
    exam_name = data.get('exam_name')
    exam_date = data.get('exam_date')
    exam_hour = data.get('exam_hour')
    selected_classes = data.get('selected_classes', [])
    
    if not exam_name or not exam_date or not exam_hour or not selected_classes:
        return jsonify({'error': 'Tüm alanları doldurunuz'}), 400
    
    classes_str = ','.join(selected_classes)
    
    conn = get_db()
    try:
        conn.execute(
            "UPDATE exams SET exam_name=?, exam_date=?, exam_hour=?, selected_classes=? WHERE id=?",
            (exam_name, exam_date, exam_hour, classes_str, id)
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Sınav başarıyla güncellendi'})
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exam/<int:id>', methods=['DELETE'])
def delete_exam(id):
    """Sınav sil - PDF dosyalarını da sil"""
    conn = get_db()
    cursor = conn.cursor()
    
    # PDF dosyalarını sil
    cursor.execute("SELECT exam_pdf FROM exams WHERE id = ?", (id,))
    row = cursor.fetchone()
    
    if row and row[0]:
        try:
            exam_pdfs = json.loads(row[0])
            pdf_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'exam_pdfs')
            for filename in exam_pdfs.values():
                pdf_path = os.path.join(pdf_folder, filename)
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)
        except Exception as e:
            print(f"PDF silme hatası: {e}")
    
    # Sınavı sil
    cursor.execute("DELETE FROM exams WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Sınav ve PDF dosyaları silindi'})


@app.route('/api/exams/delete_all', methods=['DELETE'])
def delete_all_exams():
    """Tüm sınavları sil"""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM exams")
        count = cursor.fetchone()[0]
        
        cursor.execute("DELETE FROM exams")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='exams'")
        
        conn.commit()
        
        result_message = f'{count} sınav başarıyla silindi.' if count > 0 else 'Silinecek sınav bulunamadı.'
        
        return jsonify({
            'success': True,
            'message': result_message,
            'deleted_count': count
        })
    except Exception as e:
        return jsonify({'error': f'Silme hatası: {str(e)}'}), 500
    finally:
        conn.close()


# ============= EXCEL YÜKLEME API'leri =============

@app.route('/upload_excel', methods=['POST'])
def upload_excel():
    """Sınıf ve öğrenci Excel'i yükle"""
    if 'excel_file' not in request.files:
        return jsonify({'error': 'Dosya bulunamadı'}), 400
    
    file = request.files['excel_file']
    if file.filename == '':
        return jsonify({'error': 'Dosya seçilmedi'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
    file.save(filepath)
    
    try:
        excel_data = pd.ExcelFile(filepath)
        conn = get_db()
        
        # Sınıflar sayfası
        if 'classes' in excel_data.sheet_names:
            df_classes = pd.read_excel(filepath, sheet_name='classes')
            df_classes = df_classes.dropna(how='all')
            for _, row in df_classes.iterrows():
                if pd.notna(row['Sınıf']):
                    conn.execute(
                        "INSERT OR REPLACE INTO classes (sinif, duzey, kapasite) VALUES (?, ?, ?)",
                        (row['Sınıf'], row['Düzey'], row['Kapasite'])
                    )
        
        # Öğrenciler sayfası
        if 'students' in excel_data.sheet_names:
            df_students = pd.read_excel(filepath, sheet_name='students')
            df_students = df_students.dropna(how='all')
            for _, row in df_students.iterrows():
                if pd.notna(row['Numara']):
                    # Ad Soyad birleştirme
                    ad = str(row['Ad']) if pd.notna(row.get('Ad')) else ''
                    soyad = str(row['Soyad']) if pd.notna(row.get('Soyad')) else ''
                    ad_soyad = f"{ad} {soyad}".strip()
                    
                    conn.execute(
                        "INSERT OR REPLACE INTO students (ad_soyad, numara, sinif, duzey, cinsiyet) VALUES (?, ?, ?, ?, ?)",
                        (ad_soyad, row['Numara'], row['Sınıf'], row['Düzey'], row['Cinsiyet'])
                    )
        
        conn.commit()
        conn.close()
        os.remove(filepath)
        return jsonify({'success': True, 'message': 'Veriler başarıyla yüklendi!'})
    
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': str(e)}), 500


@app.route('/upload_exams_excel', methods=['POST'])
def upload_exams_excel():
    """Excel'den sınavları toplu yükle"""
    if 'excel_file' not in request.files:
        return jsonify({'error': 'Dosya bulunamadı'}), 400
    
    file = request.files['excel_file']
    if file.filename == '':
        return jsonify({'error': 'Dosya seçilmedi'}), 400
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        return jsonify({'error': 'Sadece Excel dosyaları (.xlsx, .xls) yüklenebilir'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
    file.save(filepath)
    
    try:
        df = pd.read_excel(filepath)
        
        required_columns = ['Ders', 'Tarih', 'Saat', 'Düzey', 'Sınıflar']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            os.remove(filepath)
            return jsonify({'error': f'Eksik sütunlar: {", ".join(missing_columns)}'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT sinif FROM classes")
        existing_classes = {row[0] for row in cursor.fetchall()}
        
        success_count = 0
        error_count = 0
        skipped_count = 0
        errors = []
        new_exams = []
        
        for idx, row in df.iterrows():
            try:
                # Boş satır kontrolü
                if (pd.isna(row['Ders']) and pd.isna(row['Tarih']) and 
                    pd.isna(row['Saat']) and pd.isna(row['Düzey']) and pd.isna(row['Sınıflar'])):
                    skipped_count += 1
                    continue
                
                if pd.isna(row['Ders']) or str(row['Ders']).strip() == '':
                    errors.append(f"Satır {idx+2}: Ders adı boş, atlandı")
                    error_count += 1
                    continue
                
                exam_name = str(row['Ders']).strip()
                
                if pd.isna(row['Tarih']):
                    errors.append(f"Satır {idx+2}: Tarih boş, atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                # Tarih formatı
                try:
                    if isinstance(row['Tarih'], pd.Timestamp):
                        exam_date = row['Tarih'].strftime('%Y-%m-%d')
                    elif isinstance(row['Tarih'], datetime):
                        exam_date = row['Tarih'].strftime('%Y-%m-%d')
                    else:
                        exam_date = str(row['Tarih']).strip()
                        if '.' in exam_date:
                            parts = exam_date.split('.')
                            if len(parts) == 3:
                                exam_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                except Exception:
                    errors.append(f"Satır {idx+2}: Tarih formatı hatalı, atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                if pd.isna(row['Saat']):
                    errors.append(f"Satır {idx+2}: Saat boş, atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                exam_hour = int(row['Saat'])
                if exam_hour < 1 or exam_hour > 8:
                    errors.append(f"Satır {idx+2}: Saat 1-8 arasında olmalı (girilen: {exam_hour}), atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                if pd.isna(row['Düzey']):
                    errors.append(f"Satır {idx+2}: Düzey boş, atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                level = int(row['Düzey'])
                
                if pd.isna(row['Sınıflar']) or str(row['Sınıflar']).strip() == '':
                    errors.append(f"Satır {idx+2}: Sınıflar boş, atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                classes_str = str(row['Sınıflar']).strip()
                class_letters = [c.strip().upper() for c in classes_str.split(',') if c.strip()]
                
                if not class_letters:
                    errors.append(f"Satır {idx+2}: Geçerli sınıf harfi bulunamadı, atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                # Tam sınıf adları (9A, 9B gibi)
                full_classes = [f"{level}{letter}" for letter in class_letters]
                
                # Sınıf kontrolü
                missing_classes = [c for c in full_classes if c not in existing_classes]
                if missing_classes:
                    errors.append(f"Satır {idx+2}: Sınıflar sistemde bulunamadı: {', '.join(missing_classes)}, atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                # Aynı sınav kontrolü
                cursor.execute("""
                    SELECT id FROM exams 
                    WHERE exam_name = ? AND exam_date = ? AND exam_hour = ?
                """, (exam_name, exam_date, exam_hour))
                
                if cursor.fetchone():
                    errors.append(f"Satır {idx+2}: Aynı sınav zaten mevcut, atlandı - {exam_name}")
                    error_count += 1
                    continue
                
                classes_json = ','.join(full_classes)
                cursor.execute("""
                    INSERT INTO exams (exam_name, exam_date, exam_hour, selected_classes)
                    VALUES (?, ?, ?, ?)
                """, (exam_name, exam_date, exam_hour, classes_json))
                
                success_count += 1
                new_exams.append({
                    'name': exam_name,
                    'date': exam_date,
                    'hour': exam_hour,
                    'classes': full_classes
                })
                
            except ValueError as e:
                errors.append(f"Satır {idx+2}: Değer hatası - {str(e)}")
                error_count += 1
            except Exception as e:
                errors.append(f"Satır {idx+2}: Beklenmeyen hata - {str(e)}")
                error_count += 1
        
        conn.commit()
        conn.close()
        os.remove(filepath)
        
        result_message = f"{success_count} sınav başarıyla eklendi."
        if skipped_count > 0:
            result_message += f" {skipped_count} boş satır atlandı."
        if error_count > 0:
            result_message += f" {error_count} hata oluştu."
        
        return jsonify({
            'success': True,
            'message': result_message,
            'success_count': success_count,
            'error_count': error_count,
            'skipped_count': skipped_count,
            'errors': errors[:20],
            'new_exams': new_exams
        })
    
    except Exception as e:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': f'Dosya okuma hatası: {str(e)}'}), 500


# ============= KELEBEK KARMA ALGORİTMASI =============

def assign_to_rooms_optimized(students, rooms, room_capacities, options):
    """
    Gelişmiş salon yerleştirme - Aynı sınıftan öğrenciler yan yana gelmez
    """
    assignments = []
    avoid_same_class = options.get('avoid_same_class_room', True)
    spread_method = options.get('spread_method', 'even')
    max_per_room = options.get('max_per_room')
    
    # Kapasiteleri belirle
    capacities = {}
    for room in rooms:
        if max_per_room:
            capacities[room] = min(max_per_room, room_capacities.get(room, 30))
        else:
            capacities[room] = room_capacities.get(room, 30)
    
    # Öğrencileri sınıflarına göre grupla
    students_by_class = defaultdict(list)
    for student in students:
        students_by_class[student['sinif']].append(student)
    
    # Her sınıfı karıştır
    for sinif in students_by_class:
        random.shuffle(students_by_class[sinif])
    
    # Sınıfları karıştır
    class_names = list(students_by_class.keys())
    random.shuffle(class_names)
    
    # Dönüşümlü olarak öğrenci al
    interleaved_students = []
    max_class_size = max([len(students_by_class[c]) for c in class_names]) if class_names else 0
    
    for i in range(max_class_size):
        for sinif in class_names:
            if i < len(students_by_class[sinif]):
                interleaved_students.append(students_by_class[sinif][i])
    
    # Salon doluluk takibi
    room_usage = defaultdict(int)
    
    if spread_method == 'even':
        room_index = 0
        for student in interleaved_students:
            if avoid_same_class:
                available_rooms = [r for r in rooms if r != student['sinif'] and room_usage[r] < capacities[r]]
                if not available_rooms:
                    available_rooms = [r for r in rooms if room_usage[r] < capacities[r]]
            else:
                available_rooms = [r for r in rooms if room_usage[r] < capacities[r]]
            
            if not available_rooms:
                room = min(rooms, key=lambda r: room_usage[r])
            else:
                room = available_rooms[room_index % len(available_rooms)]
                room_index += 1
            
            seat_number = room_usage[room] + 1
            assignments.append({
                'student': student,
                'room': room,
                'seat': seat_number
            })
            room_usage[room] += 1
    
    elif spread_method == 'fill':
        room_index = 0
        for student in interleaved_students:
            while room_index < len(rooms):
                room = rooms[room_index]
                
                if avoid_same_class and room == student['sinif']:
                    room_index += 1
                    continue
                
                if room_usage[room] < capacities[room]:
                    break
                else:
                    room_index += 1
            
            if room_index >= len(rooms):
                room = min(rooms, key=lambda r: room_usage[r])
            else:
                room = rooms[room_index]
            
            seat_number = room_usage[room] + 1
            assignments.append({
                'student': student,
                'room': room,
                'seat': seat_number
            })
            room_usage[room] += 1
    
    else:  # random
        for student in interleaved_students:
            if avoid_same_class:
                available_rooms = [r for r in rooms if r != student['sinif'] and room_usage[r] < capacities[r]]
                if not available_rooms:
                    available_rooms = [r for r in rooms if room_usage[r] < capacities[r]]
            else:
                available_rooms = [r for r in rooms if room_usage[r] < capacities[r]]
            
            if not available_rooms:
                room = min(rooms, key=lambda r: room_usage[r])
            else:
                room = min(available_rooms, key=lambda r: room_usage[r])
            
            seat_number = room_usage[room] + 1
            assignments.append({
                'student': student,
                'room': room,
                'seat': seat_number
            })
            room_usage[room] += 1
    
    # Sıra numaralarını düzenle (ardışık)
    for room in rooms:
        room_students = [a for a in assignments if a['room'] == room]
        for idx, assignment in enumerate(room_students, 1):
            assignment['seat'] = idx
    
    return assignments


def create_balanced_mix(students, options):
    """Dengeli karma oluştur - cinsiyet ve sınıf dengesi"""
    # Cinsiyete göre ayır
    males = [s for s in students if s['cinsiyet'] == 'Erkek']
    females = [s for s in students if s['cinsiyet'] == 'Kız']
    
    # Sınıflara göre ayır
    class_males = defaultdict(list)
    class_females = defaultdict(list)
    
    for s in males:
        class_males[s['sinif']].append(s)
    for s in females:
        class_females[s['sinif']].append(s)
    
    # Her sınıfı karıştır
    for sinif in class_males:
        random.shuffle(class_males[sinif])
    for sinif in class_females:
        random.shuffle(class_females[sinif])
    
    # Tüm sınıf isimlerini birleştir (DÜZELTİLDİ)
    all_class_names = sorted(set(class_males.keys()) | set(class_females.keys()))
    
    # Dengeli dağıt - sınıfları dönüşümlü al
    balanced = []
    max_males = max([len(class_males[c]) for c in class_males] or [0])
    max_females = max([len(class_females[c]) for c in class_females] or [0])
    
    for i in range(max(max_males, max_females)):
        for sinif in all_class_names:
            if i < len(class_males[sinif]):
                balanced.append(class_males[sinif][i])
            if i < len(class_females[sinif]):
                balanced.append(class_females[sinif][i])
    
    return balanced


def adjust_gender_ratio(students, gender_ratio):
    """Cinsiyet oranını ayarla"""
    females = [s for s in students if s['cinsiyet'] == 'Kız']
    males = [s for s in students if s['cinsiyet'] == 'Erkek']
    
    random.shuffle(females)
    random.shuffle(males)
    
    # Dönüşümlü yerleştir
    adjusted = []
    female_idx, male_idx = 0, 0
    
    while len(adjusted) < len(students):
        if female_idx < len(females) and (len(adjusted) % 2 == 0 or male_idx >= len(males)):
            adjusted.append(females[female_idx])
            female_idx += 1
        elif male_idx < len(males):
            adjusted.append(males[male_idx])
            male_idx += 1
        elif female_idx < len(females):
            adjusted.append(females[female_idx])
            female_idx += 1
    
    return adjusted


def group_same_class_together(students):
    """Aynı sınıftaki öğrencileri yan yana grupla"""
    class_groups = defaultdict(list)
    for student in students:
        class_groups[student['sinif']].append(student)
    
    for sinif in class_groups:
        random.shuffle(class_groups[sinif])
    
    class_names = list(class_groups.keys())
    random.shuffle(class_names)
    
    result = []
    for sinif in class_names:
        result.extend(class_groups[sinif])
    
    return result


def apply_advanced_mix_strategy(students, exams, rooms, room_capacities, options):
    """Gelişmiş karma stratejileri - Optimize edilmiş sıra dağıtımı ile"""
    # Varsayılan seçenekler
    default_options = {
        'mix_type': 'full_mix',
        'gender_ratio': {'female_percent': 50, 'male_percent': 50},
        'same_class_together': False,
        'spread_method': 'even',
        'priority_rooms': [],
        'avoid_same_class_room': True,
        'max_per_room': None
    }
    
    for key, value in default_options.items():
        if key not in options:
            options[key] = value
    
    # Öğrencileri kopyala
    mixed_students = students.copy()
    
    # 1. Karıştırma tipine göre hazırlık
    if options['mix_type'] == 'full_mix':
        random.shuffle(mixed_students)
    
    elif options['mix_type'] == 'class_based':
        class_groups = defaultdict(list)
        for student in mixed_students:
            class_groups[student['sinif']].append(student)
        
        for sinif in class_groups:
            random.shuffle(class_groups[sinif])
        
        class_names = list(class_groups.keys())
        random.shuffle(class_names)
        
        mixed_students = []
        for sinif in class_names:
            mixed_students.extend(class_groups[sinif])
    
    elif options['mix_type'] == 'balanced':
        mixed_students = create_balanced_mix(mixed_students, options)
    
    # 2. Cinsiyet oranı ayarı
    if options.get('gender_balance', False):
        female_percent = options.get('gender_ratio_female', 50)
        mixed_students = adjust_gender_ratio(
            mixed_students,
            {'female_percent': female_percent, 'male_percent': 100 - female_percent}
        )
    
    # 3. Aynı sınıftakileri yan yana yap (opsiyonel)
    if options['same_class_together']:
        mixed_students = group_same_class_together(mixed_students)
    
    # 4. Öncelikli salonları belirle
    available_rooms = rooms.copy()
    if options['priority_rooms']:
        priority = [r for r in options['priority_rooms'] if r in available_rooms]
        other_rooms = [r for r in available_rooms if r not in priority]
        available_rooms = priority + other_rooms
    
    # 5. Optimize edilmiş salon yerleştirmesi
    assignments = assign_to_rooms_optimized(
        mixed_students,
        available_rooms,
        room_capacities,
        options
    )
    
    # 6. Her öğrenciyi sınavla eşleştir
    exam_class_map = {}
    for exam in exams:
        for class_name in exam['classes']:
            if class_name not in exam_class_map:
                exam_class_map[class_name] = []
            exam_class_map[class_name].append(exam['name'])
    
    final_assignments = []
    for assignment in assignments:
        student_exams = exam_class_map.get(assignment['student']['sinif'], [])
        for exam_name in student_exams:
            final_assignments.append({
                'student': assignment['student'],
                'exam_name': exam_name,
                'exam_date': exams[0]['date'] if exams else '',
                'exam_hour': exams[0]['hour'] if exams else '',
                'room': assignment['room'],
                'seat': assignment['seat']
            })
    
    # Dağıtım istatistikleri
    distribution = {}
    for room in rooms:
        distribution[room] = {
            'total': len([a for a in final_assignments if a['room'] == room]),
            'capacity': room_capacities.get(room, 30),
            'students': [a['student'] for a in final_assignments if a['room'] == room]
        }
    
    return {
        'assignments': final_assignments,
        'distribution': distribution
    }


@app.route('/api/mix_exams', methods=['POST'])
def mix_exams():
    """Kelebek karma algoritması - Tüm sınav grupları"""
    data = request.json
    mix_options = data.get('mix_options', {})
    
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, exam_name, exam_date, exam_hour, selected_classes 
        FROM exams ORDER BY exam_date, exam_hour
    """)
    exams = []
    for row in cursor.fetchall():
        exams.append({
            'id': row[0],
            'name': row[1],
            'date': row[2],
            'hour': row[3],
            'classes': row[4].split(',')
        })
    
    # Aynı tarih ve saatteki sınavları grupla
    exam_groups = {}
    for exam in exams:
        key = f"{exam['date']}_{exam['hour']}"
        if key not in exam_groups:
            exam_groups[key] = []
        exam_groups[key].append(exam)
    
    # Sınıf kapasiteleri
    cursor.execute("SELECT sinif, kapasite FROM classes")
    class_capacities = {row[0]: row[1] for row in cursor.fetchall()}
    
    mix_results = []
    
    for group_key, group_exams in exam_groups.items():
        exam_date = group_exams[0]['date']
        exam_hour = group_exams[0]['hour']
        
        # Bu gruptaki tüm sınıflar
        all_rooms = set()
        for exam in group_exams:
            all_rooms.update(exam['classes'])
        
        if not all_rooms:
            continue
        
        rooms_list = sorted(list(all_rooms))
        
        # Bu sınıflardaki öğrencileri al
        placeholders = ','.join(['?'] * len(all_rooms))
        query = f"""
            SELECT id, ad_soyad, numara, sinif, duzey, cinsiyet 
            FROM students 
            WHERE sinif IN ({placeholders})
        """
        cursor.execute(query, list(all_rooms))
        students = []
        for row in cursor.fetchall():
            students.append({
                'id': row[0],
                'ad_soyad': row[1],
                'numara': row[2],
                'sinif': row[3],
                'duzey': row[4],
                'cinsiyet': row[5]
            })
        
        if not students:
            continue
        
        room_capacities = {}
        for room in rooms_list:
            room_capacities[room] = class_capacities.get(room, 30)
        
        mix_result = apply_advanced_mix_strategy(
            students, group_exams, rooms_list, room_capacities, mix_options
        )
        
        mix_results.append({
            'date': exam_date,
            'hour': exam_hour,
            'exams': [exam['name'] for exam in group_exams],
            'rooms': rooms_list,
            'room_capacities': room_capacities,
            'total_students': len(students),
            'distribution': mix_result['distribution'],
            'mixed_students': mix_result['assignments']
        })
    
    conn.close()
    
    return jsonify({
        'success': True,
        'message': f'{len(mix_results)} grup başarıyla karıştırıldı',
        'results': mix_results
    })


@app.route('/api/mix_options', methods=['GET'])
def get_mix_options():
    """Gelişmiş karma seçeneklerini getir"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT COUNT(*) FROM exams")
        exam_count = cursor.fetchone()[0]
        
        if exam_count == 0:
            return jsonify({
                'mix_options': {},
                'exam_groups': [],
                'class_capacities': {},
                'message': 'Henüz sınav bulunmuyor. Önce sınav ekleyin.'
            })
        
        # Sınav grupları
        cursor.execute("""
            SELECT exam_date, exam_hour, GROUP_CONCAT(DISTINCT exam_name) as exam_names,
                   GROUP_CONCAT(DISTINCT selected_classes) as all_classes
            FROM exams 
            GROUP BY exam_date, exam_hour
            ORDER BY exam_date DESC, exam_hour
        """)
        
        groups = []
        for row in cursor.fetchall():
            if row[0] and row[0] != 'None':
                try:
                    all_classes = set()
                    if row[3]:
                        for class_group in row[3].split(','):
                            if class_group:
                                for c in class_group.split(','):
                                    if c:
                                        all_classes.add(c.strip())
                    
                    groups.append({
                        'date': row[0],
                        'hour': int(row[1]) if row[1] else 0,
                        'exams': row[2].split(',') if row[2] else [],
                        'classes': sorted(list(all_classes)) if all_classes else []
                    })
                except Exception as e:
                    print(f"Grup işleme hatası: {e}")
                    continue
        
        cursor.execute("SELECT sinif, kapasite FROM classes ORDER BY sinif")
        class_capacities = {row[0]: row[1] for row in cursor.fetchall()}
        
        options = {
            'mix_type': {
                'type': 'select',
                'label': 'Karma Tipi',
                'options': [
                    {'value': 'full_mix', 'label': '🔀 Tam Karma - Herkes birbirine karışsın'},
                    {'value': 'class_based', 'label': '🏫 Sınıf Bazlı - Sınıflar kendi içinde karışsın'},
                    {'value': 'balanced', 'label': '⚖️ Dengeli Karma - Cinsiyet ve sınıf dengesi gözetilsin'}
                ],
                'default': 'full_mix',
                'description': 'Öğrencilerin nasıl karıştırılacağını belirler'
            },
            'spread_method': {
                'type': 'select',
                'label': 'Salonlara Dağıtım Şekli',
                'options': [
                    {'value': 'even', 'label': '🔄 Eşit Dağıt - Her salona sırayla yerleştir'},
                    {'value': 'fill', 'label': '📥 Doldur - Bir salonu doldur, sonra diğerine geç'},
                    {'value': 'random', 'label': '🎲 Rastgele Dağıt - Rastgele salonlara yerleştir'}
                ],
                'default': 'even',
                'description': 'Öğrencilerin salonlara nasıl dağıtılacağı'
            },
            'same_class_together': {
                'type': 'boolean',
                'label': 'Aynı Sınıftaki Öğrenciler Yan Yana Olsun',
                'description': 'Aynı sınıftaki öğrenciler listede yan yana sıralansın',
                'default': False
            },
            'avoid_same_class_room': {
                'type': 'boolean',
                'label': 'Kendi Sınıfındaki Salona Girmesin',
                'description': 'Öğrenciler kendi sınıf adındaki salona yerleştirilmesin',
                'default': True
            },
            'gender_balance': {
                'type': 'boolean',
                'label': 'Cinsiyet Dengesi Gözetilsin',
                'description': 'Erkek-Kız dönüşümlü yerleştirme yap',
                'default': True
            },
            'gender_ratio_female': {
                'type': 'slider',
                'label': 'Kız Öğrenci Oranı',
                'min': 0,
                'max': 100,
                'default': 50,
                'description': 'Sınavdaki kız öğrenci yüzdesi (yaklaşık)'
            }
        }
        
        return jsonify({
            'mix_options': options,
            'exam_groups': groups,
            'class_capacities': class_capacities
        })
        
    except Exception as e:
        print(f"get_mix_options hatası: {e}")
        return jsonify({
            'mix_options': {},
            'exam_groups': [],
            'class_capacities': {},
            'error': str(e)
        })
    finally:
        conn.close()


@app.route('/api/simulate_mix', methods=['POST'])
def simulate_mix():
    """Karma simülasyonu - gerçek kayıt yapmadan önizleme"""
    data = request.json
    mix_options = data.get('mix_options', {})
    selected_group = data.get('selected_group', {})
    
    conn = get_db()
    cursor = conn.cursor()
    
    exam_date = selected_group.get('date')
    exam_hour = selected_group.get('hour')
    
    cursor.execute("""
        SELECT id, exam_name, selected_classes 
        FROM exams 
        WHERE exam_date = ? AND exam_hour = ?
    """, (exam_date, exam_hour))
    
    group_exams = []
    all_classes = set()
    
    for row in cursor.fetchall():
        classes = row[2].split(',')
        all_classes.update(classes)
        group_exams.append({
            'id': row[0],
            'name': row[1],
            'classes': classes
        })
    
    if not all_classes:
        conn.close()
        return jsonify({'error': 'Seçilen grupta sınıf bulunamadı'}), 400
    
    placeholders = ','.join(['?'] * len(all_classes))
    query = f"""
        SELECT id, ad_soyad, numara, sinif, duzey, cinsiyet 
        FROM students 
        WHERE sinif IN ({placeholders})
    """
    cursor.execute(query, list(all_classes))
    
    students = []
    for row in cursor.fetchall():
        students.append({
            'id': row[0],
            'ad_soyad': row[1],
            'numara': row[2],
            'sinif': row[3],
            'duzey': row[4],
            'cinsiyet': row[5]
        })
    
    cursor.execute("SELECT sinif, kapasite FROM classes")
    class_capacities = {row[0]: row[1] for row in cursor.fetchall()}
    
    conn.close()
    
    rooms_list = sorted(list(all_classes))
    room_capacities = {}
    for room in rooms_list:
        percent = mix_options.get('max_per_room_percent', 100)
        capacity = class_capacities.get(room, 30)
        room_capacities[room] = int(capacity * percent / 100)
    
    if 'gender_balance' in mix_options and mix_options['gender_balance']:
        female_percent = mix_options.get('gender_ratio_female', 50)
        mix_options['gender_ratio'] = {
            'female_percent': female_percent,
            'male_percent': 100 - female_percent
        }
    
    result = apply_advanced_mix_strategy(
        students, group_exams, rooms_list, room_capacities, mix_options
    )
    
    return jsonify({
        'success': True,
        'summary': {
            'total_students': len(students),
            'total_rooms': len(rooms_list),
            'distribution': result['distribution']
        },
        'assignments': result['assignments'][:50],
        'full_result': result
    })


# ============= TÜRKÇE KARAKTER DESTEKLİ PDF MODÜLÜ =============

def register_turkish_font():
    """Türkçe karakter desteği için font kaydet"""
    font_paths = [
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/calibri.ttf',
        'C:/Windows/Fonts/tahoma.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]
    
    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont('TurkishFont', font_path))
                return 'TurkishFont'
            except Exception:
                continue
    
    return 'Helvetica'


FONT_NAME = register_turkish_font()


def get_turkish_styles():
    """Türkçe karakter destekli stil tanımlamaları"""
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontName=FONT_NAME,
        fontSize=16,
        textColor=colors.HexColor('#2c3e50'),
        alignment=1,
        spaceAfter=20
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontName=FONT_NAME,
        fontSize=12,
        textColor=colors.HexColor('#34495e'),
        spaceAfter=10,
        spaceBefore=10
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontName=FONT_NAME,
        fontSize=9,
        leading=12
    )
    
    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName=FONT_NAME,
        fontSize=9,
        textColor=colors.whitesmoke,
        alignment=1,
        leading=12
    )
    
    return {
        'title': title_style,
        'heading': heading_style,
        'normal': normal_style,
        'table_header': table_header_style
    }


# ============= PDF RAPOR OLUŞTURUCULARI =============

def create_student_pdf(assignments, exam_groups):
    """Öğrenci PDF'i - Her sınıf tek sayfada"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=20, leftMargin=20, topMargin=30, bottomMargin=30
    )
    styles = get_turkish_styles()
    story = []
    
    # Kapak
    story.append(Spacer(1, 80))
    story.append(Paragraph("KELEBEK SINAV SİSTEMİ", ParagraphStyle(
        'CoverTitle', parent=styles['title'], fontSize=28,
        textColor=colors.HexColor('#1a5276'), alignment=1, spaceAfter=30
    )))
    story.append(Paragraph("ÖĞRENCİ SINAV PROGRAMI", ParagraphStyle(
        'CoverSubtitle', parent=styles['heading'], fontSize=18,
        textColor=colors.HexColor('#2e86c1'), alignment=1, spaceAfter=50
    )))
    story.append(Spacer(1, 100))
    story.append(Paragraph(
        f"Oluşturma Tarihi: {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        ParagraphStyle('DateStyle', parent=styles['normal'], alignment=1, fontSize=10)
    ))
    story.append(PageBreak())
    
    # Öğrencileri sınıflara göre grupla
    students_by_class = {}
    for exam_group in exam_groups:
        for assignment in exam_group.get('mixed_students', []):
            student = assignment['student']
            class_name = student['sinif']
            if class_name not in students_by_class:
                students_by_class[class_name] = []
            
            existing = next(
                (s for s in students_by_class[class_name] if s['numara'] == student['numara']),
                None
            )
            if not existing:
                existing = {
                    'ad_soyad': student['ad_soyad'],
                    'numara': student['numara'],
                    'sinif': student['sinif'],
                    'duzey': student.get('duzey', student['sinif'][0] if student['sinif'] else ''),
                    'exams': []
                }
                students_by_class[class_name].append(existing)
            
            existing['exams'].append({
                'name': assignment['exam_name'],
                'date': exam_group['date'],
                'hour': exam_group['hour'],
                'room': assignment['room'],
                'seat': assignment.get('seat', 0)
            })
    
    # Her sınıf için sayfa
    for class_name, students in sorted(students_by_class.items()):
        story.append(Paragraph(f"{class_name} SINIFI", ParagraphStyle(
            'ClassTitle', parent=styles['title'], fontSize=16,
            textColor=colors.HexColor('#1a5276'), alignment=1,
            spaceAfter=15, backColor=colors.HexColor('#d4e6f1'), borderPadding=10
        )))
        story.append(Spacer(1, 10))
        
        # Bilgi tablosu
        info_data = [
            [Paragraph("Sınıf Seviyesi", styles['table_header']),
             Paragraph(f"{students[0]['duzey']}. Sınıf", styles['normal'])],
            [Paragraph("Toplam Öğrenci", styles['table_header']),
             Paragraph(str(len(students)), styles['normal'])],
            [Paragraph("Sınav Sayısı", styles['table_header']),
             Paragraph(str(len(set([e['name'] for s in students for e in s['exams']]))), styles['normal'])]
        ]
        
        info_table = Table(info_data, colWidths=[100, 280])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#2e86c1')),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 15))
        
        # Öğrenci tablosu
        table_data = [[
            Paragraph("<b>Sıra</b>", styles['table_header']),
            Paragraph("<b>Öğrenci Adı Soyadı</b>", styles['table_header']),
            Paragraph("<b>Okul No</b>", styles['table_header']),
            Paragraph("<b>Sınav Adı</b>", styles['table_header']),
            Paragraph("<b>Tarih</b>", styles['table_header']),
            Paragraph("<b>Saat</b>", styles['table_header']),
            Paragraph("<b>Salon</b>", styles['table_header']),
            Paragraph("<b>Sıra No</b>", styles['table_header'])
        ]]
        
        for idx, student in enumerate(students, 1):
            exam_text = "<br/>".join([f"• {e['name']}" for e in student['exams']])
            date_text = "<br/>".join([e['date'] for e in student['exams']])
            hour_text = "<br/>".join([f"{e['hour']}. Ders" for e in student['exams']])
            room_text = "<br/>".join([e['room'] for e in student['exams']])
            seat_text = "<br/>".join([str(e['seat']) for e in student['exams']])
            
            table_data.append([
                Paragraph(str(idx), styles['normal']),
                Paragraph(student['ad_soyad'], styles['normal']),
                Paragraph(str(student['numara']), styles['normal']),
                Paragraph(exam_text, styles['normal']),
                Paragraph(date_text, styles['normal']),
                Paragraph(hour_text, styles['normal']),
                Paragraph(room_text, styles['normal']),
                Paragraph(seat_text, styles['normal'])
            ])
        
        table = Table(table_data, repeatRows=1, colWidths=[35, 85, 55, 75, 65, 45, 55, 45])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 0), (-1, 0), FONT_NAME),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#ebf5fb')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#85c1e9')),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#ebf5fb'), colors.HexColor('#d6eaf8')]),
        ]))
        story.append(table)
        story.append(PageBreak())
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def create_admin_pdf(exam_results):
    """İdareci PDF'i - Profesyonel dashboard görünümü"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        rightMargin=20, leftMargin=20, topMargin=30, bottomMargin=30
    )
    styles = get_turkish_styles()
    story = []
    
    # Kapak
    story.append(Spacer(1, 60))
    story.append(Paragraph("KELEBEK SINAV SİSTEMİ", ParagraphStyle(
        'AdminCoverTitle', parent=styles['title'], fontSize=26,
        textColor=colors.HexColor('#1a5276'), alignment=1
    )))
    story.append(Paragraph("İDARECİ RAPORU", ParagraphStyle(
        'AdminCoverSub', parent=styles['heading'], fontSize=18,
        textColor=colors.HexColor('#2e86c1'), alignment=1, spaceAfter=40
    )))
    story.append(Spacer(1, 80))
    story.append(Paragraph(
        f"Rapor Tarihi: {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        ParagraphStyle('AdminDate', parent=styles['normal'], alignment=1, fontSize=11)
    ))
    story.append(PageBreak())
    
    for idx, exam_group in enumerate(exam_results, 1):
        story.append(Paragraph(
            f"{idx}. SINAV GRUBU: {exam_group['date']} - {exam_group['hour']}. Ders",
            ParagraphStyle('GroupTitle', parent=styles['title'], fontSize=14,
                          textColor=colors.HexColor('#1a5276'),
                          backColor=colors.HexColor('#d4e6f1'),
                          borderPadding=8, spaceAfter=10)
        ))
        story.append(Spacer(1, 10))
        
        exams_text = " | ".join([f"<b>{e}</b>" for e in exam_group['exams']])
        story.append(Paragraph(f"Sınavlar: {exams_text}", styles['normal']))
        story.append(Spacer(1, 15))
        
        # İstatistikler
        class_stats = {}
        level_stats = {}
        
        for assignment in exam_group.get('mixed_students', []):
            student = assignment['student']
            class_name = student['sinif']
            level = student.get('duzey', class_name[0] if class_name else '')
            exam_name = assignment['exam_name']
            
            class_stats.setdefault(class_name, {}).setdefault(exam_name, 0)
            class_stats[class_name][exam_name] += 1
            
            level_key = f"{level}. Sınıf"
            level_stats.setdefault(level_key, {}).setdefault(exam_name, 0)
            level_stats[level_key][exam_name] += 1
        
        # Sınıf bazlı tablo
        story.append(Paragraph(
            "<b>SINIF BAZLI DAĞILIM</b>",
            ParagraphStyle('SubHead', parent=styles['heading'], fontSize=12,
                          textColor=colors.HexColor('#2e86c1'))
        ))
        story.append(Spacer(1, 5))
        
        table_data = [[
            Paragraph("<b>Sınıf</b>", styles['table_header']),
            Paragraph("<b>Düzey</b>", styles['table_header']),
            Paragraph("<b>Toplam</b>", styles['table_header'])
        ] + [Paragraph(f"<b>{exam}</b>", styles['table_header']) for exam in exam_group['exams']]]
        
        for class_name in sorted(class_stats.keys()):
            level = class_name[0] if class_name else ''
            toplam = sum(class_stats[class_name].values())
            row = [
                Paragraph(class_name, styles['normal']),
                Paragraph(str(level), styles['normal']),
                Paragraph(f"<b>{toplam}</b>", styles['normal'])
            ]
            for exam in exam_group['exams']:
                count = class_stats[class_name].get(exam, 0)
                if count > 0:
                    row.append(Paragraph(
                        f"<b>{count}</b>",
                        ParagraphStyle('CountStyle', parent=styles['normal'],
                                       textColor=colors.HexColor('#1a5276'))
                    ))
                else:
                    row.append(Paragraph("-", styles['normal']))
            table_data.append(row)
        
        total_row = [
            Paragraph("<b>TOPLAM</b>", styles['normal']),
            Paragraph("", styles['normal']),
            Paragraph(f"<b>{sum(sum(c.values()) for c in class_stats.values())}</b>", styles['normal'])
        ]
        for exam in exam_group['exams']:
            toplam = sum(c.get(exam, 0) for c in class_stats.values())
            total_row.append(Paragraph(f"<b>{toplam}</b>", styles['normal']))
        table_data.append(total_row)
        
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#85c1e9')),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.HexColor('#ebf5fb'), colors.HexColor('#d6eaf8')]),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#2e86c1')),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.whitesmoke),
        ]))
        story.append(table)
        story.append(Spacer(1, 20))
        
        # Düzey bazlı tablo
        story.append(Paragraph(
            "<b>DÜZEY BAZLI DAĞILIM</b>",
            ParagraphStyle('SubHead2', parent=styles['heading'], fontSize=12,
                          textColor=colors.HexColor('#2e86c1'))
        ))
        story.append(Spacer(1, 5))
        
        level_table = [[Paragraph("<b>Düzey</b>", styles['table_header'])] +
                       [Paragraph(f"<b>{exam}</b>", styles['table_header']) for exam in exam_group['exams']] +
                       [Paragraph("<b>Toplam</b>", styles['table_header'])]]
        
        for level in sorted(level_stats.keys()):
            row = [Paragraph(level, styles['normal'])]
            total = 0
            for exam in exam_group['exams']:
                count = level_stats[level].get(exam, 0)
                row.append(Paragraph(str(count) if count > 0 else "-", styles['normal']))
                total += count
            row.append(Paragraph(f"<b>{total}</b>", styles['normal']))
            level_table.append(row)
        
        level_tbl = Table(level_table, repeatRows=1)
        level_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#85c1e9')),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.HexColor('#ebf5fb'), colors.HexColor('#d6eaf8')]),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#2e86c1')),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.whitesmoke),
        ]))
        story.append(level_tbl)
        story.append(PageBreak())
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def create_teacher_pdf(exam_results):
    """Öğretmen PDF'i - Her sınav için kağıt dağıtım listesi"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=20, leftMargin=20, topMargin=30, bottomMargin=30
    )
    styles = get_turkish_styles()
    story = []
    
    # Kapak
    story.append(Spacer(1, 80))
    story.append(Paragraph("KELEBEK SINAV SİSTEMİ", ParagraphStyle(
        'TeacherCoverTitle', parent=styles['title'], fontSize=24,
        textColor=colors.HexColor('#1a5276'), alignment=1
    )))
    story.append(Paragraph("ÖĞRETMEN SINAV KAĞIDI DAĞITIM LİSTESİ", ParagraphStyle(
        'TeacherCoverSub', parent=styles['heading'], fontSize=14,
        textColor=colors.HexColor('#2e86c1'), alignment=1, spaceAfter=40
    )))
    story.append(Spacer(1, 80))
    story.append(Paragraph(
        f"Oluşturma Tarihi: {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        ParagraphStyle('TeacherDate', parent=styles['normal'], alignment=1, fontSize=10)
    ))
    story.append(PageBreak())
    
    # Sınavları topla ve salon-sınıf bazlı grupla
    exam_data = {}
    
    for exam_group in exam_results:
        exam_date = exam_group.get('date', '')
        exam_hour = exam_group.get('hour', '')
        
        for assignment in exam_group.get('mixed_students', []):
            exam_name = assignment.get('exam_name', '')
            room = assignment.get('room', '')
            student = assignment.get('student', {})
            sinif = student.get('sinif', '')
            duzey = ''.join([c for c in sinif if c.isdigit()]) or '?'
            
            if exam_name not in exam_data:
                exam_data[exam_name] = {'date': exam_date, 'hour': exam_hour, 'rooms': {}}
            
            exam_data[exam_name]['rooms'].setdefault(room, {}).setdefault(duzey, 0)
            exam_data[exam_name]['rooms'][room][duzey] += 1
    
    # Her sınav için sayfa
    for exam_name, data in sorted(exam_data.items()):
        story.append(Paragraph(
            f"{exam_name}",
            ParagraphStyle('ExamTitle', parent=styles['title'], fontSize=16,
                          textColor=colors.HexColor('#1a5276'), alignment=1,
                          backColor=colors.HexColor('#d4e6f1'),
                          borderPadding=8, spaceAfter=10)
        ))
        story.append(Paragraph(
            f"Tarih: {data['date']} | Saat: {data['hour']}. Ders",
            ParagraphStyle('ExamInfo', parent=styles['normal'], alignment=1, fontSize=11)
        ))
        story.append(Spacer(1, 15))
        
        # Tablo
        table_data = [[
            Paragraph("<b>Salon</b>", styles['table_header']),
            Paragraph("<b>Sınıf Düzeyi</b>", styles['table_header']),
            Paragraph("<b>Kağıt Sayısı</b>", styles['table_header'])
        ]]
        
        total_papers = 0
        
        for room in sorted(data['rooms'].keys()):
            duzeyler = data['rooms'][room]
            for duzey in sorted(duzeyler.keys()):
                count = duzeyler[duzey]
                table_data.append([
                    Paragraph(room, styles['normal']),
                    Paragraph(f"{duzey}. Sınıf", styles['normal']),
                    Paragraph(str(count), styles['normal'])
                ])
                total_papers += count
        
        table_data.append([
            Paragraph("<b>TOPLAM</b>", styles['normal']),
            Paragraph("", styles['normal']),
            Paragraph(f"<b>{total_papers}</b>", styles['normal'])
        ])
        
        table = Table(table_data, colWidths=[120, 150, 100])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#85c1e9')),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.HexColor('#ebf5fb'), colors.HexColor('#d6eaf8')]),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#2e86c1')),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.whitesmoke),
        ]))
        story.append(table)
        
        # Salon bazlı özet
        story.append(Spacer(1, 20))
        story.append(Paragraph(
            "<b>SALON BAZLI ÖZET</b>",
            ParagraphStyle('SubHeadT', parent=styles['heading'], fontSize=11,
                          textColor=colors.HexColor('#2e86c1'))
        ))
        story.append(Spacer(1, 5))
        
        room_items = []
        for room in sorted(data['rooms'].keys()):
            duzeyler = data['rooms'][room]
            duzey_text = ", ".join([f"{d}. sınıf: {count}" for d, count in sorted(duzeyler.items())])
            room_items.append(f"🏠 <b>{room}</b>: {duzey_text}")
        
        col1 = room_items[:len(room_items)//2 + len(room_items) % 2]
        col2 = room_items[len(room_items)//2 + len(room_items) % 2:]
        
        card_data = []
        max_len = max(len(col1), len(col2), 1)
        for i in range(max_len):
            row = []
            row.append(Paragraph(col1[i], styles['normal']) if i < len(col1) else Paragraph("", styles['normal']))
            row.append(Paragraph("", styles['normal']))
            row.append(Paragraph(col2[i], styles['normal']) if i < len(col2) else Paragraph("", styles['normal']))
            row.append(Paragraph("", styles['normal']))
            card_data.append(row)
        
        if card_data:
            card_table = Table(card_data, colWidths=[200, 20, 200, 20])
            card_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#ebf5fb')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#85c1e9')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ]))
            story.append(card_table)
        
        story.append(PageBreak())
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def create_visual_supervisor_pdf(exam_group):
    """Görsel gözetmen PDF - Her salon tek sayfada"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=30, bottomMargin=30, leftMargin=20, rightMargin=20
    )
    styles = get_turkish_styles()
    story = []
    
    # Salonlara göre grupla
    rooms = {}
    for assignment in exam_group.get('mixed_students', []):
        room = assignment.get('room', '')
        rooms.setdefault(room, []).append(assignment)
    
    for idx, (room_name, assignments) in enumerate(sorted(rooms.items())):
        if idx > 0:
            story.append(PageBreak())
        
        assignments.sort(key=lambda x: x.get('seat', 0))
        
        # Başlık
        story.append(Paragraph(f"SALON: {room_name}", ParagraphStyle(
            'SupTitle', parent=styles['title'], fontSize=18, alignment=1,
            textColor=colors.HexColor('#1a5276'), spaceAfter=8,
            backColor=colors.HexColor('#d4e6f1'), borderPadding=8
        )))
        
        story.append(Paragraph(
            f"Tarih: {exam_group.get('date', '')} | Ders: {exam_group.get('hour', '')}. Ders | "
            f"Toplam: {len(assignments)} öğrenci",
            ParagraphStyle('SupInfo', parent=styles['normal'], alignment=1,
                           fontSize=10, spaceAfter=15)
        ))
        
        # Çiftli mi kontrol et
        seats = sorted([a.get('seat', 0) for a in assignments])
        is_paired = False
        for i in range(0, len(seats) - 1, 2):
            if i + 1 < len(seats) and seats[i + 1] == seats[i] + 1:
                is_paired = True
            else:
                is_paired = False
                break
        
        if is_paired:
            # Çiftli sıra
            story.append(Paragraph(
                "<b>SIRA DÜZENİ (ÇİFTLİ MASA)</b>",
                ParagraphStyle('Sub', parent=styles['heading'], fontSize=11, spaceAfter=8)
            ))
            
            paired_groups = []
            current_pair = []
            for a in assignments:
                current_pair.append(a)
                if len(current_pair) == 2:
                    paired_groups.append(current_pair)
                    current_pair = []
            if current_pair:
                paired_groups.append(current_pair)
            
            for row_num, pair in enumerate(paired_groups, 1):
                row_data = [[Paragraph(
                    f"Sıra {row_num}",
                    ParagraphStyle('RowNum', parent=styles['normal'], fontSize=9)
                )]]
                for student in pair:
                    if student:
                        c = "👨" if student['student']['cinsiyet'] == 'Erkek' else "👩"
                        text = (f"<b>{student.get('seat', '')}</b><br/>{c} "
                                f"{escape_html(student['student']['ad_soyad'][:12])}"
                                f"<br/><font size='8'>{student['student']['sinif']}</font>")
                    else:
                        text = "BOŞ"
                    row_data[0].append(Paragraph(text, styles['normal']))
                
                while len(row_data[0]) < 3:
                    row_data[0].append(Paragraph(" ", styles['normal']))
                
                table = Table(row_data, colWidths=[45, 100, 100])
                table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (1, 0), (-1, -1), 0.5, colors.grey),
                    ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#2e86c1')),
                    ('TEXTCOLOR', (0, 0), (0, 0), colors.white),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(table)
                story.append(Spacer(1, 6))
        
        else:
            # Tekli sıra
            story.append(Paragraph(
                "<b>SIRA DÜZENİ (TEKLİ MASA)</b>",
                ParagraphStyle('Sub', parent=styles['heading'], fontSize=11, spaceAfter=8)
            ))
            
            row_groups = []
            current_row = []
            for a in assignments:
                current_row.append(a)
                if len(current_row) == 4:
                    row_groups.append(current_row)
                    current_row = []
            if current_row:
                row_groups.append(current_row)
            
            for row_num, row_students in enumerate(row_groups, 1):
                row_data = [[Paragraph(
                    f"Sıra {row_num}",
                    ParagraphStyle('RowNum', parent=styles['normal'], fontSize=9)
                )]]
                for i in range(4):
                    if i < len(row_students):
                        s = row_students[i]
                        c = "👨" if s['student']['cinsiyet'] == 'Erkek' else "👩"
                        text = (f"<b>{s.get('seat', '')}</b><br/>{c} "
                                f"{escape_html(s['student']['ad_soyad'][:12])}"
                                f"<br/><font size='8'>{s['student']['sinif']}</font>")
                    else:
                        text = "BOŞ"
                    row_data[0].append(Paragraph(text, styles['normal']))
                
                table = Table(row_data, colWidths=[45, 70, 70, 70, 70])
                table.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (1, 0), (-1, -1), 0.5, colors.grey),
                    ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#2e86c1')),
                    ('TEXTCOLOR', (0, 0), (0, 0), colors.white),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(table)
                story.append(Spacer(1, 6))
        
        story.append(Spacer(1, 20))
        story.append(Paragraph(
            "Öğretmen İmza: ____________________",
            ParagraphStyle('Sig', parent=styles['normal'], alignment=1, fontSize=9)
        ))
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def create_room_pdf(exam_results):
    """Salon bazlı PDF - Her salon tek sayfada"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=30, bottomMargin=30, leftMargin=20, rightMargin=20
    )
    styles = get_turkish_styles()
    story = []
    
    # Kapak
    story.append(Spacer(1, 50))
    story.append(Paragraph("KELEBEK SINAV SİSTEMİ", ParagraphStyle(
        'Cover1', parent=styles['title'], fontSize=22, alignment=1,
        textColor=colors.HexColor('#1a5276')
    )))
    story.append(Paragraph("SALON BAZLI OTURMA PLANI", ParagraphStyle(
        'Cover2', parent=styles['heading'], fontSize=16, alignment=1,
        textColor=colors.HexColor('#2e86c1'), spaceAfter=20
    )))
    story.append(Paragraph(
        f"{datetime.now().strftime('%d.%m.%Y')}",
        ParagraphStyle('Cover3', parent=styles['normal'], alignment=1, fontSize=10)
    ))
    story.append(PageBreak())
    
    # Tüm salonları topla
    all_rooms = {}
    for exam_group in exam_results:
        for assignment in exam_group.get('mixed_students', []):
            room_name = assignment.get('room', '')
            if not room_name:
                continue
            if room_name not in all_rooms:
                all_rooms[room_name] = {
                    'students': [],
                    'date': exam_group.get('date', ''),
                    'hour': exam_group.get('hour', ''),
                    'exams': set()
                }
            all_rooms[room_name]['students'].append(assignment)
            all_rooms[room_name]['exams'].add(assignment.get('exam_name', ''))
    
    for idx, room_name in enumerate(sorted(all_rooms.keys())):
        if idx > 0:
            story.append(PageBreak())
        
        room_data = all_rooms[room_name]
        students = room_data['students']
        students.sort(key=lambda x: x.get('seat', 0))
        
        # Başlık
        story.append(Paragraph(f"SALON: {room_name}", ParagraphStyle(
            'RoomTitle1', parent=styles['title'], fontSize=18, alignment=1,
            textColor=colors.HexColor('#1a5276'), spaceAfter=8,
            backColor=colors.HexColor('#d4e6f1'), borderPadding=8
        )))
        
        exam_names = ', '.join(room_data['exams'])
        story.append(Paragraph(
            f"Tarih: {room_data['date']} | Ders: {room_data['hour']}. Ders | "
            f"Sınav: {exam_names} | Öğrenci: {len(students)}",
            ParagraphStyle('RoomInfo1', parent=styles['normal'], alignment=1,
                           fontSize=10, spaceAfter=15)
        ))
        
        # Çiftli mi kontrol
        seats = sorted([s.get('seat', 0) for s in students])
        is_paired = False
        for i in range(0, len(seats) - 1, 2):
            if i + 1 < len(seats) and seats[i + 1] == seats[i] + 1:
                is_paired = True
            else:
                is_paired = False
                break
        
        if is_paired:
            story.append(Paragraph(
                "<b>📌 ÇİFTLİ MASA DÜZENİ</b>",
                ParagraphStyle('Sub1', parent=styles['heading'], fontSize=11, spaceAfter=8)
            ))
            paired_groups = []
            current = []
            for s in students:
                current.append(s)
                if len(current) == 2:
                    paired_groups.append(current)
                    current = []
            if current:
                paired_groups.append(current)
            
            for row_num, pair in enumerate(paired_groups, 1):
                row = [Paragraph(
                    f"Sıra {row_num}",
                    ParagraphStyle('RN', parent=styles['normal'], fontSize=9)
                )]
                for s in pair:
                    if s:
                        c = "👨" if s['student']['cinsiyet'] == 'Erkek' else "👩"
                        text = (f"<b>{s.get('seat', '')}</b><br/>{c} "
                                f"{escape_html(s['student']['ad_soyad'][:12])}"
                                f"<br/><font size='8'>{s['student']['sinif']}</font>")
                    else:
                        text = "BOŞ"
                    row.append(Paragraph(text, styles['normal']))
                while len(row) < 3:
                    row.append(Paragraph(" ", styles['normal']))
                
                t = Table([row], colWidths=[45, 100, 100])
                t.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (1, 0), (-1, -1), 0.5, colors.grey),
                    ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#2e86c1')),
                    ('TEXTCOLOR', (0, 0), (0, 0), colors.white),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(t)
                story.append(Spacer(1, 6))
        else:
            story.append(Paragraph(
                "<b>📌 TEKLİ MASA DÜZENİ</b>",
                ParagraphStyle('Sub1', parent=styles['heading'], fontSize=11, spaceAfter=8)
            ))
            row_groups = []
            current = []
            for s in students:
                current.append(s)
                if len(current) == 4:
                    row_groups.append(current)
                    current = []
            if current:
                row_groups.append(current)
            
            for row_num, row_students in enumerate(row_groups, 1):
                row = [Paragraph(
                    f"Sıra {row_num}",
                    ParagraphStyle('RN', parent=styles['normal'], fontSize=9)
                )]
                for i in range(4):
                    if i < len(row_students):
                        s = row_students[i]
                        c = "👨" if s['student']['cinsiyet'] == 'Erkek' else "👩"
                        text = (f"<b>{s.get('seat', '')}</b><br/>{c} "
                                f"{escape_html(s['student']['ad_soyad'][:12])}"
                                f"<br/><font size='8'>{s['student']['sinif']}</font>")
                    else:
                        text = "BOŞ"
                    row.append(Paragraph(text, styles['normal']))
                
                t = Table([row], colWidths=[45, 70, 70, 70, 70])
                t.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (1, 0), (-1, -1), 0.5, colors.grey),
                    ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#2e86c1')),
                    ('TEXTCOLOR', (0, 0), (0, 0), colors.white),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(t)
                story.append(Spacer(1, 6))
        
        # Özet
        erkek = len([s for s in students if s['student']['cinsiyet'] == 'Erkek'])
        kiz = len([s for s in students if s['student']['cinsiyet'] == 'Kız'])
        story.append(Spacer(1, 15))
        story.append(Paragraph(
            f"👨 Erkek: {erkek} &nbsp;&nbsp; 👩 Kız: {kiz}",
            ParagraphStyle('Sum', parent=styles['normal'], alignment=1, fontSize=9)
        ))
    
    doc.build(story)
    buffer.seek(0)
    return buffer


# ============= PDF RAPOR ENDPOINT'leri =============

@app.route('/api/report/student', methods=['POST'])
def generate_student_report():
    """Öğrenci PDF raporu"""
    data = request.json
    assignments = data.get('assignments', [])
    exam_groups = data.get('exam_groups', [])
    
    pdf_buffer = create_student_pdf(assignments, exam_groups)
    return send_file(
        pdf_buffer, mimetype='application/pdf',
        as_attachment=True, download_name='ogrenci_sinav_programi.pdf'
    )


@app.route('/api/report/admin', methods=['POST'])
def generate_admin_report():
    """İdareci PDF raporu"""
    data = request.json
    exam_results = data.get('exam_results', [])
    
    pdf_buffer = create_admin_pdf(exam_results)
    return send_file(
        pdf_buffer, mimetype='application/pdf',
        as_attachment=True, download_name='idareci_raporu.pdf'
    )


@app.route('/api/report/teacher', methods=['POST'])
def generate_teacher_report():
    """Öğretmen PDF raporu"""
    data = request.json
    exam_results = data.get('exam_results', [])
    
    pdf_buffer = create_teacher_pdf(exam_results)
    return send_file(
        pdf_buffer, mimetype='application/pdf',
        as_attachment=True, download_name='ogretmen_kagit_dagitim.pdf'
    )


@app.route('/api/report/supervisor', methods=['POST'])
def generate_supervisor_report():
    """Gözetmen PDF - Sıra düzeni görsel olarak"""
    data = request.json
    exam_group = data.get('exam_group', {})
    
    pdf_buffer = create_visual_supervisor_pdf(exam_group)
    return send_file(
        pdf_buffer, mimetype='application/pdf',
        as_attachment=True,
        download_name=f"gozetmen_raporu_{exam_group.get('date', '')}_{exam_group.get('hour', '')}.pdf"
    )


@app.route('/api/report/room', methods=['POST'])
def generate_room_report():
    """Salon bazlı PDF raporu"""
    data = request.json
    exam_results = data.get('exam_results', [])
    
    pdf_buffer = create_room_pdf(exam_results)
    return send_file(
        pdf_buffer, mimetype='application/pdf',
        as_attachment=True, download_name='salon_bazli_liste.pdf'
    )


# ============= PDF YÜKLEME VE YÖNETİM =============

@app.route('/api/exam/<int:id>/pdf', methods=['POST'])
def upload_exam_pdf(id):
    """Sınava PDF dosyası ekle (sınıf düzeyine göre)"""
    try:
        if 'pdf_file' not in request.files:
            return jsonify({'error': 'Dosya bulunamadı'}), 400
        
        file = request.files['pdf_file']
        level = request.form.get('level', '')
        
        if file.filename == '':
            return jsonify({'error': 'Dosya seçilmedi'}), 400
        
        if not file.filename.endswith('.pdf'):
            return jsonify({'error': 'Sadece PDF dosyaları yüklenebilir'}), 400
        
        pdf_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'exam_pdfs')
        os.makedirs(pdf_folder, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"exam_{id}_level_{level}_{timestamp}.pdf"
        filepath = os.path.join(pdf_folder, filename)
        file.save(filepath)
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT exam_pdf FROM exams WHERE id = ?", (id,))
        row = cursor.fetchone()
        
        exam_pdfs = {}
        if row and row[0]:
            try:
                exam_pdfs = json.loads(row[0])
            except Exception:
                exam_pdfs = {}
        
        # Eski PDF varsa sil
        if level in exam_pdfs:
            old_path = os.path.join(pdf_folder, exam_pdfs[level])
            if os.path.exists(old_path):
                os.remove(old_path)
        
        exam_pdfs[level] = filename
        
        cursor.execute("UPDATE exams SET exam_pdf = ? WHERE id = ?", (json.dumps(exam_pdfs), id))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'filename': filename, 'level': level})
        
    except Exception as e:
        print(f"PDF yükleme hatası: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/exam/<int:id>/pdfs', methods=['GET'])
def get_exam_pdfs(id):
    """Sınavın tüm PDF'lerini getir"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT exam_pdf FROM exams WHERE id = ?", (id,))
    row = cursor.fetchone()
    conn.close()
    
    if row and row[0]:
        try:
            return jsonify(json.loads(row[0]))
        except Exception:
            return jsonify({})
    return jsonify({})


@app.route('/api/exam/<int:id>/pdf/<level>', methods=['DELETE'])
def delete_exam_pdf_by_level(id, level):
    """Sınavın belirli düzeydeki PDF dosyasını sil"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT exam_pdf FROM exams WHERE id = ?", (id,))
    row = cursor.fetchone()
    
    if row and row[0]:
        try:
            exam_pdfs = json.loads(row[0])
            if level in exam_pdfs:
                pdf_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'exam_pdfs')
                pdf_path = os.path.join(pdf_folder, exam_pdfs[level])
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)
                del exam_pdfs[level]
                
                new_value = json.dumps(exam_pdfs) if exam_pdfs else None
                cursor.execute("UPDATE exams SET exam_pdf = ? WHERE id = ?", (new_value, id))
                conn.commit()
        except Exception as e:
            print(f"PDF silme hatası: {e}")
    
    conn.close()
    return jsonify({'success': True, 'message': f'{level}. sınıf PDF silindi'})


@app.route('/api/exam/<int:id>/pdf/<level>', methods=['GET'])
def get_exam_pdf_by_level(id, level):
    """Sınavın belirli düzeydeki PDF dosyasını getir"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT exam_pdf FROM exams WHERE id = ?", (id,))
    row = cursor.fetchone()
    conn.close()
    
    if row and row[0]:
        try:
            exam_pdfs = json.loads(row[0])
            if level in exam_pdfs:
                pdf_folder = os.path.join(app.config['UPLOAD_FOLDER'], 'exam_pdfs')
                pdf_path = os.path.join(pdf_folder, exam_pdfs[level])
                if os.path.exists(pdf_path):
                    return send_file(pdf_path, mimetype='application/pdf')
        except Exception as e:
            print(f"PDF getirme hatası: {e}")
    
    return jsonify({'error': 'PDF bulunamadı'}), 404


# ============= UYGULAMA BAŞLATMA =============

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)