import cv2
import os
import numpy as np
import mysql.connector
from insightface.app import FaceAnalysis

# 1. Cấu hình kết nối MySQL (Thay đổi thông tin cho khớp với máy bạn)
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',       # Tên đăng nhập MySQL mặc định (thường của XAMPP)
    'password': 'tienanh2005',       # Mật khẩu (thường để trống nếu dùng XAMPP)
    'database': 'face_attendance_db'
}

# Đảm bảo thư mục dataset tồn tại
if not os.path.exists('dataset'):
    os.makedirs('dataset')

# 2. Nhập thông tin sinh viên qua dòng lệnh
print("=== HỆ THỐNG ĐĂNG KÝ SINH TRẮC HỌC ===")
student_id = input("Nhập Mã Sinh Viên (VD: SV001): ").strip()
full_name = input("Nhập Họ và Tên: ").strip()
class_name = input("Nhập Lớp: ").strip()

# Đường dẫn sẽ lưu file vector
npy_path = f"dataset/{student_id}.npy"

# 3. Khởi tạo AI (Giống hệt phần main để đảm bảo tính đồng nhất)
print("Đang tải AI...")
app = FaceAnalysis(name='buffalo_sc', providers=['CPUExecutionProvider'])
app.prepare(ctx_id=0, det_size=(640, 640))

cap = cv2.VideoCapture(0)
print("Đang mở camera... Hãy nhìn thẳng vào camera và BẤM PHÍM 's' ĐỂ LƯU.")

embedding_saved = False

while True:
    ret, frame = cap.read()
    if not ret:
        break

    faces = app.get(frame)

    # Hiển thị khung hình và vẽ ô vuông nếu thấy mặt
    display_frame = frame.copy()
    if len(faces) > 0:
        face = faces[0] # Chỉ lấy khuôn mặt đầu tiên (to nhất) trong khung hình
        bbox = face.bbox.astype(int)
        cv2.rectangle(display_frame, (bbox[0], bbox[1]), (bbox[2], bbox[3]), (0, 255, 0), 2)
        cv2.putText(display_frame, "Ready - Press 's' to Save", (10, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    else:
        cv2.putText(display_frame, "No face detected", (10, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

    cv2.imshow("Enrollment Camera", display_frame)

    key = cv2.waitKey(1) & 0xFF
    # 4. Bấm phím 's' để trích xuất và lưu
    if key == ord('s'):
        if len(faces) == 0:
            print("Lỗi: Không tìm thấy khuôn mặt nào. Hãy thử lại!")
        elif len(faces) > 1:
            print("Lỗi: Có nhiều hơn 1 khuôn mặt trong khung hình. Đề nghị đứng một mình!")
        else:
            # Lấy vector đặc trưng (mảng 512 số)
            embedding = faces[0].embedding
            
            # Lưu mảng này ra file .npy
            np.save(npy_path, embedding)
            print(f"Đã lưu khuôn mặt vào file: {npy_path}")
            embedding_saved = True
            break # Thoát camera để chuyển sang bước lưu Database
            
    elif key == ord('q'):
        print("Đã hủy quá trình đăng ký.")
        break

cap.release()
cv2.destroyAllWindows()

# 5. Lưu thông tin vào MySQL nếu đã chụp mặt thành công
if embedding_saved:
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Câu lệnh SQL thêm dữ liệu
        sql = "INSERT INTO students (student_id, full_name, class_name, embedding_path) VALUES (%s, %s, %s, %s)"
        values = (student_id, full_name, class_name, npy_path)
        
        cursor.execute(sql, values)
        conn.commit() # Lưu thay đổi
        
        print(f"✅ HOÀN TẤT: Đã lưu thông tin sinh viên {full_name} ({student_id}) vào Database!")
        
    except mysql.connector.Error as err:
        print(f"Lỗi khi kết nối Database: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()