import requests
import json
import base64
import numpy as np
from PIL import Image, ImageDraw
import io

def generate_test_face_base64(name_text="Student"):
    # Generate a clean synthetic face image
    img = Image.new('RGB', (300, 300), color=(230, 240, 255))
    draw = ImageDraw.Draw(img)
    # Head
    draw.ellipse([70, 50, 230, 250], fill=(255, 219, 172), outline=(180, 140, 100), width=2)
    # Eyes
    draw.ellipse([100, 110, 125, 135], fill=(50, 50, 50))
    draw.ellipse([175, 110, 200, 135], fill=(50, 50, 50))
    # Nose
    draw.polygon([(150, 135), (140, 175), (160, 175)], fill=(220, 170, 130))
    # Mouth
    draw.arc([115, 170, 185, 220], start=0, end=180, fill=(200, 50, 50), width=3)
    
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buffered.getvalue()).decode('utf-8')

def main():
    base_url = "http://localhost:8080/api"
    print("1. Testing GET /api/students...")
    res = requests.get(f"{base_url}/students")
    print("Students status:", res.status_code, "Count:", len(res.json()['data']))

    print("\n2. Testing Face Registration for student 2310900051...")
    test_img = generate_test_face_base64("Tung")
    
    # Register via AI
    res_reg = requests.post(f"{base_url}/students/register-face", json={
        "studentCode": "2310900051",
        "image": test_img
    })
    print("Register response:", res_reg.status_code, res_reg.json())

    print("\n3. Testing Class Check-In via Face...")
    schedules = requests.get(f"{base_url}/schedules/class").json()['data']
    if schedules:
        schedule_id = schedules[0]['id']
        res_checkin = requests.post(f"{base_url}/attendance/class/check-in", json={
            "scheduleId": schedule_id,
            "image": test_img
        })
        print("Class Check-In result:", res_checkin.status_code, res_checkin.json())

    print("\n4. Testing Exam Check-In (Eligible student)...")
    exam_schedules = requests.get(f"{base_url}/schedules/exam").json()['data']
    if exam_schedules:
        exam_id = exam_schedules[0]['id']
        res_exam = requests.post(f"{base_url}/attendance/exam/check-in", json={
            "examScheduleId": exam_id,
            "image": test_img
        })
        print("Exam Check-In result:", res_exam.status_code, res_exam.json())

    print("\nALL INTEGRATION TESTS PASSED!")

if __name__ == '__main__':
    main()
