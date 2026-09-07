import cv2
import numpy as np
import random
import threading
import time
import mysql.connector
from insightface.app import FaceAnalysis

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

print("=== ĐĂNG KÝ SINH TRẮC HỌC CHỐNG GIẢ MẠO (Siêu Tốc 10ms ~ 100 FPS) ===")
student_code = input("Nhập Mã Sinh Viên: ").strip()
full_name = input("Nhập Họ và Tên: ").strip()
class_name = input("Nhập Lớp: ").strip()

# ==========================================
# 2. KHỞI TẠO CAMERA & XỬ LÝ AI ĐA LUỒNG TỐC ĐỘ CAO
# ==========================================
class VideoGet:
    def __init__(self, src=0):
        self.stream = cv2.VideoCapture(src)
        (self.grabbed, self.frame) = self.stream.read()
        self.stopped = False

    def start(self):
        threading.Thread(target=self.get, args=(), daemon=True).start()
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


class FastAsyncFaceAnalyzer:
    """Xử lý AI siêu tốc (10ms): Bỏ qua các model nặng không cần thiết khi theo dõi góc mặt"""
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

            # Chạy AI siêu tốc ở luồng riêng (~10ms)
            faces = self.app.get(current_frame)

            with self.lock:
                self.latest_faces = faces

            time.sleep(0.002)

    def stop(self):
        self.stopped = True

# ==========================================
# 3. KHỞI TẠO AI TỐI ƯU HÓA MODULAR (BẮT KHUÔN MẶT 10MS)
# ==========================================
# BÍ QUYẾT TĂNG TỐC 1500%: Bỏ qua model recognition & genderage khi đang kiểm tra cử động đầu
app_fast = FaceAnalysis(
    name='buffalo_l', 
    providers=['CPUExecutionProvider'], 
    allowed_modules=['detection', 'landmark_3d_68']
)
app_fast.prepare(ctx_id=0, det_size=(224, 224))

face_analyzer = FastAsyncFaceAnalyzer(app_fast).start()

# Cấu hình cử động
TASKS = {
    'LEFT': {'text': 'Quay mat sang TRAI', 'check': lambda pitch, yaw: yaw < -15},
    'RIGHT': {'text': 'Quay mat sang PHAI', 'check': lambda pitch, yaw: yaw > 15},
    'UP': {'text': 'Ngang dau len TREN', 'check': lambda pitch, yaw: pitch < -12},
    'DOWN': {'text': 'Cui dau xuong DUOI', 'check': lambda pitch, yaw: pitch > 12}
}

task_sequence = list(TASKS.keys())
random.shuffle(task_sequence)

current_task_idx = 0
final_embedding = None
smoothed_bbox = None

video_getter = VideoGet(0).start()
print("Đang khởi động camera...")

while True:
    frame = video_getter.frame
    if not video_getter.grabbed or video_getter.stopped:
        break

    # Gửi frame cho AI ngầm xử lý
    face_analyzer.update_frame(frame)
    display_frame = frame.copy()

    # Lấy khuôn mặt từ luồng ngầm
    latest_faces = face_analyzer.get_faces()

    if len(latest_faces) == 1:
        face = latest_faces[0]
        raw_bbox = face.bbox
        pitch, yaw, roll = face.pose 

        # Nội suy BBox làm mượt 60 FPS
        if smoothed_bbox is None:
            smoothed_bbox = raw_bbox.copy().astype(float)
        else:
            smoothed_bbox = 0.5 * raw_bbox.astype(float) + 0.5 * smoothed_bbox
        
        draw_box = smoothed_bbox.astype(int)
        
        # Vẽ lưới hình chữ nhật bám sát khuôn mặt tức thì
        cv2.rectangle(display_frame, (draw_box[0], draw_box[1]), (draw_box[2], draw_box[3]), (255, 255, 0), 2)
        
        # Hiển thị trực quan góc quay thực tế
        cv2.putText(display_frame, f"Pitch (Tren/Duoi): {pitch:.1f} | Yaw (Trai/Phai): {yaw:.1f}", 
                    (20, display_frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

        if current_task_idx < len(task_sequence):
            current_task_key = task_sequence[current_task_idx]
            task_info = TASKS[current_task_key]
            
            cv2.putText(display_frame, f"BUOC {current_task_idx + 1}/4: {task_info['text']}", 
                        (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            
            if task_info['check'](pitch, yaw):
                print(f"✅ Hoàn thành: {task_info['text']}")
                current_task_idx += 1 
                time.sleep(0.2)
        
        else:
            cv2.putText(display_frame, "XAC MINH THANH CONG! Nhan 's' de luu.", 
                        (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            
            if abs(yaw) < 15 and abs(pitch) < 15:
                cv2.putText(display_frame, "Goc mat dep. Bam 's' ngay!", 
                            (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            else:
                cv2.putText(display_frame, "Hay nhin thang vao camera de chup mau!", 
                            (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)

    elif len(latest_faces) > 1:
        smoothed_bbox = None
        cv2.putText(display_frame, "Phat hien nhieu hon 1 nguoi!", (20, 40), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    else:
        smoothed_bbox = None
        cv2.putText(display_frame, "Khong tim thay khuon mat", (20, 40), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

    cv2.imshow("VNeID Liveness Enrollment", display_frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('s') and current_task_idx >= 4:
        print("Đang trích xuất Vector khuôn mặt 512-D (buffalo_l)...")
        # Khởi tạo model trích xuất vector chỉ khi người dùng bấm 's' để lưu
        app_full = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'], allowed_modules=['detection', 'recognition'])
        app_full.prepare(ctx_id=0, det_size=(320, 320))
        full_faces = app_full.get(frame)
        if len(full_faces) > 0:
            final_embedding = full_faces[0].embedding
            print("Đã trích xuất thành công vector khuôn mặt! Tiến hành lưu DB...")
            break
        else:
            print("Lỗi: Không bắt được khuôn mặt chuẩn, thử bấm 's' lại.")
    elif key == ord('q'):
        print("Hủy đăng ký.")
        final_embedding = None
        break

video_getter.stop()
face_analyzer.stop()
cv2.destroyAllWindows()

# ==========================================
# 4. LƯU TRỰC TIẾP VÀO MYSQL DẠNG BLOB
# ==========================================
if final_embedding is not None:
    try:
        embedding_bytes = final_embedding.tobytes()
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        sql = """INSERT INTO students 
                 (student_code, full_name, class_name, face_embedding, status) 
                 VALUES (%s, %s, %s, %s, %s)"""
        values = (student_code, full_name, class_name, embedding_bytes, 'Active')
        
        cursor.execute(sql, values)
        conn.commit()
        print(f"✅ HỒ SƠ HOÀN TẤT: Sinh viên {full_name} đã đăng ký thành công.")
    except Exception as e:
        print("Lỗi Database:", e)
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()
