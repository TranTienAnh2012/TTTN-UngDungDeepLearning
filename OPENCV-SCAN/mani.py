import cv2
import threading
import numpy as np
import os
import mysql.connector
from insightface.app import FaceAnalysis

# ==========================================
# 1. CẤU HÌNH CƠ SỞ DỮ LIỆU
# ==========================================
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'tienanh2005',
    'database': 'face_attendance_db'
}

# ==========================================
# 2. TẢI DỮ LIỆU TỪ MYSQL LÊN RAM
# ==========================================
known_embeddings = {}
known_names = {}

print("Đang kết nối Database và tải dữ liệu sinh trắc...")
try:
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT student_id, full_name, embedding_path FROM students")
    
    for row in cursor.fetchall():
        sid = row['student_id']
        path = row['embedding_path']
        # Kiểm tra xem file .npy có thực sự tồn tại trên ổ cứng không
        if os.path.exists(path):
            known_embeddings[sid] = np.load(path)
            known_names[sid] = row['full_name']
            
    cursor.close()
except Exception as e:
    print(f"Lỗi tải dữ liệu: {e}")
    exit()

print(f"Đã tải thành công {len(known_embeddings)} hồ sơ khuôn mặt!")

# Hàm tính độ tương đồng (Cosine Similarity)
def compute_similarity(emb1, emb2):
    return np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))

# ==========================================
# 3. KHỞI TẠO CAMERA & AI
# ==========================================
class VideoGet:
    def __init__(self, src=0):
        self.stream = cv2.VideoCapture(src)
        (self.grabbed, self.frame) = self.stream.read()
        self.stopped = False
    def start(self):
        threading.Thread(target=self.get, args=()).start()
        return self
    def get(self):
        while not self.stopped:
            if not self.grabbed:
                self.stop()
            else:
                (self.grabbed, self.frame) = self.stream.read()
    def stop(self):
        self.stopped = True
        self.stream.release()

app = FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

video_getter = VideoGet(0).start()

# ==========================================
# 4. LOGIC NHẬN DIỆN & BỎ PHIẾU
# ==========================================
VOTE_THRESHOLD = 15      
SIMILARITY_THRESHOLD = 0.45  # Ngưỡng chấp nhận (Từ 0.4 -> 0.6). Càng cao càng khắt khe.
attendance_votes = {}   
marked_present = set()  

print("Đang mở camera... Sẵn sàng điểm danh!")

while True:
    frame = video_getter.frame
    if not video_getter.grabbed or video_getter.stopped:
        break

    faces = app.get(frame)

    for face in faces:
        bbox = face.bbox.astype(int)
        current_embedding = face.embedding
        
        # TIẾN HÀNH SO SÁNH VỚI DATABASE TRÊN RAM
        best_match_id = "Unknown"
        best_score = -1
        
        for sid, saved_emb in known_embeddings.items():
            score = compute_similarity(current_embedding, saved_emb)
            if score > best_score:
                best_score = score
                best_match_id = sid

        # Kiểm tra xem điểm số có vượt qua ngưỡng an toàn không
        if best_score >= SIMILARITY_THRESHOLD:
            student_id = best_match_id
            student_name = known_names[student_id]
            
            # LOGIC BỎ PHIẾU
            if student_id not in marked_present:
                attendance_votes[student_id] = attendance_votes.get(student_id, 0) + 1
                current_votes = attendance_votes[student_id]
                
                if current_votes >= VOTE_THRESHOLD:
                    marked_present.add(student_id)
                    
                    # GHI LỊCH SỬ VÀO DATABASE
                    try:
                        cursor = conn.cursor()
                        cursor.execute("INSERT INTO attendance_logs (student_id) VALUES (%s)", (student_id,))
                        conn.commit()
                        cursor.close()
                        print(f"✅ ĐÃ ĐIỂM DANH: {student_name} ({student_id}) - Độ chính xác: {best_score:.2f}")
                    except Exception as e:
                        print("Lỗi lưu nhật ký:", e)

            # HIỂN THỊ GIAO DIỆN KHI NHẬN RA NGƯỜI
            if student_id in marked_present:
                color = (0, 255, 0) # Xanh lá
                status_text = f"{student_id} - {student_name} - DONE"
            else:
                color = (0, 255, 255) # Vàng chờ đợi
                status_text = f"{student_name} - Voting: {attendance_votes.get(student_id, 0)}/{VOTE_THRESHOLD}"
        
        else:
            # NẾU LÀ NGƯỜI LẠ
            color = (0, 0, 255) # Đỏ
            status_text = f"Unknown ({best_score:.2f})"

        # Vẽ khung
        cv2.rectangle(frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), color, 2)
        cv2.putText(frame, status_text, (bbox[0], bbox[1] - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    cv2.imshow('He Thong Nhan Dien Diem Danh', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Dọn dẹp
video_getter.stop()
cv2.destroyAllWindows()
if conn.is_connected():
    conn.close()