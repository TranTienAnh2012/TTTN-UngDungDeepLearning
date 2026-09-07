import cv2
import threading
import time
import json
import sys
import numpy as np
import mysql.connector
from insightface.app import FaceAnalysis

sys.stdout.reconfigure(encoding='utf-8')

import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--schedule-id', type=int, default=1)
args, unknown = parser.parse_known_args()
target_schedule_id = args.schedule_id

# ==========================================
# 1. CẤU HÌNH CƠ SỞ DỮ LIỆU
# ==========================================
DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': '',
    'database': 'face_attendance_db',
    'port': 3309
}

# ==========================================
# 2. TẢI DỮ LIỆU BLOB TỪ MYSQL LÊN RAM
# ==========================================
known_embeddings_dict = {}
known_names_dict = {}

print("Đang kết nối Database và tải dữ liệu sinh trắc...")
try:
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("SELECT student_code, full_name, face_embedding FROM students WHERE face_embedding IS NOT NULL")
    
    for row in cursor.fetchall():
        sid = row['student_code']
        blob_data = row['face_embedding']
        
        # BÍ QUYẾT: Đọc linh hoạt cả dạng JSON String lẫn Raw Binary Bytes
        try:
            if isinstance(blob_data, (bytes, bytearray)):
                if len(blob_data) == 2048 and len(blob_data) % 4 == 0:
                    embedding_array = np.frombuffer(blob_data, dtype=np.float32)
                else:
                    embedding_array = np.array(json.loads(blob_data.decode('utf-8')), dtype=np.float32)
            elif isinstance(blob_data, str):
                embedding_array = np.array(json.loads(blob_data), dtype=np.float32)
            else:
                continue

            if len(embedding_array) == 512:
                known_embeddings_dict[sid] = embedding_array
                known_names_dict[sid] = row['full_name']
        except Exception as err:
            print(f"Bỏ qua hồ sơ {sid} do lỗi định dạng vector: {err}")
            
    cursor.close()
except Exception as e:
    print(f"Lỗi tải dữ liệu: {e}")
    exit()

print(f"Đã tải thành công {len(known_embeddings_dict)} hồ sơ khuôn mặt từ Database!")

# Gom dữ liệu thành Matrix 2D để nhân Ma Trận tìm kiếm siêu tốc
student_id_list = list(known_embeddings_dict.keys())
if student_id_list:
    embeddings_matrix = np.array([known_embeddings_dict[sid] for sid in student_id_list])
    norms = np.linalg.norm(embeddings_matrix, axis=1, keepdims=True)
    embeddings_matrix_norm = embeddings_matrix / np.maximum(norms, 1e-10)
else:
    embeddings_matrix_norm = None

# ==========================================
# 3. KHỞI TẠO CAMERA & XỬ LÝ AI ĐA LUỒNG TỐC ĐỘ CAO
# ==========================================
class VideoGet:
    def __init__(self, src=0):
        # Ưu tiên DirectShow trên Windows
        self.stream = cv2.VideoCapture(src, cv2.CAP_DSHOW)
        if not self.stream.isOpened():
            self.stream = cv2.VideoCapture(src, cv2.CAP_ANY)

        self.stream.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.stream.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        # Warm up camera exposure để tránh khung hình bị đen
        self.grabbed = False
        self.frame = None
        for _ in range(25):
            grabbed, frame = self.stream.read()
            if grabbed and frame is not None:
                self.grabbed = grabbed
                self.frame = frame
                if np.mean(frame) > 1.0:
                    break
            time.sleep(0.05)

        self.stopped = False

    def start(self):
        threading.Thread(target=self.get, args=(), daemon=True).start()
        return self

    def get(self):
        while not self.stopped:
            if not self.stream.isOpened():
                time.sleep(0.05)
                continue
            grabbed, frame = self.stream.read()
            if grabbed and frame is not None:
                self.grabbed = grabbed
                self.frame = frame
            else:
                time.sleep(0.01)

    def stop(self):
        self.stopped = True
        try:
            self.stream.release()
        except Exception:
            pass


class FastAsyncFaceAnalyzer:
    """Xử lý ngầm tốc độ cao (15ms) giúp BBox bắt dính mặt tức thì"""
    def __init__(self, app):
        self.app = app
        self.frame = None
        self.latest_faces = []
        self.stopped = False
        self.lock = threading.Lock()

    def start(self):
        threading.Thread(target=self._run, args=(), daemon=True).start()
        return self

    def update_frame(self, frame):
        with self.lock:
            self.frame = frame.copy()

    def get_faces(self):
        with self.lock:
            return self.latest_faces

    def _run(self):
        while not self.stopped:
            if self.frame is None:
                time.sleep(0.002)
                continue

            with self.lock:
                current_frame = self.frame.copy()

            faces = self.app.get(current_frame)

            with self.lock:
                self.latest_faces = faces

            time.sleep(0.002)

    def stop(self):
        self.stopped = True

# TỐI ƯU SIÊU TỐC: Chỉ bật 2 model cần thiết (detection + recognition), bỏ qua landmark 2D/3D & genderage
app = FaceAnalysis(
    name='buffalo_l', 
    providers=['CPUExecutionProvider'], 
    allowed_modules=['detection', 'recognition']
)
app.prepare(ctx_id=0, det_size=(256, 256))

video_getter = VideoGet(0).start()
face_analyzer = FastAsyncFaceAnalyzer(app).start()

# ==========================================
# 4. LOGIC NHẬN DIỆN & BỎ PHIẾU
# ==========================================
VOTE_THRESHOLD = 15      
SIMILARITY_THRESHOLD = 0.45  
attendance_votes = {}   
marked_present = set()  
smoothed_bboxes = {} 

success_time = None
closing_in_progress = False

print("Đang mở camera... Sẵn sàng điểm danh!")

while True:
    frame = video_getter.frame
    if frame is None:
        time.sleep(0.01)
        continue
    if video_getter.stopped:
        break

    # Gửi frame cho AI ngầm xử lý
    face_analyzer.update_frame(frame)
    display_frame = frame.copy()

    # Lấy khuôn mặt từ luồng ngầm
    faces = face_analyzer.get_faces()

    for idx, face in enumerate(faces):
        raw_bbox = face.bbox
        current_embedding = face.embedding
        
        # Làm mượt Bounding Box
        if idx not in smoothed_bboxes:
            smoothed_bboxes[idx] = raw_bbox.copy().astype(float)
        else:
            smoothed_bboxes[idx] = 0.5 * raw_bbox.astype(float) + 0.5 * smoothed_bboxes[idx]
            
        bbox = smoothed_bboxes[idx].astype(int)
        
        best_match_id = "Unknown"
        best_score = -1.0

        if embeddings_matrix_norm is not None and len(student_id_list) > 0:
            curr_norm = current_embedding / np.maximum(np.linalg.norm(current_embedding), 1e-10)
            similarities = np.dot(embeddings_matrix_norm, curr_norm)
            best_idx = int(np.argmax(similarities))
            best_score = float(similarities[best_idx])
            if best_score >= SIMILARITY_THRESHOLD:
                best_match_id = student_id_list[best_idx]

        if best_match_id != "Unknown":
            student_id = best_match_id
            student_name = known_names_dict[student_id]
            
            if student_id not in marked_present:
                attendance_votes[student_id] = attendance_votes.get(student_id, 0) + 1
                current_votes = attendance_votes[student_id]
                
                if current_votes >= VOTE_THRESHOLD:
                    marked_present.add(student_id)
                    
                    try:
                        cursor = conn.cursor()
                        cursor.execute("""
                            INSERT INTO class_attendance (schedule_id, student_id, check_in_time, status, confidence_score) 
                            VALUES (
                                %s,
                                (SELECT id FROM students WHERE student_code = %s), 
                                NOW(), 
                                'PRESENT', 
                                %s
                            )
                        """, (target_schedule_id, student_id, float(best_score)))
                        conn.commit()
                        cursor.close()
                        print(f"✅ ĐÃ ĐIỂM DANH: {student_name} ({student_id}) - Độ chính xác: {best_score:.2f}")
                        if not closing_in_progress:
                            success_time = time.time()
                            closing_in_progress = True
                    except Exception as e:
                        print("Lỗi lưu nhật ký:", e)

            if student_id in marked_present:
                color = (0, 255, 0) 
                status_text = f"{student_id} - {student_name} - DONE"
            else:
                color = (0, 255, 255) 
                status_text = f"{student_name} - Voting: {attendance_votes.get(student_id, 0)}/{VOTE_THRESHOLD}"
        
        else:
            color = (0, 0, 255) 
            status_text = f"Unknown ({best_score:.2f})"

        cv2.rectangle(display_frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 2)
        cv2.putText(display_frame, status_text, (bbox[0], bbox[1] - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    if closing_in_progress and success_time is not None:
        elapsed = time.time() - success_time
        remaining = max(0, int(5 - elapsed))
        cv2.putText(display_frame, f"Thanh cong! Tu dong dong sau {remaining}s...", (20, 40), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        if elapsed >= 5.0:
            print("Đã hết 5 giây, tự động đóng camera.")
            break

    cv2.imshow('He Thong Nhan Dien Diem Danh', display_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

video_getter.stop()
face_analyzer.stop()
cv2.destroyAllWindows()
if conn.is_connected():
    conn.close()
