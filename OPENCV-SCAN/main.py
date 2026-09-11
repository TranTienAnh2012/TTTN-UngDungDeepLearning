import cv2
import threading
import time
import json
import os
import sys
import argparse
import base64
import requests
import numpy as np
import mysql.connector
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from insightface.app import FaceAnalysis

sys.stdout.reconfigure(encoding='utf-8')

# ==========================================
# 1. CẤU HÌNH THAM SỐ VÀ CƠ SỞ DỮ LIỆU
# ==========================================
DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': '123456',
    'database': 'face_attendance_db',
    'port': 3306
}

parser = argparse.ArgumentParser(description="Nhận diện và Điểm danh Real-time qua OpenCV")
parser.add_argument('--schedule-id', type=int, default=None, help="ID ca học cần điểm danh")
parser.add_argument('--exam-schedule-id', type=int, default=None, help="ID ca thi cần xác thực")
parser.add_argument('--headless', action='store_true', help="Chạy chế độ ngầm Web Stream (không mở popup cv2.imshow)")
parser.add_argument('--stream-url', type=str, default='http://127.0.0.1:8080', help="Địa chỉ Spring Boot Server để đẩy STOMP stream")
args, _ = parser.parse_known_args()

target_schedule_id = args.schedule_id
target_exam_schedule_id = args.exam_schedule_id
is_headless = args.headless
stream_base_url = args.stream_url.rstrip('/')

# ==========================================
# 2. KHỞI TẠO FONT TIẾNG VIỆT UNICODE (PILLOW)
# ==========================================
FONT_CANDIDATES = [
    ("C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/segoeui.ttf"),
    ("C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf"),
    ("C:/Windows/Fonts/tahomabd.ttf", "C:/Windows/Fonts/tahoma.ttf"),
]

def init_vietnamese_fonts():
    for bold_p, reg_p in FONT_CANDIDATES:
        if os.path.exists(bold_p) and os.path.exists(reg_p):
            try:
                f_title = ImageFont.truetype(bold_p, 14)
                f_sub = ImageFont.truetype(reg_p, 12)
                return f_title, f_sub
            except Exception:
                pass
    default_f = ImageFont.load_default()
    return default_f, default_f

FONT_TITLE, FONT_SUB = init_vietnamese_fonts()

# ==========================================
# 3. HÀM VẼ 4 GÓC MẶT (CORNER BRACKETS) & HUD TIẾNG VIỆT
# ==========================================
def draw_corner_hud(img, bbox, color_bgr, corner_len_ratio=0.22, thickness=3):
    """Vẽ 4 góc bo (corner brackets) quanh khuôn mặt thay vì vẽ cả hình chữ nhật đóng kín"""
    x1, y1, x2, y2 = bbox
    w = max(1, x2 - x1)
    h = max(1, y2 - y1)
    
    corner_len = max(14, min(int(w * corner_len_ratio), int(h * corner_len_ratio), 30))
    
    # Góc Trên - Trái (Top-Left)
    cv2.line(img, (x1, y1), (x1 + corner_len, y1), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y1), (x1, y1 + corner_len), color_bgr, thickness, cv2.LINE_AA)
    
    # Góc Trên - Phải (Top-Right)
    cv2.line(img, (x2, y1), (x2 - corner_len, y1), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y1), (x2, y1 + corner_len), color_bgr, thickness, cv2.LINE_AA)
    
    # Góc Dưới - Trái (Bottom-Left)
    cv2.line(img, (x1, y2), (x1 + corner_len, y2), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y2), (x1, y2 - corner_len), color_bgr, thickness, cv2.LINE_AA)
    
    # Góc Dưới - Phải (Bottom-Right)
    cv2.line(img, (x2, y2), (x2 - corner_len, y2), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y2), (x2, y2 - corner_len), color_bgr, thickness, cv2.LINE_AA)
    
    # Chấm định vị nhỏ ở 4 góc
    dot_r = 2
    cv2.circle(img, (x1, y1), dot_r, color_bgr, -1, cv2.LINE_AA)
    cv2.circle(img, (x2, y1), dot_r, color_bgr, -1, cv2.LINE_AA)
    cv2.circle(img, (x1, y2), dot_r, color_bgr, -1, cv2.LINE_AA)
    cv2.circle(img, (x2, y2), dot_r, color_bgr, -1, cv2.LINE_AA)


def render_all_faces_hud(img_bgr, faces_render_list):
    """Vẽ toàn bộ Bounding Corner và Badge thông tin Tiếng Việt Unicode sắc nét"""
    if not faces_render_list:
        return img_bgr

    # 1. Vẽ 4 góc bằng OpenCV với khử răng cưa
    for item in faces_render_list:
        draw_corner_hud(img_bgr, item['bbox'], item['color_bgr'], thickness=3)

    # 2. Chuyển sang PIL Image để vẽ Tiếng Việt Unicode chuẩn xác
    pil_img = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_img, "RGBA")

    for item in faces_render_list:
        x1, y1, x2, y2 = item['bbox']
        title = item['title']
        sub = item['subtitle']
        c_rgb = item['color_rgb']

        title_bbox = draw.textbbox((0, 0), title, font=FONT_TITLE)
        sub_bbox = draw.textbbox((0, 0), sub, font=FONT_SUB)
        
        t_w = title_bbox[2] - title_bbox[0]
        s_w = sub_bbox[2] - sub_bbox[0]
        
        box_w = max(t_w, s_w) + 28
        box_h = 42

        # Vị trí hộp thông tin (mặc định đặt phía trên khuôn mặt)
        bx1 = x1
        by1 = y1 - box_h - 10
        if by1 < 8: # Nếu khuôn mặt sát mép trên màn hình thì đưa xuống dưới
            by1 = y2 + 10
        bx2 = bx1 + box_w
        by2 = by1 + box_h

        # Nền hộp thông tin (Dark Glassmorphic)
        draw.rounded_rectangle(
            [bx1, by1, bx2, by2], 
            radius=6, 
            fill=(15, 23, 42, 225), 
            outline=c_rgb, 
            width=2
        )

        # Chấm tròn trạng thái
        dot_cx = bx1 + 12
        dot_cy = by1 + 13
        draw.ellipse([dot_cx - 4, dot_cy - 4, dot_cx + 4, dot_cy + 4], fill=c_rgb)

        # Tiêu đề Tiếng Việt Unicode (Họ và Tên đầy đủ)
        draw.text((bx1 + 22, by1 + 4), title, fill=(255, 255, 255, 255), font=FONT_TITLE)
        
        # Dòng phụ (Mã SV + Trạng thái điểm danh)
        draw.text((bx1 + 22, by1 + 22), sub, fill=c_rgb, font=FONT_SUB)

    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# ==========================================
# 4. TẢI DỮ LIỆU VECTOR SINH TRẮC HỌC TỪ MYSQL
# ==========================================
known_embeddings_dict = {}
known_names_dict = {}
known_student_db_ids = {}

print("=====================================================================")
print("  HỆ THỐNG NHẬN DIỆN & ĐIỂM DANH SINH TRẮC HỌC REAL-TIME (OPENCV + AI)")
print("=====================================================================")
print(f"Chế độ hoạt động: {'[HEADLESS WEB STREAM]' if is_headless else '[DESKTOP POPUP WINDOW]'}")
print("Đang kết nối Database MySQL và tải Vector khuôn mặt lên RAM...")

try:
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT id, student_code, full_name, face_embedding FROM students WHERE face_embedding IS NOT NULL")
    rows = cursor.fetchall()

    for row in rows:
        sid = row['student_code']
        db_id = row['id']
        blob_data = row['face_embedding']

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
                known_student_db_ids[sid] = db_id
        except Exception as err:
            print(f"Bỏ qua hồ sơ {sid} do lỗi định dạng vector: {err}")

    cursor.close()
    conn.close()
except Exception as e:
    print(f"[ERROR] Lỗi kết nối MySQL: {e}")
    exit(1)

print(f"✅ Đã nạp thành công {len(known_embeddings_dict)} hồ sơ sinh viên vào bộ nhớ RAM.")

# Gom thành Ma Trận 2D để tìm kiếm ma trận siêu tốc O(1)
student_id_list = list(known_embeddings_dict.keys())
if student_id_list:
    embeddings_matrix = np.array([known_embeddings_dict[sid] for sid in student_id_list])
    norms = np.linalg.norm(embeddings_matrix, axis=1, keepdims=True)
    embeddings_matrix_norm = embeddings_matrix / np.maximum(norms, 1e-10)
else:
    embeddings_matrix_norm = None

# ==========================================
# 5. BỘ ĐẨY LUỒNG WEBSOCKET (HTTP STREAM BRIDGE) ĐA LUỒNG
# ==========================================
class WebStreamBridge:
    """Đẩy khung hình và sự kiện điểm danh sang Spring Boot Backend để broadcast qua STOMP"""
    def __init__(self, base_url, enabled=True):
        self.base_url = base_url
        self.enabled = enabled
        self.session = requests.Session()
        self.latest_frame = None
        self.latest_meta = {}
        self.stopped = False
        self.lock = threading.Lock()
        self.frame_endpoint = f"{self.base_url}/api/camera/stream-frame"
        self.event_endpoint = f"{self.base_url}/api/camera/attendance-event"

    def start(self):
        if self.enabled:
            threading.Thread(target=self._stream_worker, args=(), daemon=True).start()
        return self

    def push_frame(self, frame, faces_count, fps, status="SCANNING"):
        if not self.enabled:
            return
        with self.lock:
            self.latest_frame = frame
            self.latest_meta = {
                'facesCount': faces_count,
                'fps': round(fps, 1),
                'status': status,
                'timestamp': int(time.time() * 1000)
            }

    def send_attendance_event(self, event_data):
        if not self.enabled:
            return
        def _send():
            try:
                self.session.post(self.event_endpoint, json=event_data, timeout=1.5)
            except Exception as e:
                print(f"[WARN] Không thể gửi attendance event qua STOMP: {e}")
        threading.Thread(target=_send, daemon=True).start()

    def _stream_worker(self):
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 65]
        while not self.stopped:
            frame_to_send = None
            meta_to_send = None
            with self.lock:
                if self.latest_frame is not None:
                    frame_to_send = self.latest_frame.copy()
                    meta_to_send = dict(self.latest_meta)
                    self.latest_frame = None

            if frame_to_send is not None:
                try:
                    success, buffer = cv2.imencode('.jpg', frame_to_send, encode_param)
                    if success:
                        b64_str = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
                        payload = {
                            'image': b64_str,
                            'facesCount': meta_to_send.get('facesCount', 0),
                            'fps': meta_to_send.get('fps', 0.0),
                            'status': meta_to_send.get('status', 'SCANNING'),
                            'timestamp': meta_to_send.get('timestamp', int(time.time() * 1000))
                        }
                        self.session.post(self.frame_endpoint, json=payload, timeout=0.8)
                except Exception:
                    pass
            time.sleep(0.03) # ~30 FPS throttle

    def stop(self):
        self.stopped = True

# ==========================================
# 6. KHỞI TẠO CAMERA & XỬ LÝ AI ĐA LUỒNG
# ==========================================
class VideoGet:
    def __init__(self, src=0):
        self.stream = cv2.VideoCapture(src)
        self.stream.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.stream.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
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
    """Xử lý ngầm nhận diện khuôn mặt ~15ms"""
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


print("Đang khởi động AI Engine InsightFace (buffalo_l)...")
app = FaceAnalysis(
    name='buffalo_l', 
    providers=['CPUExecutionProvider'], 
    allowed_modules=['detection', 'recognition']
)
app.prepare(ctx_id=0, det_size=(256, 256))

video_getter = VideoGet(0).start()
face_analyzer = FastAsyncFaceAnalyzer(app).start()
stream_bridge = WebStreamBridge(stream_base_url, enabled=is_headless).start()

# ==========================================
# 7. LOGIC NHẬN DIỆN, BỎ PHIẾU & GHI DATABASE
# ==========================================
VOTE_THRESHOLD = 5          # Cần 5 frame liên tiếp khớp để ghi nhận điểm danh
SIMILARITY_THRESHOLD = 0.45  # Ngưỡng tương đồng Cosine
attendance_votes = {}
marked_present = set()
smoothed_bboxes = {}

# Kết nối database riêng để lưu log
db_conn = mysql.connector.connect(**DB_CONFIG)

def record_attendance(student_code, confidence):
    try:
        cur = db_conn.cursor()
        db_student_id = known_student_db_ids.get(student_code)
        if not db_student_id:
            return

        now = datetime.now()
        student_name = known_names_dict.get(student_code, "Sinh viên")
        
        # Nếu có ca học cụ thể
        if target_schedule_id:
            cur.execute("SELECT id FROM class_attendance WHERE schedule_id = %s AND student_id = %s", (target_schedule_id, db_student_id))
            if cur.fetchone() is None:
                cur.execute("""INSERT INTO class_attendance (student_id, schedule_id, check_in_time, status, confidence_score) 
                               VALUES (%s, %s, %s, 'PRESENT', %s)""", (db_student_id, target_schedule_id, now, confidence))
                db_conn.commit()
                print(f"✅ ĐÃ ĐIỂM DANH LỚP HỌC (Ca #{target_schedule_id}): {student_name} ({student_code})")
                
                # Gửi sự kiện STOMP
                stream_bridge.send_attendance_event({
                    'eventType': 'CLASS_ATTENDANCE',
                    'scheduleId': target_schedule_id,
                    'studentCode': student_code,
                    'fullName': student_name,
                    'confidence': round(float(confidence), 4),
                    'checkInTime': now.strftime('%H:%M:%S %d/%m/%Y'),
                    'status': 'PRESENT',
                    'message': f"Đã điểm danh thành công: {student_name}"
                })
        elif target_exam_schedule_id:
            # Xác thực ca thi
            cur.execute("SELECT id FROM exam_attendance WHERE exam_schedule_id = %s AND student_id = %s", (target_exam_schedule_id, db_student_id))
            if cur.fetchone() is None:
                cur.execute("""INSERT INTO exam_attendance (student_id, exam_schedule_id, check_in_time, is_verified, seat_row, seat_col) 
                               VALUES (%s, %s, %s, 1, 0, 0)""", (db_student_id, target_exam_schedule_id, now))
                db_conn.commit()
                print(f"🎓 ĐÃ XÁC THỰC PHÒNG THI (Ca thi #{target_exam_schedule_id}): {student_name} ({student_code})")
                
                # Gửi sự kiện STOMP
                stream_bridge.send_attendance_event({
                    'eventType': 'EXAM_ATTENDANCE',
                    'examScheduleId': target_exam_schedule_id,
                    'studentCode': student_code,
                    'fullName': student_name,
                    'confidence': round(float(confidence), 4),
                    'checkInTime': now.strftime('%H:%M:%S %d/%m/%Y'),
                    'status': 'VERIFIED',
                    'message': f"Đã xác thực vào phòng thi: {student_name}"
                })
        else:
            # Điểm danh chung
            cur.execute("""INSERT INTO class_attendance (student_id, schedule_id, check_in_time, status, confidence_score) 
                           VALUES (%s, 1, %s, 'PRESENT', %s)""", (db_student_id, now, confidence))
            db_conn.commit()
            print(f"✅ ĐÃ ĐIỂM DANH: {student_name} ({student_code})")

        cur.close()
    except Exception as err:
        print(f"[LỖI LƯU ĐIỂM DANH]: {err}")


if not is_headless:
    print("\n>>> CAMERA ĐANG HOẠT ĐỘNG (Nhấn phím 'q' trên cửa sổ Camera để dừng) <<<\n")
else:
    print("\n>>> CAMERA ĐANG PHÁT SÓNG TRỰC TIẾP LÊN WEB QUA WEBSOCKET STOMP <<<\n")

prev_frame_time = time.time()
smoothed_fps = 28.0

while True:
    frame = video_getter.frame
    if not video_getter.grabbed or video_getter.stopped:
        break

    face_analyzer.update_frame(frame)
    display_frame = frame.copy()
    faces = face_analyzer.get_faces()
    
    # Tính FPS mượt mà ổn định (EMA)
    cur_time = time.time()
    dt = cur_time - prev_frame_time
    prev_frame_time = cur_time
    if dt > 0:
        inst_fps = 1.0 / dt
        smoothed_fps = 0.92 * smoothed_fps + 0.08 * inst_fps
    display_fps = round(min(max(smoothed_fps, 10.0), 35.0), 1)

    current_status = "SCANNING"
    faces_to_render = []

    for idx, face in enumerate(faces):
        raw_bbox = face.bbox
        current_embedding = face.embedding

        # Làm mượt khung Bounding Box
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
            student_code = best_match_id
            student_name = known_names_dict.get(student_code, "Sinh viên")

            if student_code not in marked_present:
                attendance_votes[student_code] = attendance_votes.get(student_code, 0) + 1
                current_votes = attendance_votes[student_code]

                if current_votes >= VOTE_THRESHOLD:
                    marked_present.add(student_code)
                    record_attendance(student_code, best_score)
                    current_status = "MATCHED"

            if student_code in marked_present:
                c_bgr = (52, 211, 153)    # Emerald Green BGR
                c_rgb = (52, 211, 153)    # Emerald Green RGB
                title_str = student_name
                sub_str = f"MSV: {student_code} • ĐÃ ĐIỂM DANH ({best_score*100:.0f}%)"
            else:
                c_bgr = (34, 197, 246)    # Amber/Cyan BGR
                c_rgb = (246, 197, 34)    # Amber/Yellow RGB
                title_str = student_name
                sub_str = f"MSV: {student_code} • Đang quét: {attendance_votes.get(student_code, 0)}/{VOTE_THRESHOLD}"
        else:
            c_bgr = (80, 80, 240)        # Soft Coral Red BGR
            c_rgb = (240, 80, 80)        # Soft Coral Red RGB
            title_str = "Chưa xác định"
            sub_str = f"Độ tương đồng: {max(0, best_score)*100:.0f}%"

        faces_to_render.append({
            'bbox': bbox,
            'title': title_str,
            'subtitle': sub_str,
            'color_bgr': c_bgr,
            'color_rgb': c_rgb
        })

    # Vẽ toàn bộ HUD 4 góc và Badge Tiếng Việt Unicode
    final_frame = render_all_faces_hud(display_frame, faces_to_render)

    # Đẩy frame vào WebStreamBridge nếu chạy Headless
    if is_headless:
        stream_bridge.push_frame(final_frame, len(faces), display_fps, current_status)
    else:
        cv2.imshow('Diem Danh Khuon Mat Real-Time (OpenCV + InsightFace)', final_frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

video_getter.stop()
face_analyzer.stop()
stream_bridge.stop()

if not is_headless:
    cv2.destroyAllWindows()

if db_conn.is_connected():
    db_conn.close()