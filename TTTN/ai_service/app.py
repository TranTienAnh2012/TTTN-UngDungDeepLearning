import os
import io
import base64
import logging
import numpy as np
import cv2
from flask import Flask, request, jsonify
from flask_cors import CORS
from insightface.app import FaceAnalysis

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
)

app = Flask(__name__)
CORS(app)  # Cho phép gọi Cross-Origin từ Spring Boot / Web frontend

# ==========================================
# KHỞI TẠO INSIGHTFACE AI ENGINE (BUFFALO_L)
# ==========================================
logging.info("Đang khởi tạo InsightFace (buffalo_l) AI Engine...")
ai_app = FaceAnalysis(
    name='buffalo_l',
    providers=['CPUExecutionProvider'],
    allowed_modules=['detection', 'recognition']
)
ai_app.prepare(ctx_id=0, det_size=(320, 320))
logging.info("InsightFace AI Engine đã sẵn sàng!")

def decode_base64_image(base64_str: str):
    """
    Giải mã chuỗi Base64 (có hoặc không có header data URI) thành OpenCV image (BGR numpy array)
    """
    if not base64_str:
        return None
    
    if ',' in base64_str:
        base64_str = base64_str.split(',', 1)[1]
        
    try:
        img_bytes = base64.b64decode(base64_str)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        logging.error(f"Lỗi giải mã base64 image: {e}")
        return None

def cosine_similarity(vec1, vec2):
    """
    Tính Cosine Similarity giữa 2 vector numpy
    """
    v1 = np.array(vec1, dtype=np.float32)
    v2 = np.array(vec2, dtype=np.float32)
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(np.dot(v1, v2) / (norm1 * norm2))

@app.route('/health', methods=['GET'])
@app.route('/api/ai/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "UP",
        "service": "Face Recognition AI Service (Flask)",
        "engine": "InsightFace",
        "model": "buffalo_l (512-D)",
        "allowed_modules": ["detection", "recognition"]
    }), 200

@app.route('/api/ai/register', methods=['POST'])
def register_face():
    """
    POST /api/ai/register
    Body: { "image": "data:image/jpeg;base64,..." }
    Trả về: Vector 512 chiều trích xuất từ khuôn mặt
    """
    try:
        data = request.get_json(force=True)
        image_base64 = data.get("image")
        
        if not image_base64:
            return jsonify({
                "success": False,
                "message": "Trường 'image' chứa base64 không được để trống"
            }), 400
            
        img = decode_base64_image(image_base64)
        if img is None:
            return jsonify({
                "success": False,
                "message": "Dữ liệu ảnh base64 không hợp lệ"
            }), 400

        faces = ai_app.get(img)
        
        if not faces or len(faces) == 0:
            return jsonify({
                "success": False,
                "face_detected": False,
                "message": "Không tìm thấy khuôn mặt rõ ràng trong ảnh. Vui lòng chụp thẳng và đủ ánh sáng."
            }), 422
            
        # Lấy khuôn mặt có diện tích lớn nhất (nếu có nhiều hơn 1)
        best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        embedding = best_face.embedding.astype(float).tolist()
        bbox = [int(val) for val in best_face.bbox.tolist()]
        
        return jsonify({
            "success": True,
            "face_detected": True,
            "dimension": len(embedding),
            "embedding": embedding,
            "bbox": bbox,
            "message": "Trích xuất vector khuôn mặt thành công"
        }), 200

    except Exception as e:
        logging.error(f"Lỗi khi xử lý đăng ký khuôn mặt: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "message": f"Lỗi xử lý Flask AI server: {str(e)}"
        }), 500

def load_db_candidates():
    cand_dict = {}
    try:
        import pymysql
        conn = pymysql.connect(host='127.0.0.1', port=3309, user='root', password='', database='face_attendance_db', charset='utf8mb4')
        cursor = conn.cursor()
        cursor.execute("SELECT student_code, face_embedding FROM students WHERE face_embedding IS NOT NULL")
        for row in cursor.fetchall():
            code = str(row[0])
            blob_data = row[1]
            if not blob_data:
                continue
            arr = None
            if isinstance(blob_data, (bytes, bytearray)):
                if len(blob_data) == 2048:
                    arr = np.frombuffer(blob_data, dtype=np.float32)
                else:
                    try:
                        arr = np.array(json.loads(blob_data.decode('utf-8')), dtype=np.float32)
                    except Exception:
                        pass
            elif isinstance(blob_data, str):
                try:
                    arr = np.array(json.loads(blob_data), dtype=np.float32)
                except Exception:
                    pass
            if arr is not None and len(arr) == 512:
                cand_dict[code] = arr.tolist()
        conn.close()
    except Exception as db_err:
        logging.error(f"Lỗi đọc DB trực tiếp trong Flask AI: {db_err}")
    return cand_dict

@app.route('/api/ai/recognize', methods=['POST'])
def recognize_face():
    """
    POST /api/ai/recognize
    Body: {
        "image": "data:image/jpeg;base64,...",
        "candidates": [ { "student_code": "2310900051", "embedding": [...] } ],
        "threshold": 0.45
    }
    """
    try:
        data = request.get_json(force=True)
        image_base64 = data.get("image")
        candidates = data.get("candidates", [])
        threshold = float(data.get("threshold", 0.45))
        
        if not image_base64:
            return jsonify({
                "matched": False,
                "message": "Thiếu dữ liệu ảnh 'image'"
            }), 400
            
        img = decode_base64_image(image_base64)
        if img is None:
            return jsonify({
                "matched": False,
                "message": "Dữ liệu ảnh base64 không hợp lệ"
            }), 400

        faces = ai_app.get(img)
        if not faces or len(faces) == 0:
            return jsonify({
                "matched": False,
                "student_code": None,
                "confidence": 0.0,
                "bbox": None,
                "message": "Không phát hiện khuôn mặt trong ảnh"
            }), 200

        best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        query_embedding = best_face.embedding.astype(float)
        bbox = [int(val) for val in best_face.bbox.tolist()]
        
        # Luôn tự nạp tất cả candidate từ DB MySQL và hợp nhất với danh sách truyền vào
        cand_dict = load_db_candidates()
        if candidates:
            for cand in candidates:
                cand_code = str(cand.get("student_code", ""))
                cand_vec = cand.get("embedding")
                if cand_code and cand_vec and len(cand_vec) == 512:
                    cand_dict[cand_code] = cand_vec

        cand_codes = list(cand_dict.keys())
        cand_vectors = list(cand_dict.values())

        if not cand_vectors:
            return jsonify({
                "matched": False,
                "student_code": None,
                "confidence": 0.0,
                "bbox": bbox,
                "message": "Không có vector hợp lệ trong hệ thống cơ sở dữ liệu"
            }), 200

        # TỐI ƯU SIÊU TỐC (<1ms): Ma trận hóa 2D NumPy và nhân Ma Trận tìm kiếm song song
        matrix = np.array(cand_vectors, dtype=np.float32)
        matrix_norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        matrix_norm = matrix / np.maximum(matrix_norms, 1e-10)

        query_norm_val = np.linalg.norm(query_embedding)
        query_norm = query_embedding / np.maximum(query_norm_val, 1e-10)

        similarities = np.dot(matrix_norm, query_norm)
        best_idx = int(np.argmax(similarities))
        highest_score = float(similarities[best_idx])
        best_match_code = cand_codes[best_idx]
                
        if highest_score >= threshold and best_match_code is not None:
            return jsonify({
                "matched": True,
                "student_code": best_match_code,
                "confidence": round(highest_score, 4),
                "bbox": bbox,
                "message": "Nhận diện khuôn mặt thành công"
            }), 200
        else:
            return jsonify({
                "matched": False,
                "student_code": best_match_code,
                "confidence": round(highest_score if highest_score > 0 else 0.0, 4),
                "bbox": bbox,
                "message": f"Khuôn mặt không khớp (Độ tương đồng: {round(highest_score, 4)} < ngưỡng {threshold})"
            }), 200

    except Exception as e:
        logging.error(f"Lỗi khi xử lý nhận diện khuôn mặt: {str(e)}", exc_info=True)
        return jsonify({
            "matched": False,
            "message": f"Lỗi xử lý Flask AI server: {str(e)}"
        }), 500

if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    port = int(os.environ.get("PORT", 5000))
    print(f"[AI SERVICE] Running on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)

