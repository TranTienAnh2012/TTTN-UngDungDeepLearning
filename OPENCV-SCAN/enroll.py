import cv2
import numpy as np
import random
import threading
import time
import json
import os
import sys
import argparse
import base64
import requests
import mysql.connector
from datetime import date
from PIL import Image, ImageDraw, ImageFont
from insightface.app import FaceAnalysis

sys.stdout.reconfigure(encoding='utf-8')

# ==========================================
# 1. CẤU HÌNH CƠ SỞ DỮ LIỆU & THAM SỐ ĐĂNG KÝ
# ==========================================
DB_CONFIG = {
    'host': '127.0.0.1',
    'user': 'root',
    'password': '123456',
    'database': 'face_attendance_db',
    'port': 3306
}

parser = argparse.ArgumentParser(description="Đăng ký khuôn mặt sinh trắc học")
parser.add_argument('--student-code', type=str, default=None, help="Mã sinh viên")
parser.add_argument('--full-name', type=str, default=None, help="Họ và tên")
parser.add_argument('--class-name', type=str, default=None, help="Tên lớp")
parser.add_argument('--headless', action='store_true', help="Chạy chế độ ngầm Web Stream (không mở popup cv2.imshow)")
parser.add_argument('--stream-url', type=str, default='http://127.0.0.1:8080', help="Địa chỉ Spring Boot Server")
args, _ = parser.parse_known_args()

is_headless = args.headless
stream_base_url = args.stream_url.rstrip('/')

print("=====================================================================")
print("   ĐĂNG KÝ SINH TRẮC HỌC KHUÔN MẶT - CHỐNG GIẢ MẠO (INSIGHTFACE 512-D)")
print("=====================================================================")
print(f"Chế độ hoạt động: {'[HEADLESS WEB STREAM]' if is_headless else '[DESKTOP POPUP WINDOW]'}")

if args.student_code:
    student_code = args.student_code.strip()
    full_name = args.full_name.strip() if args.full_name else "Sinh viên"
    class_name = args.class_name.strip() if args.class_name else "K23CNT3"
else:
    student_code = input("> Nhập Mã Sinh Viên (VD: 2310900051): ").strip()
    full_name = input("> Nhập Họ và Tên: ").strip()
    class_name = input("> Nhập Lớp (VD: K23CNT3): ").strip()

if not student_code:
    print("[ERROR] Mã sinh viên không được để trống!")
    exit(1)

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
                f_title = ImageFont.truetype(bold_p, 15)
                f_sub = ImageFont.truetype(reg_p, 12)
                f_inst = ImageFont.truetype(bold_p, 16)
                return f_title, f_sub, f_inst
            except Exception:
                pass
    default_f = ImageFont.load_default()
    return default_f, default_f, default_f

FONT_TITLE, FONT_SUB, FONT_INST = init_vietnamese_fonts()

# ==========================================
# 3. BỘ ĐẨY LUỒNG WEBSOCKET (HTTP STREAM BRIDGE)
# ==========================================
class WebStreamBridge:
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

    def push_frame(self, frame, faces_count, fps, status="REGISTERING"):
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

    def send_register_event(self, event_data):
        if not self.enabled:
            return
        def _send():
            try:
                self.session.post(self.event_endpoint, json=event_data, timeout=1.5)
            except Exception as e:
                print(f"[WARN] Không thể gửi event qua STOMP: {e}")
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
                            'status': meta_to_send.get('status', 'REGISTERING'),
                            'timestamp': meta_to_send.get('timestamp', int(time.time() * 1000))
                        }
                        self.session.post(self.frame_endpoint, json=payload, timeout=0.8)
                except Exception:
                    pass
            time.sleep(0.03)

    def stop(self):
        self.stopped = True

# ==========================================
# 4. HÀM VẼ 4 GÓC MẶT VÀ BANNER CHỈ DẪN LIVENESS
# ==========================================
def draw_corner_hud(img, bbox, color_bgr, corner_len_ratio=0.22, thickness=3):
    x1, y1, x2, y2 = bbox
    w = max(1, x2 - x1)
    h = max(1, y2 - y1)
    corner_len = max(14, min(int(w * corner_len_ratio), int(h * corner_len_ratio), 32))
    
    cv2.line(img, (x1, y1), (x1 + corner_len, y1), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y1), (x1, y1 + corner_len), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y1), (x2 - corner_len, y1), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y1), (x2, y1 + corner_len), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y2), (x1 + corner_len, y2), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x1, y2), (x1, y2 - corner_len), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y2), (x2 - corner_len, y2), color_bgr, thickness, cv2.LINE_AA)
    cv2.line(img, (x2, y2), (x2, y2 - corner_len), color_bgr, thickness, cv2.LINE_AA)


def render_enrollment_hud(img_bgr, bbox, student_title, student_sub, instruction_text, instruction_color_rgb, progress_text, is_passed=False):
    color_bgr = (instruction_color_rgb[2], instruction_color_rgb[1], instruction_color_rgb[0])
    
    if bbox is not None:
        draw_corner_hud(img_bgr, bbox, color_bgr, thickness=3)

    pil_img = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_img, "RGBA")
    w, h = pil_img.size

    # 1. Top Instruction Banner (Chỉ dẫn Liveness)
    banner_w = w - 40
    banner_h = 50
    bx1 = 20
    by1 = 16
    bx2 = bx1 + banner_w
    by2 = by1 + banner_h

    # Nền Banner
    draw.rounded_rectangle(
        [bx1, by1, bx2, by2], 
        radius=8, 
        fill=(15, 23, 42, 230), 
        outline=instruction_color_rgb, 
        width=2
    )

    # Text chỉ dẫn
    draw.text((bx1 + 16, by1 + 7), instruction_text, fill=(255, 255, 255, 255), font=FONT_INST)
    draw.text((bx1 + 16, by1 + 28), progress_text, fill=instruction_color_rgb, font=FONT_SUB)

    # 2. Student Info Badge trên khuôn mặt
    if bbox is not None:
        x1, y1, x2, y2 = bbox
        t_bbox = draw.textbbox((0, 0), student_title, font=FONT_TITLE)
        s_bbox = draw.textbbox((0, 0), student_sub, font=FONT_SUB)
        card_w = max(t_bbox[2] - t_bbox[0], s_bbox[2] - s_bbox[0]) + 28
        card_h = 42

        card_x1 = x1
        card_y1 = y1 - card_h - 10
        if card_y1 < 75: # Tránh đè lên Banner trên cùng
            card_y1 = y2 + 10
        card_x2 = card_x1 + card_w
        card_y2 = card_y1 + card_h

        draw.rounded_rectangle(
            [card_x1, card_y1, card_x2, card_y2],
            radius=6,
            fill=(15, 23, 42, 220),
            outline=instruction_color_rgb,
            width=2
        )

        # Chấm trạng thái
        draw.ellipse([card_x1 + 10, card_y1 + 13, card_x1 + 18, card_y1 + 21], fill=instruction_color_rgb)
        draw.text((card_x1 + 22, card_y1 + 4), student_title, fill=(255, 255, 255, 255), font=FONT_TITLE)
        draw.text((card_x1 + 22, card_y1 + 22), student_sub, fill=instruction_color_rgb, font=FONT_SUB)

    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

# ==========================================
# 5. KHỞI TẠO CAMERA & XỬ LÝ AI ĐA LUỒNG
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
    """Xử lý ngầm 3D Landmark & Head Pose để kiểm tra cử động đầu chống giả mạo"""
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


print("Đang nạp mô hình phát hiện và căn chỉnh khuôn mặt InsightFace...")
app_fast = FaceAnalysis(
    name='buffalo_l', 
    providers=['CPUExecutionProvider'], 
    allowed_modules=['detection', 'landmark_3d_68']
)
app_fast.prepare(ctx_id=0, det_size=(256, 256))

face_analyzer = FastAsyncFaceAnalyzer(app_fast).start()
stream_bridge = WebStreamBridge(stream_base_url, enabled=is_headless).start()

# Cấu hình cử động chống giả mạo (Liveness) với Tiếng Việt
TASKS = {
    'LEFT': {'text': 'Quay mặt sang Phải', 'check': lambda pitch, yaw: yaw < -13},
    'RIGHT': {'text': 'Quay mặt sang Trái', 'check': lambda pitch, yaw: yaw > 13},
    'UP': {'text': 'Cúi đầu xuống DƯỚI', 'check': lambda pitch, yaw: pitch < -9},
    'DOWN': {'text': 'Ngẩng đầu lên TRÊN', 'check': lambda pitch, yaw: pitch > 9}
}

task_sequence = list(TASKS.keys())
random.shuffle(task_sequence)

current_task_idx = 0
final_embedding = None
smoothed_bbox = None
hold_center_start = None

video_getter = VideoGet(0).start()
print(f"Đang mở camera cho sinh viên: {student_code} - {full_name}...")

prev_time = time.time()
smoothed_fps = 28.0

while True:
    frame = video_getter.frame
    if not video_getter.grabbed or video_getter.stopped:
        break

    face_analyzer.update_frame(frame)
    display_frame = frame.copy()
    latest_faces = face_analyzer.get_faces()

    # Tính FPS mượt mà
    cur_time = time.time()
    dt = cur_time - prev_time
    prev_time = cur_time
    if dt > 0:
        inst_fps = 1.0 / dt
        smoothed_fps = 0.92 * smoothed_fps + 0.08 * inst_fps
    display_fps = round(min(max(smoothed_fps, 10.0), 35.0), 1)

    instruction_text = "Vui lòng nhìn thẳng vào Camera..."
    instruction_color = (246, 197, 34) # Vàng cam
    progress_text = "Chế độ: Đăng ký sinh trắc học Face ID"
    draw_box = None
    is_passed = False

    if len(latest_faces) == 1:
        face = latest_faces[0]
        raw_bbox = face.bbox
        pitch, yaw, roll = face.pose 

        # Làm mượt BBox
        if smoothed_bbox is None:
            smoothed_bbox = raw_bbox.copy().astype(float)
        else:
            smoothed_bbox = 0.5 * raw_bbox.astype(float) + 0.5 * smoothed_bbox
        
        draw_box = smoothed_bbox.astype(int)

        if current_task_idx < len(task_sequence):
            current_task_key = task_sequence[current_task_idx]
            task_info = TASKS[current_task_key]
            
            instruction_text = f"BƯỚC {current_task_idx + 1}/4: {task_info['text']}"
            progress_text = f"Độ nghiêng: Pitch {pitch:.0f}° | Yaw {yaw:.0f}°"
            instruction_color = (246, 197, 34) # Vàng cam

            if task_info['check'](pitch, yaw):
                print(f"✅ Vượt qua bước {current_task_idx + 1}: {task_info['text']}")
                current_task_idx += 1 
                time.sleep(0.18)
        else:
            is_passed = True
            is_centered = (abs(yaw) < 14 and abs(pitch) < 14)

            if is_centered:
                if hold_center_start is None:
                    hold_center_start = time.time()
                
                held_time = time.time() - hold_center_start
                countdown = max(0.0, 1.2 - held_time)
                
                instruction_text = "XÁC MINH THÀNH CÔNG! Đang chụp..."
                progress_text = f"Giữ nguyên khuôn mặt: {countdown:.1f}s"
                instruction_color = (52, 211, 153) # Xanh ngọc

                if held_time >= 1.2:
                    print("Đang trích xuất Vector đặc trưng khuôn mặt 512 chiều (ArcFace)...")
                    app_full = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'], allowed_modules=['detection', 'recognition'])
                    app_full.prepare(ctx_id=0, det_size=(320, 320))
                    full_faces = app_full.get(frame)
                    if len(full_faces) > 0:
                        final_embedding = full_faces[0].embedding
                        print(f"Trích xuất thành công Vector (512 chiều). Lưu CSDL...")
                        break
                    else:
                        hold_center_start = None
            else:
                hold_center_start = None
                instruction_text = "XÁC MINH THÀNH CÔNG!"
                progress_text = "Hãy nhìn thẳng vào camera để hoàn tất lưu dữ liệu"
                instruction_color = (56, 189, 248) # Xanh dương

    elif len(latest_faces) > 1:
        smoothed_bbox = None
        instruction_text = "CẢNH BÁO: Phát hiện nhiều hơn 1 người!"
        progress_text = "Vui lòng chỉ 1 người đứng trước camera để đăng ký"
        instruction_color = (240, 80, 80) # Đỏ
    else:
        smoothed_bbox = None
        instruction_text = "Đang tìm kiếm khuôn mặt..."
        progress_text = "Hãy hướng khuôn mặt vào giữa khung hình"
        instruction_color = (148, 163, 184) # Xám

    # Render HUD tổng thể
    final_frame = render_enrollment_hud(
        display_frame, 
        draw_box, 
        full_name, 
        f"MSV: {student_code} ({class_name})", 
        instruction_text, 
        instruction_color, 
        progress_text,
        is_passed
    )

    if is_headless:
        stream_bridge.push_frame(final_frame, len(latest_faces), display_fps, "REGISTERING")
    else:
        cv2.imshow("Dang Ky Sinh Trac Hoc Face ID (Nhan 's' de Luu, 'q' de Thoat)", final_frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('s') and current_task_idx >= len(task_sequence):
            app_full = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'], allowed_modules=['detection', 'recognition'])
            app_full.prepare(ctx_id=0, det_size=(320, 320))
            full_faces = app_full.get(frame)
            if len(full_faces) > 0:
                final_embedding = full_faces[0].embedding
                break
        elif key == ord('q'):
            print("Đã hủy phiên đăng ký.")
            final_embedding = None
            break

video_getter.stop()
face_analyzer.stop()
stream_bridge.stop()

if not is_headless:
    cv2.destroyAllWindows()

# ==========================================
# 6. LƯU VECTOR VÀO MYSQL VÀ BẮN SỰ KIỆN STOMP
# ==========================================
if final_embedding is not None:
    try:
        embedding_json = json.dumps(final_embedding.tolist())
        
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        sql = """INSERT INTO students 
                 (student_code, full_name, date_of_birth, class_name, face_embedding, status) 
                 VALUES (%s, %s, %s, %s, %s, 'ACTIVE')
                 ON DUPLICATE KEY UPDATE 
                     full_name = VALUES(full_name),
                     class_name = VALUES(class_name),
                     face_embedding = VALUES(face_embedding),
                     status = 'ACTIVE'"""
        
        values = (student_code, full_name, date(2005, 1, 1), class_name, embedding_json)
        cursor.execute(sql, values)
        conn.commit()
        cursor.close()
        conn.close()
        
        print("=====================================================================")
        print(f"🎉 ĐĂNG KÝ THÀNH CÔNG: Sinh viên {full_name} ({student_code})")
        print("   Vector đặc trưng 512 chiều đã được lưu vào Database MySQL.")
        print("=====================================================================")

        # Gửi sự kiện STOMP thông báo cho giao diện Admin
        try:
            requests.post(f"{stream_base_url}/api/camera/attendance-event", json={
                'eventType': 'FACE_REGISTERED',
                'studentCode': student_code,
                'fullName': full_name,
                'className': class_name,
                'status': 'SUCCESS',
                'message': f"Đã đăng ký Face ID thành công cho {full_name} ({student_code})"
            }, timeout=2.0)
        except Exception as se:
            print(f"[WARN] Không thể gửi STOMP event: {se}")

    except Exception as e:
        print(f"[LỖI DATABASE] Không thể lưu vector: {e}")