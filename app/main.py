from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import socketio
import os
import uvicorn
import logging

from app.auth.router import auth_router
from app.transfer.router import transfer_router
from app.signaling.socket import sio

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Create the FastAPI app
app = FastAPI(title="P2P Secure File Transfer")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://streamsnatcher.com",
        "https://www.streamsnatcher.com",
        "http://streamsnatcher.com",
        "http://www.streamsnatcher.com",
        "*"  # Temporarily allow all origins for debugging
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Add routers
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(transfer_router, prefix="/api/transfer", tags=["File Transfer"])

# Create templates
templates = Jinja2Templates(directory="templates")

# SocketIO setup - FIXED CONFIGURATION
print("Creating Socket.IO ASGI app")
socket_app = socketio.ASGIApp(
    sio, 
    socketio_path=''  # Empty string makes the path just /socket.io/
)
print("Mounting Socket.IO at /socket.io/")
app.mount("/socket.io/", socket_app)  # Note the trailing slash
print("Socket.IO mounted successfully")

@app.get("/")
async def read_root(request: Request):
    """Serve the main application page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/join/{session_id}", response_class=HTMLResponse)
async def join_session(request: Request, session_id: str):
    """Handle session join links"""
    # Using the same template but with session_id context
    return templates.TemplateResponse("index.html", {"request": request, "session_id": session_id})

@app.get("/api/stun-config")
async def get_turn_credentials():
    """Return STUN server credentials"""
    return {
        "iceServers": [
            {
                "urls": [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302"
                ]
            },
            {
                "urls": ["turn:127.0.0.1:3478"],
                "username": "devuser",
                "credential": "devpass"
            }
        ]
    }

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)