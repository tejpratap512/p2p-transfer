import socketio
import uuid
from typing import Dict, Set
import json
import time
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("socketio")
logger.setLevel(logging.DEBUG)

# Create Socket.IO server with enhanced configuration
print("Initializing Socket.IO server...")
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=[
        'https://streamsnatcher.com',
        'https://www.streamsnatcher.com',
        'http://streamsnatcher.com',
        'http://www.streamsnatcher.com',
        '*'  # Temporarily allow all origins for debugging
    ],
    logger=True,
    engineio_logger=True
)
print("Socket.IO server initialized")

# Track active sessions
sessions: Dict[str, Dict] = {}
# Track active users
users: Dict[str, Set[str]] = {}  # email -> set of sids

@sio.event
async def connect(sid, environ, auth=None):
    """Handle new connection"""
    print(f"Client connected: {sid}")
    logger.info(f"Socket.IO: Client connected with sid {sid}")
    # Store authentication info if provided
    if auth and 'email' in auth:
        if auth['email'] not in users:
            users[auth['email']] = set()
        users[auth['email']].add(sid)

@sio.event
async def disconnect(sid):
    """Handle disconnection"""
    print(f"Client disconnected: {sid}")
    logger.info(f"Socket.IO: Client disconnected: {sid}")
    
    # Remove user from users list
    for email, sids in list(users.items()):
        if sid in sids:
            sids.remove(sid)
            if len(sids) == 0:
                del users[email]
    
    # Clean up any sessions this user was part of
    for session_id, session in list(sessions.items()):
        if sid in (session.get('sender'), session.get('receiver')):
            # Notify other participant of disconnect
            other_sid = session.get('receiver') if sid == session.get('sender') else session.get('sender')
            if other_sid:
                await sio.emit('peer_disconnected', {'session_id': session_id}, room=other_sid)
            
            # Mark the session as disconnected
            session['disconnected_at'] = time.time()
            print(f"Session {session_id} marked as disconnected")

@sio.event
async def create_session(sid, data):
    """Create a new transfer session"""
    # Generate a unique session ID if none provided
    session_id = data.get('session_id', uuid.uuid4().hex)
    
    if session_id in sessions:
        return {'error': 'Session ID already in use'}
    
    sessions[session_id] = {
        'sender': sid,
        'created_at': time.time(),
        'max_file_size': 1024 * 1024 * 1024  # 1GB default for free users
    }
    
    print(f"Session {session_id} created by {sid}")
    return {'success': True, 'session_id': session_id}

@sio.event
async def join_session(sid, data):
    """Join an existing session as receiver"""
    session_id = data.get('session_id')
    if not session_id or session_id not in sessions:
        return {'error': 'Invalid session ID'}
    
    if 'receiver' in sessions[session_id]:
        return {'error': 'Session already has a receiver'}
    
    sessions[session_id]['receiver'] = sid
    
    # Notify sender that receiver has joined
    await sio.emit('receiver_joined', {'session_id': session_id}, room=sessions[session_id]['sender'])
    print(f"Receiver {sid} joined session {session_id}")
    
    return {'success': True, 'session_id': session_id}

@sio.event
async def relay_signal(sid, data):
    """Relay WebRTC signaling data between peers"""
    session_id = data.get('session_id')
    signal_data = data.get('signal')
    
    if not session_id or session_id not in sessions:
        return {'error': 'Invalid session ID'}
    
    session = sessions[session_id]
    
    # Determine if this is the sender or receiver
    is_sender = sid == session.get('sender')
    target_sid = session.get('receiver') if is_sender else session.get('sender')
    
    if not target_sid:
        return {'error': 'Target peer not connected'}
    
    # Send the signal data to the other peer
    await sio.emit('signal', {
        'session_id': session_id,
        'signal': signal_data,
        'from': 'sender' if is_sender else 'receiver'
    }, room=target_sid)
    
    return {'success': True}

@sio.event
async def send_ice_candidate(sid, data):
    """Relay ICE candidates between peers"""
    session_id = data.get('session_id')
    candidate = data.get('candidate')
    
    if not session_id or session_id not in sessions:
        return {'error': 'Invalid session ID'}
    
    session = sessions[session_id]
    
    # Determine if this is the sender or receiver
    is_sender = sid == session.get('sender')
    target_sid = session.get('receiver') if is_sender else session.get('sender')
    
    if not target_sid:
        return {'error': 'Target peer not connected'}
    
    # Send the ICE candidate to the other peer
    await sio.emit('ice_candidate', {
        'session_id': session_id,
        'candidate': candidate,
        'from': 'sender' if is_sender else 'receiver'
    }, room=target_sid)
    
    return {'success': True}