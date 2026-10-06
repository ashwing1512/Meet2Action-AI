import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Captions,
  Check,
  Copy,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { apiFetch, API_URL } from '../api';

const SIGNAL_URL = 'ws://127.0.0.1:8000/api';

export default function MeetingsPage() {
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '');
  const [joinCode, setJoinCode] = useState('');
  const [activeRoom, setActiveRoom] = useState('');
  const [meetings, setMeetings] = useState([]);
  const [form, setForm] = useState({ title: 'Weekly Product Sync', transcript: '', participants: 'Aisha, Leo, Nina, Omar' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [analysisError, setAnalysisError] = useState('');

  useEffect(() => {
    apiFetch(`${API_URL}/meetings`)
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load meetings.');
        return res.json();
      })
      .then(setMeetings)
      .catch((error) => console.error(error));
  }, []);

  const openRoom = (code) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;
    setActiveRoom(normalizedCode);
    setRoomCode(normalizedCode);
    window.history.replaceState({}, '', `/meetings?room=${encodeURIComponent(normalizedCode)}`);
  };

  const leaveRoom = () => {
    setActiveRoom('');
    window.history.replaceState({}, '', '/meetings');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAnalysisError('');
    setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/meetings/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(' ')
          : data.detail;
        throw new Error(detail || 'Meeting analysis failed.');
      }
      setResult(data.analysis);
      const meetingResponse = await apiFetch(`${API_URL}/meetings`);
      if (!meetingResponse.ok) throw new Error('Unable to refresh meeting history.');
      setMeetings(await meetingResponse.json());
    } catch (error) {
      setAnalysisError(error.message || 'Could not analyze this transcript. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const refreshMeetings = async () => {
    const response = await apiFetch(`${API_URL}/meetings`);
    if (!response.ok) throw new Error('Unable to refresh meeting history.');
    setMeetings(await response.json());
  };

  if (activeRoom) {
    return <MeetingRoom roomCode={activeRoom} onLeave={leaveRoom} onMeetingSaved={refreshMeetings} />;
  }

  return (
    <div className="page-stack">
      <section className="meeting-lobby panel">
        <div className="meeting-lobby-copy">
          <span className="meeting-lobby-icon"><Video size={22} /></span>
          <div>
            <p className="eyebrow">MEETGROW MEETINGS</p>
            <h2>Bring your team together</h2>
            <p className="muted-text">Start a secure room or join with a meeting code. Turn the conversation into clear next steps.</p>
          </div>
        </div>
        <div className="meeting-lobby-actions">
          <button className="primary-button" type="button" onClick={() => openRoom(createRoomCode())}>
            <Plus size={17} /> New meeting
          </button>
          <form
            className="join-room-form"
            onSubmit={(event) => {
              event.preventDefault();
              openRoom(joinCode);
            }}
          >
            <input
              aria-label="Meeting code"
              placeholder="Enter meeting code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              maxLength={8}
            />
            <button className="secondary-button" type="submit" disabled={!joinCode.trim()}>Join</button>
          </form>
        </div>
      </section>

      <section className="panel form-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">AI MEETING NOTES</p>
            <h3>Analyze a transcript</h3>
            <p className="muted-text meeting-form-intro">Get a concise summary, key notes, and suggested action items from your meeting.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="stacked-form">
          <div className="field-row">
            <label>
              Meeting title
              <input name="title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              Participants
              <input name="participants" value={form.participants} onChange={(event) => setForm({ ...form, participants: event.target.value })} />
            </label>
          </div>
          <label>
            Transcript
            <textarea
              name="transcript"
              value={form.transcript}
              onChange={(event) => setForm({ ...form, transcript: event.target.value })}
              rows={8}
              minLength={20}
              placeholder="Paste the meeting transcript here. Include who said what and any agreed actions or deadlines..."
              required
            />
          </label>
          {analysisError && <p className="task-error" role="alert">{analysisError}</p>}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Analyzing transcript…' : 'Generate meeting notes'}
          </button>
        </form>
      </section>

      {result && (
        <section className="panel">
          <div className="panel-header"><h3>AI analysis</h3></div>
          <div className="analysis-grid">
            <div><p className="eyebrow">Summary</p><p>{result.summary}</p></div>
            <div>
              <p className="eyebrow">Notes</p>
              <ul className="bullet-list">{result.notes.map((note) => <li key={note}>{note}</li>)}</ul>
            </div>
            <div>
              <p className="eyebrow">Roles</p>
              <div className="tag-row">{(result.roles || []).map((role) => <span key={role} className="tag">{role}</span>)}</div>
            </div>
            <div>
              <p className="eyebrow">Deadlines</p>
              <ul className="bullet-list">{(result.deadlines || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h3>Recent meetings</h3>
          </div>
          <span className="meeting-history-count">{meetings.length} saved</span>
        </div>
        {meetings.length ? (
          <div className="meeting-list">
            {meetings.map((meeting) => (
              <div key={meeting.id} className="meeting-card">
                <div className="meeting-card-heading">
                  <p className="list-title">{meeting.title}</p>
                  <p className="muted-text">{meeting.date}</p>
                </div>
                <p>{meeting.summary}</p>
              </div>
            ))}
          </div>
        ) : <p className="muted-text">Your analyzed meetings will appear here.</p>}
      </section>
    </div>
  );
}

function MeetingRoom({ roomCode, onLeave, onMeetingSaved }) {
  const peerId = useRef(crypto.randomUUID());
  const localVideo = useRef(null);
  const localStream = useRef(null);
  const socket = useRef(null);
  const recognition = useRef(null);
  const shouldTranscribe = useRef(false);
  const transcriptRef = useRef('');
  const analyzeAfterRecognitionStops = useRef(false);
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const [remotePeers, setRemotePeers] = useState({});
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [copied, setCopied] = useState(false);
  const [connectionState, setConnectionState] = useState('Connecting...');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [analyzingTranscript, setAnalyzingTranscript] = useState(false);
  const [transcriptMessage, setTranscriptMessage] = useState('');
  const [transcriptError, setTranscriptError] = useState('');

  const sendSignal = useCallback((message) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
    }
  }, []);

  const createPeerConnection = useCallback((remoteId) => {
    const existing = peerConnections.current.get(remoteId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    localStream.current?.getTracks().forEach((track) => connection.addTrack(track, localStream.current));
    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ type: 'ice-candidate', to: remoteId, candidate: event.candidate });
    };
    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) setRemotePeers((peers) => ({ ...peers, [remoteId]: { stream } }));
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') {
        setError('A participant connection failed. Check your network and try rejoining.');
      }
    };
    peerConnections.current.set(remoteId, connection);
    return connection;
  }, [sendSignal]);

  const makeOffer = useCallback(async (remoteId) => {
    const connection = createPeerConnection(remoteId);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    sendSignal({ type: 'offer', to: remoteId, description: connection.localDescription });
  }, [createPeerConnection, sendSignal]);

  const handleSignal = useCallback(async (message) => {
    if (message.type === 'peers') {
      message.peerIds.forEach((remoteId) => {
        createPeerConnection(remoteId);
        if (peerId.current < remoteId) makeOffer(remoteId).catch((err) => setError(err.message));
      });
      setConnectionState('Waiting for others');
      return;
    }

    if (message.type === 'peer-joined') {
      createPeerConnection(message.peerId);
      if (peerId.current < message.peerId) makeOffer(message.peerId).catch((err) => setError(err.message));
      setConnectionState('In meeting');
      return;
    }

    if (message.type === 'peer-left') {
      peerConnections.current.get(message.peerId)?.close();
      peerConnections.current.delete(message.peerId);
      setRemotePeers((peers) => {
        const nextPeers = { ...peers };
        delete nextPeers[message.peerId];
        return nextPeers;
      });
      return;
    }

    if (message.type === 'offer') {
      const connection = createPeerConnection(message.from);
      await connection.setRemoteDescription(message.description);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      sendSignal({ type: 'answer', to: message.from, description: connection.localDescription });
      const queued = pendingCandidates.current.get(message.from) || [];
      for (const candidate of queued) await connection.addIceCandidate(candidate);
      pendingCandidates.current.delete(message.from);
      return;
    }

    if (message.type === 'answer') {
      const connection = createPeerConnection(message.from);
      await connection.setRemoteDescription(message.description);
      const queued = pendingCandidates.current.get(message.from) || [];
      for (const candidate of queued) await connection.addIceCandidate(candidate);
      pendingCandidates.current.delete(message.from);
      return;
    }

    if (message.type === 'ice-candidate') {
      const connection = createPeerConnection(message.from);
      if (connection.remoteDescription) {
        await connection.addIceCandidate(message.candidate);
      } else {
        const queued = pendingCandidates.current.get(message.from) || [];
        pendingCandidates.current.set(message.from, [...queued, message.candidate]);
      }
    }
  }, [createPeerConnection, makeOffer, sendSignal]);

  useEffect(() => {
    let disposed = false;
    let activeSocket;

    const connect = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStream.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        const token = localStorage.getItem('meetgrow_token');
        activeSocket = new WebSocket(`${SIGNAL_URL}/rooms/${encodeURIComponent(roomCode)}/ws/${peerId.current}?token=${encodeURIComponent(token || '')}`);
        socket.current = activeSocket;
        activeSocket.onopen = () => setConnectionState('Waiting for others');
        activeSocket.onmessage = (event) => {
          handleSignal(JSON.parse(event.data)).catch((err) => setError(err.message));
        };
        activeSocket.onerror = () => setError('Could not connect to the meeting server. Please try again.');
        activeSocket.onclose = () => {
          if (!disposed) setConnectionState('Disconnected');
        };
      } catch (err) {
        setError(err.name === 'NotAllowedError'
          ? 'Camera or microphone access was blocked. Allow access in your browser settings, then rejoin.'
          : `Could not start your camera and microphone: ${err.message}`);
      }
    };

    connect();
    return () => {
      disposed = true;
      shouldTranscribe.current = false;
      recognition.current?.stop();
      activeSocket?.close();
      peerConnections.current.forEach((connection) => connection.close());
      peerConnections.current.clear();
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    };
  }, [handleSignal, roomCode]);

  const analyzeTranscript = useCallback(async () => {
    const capturedTranscript = transcriptRef.current.trim();
    if (capturedTranscript.length < 20) {
      setTranscriptError('Capture a little more speech before analyzing the transcript.');
      return;
    }

    setAnalyzingTranscript(true);
    setTranscriptError('');
    setTranscriptMessage('');
    try {
      const response = await apiFetch(`${API_URL}/meetings/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Meeting ${roomCode}`,
          transcript: capturedTranscript,
          participants: 'Live meeting',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not analyze the meeting transcript.');
      const taskCount = data.analysis?.tasks?.length || 0;
      setTranscriptMessage(
        taskCount
          ? `Transcript saved. AI added ${taskCount} task${taskCount === 1 ? '' : 's'} to your task list.`
          : 'Transcript saved. AI did not find any clear action items.',
      );
      await onMeetingSaved();
    } catch (analysisError) {
      setTranscriptError(analysisError.message);
    } finally {
      setAnalyzingTranscript(false);
    }
  }, [onMeetingSaved, roomCode]);

  const startTranscription = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTranscriptError('Live speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (recognition.current) {
      try {
        recognition.current.start();
        shouldTranscribe.current = true;
        setTranscribing(true);
        setTranscriptError('');
      } catch (recognitionError) {
        setTranscriptError(`Could not restart speech recognition: ${recognitionError.message}`);
      }
      return;
    }

    const speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = navigator.language || 'en-US';
    speechRecognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = event.results[index][0].transcript.trim();
        if (event.results[index].isFinal) finalText += `${phrase} `;
        else interimText += `${phrase} `;
      }
      if (finalText) {
        transcriptRef.current = `${transcriptRef.current}${finalText}`;
        setTranscript(transcriptRef.current);
      }
      setInterimTranscript(interimText.trim());
    };
    speechRecognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        shouldTranscribe.current = false;
        setTranscribing(false);
        setTranscriptError(`Speech recognition stopped: ${event.error}.`);
      }
    };
    speechRecognition.onend = () => {
      if (shouldTranscribe.current) {
        try {
          speechRecognition.start();
          return;
        } catch {
          shouldTranscribe.current = false;
        }
      }
      setTranscribing(false);
      setInterimTranscript('');
      if (analyzeAfterRecognitionStops.current) {
        analyzeAfterRecognitionStops.current = false;
        analyzeTranscript();
      }
    };
    recognition.current = speechRecognition;
    shouldTranscribe.current = true;
    setTranscribing(true);
    setTranscriptError('');
    try {
      speechRecognition.start();
    } catch (recognitionError) {
      shouldTranscribe.current = false;
      setTranscribing(false);
      setTranscriptError(`Could not start speech recognition: ${recognitionError.message}`);
    }
  };

  const stopTranscription = () => {
    shouldTranscribe.current = false;
    recognition.current?.stop();
    setTranscribing(false);
  };

  const analyzeCapturedTranscript = () => {
    if (shouldTranscribe.current) {
      analyzeAfterRecognitionStops.current = true;
      shouldTranscribe.current = false;
      recognition.current?.stop();
      return;
    }
    analyzeTranscript();
  };

  useEffect(() => {
    if (localVideo.current && localStream.current) localVideo.current.srcObject = localStream.current;
  }, [error]);

  const toggleMic = () => {
    const next = !micOn;
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = next; });
    setMicOn(next);
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    localStream.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraOn(next);
  };

  const copyInvite = async () => {
    const inviteUrl = `${window.location.origin}/meetings?room=${encodeURIComponent(roomCode)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy the invite link. You can share the meeting code instead.');
    }
  };

  const participantCount = Object.keys(remotePeers).length + 1;

  return (
    <section className="call-room">
      <header className="call-room-header">
        <div className="call-room-title">
          <button className="call-back-button" type="button" onClick={onLeave} aria-label="Leave meeting">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2>Team meeting</h2>
            <p><span className="live-dot" />{connectionState} <span className="room-code-label">· {roomCode}</span></p>
          </div>
        </div>
        <button className="secondary-button invite-button" type="button" onClick={copyInvite}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy invite link'}
        </button>
      </header>

      {error && (
        <div className="call-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button>
        </div>
      )}

      <div className={`call-stage ${participantCount > 1 ? 'has-participants' : ''}`}>
        <div className="video-tile local-video-tile">
          <video ref={localVideo} autoPlay playsInline muted />
          {!cameraOn && (
            <div className="video-placeholder">
              <div className="video-avatar">You</div>
              <span>Camera off</span>
            </div>
          )}
          <span className="video-name">{micOn ? 'You' : 'You · muted'}</span>
        </div>
        {Object.entries(remotePeers).map(([id, peer]) => (
          <RemoteVideo key={id} id={id} stream={peer.stream} />
        ))}
        {participantCount === 1 && !error && (
          <div className="waiting-overlay">
            <div className="waiting-icon"><Users size={22} /></div>
            <p>You're the first one here</p>
            <span>Share the invite link to bring your team in.</span>
          </div>
        )}
      </div>

      <section className="live-transcript-panel" aria-label="Live meeting transcript">
        <div className="live-transcript-header">
          <div>
            <h3><Captions size={17} /> Live transcript &amp; tasks</h3>
            <p>Captures speech from your microphone. Start captions when you’re ready.</p>
          </div>
          <div className="live-transcript-actions">
            <button
              className={`secondary-button ${transcribing ? 'transcript-listening' : ''}`}
              type="button"
              onClick={transcribing ? stopTranscription : startTranscription}
              disabled={analyzingTranscript}
            >
              {transcribing ? <MicOff size={15} /> : <Mic size={15} />}
              {transcribing ? 'Stop captions' : 'Start captions'}
            </button>
            <button
              className="primary-button transcript-analyze-button"
              type="button"
              onClick={analyzeCapturedTranscript}
              disabled={analyzingTranscript || transcriptRef.current.trim().length < 20}
            >
              <Sparkles size={15} />
              {analyzingTranscript ? 'Analyzing…' : 'Analyze & save tasks'}
            </button>
          </div>
        </div>
        <div className="live-transcript-text" aria-live="polite">
          {transcript || interimTranscript ? (
            <>
              <span>{transcript}</span>
              {interimTranscript && <span className="transcript-interim">{transcript ? ' ' : ''}{interimTranscript}</span>}
            </>
          ) : (
            <span className="muted-text">Your live transcript will appear here.</span>
          )}
        </div>
        <p className="transcript-privacy-note">Speech recognition uses your browser’s speech service. The transcript is sent to Meetgrow for AI analysis only when you choose to analyze it.</p>
        {transcriptMessage && <p className="transcript-status" role="status">{transcriptMessage}</p>}
        {transcriptError && <p className="task-error" role="alert">{transcriptError}</p>}
      </section>

      <footer className="call-controls">
        <div className="participant-count"><Users size={17} /><span>{participantCount} {participantCount === 1 ? 'person' : 'people'}</span></div>
        <div className="call-control-buttons">
          <button className={`call-control ${!micOn ? 'is-off' : ''}`} type="button" onClick={toggleMic} aria-label={micOn ? 'Mute microphone' : 'Turn on microphone'}>
            {micOn ? <Mic size={19} /> : <MicOff size={19} />}
          </button>
          <button className={`call-control ${!cameraOn ? 'is-off' : ''}`} type="button" onClick={toggleCamera} aria-label={cameraOn ? 'Turn off camera' : 'Turn on camera'}>
            {cameraOn ? <Video size={19} /> : <VideoOff size={19} />}
          </button>
          <button className="call-control leave-call-button" type="button" onClick={onLeave} aria-label="Leave meeting">
            <X size={20} />
          </button>
        </div>
        <div className="call-room-code">Room <strong>{roomCode}</strong></div>
      </footer>
    </section>
  );
}

function RemoteVideo({ id, stream }) {
  const video = useRef(null);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="video-tile">
      <video ref={video} autoPlay playsInline />
      <span className="video-name">Guest {id.slice(0, 4)}</span>
    </div>
  );
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
