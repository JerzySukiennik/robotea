// Robotea: two-player link (room code, ntfy.sh signaling, WebRTC data channels for hand poses and high-five events)
const NTFY = 'https://ntfy.sh/';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const POSE_FLOATS = 29;

export const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => ALPHA[b % ALPHA.length]).join('');
export const cleanCode = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

export function packPose(s, out = new Float32Array(POSE_FLOATS)) {
  let k = 0;
  for (const v of [s.L, s.R]) { out[k++] = v.x; out[k++] = v.y; out[k++] = v.z; }
  for (const q of [s.qL, s.qR]) { out[k++] = q.x; out[k++] = q.y; out[k++] = q.z; out[k++] = q.w; }
  for (const c of [s.cL, s.cR]) for (let i = 0; i < 6; i++) out[k++] = c[i];
  out[k++] = s.lean; out[k++] = s.side; out[k++] = s.twist;
  return out;
}

export function unpackPose(buf, THREE) {
  const a = new Float32Array(buf);
  if (a.length < POSE_FLOATS) return null;
  let k = 0;
  const v = () => new THREE.Vector3(a[k++], a[k++], a[k++]);
  const q = () => new THREE.Quaternion(a[k++], a[k++], a[k++], a[k++]);
  const L = v(), R = v(), qL = q(), qR = q();
  const cL = Array.from(a.slice(k, k + 6)); k += 6;
  const cR = Array.from(a.slice(k, k + 6)); k += 6;
  return { L, R, qL, qR, cL, cR, lean: a[k++], side: a[k++], twist: a[k++] };
}

export function createLink({ code, host, onState = () => {}, onPose = () => {}, onEvent = () => {} }) {
  const me = Math.random().toString(36).slice(2, 10);
  const topic = 'robotea-hf-' + code.toLowerCase();
  let other = null, pc = null, pose = null, evt = null, remoteReady = false, closed = false, helloTimer = null, es = null;
  const pendingIce = [];
  const send = msg => fetch(NTFY + topic, { method: 'POST', body: JSON.stringify({ ...msg, f: me }) }).catch(() => {});

  function wire(ch) {
    ch.binaryType = 'arraybuffer';
    ch.onmessage = e => {
      if (ch.label === 'pose') onPose(e.data);
      else { try { onEvent(JSON.parse(e.data)); } catch {} }
    };
    const opened = () => {
      if (pose?.readyState === 'open' && evt?.readyState === 'open') {
        onState('open');
        clearInterval(helloTimer);
        es?.close();
      }
    };
    ch.onclose = () => { if (!closed) onState('lost'); };
    if (ch.readyState === 'open') opened(); else ch.onopen = opened;
  }

  function makePc() {
    pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = e => { if (e.candidate) send({ t: 'ice', to: other, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed') onState('failed');
      else if (s === 'disconnected' || s === 'closed') { if (!closed) onState('lost'); }
    };
    pc.ondatachannel = e => {
      if (e.channel.label === 'pose') pose = e.channel;
      else if (e.channel.label === 'evt') evt = e.channel;
      else return e.channel.close();
      wire(e.channel);
    };
  }

  async function flushIce() {
    remoteReady = true;
    while (pendingIce.length) { try { await pc.addIceCandidate(pendingIce.shift()); } catch {} }
  }

  async function handle(m) {
    if (m.f === me || (m.to && m.to !== me)) return;
    if (host && m.t === 'hello' && !pc) {
      other = m.f;
      makePc();
      pose = pc.createDataChannel('pose', { ordered: false, maxRetransmits: 0 });
      evt = pc.createDataChannel('evt');
      wire(pose);
      wire(evt);
      await pc.setLocalDescription(await pc.createOffer());
      send({ t: 'offer', to: other, sdp: pc.localDescription.sdp });
      onState('connecting');
    } else if (!host && m.t === 'offer' && !pc) {
      other = m.f;
      clearInterval(helloTimer);
      makePc();
      await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await flushIce();
      await pc.setLocalDescription(await pc.createAnswer());
      send({ t: 'answer', to: other, sdp: pc.localDescription.sdp });
      onState('connecting');
    } else if (host && m.t === 'answer' && pc && m.f === other && !remoteReady) {
      await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
      await flushIce();
    } else if (m.t === 'ice' && m.f === other) {
      if (remoteReady) { try { await pc.addIceCandidate(m.c); } catch {} }
      else pendingIce.push(m.c);
    }
  }

  es = new EventSource(NTFY + topic + '/sse');
  es.onmessage = e => {
    try {
      const d = JSON.parse(e.data);
      if (d.event && d.event !== 'message') return;
      handle(JSON.parse(d.message));
    } catch {}
  };
  es.onopen = () => {
    onState(host ? 'waiting' : 'searching');
    if (!host) { send({ t: 'hello' }); helloTimer = setInterval(() => { if (!pc) send({ t: 'hello' }); }, 2000); }
  };
  es.onerror = () => { if (!pc) onState('offline'); };

  return {
    code,
    sendPose(buf) { if (pose?.readyState === 'open' && pose.bufferedAmount < 4096) pose.send(buf); },
    sendEvent(o) { if (evt?.readyState === 'open') evt.send(JSON.stringify(o)); },
    close() { closed = true; clearInterval(helloTimer); es?.close(); try { pose?.close(); evt?.close(); pc?.close(); } catch {} },
  };
}
