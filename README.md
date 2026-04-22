# AR-Cube

AR-Cube is an interactive Augmented Reality web application that allows users to control 3D objects using hand gestures in real-time. The project utilizes Three.js for 3D rendering and Google MediaPipe for hand tracking. It supports both desktop (webcam) and mobile (VR Cardboard) modes.

## Features

- *Hand Gesture Control:* Use your hands to interact with 3D cubes on screen.
  - *Normal Mode (Two Index Fingers / One Palm):* Controls a single cube's size, position, and rotation based on the distance and angle between your hands or palm orientation.
  - *Pinch Mode (Both Hands Pinch):* Pinch your thumb and index fingers on both hands to spawn a dynamic grid of cubes. Stretching horizontally increases the grid size in the X-axis, and vertically in the Y-axis.
- *VR Cardboard Mode:* Turn on VR mode on your smartphone to view the scene in a split-screen stereoscopic view. It uses device gyroscope data to allow you to look around the 3D scene using head tracking.
- *Local Client-Side Processing:* Performs MediaPipe hand tracking directly in the browser using JavaScript for reduced latency and easier deployment.
- *Python Backend (Optional/Legacy):* A Flask and Socket.IO-based server (HandDistanceServer.py) is also included to demonstrate processing hand gestures on the server and streaming data to the client.

## Files

- threejscube.html, Cube.js, Cube.css: The frontend Three.js web application and UI.
- https_server.py: A simple Python HTTPS server to serve the frontend locally. HTTPS is required to test camera and gyroscope features on mobile devices.
- HandDistanceServer.py: A Flask + WebSocket backend for server-side hand tracking (using Python MediaPipe and OpenCV).

## Requirements

### For the Web App (Client-side)
A modern web browser with WebRTC (camera) and WebGL support.

### For the Python Backend (Optional)
Python 3.x with the following libraries:
- flask, flask_socketio, flask_cors
- opencv-python (cv2)
- mediapipe
- numpy

You can install the dependencies via:
```bash
pip install flask flask-socketio flask-cors opencv-python mediapipe numpy
