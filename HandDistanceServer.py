from flask import Flask, send_from_directory
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import cv2
import mediapipe as mp 
import numpy as np
import threading
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return send_from_directory('.', 'threejscube.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)


# ===== MediaPipe Setup =====
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)
mp_draw = mp.solutions.drawing_utils

# ===== Global variables =====
camera_active = False
cap = None
worker_thread_started = False


# ===== Utility: Map value ranges =====
def map_value(value, in_min, in_max, out_min, out_max):
    return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min


# ===== Utility: Calculate distance between two points =====
def distance(p1, p2):
    return np.hypot(p2[0] - p1[0], p2[1] - p1[1])


# ===== Check if hand is pinching (thumb tip close to index tip) =====
def is_pinching(hand_landmarks, w, h):
    lm = hand_landmarks.landmark
    
    # Thumb tip (4) and Index tip (8)
    thumb_x = int(lm[4].x * w)
    thumb_y = int(lm[4].y * h)
    index_x = int(lm[8].x * w)
    index_y = int(lm[8].y * h)
    
    pinch_dist = distance((thumb_x, thumb_y), (index_x, index_y))
    
    # Pinch threshold - adjust this value based on your camera distance
    PINCH_THRESHOLD = 50  # pixels
    
    return pinch_dist < PINCH_THRESHOLD, (thumb_x, thumb_y), (index_x, index_y)


# ======================================================================
# 🔥 PROCESS HAND TRACKING (Runs only when camera_active = True)
# ======================================================================
def process_camera():
    global camera_active, cap

    cap = cv2.VideoCapture(0)

    ret, frame = cap.read()
    if ret:
        h, w, c = frame.shape
    else:
        h, w = 480, 640

    print("🟢 Hand tracking started...")
    print("📡 Sending hand data to connected clients...")

    while camera_active:
        success, frame = cap.read()
        if not success:
            break

        frame = cv2.flip(frame, 1)
        h, w, c = frame.shape

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb)

        hand_data = {
            'mode': 'idle',
            'cube_size': 2.0,
            'position_x': 0.0,
            'position_y': 0.0,
            'rotation_z': 0.0,
            'grid_x': 1,
            'grid_y': 1
        }

        if results.multi_hand_landmarks:
            num_hands = len(results.multi_hand_landmarks)
            
            # ===== TWO HANDS DETECTED =====
            if num_hands == 2:
                hand1 = results.multi_hand_landmarks[0]
                hand2 = results.multi_hand_landmarks[1]
                
                # Check if BOTH hands are pinching
                is_pinch1, thumb1, index1 = is_pinching(hand1, w, h)
                is_pinch2, thumb2, index2 = is_pinching(hand2, w, h)
                
                # ===== PINCH MODE: Both hands pinching =====
                if is_pinch1 and is_pinch2:
                    hand_data['mode'] = 'pinch'
                    
                    # Use midpoint of each pinch as control points
                    pinch1_x = (thumb1[0] + index1[0]) // 2
                    pinch1_y = (thumb1[1] + index1[1]) // 2
                    pinch2_x = (thumb2[0] + index2[0]) // 2
                    pinch2_y = (thumb2[1] + index2[1]) // 2
                    
                    # Calculate distance between the two pinches
                    horizontal_dist = abs(pinch2_x - pinch1_x)
                    vertical_dist = abs(pinch2_y - pinch1_y)
                    
                    # Map distances to grid size (1-8 cubes)
                    hand_data['grid_x'] = max(1, min(8, int(map_value(horizontal_dist, 50, 500, 1, 8))))
                    hand_data['grid_y'] = max(1, min(8, int(map_value(vertical_dist, 50, 400, 1, 8))))
                    
                    # Position is the midpoint between both pinches
                    center_x = (pinch1_x + pinch2_x) // 2
                    center_y = (pinch1_y + pinch2_y) // 2
                    
                    hand_data['position_x'] = map_value(center_x, 0, w, -5, 5)
                    hand_data['position_y'] = map_value(center_y, 0, h, 5, -5)
                    
                    # Draw pinch visualization
                    # Hand 1
                    cv2.circle(frame, thumb1, 10, (255, 0, 255), -1)
                    cv2.circle(frame, index1, 10, (255, 0, 255), -1)
                    cv2.line(frame, thumb1, index1, (255, 0, 255), 3)
                    cv2.circle(frame, (pinch1_x, pinch1_y), 15, (255, 255, 0), 3)
                    
                    # Hand 2
                    cv2.circle(frame, thumb2, 10, (255, 0, 255), -1)
                    cv2.circle(frame, index2, 10, (255, 0, 255), -1)
                    cv2.line(frame, thumb2, index2, (255, 0, 255), 3)
                    cv2.circle(frame, (pinch2_x, pinch2_y), 15, (255, 255, 0), 3)
                    
                    # Line between pinches
                    cv2.line(frame, (pinch1_x, pinch1_y), (pinch2_x, pinch2_y), (0, 255, 255), 2)
                    
                    # Display info
                    cv2.putText(frame, f"PINCH MODE: {hand_data['grid_x']}x{hand_data['grid_y']}", 
                               (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 255), 2)
                    cv2.putText(frame, f"H-Dist: {horizontal_dist}px  V-Dist: {vertical_dist}px", 
                               (20, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                
                # ===== NORMAL MODE: Two index fingers (not pinching) =====
                else:
                    hand_data['mode'] = 'normal'
                    
                    # Get index finger tips from both hands
                    lm1 = hand1.landmark
                    lm2 = hand2.landmark
                    
                    x1 = int(lm1[8].x * w)
                    y1 = int(lm1[8].y * h)
                    x2 = int(lm2[8].x * w)
                    y2 = int(lm2[8].y * h)
                    
                    mx, my = (x1 + x2) // 2, (y1 + y2) // 2
                    dist = int(np.hypot(x2 - x1, y2 - y1))
                    angle = np.arctan2(y2 - y1, x2 - x1)
                    
                    hand_data['cube_size'] = max(0.5, min(3.0, map_value(dist, 100, 400, 0.5, 3.0)))
                    hand_data['position_x'] = map_value(mx, 0, w, -5, 5)
                    hand_data['position_y'] = map_value(my, 0, h, 5, -5)
                    hand_data['rotation_z'] = angle % (2 * np.pi)
                    
                    # Draw visualization
                    cv2.circle(frame, (x1, y1), 10, (0, 255, 255), -1)
                    cv2.circle(frame, (x2, y2), 10, (0, 255, 255), -1)
                    cv2.line(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                    cv2.putText(frame, "NORMAL MODE", (20, 50), 
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

        # Send the hand data to the client
        socketio.emit('hand_data', hand_data)

        # Optional display
        try:
            cv2.imshow("Hand Tracking", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                camera_active = False
        except:
            pass

        time.sleep(0.03)  # 30 FPS

    if cap:
        cap.release()
    cv2.destroyAllWindows()
    print("🔴 Hand tracking stopped.")


# ======================================================================
# 🔥 BACKGROUND WORKER THREAD (Always runs independently)
# ======================================================================
def worker_thread():
    global camera_active

    print("🧵 Worker thread started")

    while True:
        if camera_active:
            process_camera()
        else:
            time.sleep(0.1)  # Sleep lightly when camera is off


# ======================================================================
# 🔥 SocketIO Events
# ======================================================================
@socketio.on('connect')
def handle_connect():
    print("✅ Client connected")
    emit('status', {'message': 'Connected to hand tracking server'})


@socketio.on('disconnect')
def handle_disconnect():
    print("❌ Client disconnected")


@socketio.on('start_camera')
def handle_start_camera():
    global camera_active, worker_thread_started

    camera_active = True

    # Start worker thread once at startup
    if not worker_thread_started:
        t = threading.Thread(target=worker_thread, daemon=True)
        t.start()
        worker_thread_started = True
        print("🧵 Worker thread launched")

    emit('status', {'message': 'Camera started'})
    print("📹 Camera start requested by client")


@socketio.on('stop_camera')
def handle_stop_camera():
    global camera_active
    camera_active = False
    emit('status', {'message': 'Camera stopped'})
    print("🛑 Camera stop requested by client")


# ======================================================================
# 🔥 Server Runner
# ======================================================================
    print("=" * 60)
    print("🚀 Hand Tracking Server - Dual Pinch Mode")
    print("=" * 60)
    print("📡 WebSocket running on https://localhost:5000 (HTTPS Enabled)")
    print("⚠️  Accept the 'Not Secure' warning in your browser to proceed.")
    print("🤌🤌 BOTH HANDS PINCH: Create cube grid")
    print("   • Horizontal stretch = More cubes in X")
    print("   • Vertical stretch = More cubes in Y")
    print("👋👋 TWO INDEX FINGERS: Control single cube")
    print("=" * 60)

    # ssl_context='adhoc' requires pyopenssl
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, ssl_context='adhoc')