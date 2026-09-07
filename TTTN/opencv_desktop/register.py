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
parser.add_argument('--student-code', type=str, required=True, help="Ma SV can dang ky khuon mat")
args, unknown = parser.parse_known_args()
target_student_code = args.student_code

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

print(f"Đang khởi động Camera để đăng ký khuôn mặt cho SV: {target_student_code}")

# ==========================================
# KHỞI TẠO CAMERA & XỬ LÝ AI ĐA LUỒNG TỐC ĐỘ CAO
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

# TỐI ƯU SIÊU TỐC: Chỉ bật 2 model cần thiết (detection + recognition)
app = FaceAnalysis(
    name='buffalo_l', 
    providers=['CPUExecutionProvider'], 
    allowed_modules=['detection', 'recognition']
)
app.prepare(ctx_id=0, det_size=(256, 256))

video_getter = VideoGet(0).start()
face_analyzer = FastAsyncFaceAnalyzer(app).start()

smoothed_bboxes = {} 

print("=====================================================")
print(f" HUONG DAN DANG KY KHUON MAT CHO SV {target_student_code}")
print(" 1. Nhin thang vao Camera")
print(" 2. Đảm bảo khuôn mặt nằm trong khung màu xanh")
print(" 3. Nhấn phím 'S' để LUU va HOAN TAT dang ky")
print(" 4. Nhấn phím 'Q' để HỦY (Thoat)")
print("=====================================================")

try:
    conn = mysql.connector.connect(**DB_CONFIG)
except Exception as e:
    print(f"Lỗi kết nối CSDL: {e}")
    sys.exit(1)

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
    
    largest_face = None
    max_area = 0
    
    # Tìm khuôn mặt lớn nhất (tránh người đứng sau)
    for face in faces:
        bbox = face.bbox.astype(int)
        area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        if area > max_area:
            max_area = area
            largest_face = face

    if largest_face is not None:
        raw_bbox = largest_face.bbox
        
        # Làm mượt Bounding Box
        if 0 not in smoothed_bboxes:
            smoothed_bboxes[0] = raw_bbox.copy().astype(float)
        else:
            smoothed_bboxes[0] = 0.5 * raw_bbox.astype(float) + 0.5 * smoothed_bboxes[0]
            
        bbox = smoothed_bboxes[0].astype(int)
        
        # Vẽ khung xanh chỉ dẫn
        cv2.rectangle(display_frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (255, 255, 0), 2)
        cv2.putText(display_frame, f"Nhan 'S' de LUU - SV: {target_student_code}", (bbox[0], bbox[1] - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

    cv2.imshow('He Thong Dang Ky Khuon Mat', display_frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        print("Đã hủy đăng ký.")
        break
    elif key == ord('s') or key == ord('S'):
        if largest_face is not None:
            embedding = largest_face.embedding
            # Chuẩn hóa vector thành list để lưu dạng JSON String
            embedding_list = embedding.tolist()
            embedding_json = json.dumps(embedding_list)
            
            try:
                cursor = conn.cursor()
                # Cập nhật vào DB
                cursor.execute("""
                    UPDATE students 
                    SET face_embedding = %s 
                    WHERE student_code = %s
                """, (embedding_json, target_student_code))
                conn.commit()
                
                if cursor.rowcount > 0:
                    print(f"✅ ĐÃ ĐĂNG KÝ KHUÔN MẶT THÀNH CÔNG CHO SV {target_student_code}!")
                    cv2.putText(display_frame, "DANG KY THANH CONG! Dang dong...", (50, 50), 
                                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
                    cv2.imshow('He Thong Dang Ky Khuon Mat', display_frame)
                    cv2.waitKey(2000) # Đợi 2s để người dùng thấy thông báo
                else:
                    print(f"❌ LỖI: Không tìm thấy sinh viên có mã {target_student_code} trong CSDL!")
                    
                cursor.close()
            except Exception as e:
                print(f"Lỗi khi lưu vào CSDL: {e}")
            break
        else:
            print("Không tìm thấy khuôn mặt nào! Hãy nhìn thẳng vào camera.")

video_getter.stop()
face_analyzer.stop()
cv2.destroyAllWindows()
if conn.is_connected():
    conn.close()
