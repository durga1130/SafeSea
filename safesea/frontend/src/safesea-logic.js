// ═══════════════════════════════════════════════════════════════
// SafeSea — API + Realtime layer (replaces all mock data)
// This block runs BEFORE the original application logic so that
// API, loadCoreData(), connectRealtime() and refreshMessages()
// are in scope for the rest of the script.
// ═══════════════════════════════════════════════════════════════
var API = (function () {
  var base = (window.SAFESEA_API || 'http://localhost:4000').replace(/\/$/, '');
  var token = null;
  try { token = localStorage.getItem('ss_token'); } catch (e) {}

  function headers(json) {
    var h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }
  async function req(method, path, body) {
    var opts = { method: method, headers: headers(!!body) };
    if (body) opts.body = JSON.stringify(body);
    var res = await fetch(base + path, opts);
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) { throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status)); }
    return data;
  }
  return {
    get base() { return base; },
    get token() { return token; },
    setToken: function (t) { token = t; try { localStorage.setItem('ss_token', t); } catch (e) {} },
    clearToken: function () { token = null; try { localStorage.removeItem('ss_token'); } catch (e) {} },
    login: function (username, password, role, nationality) {
      return req('POST', '/api/auth/login', { username: username, password: password, role: role, nationality: nationality });
    },
    signup: function (payload) { return req('POST', '/api/auth/signup', payload); },
    getVessels: function () { return req('GET', '/api/vessels'); },
    getNotifications: function () { return req('GET', '/api/notifications'); },
    getInbox: function () { return req('GET', '/api/messages/inbox'); },
    getSent: function () { return req('GET', '/api/messages/sent'); },
    sendMessage: function (m) { return req('POST', '/api/messages', m); },
    replyMessage: function (id, body) { return req('POST', '/api/messages/' + id + '/reply', { body: body }); },
    sendSOS: function (body) { return req('POST', '/api/sos', { body: body }); }
  };
})();

// Load fleet + notifications from the database on dashboard init
async function loadCoreData() {
  try { VESSELS = await API.getVessels(); } catch (e) { console.warn('vessels load failed', e); VESSELS = []; }
  try { APP.notifications = await API.getNotifications(); } catch (e) { console.warn('notif load failed', e); APP.notifications = []; }
}

// Fetch inbox + sent from the database and re-render every message view
async function refreshMessages() {
  try { APP.inbox = await API.getInbox(); } catch (e) { APP.inbox = APP.inbox || []; }
  try { APP.sentEmails = await API.getSent(); } catch (e) { APP.sentEmails = APP.sentEmails || []; }
  var badge = document.getElementById('inbox-badge');
  var unread = (APP.inbox || []).filter(function (m) { return m.unread; }).length;
  if (badge) { badge.style.display = unread ? 'flex' : 'none'; badge.textContent = unread; }
  var ac = document.getElementById('admin-inbox-count'); if (ac) ac.textContent = (APP.inbox || []).length + ' msgs';
  if (typeof renderInboxPage === 'function') renderInboxPage();
  if (typeof renderSentPage === 'function') renderSentPage();
  if (typeof renderFishSentList === 'function') renderFishSentList();
}

// Socket.IO — real-time vessel tracking + live notifications
function connectRealtime() {
  if (!window.io) { setTimeout(connectRealtime, 800); return; }
  if (window._ssSocket) return;
  var s = window.io(API.base, { transports: ['websocket', 'polling'], auth: { token: API.token } });
  window._ssSocket = s;
  s.on('vessels:update', function (list) {
    if (Array.isArray(list)) {
      VESSELS = list;
      if (typeof fillVesselTable === 'function') fillVesselTable();
      refreshFleetMarkers();
    }
  });
  s.on('notification:new', function (n) {
    APP.notifications = [n].concat(APP.notifications || []);
    if (typeof renderNotifications === 'function') renderNotifications();
  });
}

// Draw / redraw other-vessel markers on the Leaflet map (skips owned vessel index 0)
function refreshFleetMarkers() {
  if (!window.L || !map) return;
  if (!window._fleetLayer) { window._fleetLayer = L.layerGroup().addTo(map); }
  window._fleetLayer.clearLayers();
  VESSELS.forEach(function (v, i) {
    if (i === 0) return;
    var col = v.zone === 'safe' ? '#00ff88' : v.zone === 'warning' ? '#ffd600' : '#ff2244';
    L.marker([v.lat, v.lon], { icon: L.divIcon({ html: '<div style="width:10px;height:10px;border-radius:50%;background:' + col + ';box-shadow:0 0 10px ' + col + ';border:1.5px solid rgba(255,255,255,.4)"></div>', className: '', iconAnchor: [5, 5] }) })
      .addTo(window._fleetLayer)
      .bindPopup('<b>' + v.id + '</b><br>' + v.name + '<br>Risk: ' + v.risk + '%');
  });
}


// ═══════════════════════════════════════
// EMAILJS CONFIG — real sending to sharupriya3010@gmail.com
// ═══════════════════════════════════════
const EMAIL_CFG = {
  serviceId:  'service_iuhkfm4',
  templateId: '',          // Fill in your template ID
  publicKey:  '',          // Fill in your public key
  adminEmail: 'sharupriya3010@gmail.com'
};

// Load EmailJS SDK
(function(){
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  s.onload = () => {
    if (window.emailjs && EMAIL_CFG.publicKey) {
      emailjs.init(EMAIL_CFG.publicKey);
      console.log('EmailJS initialized');
    }
  };
  document.head.appendChild(s);
})();

async function sendEmailReal(toEmail, toName, subject, message, fromName) {
  const params = {
    to_email: toEmail,
    to_name: toName || 'Admin',
    from_name: fromName || (APP.user ? APP.user.fullname : 'SafeSea'),
    from_email: APP.user ? APP.user.email : 'safesea@system.in',
    subject: subject,
    message: message,
    reply_to: APP.user ? APP.user.email : 'safesea@system.in'
  };
  // Re-read settings from inputs in case user updated them
  const svcId = document.getElementById('ejs-service')?.value || EMAIL_CFG.serviceId;
  const tplId = document.getElementById('ejs-template')?.value || EMAIL_CFG.templateId;
  const pubKey = document.getElementById('ejs-pubkey')?.value || EMAIL_CFG.publicKey;
  if (svcId && tplId && pubKey && window.emailjs) {
    try {
      if (pubKey && window.emailjs) emailjs.init(pubKey);
      const r = await emailjs.send(svcId, tplId, params);
      showToast('✅ Email Sent', `Delivered to ${toEmail}`, 'var(--safe)');
      return { ok: true };
    } catch (e) {
      console.error('EmailJS error:', e);
      showToast('⚠️ Email Preview', `EmailJS error — check Template ID & Public Key`, 'var(--warn)');
      showEmailPreview(toEmail, subject, message);
      return { ok: false };
    }
  } else {
    // Show preview if not configured
    showEmailPreview(toEmail, subject, message);
    showToast('📧 Email Preview', 'Add Template ID & Public Key in Settings to send real emails', 'var(--warn)');
    return { ok: false, preview: true };
  }
}

function showEmailPreview(to, subject, body) {
  let m = document.getElementById('epv-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'epv-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;';
    m.innerHTML = `<div style="background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:28px;max-width:540px;width:92%;box-shadow:0 0 60px rgba(0,100,255,.2);max-height:85vh;overflow-y:auto;">
      <div style="font-family:'Orbitron',monospace;font-size:13px;color:var(--ac);letter-spacing:2px;margin-bottom:16px;">📧 EMAIL PREVIEW</div>
      <div style="background:rgba(0,80,180,.08);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="font-size:10px;color:var(--t3);margin-bottom:3px;">TO</div><div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--ac2);" id="epv-to"></div>
        <div style="font-size:10px;color:var(--t3);margin:8px 0 3px;">SUBJECT</div><div style="font-size:12px;color:var(--t1);font-weight:600;" id="epv-sub"></div>
      </div>
      <div style="background:rgba(0,80,180,.08);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;font-size:12px;color:var(--t2);line-height:1.7;white-space:pre-wrap;max-height:200px;overflow-y:auto;" id="epv-body"></div>
      <div style="padding:9px 12px;background:rgba(255,200,0,.07);border:1px solid rgba(255,200,0,.2);border-radius:8px;font-size:10px;color:var(--warn);margin-bottom:14px;">
        💡 To send real emails: Go to Settings → add your EmailJS Template ID and Public Key. Service ID is already set to <b>service_iuhkfm4</b>.
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="navigator.clipboard.writeText(document.getElementById('epv-body').textContent).then(()=>showToast('Copied!','','var(--safe)'))" style="padding:9px 18px;border-radius:9px;border:none;background:linear-gradient(135deg,#004ecc,#00aaff);color:#fff;font-family:'Orbitron',monospace;font-size:10px;font-weight:700;cursor:pointer;">📋 COPY</button>
        <button onclick="document.getElementById('epv-modal').style.display='none'" style="padding:9px 18px;border-radius:9px;border:1px solid var(--border);background:rgba(0,80,180,.08);color:var(--t2);font-size:11px;cursor:pointer;">✕ Close</button>
      </div>
    </div>`;
    document.body.appendChild(m);
  }
  document.getElementById('epv-to').textContent = to;
  document.getElementById('epv-sub').textContent = subject;
  document.getElementById('epv-body').textContent = body;
  m.style.display = 'flex';
}

// ═══════════════════════════════════════
// i18n
// ═══════════════════════════════════════
const LANG = {
  en: {
    appName:'SAFESEA',tag:'Maritime Boundary Navigation System',
    selRole:'Select Role',rFish:'Fisherman',rCrew:'Crew',rAdmin:'Admin',
    username:'Username / Vessel ID',password:'Password',nationality:'Nationality',
    remember:'Remember me',forgot:'Forgot Password?',loginBtn:'⚓ INITIALIZE NAVIGATION',
    noAcc:"Don't have an account?",signUp:'Sign Up',secure:'Secure AIS v4.2 · IMO Compliant',
    navMap:'Live Map',navDash:'Dashboard',navInbox:'Inbox',navSent:'Sent',navNotif:'Alerts',navProf:'Profile',navSet:'Settings',navOut:'Logout',
    myProf:'My Profile',settings:'Settings',notifs:'Notifications',logout:'Logout',
    safe:'Safe',warning:'Warning',restricted:'Restricted',
    riskEngine:'Risk Engine',riskLevel:'RISK LEVEL',liveData:'Live Data',
    speed:'Speed',heading:'Heading',latitude:'Latitude',longitude:'Longitude',distBorder:'Dist. Border',etaBorder:'ETA Border',
    weather:'Marine Weather',wave:'Wave',wind:'Wind',visibility:'Visibility',pressure:'Pressure',
    boundaries:'Boundaries',alertsEmail:'Alerts',sosBroadcast:'SOS Broadcast',
    emailOff:'Email Alerts Off',emailOn:'Email Alerts On',voiceOff:'Voice Warnings Off',voiceOn:'Voice Warnings On',
    voiceLang:'VOICE LANGUAGE',alertEmailLbl:'ALERT EMAIL',testEmail:'📧 SEND TEST EMAIL',sosDesc:'Sends location + risk email to Admin',
    probEngine:'Probability Engine',riskComp:'Risk Components',traj:'Trajectory',
    inboxTitle:'INBOX',allMsgs:'ALL MESSAGES',sentTitle:'SENT EMAILS',
    composeBtn:'+ COMPOSE',sentEmails:'📧 MESSAGES',noSent:'No messages yet',
    fishHello:'Welcome, Fisher!',fishSub:'Stay safe — monitor your position and boundaries below.',
    crewHello:'Welcome, Crew!',crewSub:'Monitor navigation and broadcast SOS if needed.',
    zoneSafe:'SAFE ZONE',zoneWarn:'WARNING ZONE',zoneDanger:'DANGER ZONE',
    alertTitle:'MARITIME BOUNDARY VIOLATION',
    ackBtn:'ACKNOWLEDGE',sosBtn:'CONTACT COAST GUARD',
    replyTitle:'↩️ REPLY',replyBtn:'📧 SEND REPLY',saveBtn:'SAVE SETTINGS',
  },
  ta: {
    appName:'SAFESEA',tag:'கடல் எல்லை வழிசெலுத்தல்',
    selRole:'பங்கு தேர்வு',rFish:'மீனவர்',rCrew:'குழு',rAdmin:'நிர்வாகி',
    username:'பயனர்பெயர்',password:'கடவுச்சொல்',nationality:'தேசியம்',
    remember:'என்னை நினைவில் வை',forgot:'கடவுச்சொல் மறந்தீர்களா?',loginBtn:'⚓ வழிசெலுத்தல் தொடங்கு',
    noAcc:'கணக்கு இல்லையா?',signUp:'பதிவு செய்க',secure:'பாதுகாப்பான AIS v4.2',
    navMap:'நேரடி வரைபடம்',navDash:'டாஷ்போர்டு',navInbox:'இன்பாக்ஸ்',navSent:'அனுப்பியவை',navNotif:'எச்சரிக்கைகள்',navProf:'சுயவிவரம்',navSet:'அமைப்புகள்',navOut:'வெளியேறு',
    myProf:'என் சுயவிவரம்',settings:'அமைப்புகள்',notifs:'அறிவிப்புகள்',logout:'வெளியேறு',
    safe:'பாதுகாப்பு',warning:'எச்சரிக்கை',restricted:'தடைசெய்யப்பட்டது',
    riskEngine:'ஆபத்து எஞ்சின்',riskLevel:'ஆபத்து நிலை',liveData:'நேரடி தரவு',
    speed:'வேகம்',heading:'திசை',latitude:'அட்சரேகை',longitude:'தீர்க்கரேகை',distBorder:'எல்லை தூரம்',etaBorder:'எல்லை நேரம்',
    weather:'கடல் வானிலை',wave:'அலை',wind:'காற்று',visibility:'தெரிவுத்திறன்',pressure:'அழுத்தம்',
    boundaries:'எல்லைகள்',alertsEmail:'எச்சரிக்கை',sosBroadcast:'SOS அறிவிப்பு',
    emailOff:'மின்னஞ்சல் முடக்கம்',emailOn:'மின்னஞ்சல் இயக்கம்',voiceOff:'குரல் முடக்கம்',voiceOn:'குரல் இயக்கம்',
    voiceLang:'குரல் மொழி',alertEmailLbl:'எச்சரிக்கை மின்னஞ்சல்',testEmail:'📧 சோதனை மின்னஞ்சல்',sosDesc:'நிலை + ஆபத்தை நிர்வாகிக்கு அனுப்பு',
    probEngine:'நிகழ்தகவு எஞ்சின்',riskComp:'ஆபத்து கூறுகள்',traj:'பாதை முன்னறிவிப்பு',
    inboxTitle:'இன்பாக்ஸ்',allMsgs:'அனைத்து செய்திகளும்',sentTitle:'அனுப்பிய மின்னஞ்சல்கள்',
    composeBtn:'+ உருவாக்கு',sentEmails:'📧 செய்திகள்',noSent:'செய்திகள் இல்லை',
    fishHello:'வரவேற்கிறோம், மீனவரே!',fishSub:'பாதுகாப்பாக இருங்கள்.',
    crewHello:'வரவேற்கிறோம், குழுவே!',crewSub:'வழிசெலுத்தலை கண்காணியுங்கள்.',
    zoneSafe:'பாதுகாப்பான மண்டலம்',zoneWarn:'எச்சரிக்கை மண்டலம்',zoneDanger:'ஆபத்தான மண்டலம்',
    alertTitle:'கடல் எல்லை மீறல்',ackBtn:'✓ ஒப்புக்கொள்',sosBtn:'🆘 SOS அனுப்பு',
    replyTitle:'↩️ பதில்',replyBtn:'📧 அனுப்பு',saveBtn:'சேமி',
  },
  hi: {
    appName:'SAFESEA',tag:'समुद्री सीमा नेविगेशन',
    selRole:'भूमिका चुनें',rFish:'मछुआरा',rCrew:'दल',rAdmin:'प्रशासक',
    username:'उपयोगकर्ता नाम',password:'पासवर्ड',nationality:'राष्ट्रीयता',
    remember:'मुझे याद रखें',forgot:'पासवर्ड भूले?',loginBtn:'⚓ नेविगेशन शुरू',
    noAcc:'खाता नहीं?',signUp:'साइन अप',secure:'सुरक्षित AIS v4.2',
    navMap:'लाइव मैप',navDash:'डैशबोर्ड',navInbox:'इनबॉक्स',navSent:'भेजे',navNotif:'अलर्ट',navProf:'प्रोफ़ाइल',navSet:'सेटिंग्स',navOut:'लॉग आउट',
    myProf:'मेरी प्रोफ़ाइल',settings:'सेटिंग्स',notifs:'सूचनाएं',logout:'लॉग आउट',
    safe:'सुरक्षित',warning:'चेतावनी',restricted:'प्रतिबंधित',
    riskEngine:'जोखिम इंजन',riskLevel:'जोखिम स्तर',liveData:'लाइव डेटा',
    speed:'गति',heading:'दिशा',latitude:'अक्षांश',longitude:'देशांतर',distBorder:'सीमा दूरी',etaBorder:'ETA',
    weather:'समुद्री मौसम',wave:'लहर',wind:'हवा',visibility:'दृश्यता',pressure:'दबाव',
    boundaries:'सीमाएं',alertsEmail:'अलर्ट',sosBroadcast:'SOS प्रसारण',
    emailOff:'ईमेल बंद',emailOn:'ईमेल चालू',voiceOff:'वॉयस बंद',voiceOn:'वॉयस चालू',
    voiceLang:'वॉयस भाषा',alertEmailLbl:'अलर्ट ईमेल',testEmail:'📧 टेस्ट ईमेल',sosDesc:'स्थान + जोखिम ईमेल भेजें',
    probEngine:'संभावना इंजन',riskComp:'जोखिम घटक',traj:'पथ पूर्वानुमान',
    inboxTitle:'इनबॉक्स',allMsgs:'सभी संदेश',sentTitle:'भेजे गए ईमेल',
    composeBtn:'+ लिखें',sentEmails:'📧 संदेश',noSent:'कोई संदेश नहीं',
    fishHello:'स्वागत, मछुआरे!',fishSub:'सुरक्षित रहें।',
    crewHello:'स्वागत, दल!',crewSub:'नेविगेशन देखें।',
    zoneSafe:'सुरक्षित क्षेत्र',zoneWarn:'चेतावनी क्षेत्र',zoneDanger:'खतरनाक क्षेत्र',
    alertTitle:'सीमा उल्लंघन',ackBtn:'✓ स्वीकार',sosBtn:'🆘 SOS',
    replyTitle:'↩️ जवाब',replyBtn:'📧 भेजें',saveBtn:'सहेजें',
  },
  ml: {
    appName:'SAFESEA',tag:'സമുദ്ര അതിർത്തി നാവിഗേഷൻ',
    selRole:'റോൾ',rFish:'മൽസ്യത്തൊഴിലാളി',rCrew:'ക്രൂ',rAdmin:'അഡ്മിൻ',
    username:'ഉപയോക്തൃനാമം',password:'പാസ്‌വേഡ്',nationality:'ദേശീയത',
    remember:'ഓർക്കുക',forgot:'മറന്നോ?',loginBtn:'⚓ ആരംഭിക്കുക',
    noAcc:'അക്കൗണ്ട് ഇല്ലേ?',signUp:'സൈൻ അപ്',secure:'AIS v4.2',
    navMap:'ലൈവ് മാപ്',navDash:'ഡാഷ്ബോർഡ്',navInbox:'ഇൻബോക്സ്',navSent:'അയച്ചവ',navNotif:'അലേർട്ട്',navProf:'പ്രൊഫൈൽ',navSet:'ക്രമീകരണം',navOut:'ലോഗ് ഔട്ട്',
    myProf:'പ്രൊഫൈൽ',settings:'ക്രമീകരണം',notifs:'അറിയിപ്പ്',logout:'ലോഗ് ഔട്ട്',
    safe:'സുരക്ഷിതം',warning:'മുന്നറിയിപ്പ്',restricted:'നിരോധിതം',
    riskEngine:'റിസ്ക് എഞ്ചിൻ',riskLevel:'റിസ്ക് നില',liveData:'ഡേറ്റ',
    speed:'വേഗത',heading:'ദിശ',latitude:'അക്ഷാംശം',longitude:'രേഖാംശം',distBorder:'ദൂരം',etaBorder:'ETA',
    weather:'കാലാവസ്ഥ',wave:'തിര',wind:'കാറ്റ്',visibility:'ദൃശ്യത',pressure:'മർദ്ദം',
    boundaries:'അതിർത്തി',alertsEmail:'അലേർട്ട്',sosBroadcast:'SOS',
    emailOff:'ഇമെയിൽ ഓഫ്',emailOn:'ഇമെയിൽ ഓൺ',voiceOff:'ശബ്ദം ഓഫ്',voiceOn:'ശബ്ദം ഓൺ',
    voiceLang:'ഭാഷ',alertEmailLbl:'ഇമെയിൽ',testEmail:'📧 ടെസ്റ്റ്',sosDesc:'അഡ്മിന് ഇമെയിൽ',
    probEngine:'സാധ്യത',riskComp:'ഘടകങ്ങൾ',traj:'പഥം',
    inboxTitle:'ഇൻബോക്സ്',allMsgs:'സന്ദേശങ്ങൾ',sentTitle:'അയച്ചവ',
    composeBtn:'+ എഴുത്',sentEmails:'📧 സന്ദേശം',noSent:'ഒന്നും ഇല്ല',
    fishHello:'സ്വാഗതം!',fishSub:'സുരക്ഷിതരായിരിക്കുക.',
    crewHello:'സ്വാഗതം, ക്രൂ!',crewSub:'നാവിഗേഷൻ നിരീക്ഷിക്കുക.',
    zoneSafe:'സുരക്ഷിത മേഖല',zoneWarn:'മുന്നറിയിപ്പ് മേഖല',zoneDanger:'അപകട മേഖല',
    alertTitle:'അതിർത്തി ലംഘനം',ackBtn:'✓ സ്വീകരിക്കുക',sosBtn:'🆘 SOS',
    replyTitle:'↩️ മറുപടി',replyBtn:'📧 അയക്കുക',saveBtn:'സേവ്',
  },
  te: {
    appName:'SAFESEA',tag:'సముద్ర సరిహద్దు నావిగేషన్',
    selRole:'పాత్ర',rFish:'మత్స్యకారుడు',rCrew:'సిబ్బంది',rAdmin:'నిర్వాహకుడు',
    username:'వినియోగదారు',password:'పాస్‌వర్డ్',nationality:'జాతీయత',
    remember:'గుర్తుంచుకో',forgot:'మర్చిపోయారా?',loginBtn:'⚓ ప్రారంభించు',
    noAcc:'అకౌంట్ లేదా?',signUp:'సైన్ అప్',secure:'AIS v4.2',
    navMap:'మ్యాప్',navDash:'డాష్‌బోర్డ్',navInbox:'ఇన్‌బాక్స్',navSent:'పంపిన',navNotif:'అలర్ట్‌లు',navProf:'ప్రొఫైల్',navSet:'సెట్టింగ్‌లు',navOut:'లాగ్ అవుట్',
    myProf:'ప్రొఫైల్',settings:'సెట్టింగ్‌లు',notifs:'నోటిఫికేషన్‌లు',logout:'లాగ్ అవుట్',
    safe:'సురక్షితం',warning:'హెచ్చరిక',restricted:'నిషేధం',
    riskEngine:'రిస్క్',riskLevel:'రిస్క్ స్థాయి',liveData:'డేటా',
    speed:'వేగం',heading:'దిశ',latitude:'అక్షాంశం',longitude:'రేఖాంశం',distBorder:'దూరం',etaBorder:'ETA',
    weather:'వాతావరణం',wave:'అలల',wind:'గాలి',visibility:'దృశ్యత',pressure:'ఒత్తిడి',
    boundaries:'సరిహద్దులు',alertsEmail:'అలర్ట్',sosBroadcast:'SOS',
    emailOff:'ఇమెయిల్ ఆఫ్',emailOn:'ఇమెయిల్ ఆన్',voiceOff:'వాయిస్ ఆఫ్',voiceOn:'వాయిస్ ఆన్',
    voiceLang:'భాష',alertEmailLbl:'ఇమెయిల్',testEmail:'📧 టెస్ట్',sosDesc:'అడ్మిన్‌కి ఇమెయిల్',
    probEngine:'సంభావ్యత',riskComp:'భాగాలు',traj:'పథం',
    inboxTitle:'ఇన్‌బాక్స్',allMsgs:'సందేశాలు',sentTitle:'పంపిన ఇమెయిల్‌లు',
    composeBtn:'+ రాయండి',sentEmails:'📧 సందేశం',noSent:'ఏమీ లేదు',
    fishHello:'స్వాగతం!',fishSub:'సురక్షితంగా ఉండండి.',
    crewHello:'స్వాగతం, సిబ్బంది!',crewSub:'నావిగేషన్ నిరీక్షించండి.',
    zoneSafe:'సురక్షిత',zoneWarn:'హెచ్చరిక',zoneDanger:'ప్రమాదం',
    alertTitle:'సరిహద్దు ఉల్లంఘన',ackBtn:'✓ అంగీకరించు',sosBtn:'🆘 SOS',
    replyTitle:'↩️ జవాబు',replyBtn:'📧 పంపు',saveBtn:'సేవ్',
  }
};

const APP = {
  lang:'en', theme:'dark', role:'fisherman', emailEnabled:false, voiceEnabled:false, alarmEnabled:true,
  alertActive:false, voiceLang:'en',
  user:{name:'fisher_001',fullname:'Ravi Kumar',email:'fisher001@gmail.com',role:'fisherman',vessel:'IND-TN-042',phone:'+91 98765 43210',col:'linear-gradient(135deg,#0044dd,#0099ff)',let:'F'},
  adminEmail:'sharupriya3010@gmail.com',
  inbox:[],       // received messages (admin sees all, fisherman sees replies)
  sentEmails:[]   // sent messages (all roles)
};

function T(k){ return (LANG[APP.lang]||LANG.en)[k]||k; }

// ═══════════════════════════════════════
// APPLY LANGUAGE
// ═══════════════════════════════════════
function applyLang(){
  const t = LANG[APP.lang]||LANG.en;
  const s = (id,k) => { const e=document.getElementById(id); if(e&&t[k])e.textContent=t[k]; };
  s('l-title','appName'); s('l-tag','tag'); s('l-role','selRole');
  s('l-rf','rFish'); s('l-rc','rCrew'); s('l-ra','rAdmin');
  ['l-user','l-pass','l-nat','l-rem'].forEach((id,i)=>{ const keys=['username','password','nationality','remember']; s(id,keys[i]); });
  s('l-frg','forgot'); s('l-btn','loginBtn'); s('l-sec','secure');
  const lf=document.getElementById('l-foot'); if(lf) lf.innerHTML=t.noAcc+' <a href="#" onclick="showPage(\'pg-signup\');return false;">'+t.signUp+'</a>';
  s('n-map','navMap'); s('n-dash','navDash'); s('n-inbox','navInbox'); s('n-sent','navSent');
  s('n-notif','navNotif'); s('n-prof','navProf'); s('n-set','navSet'); s('n-out','navOut');
  s('pd-profile','myProf'); s('pd-settings','settings'); s('pd-notif','notifs'); s('pd-logout','logout');
  s('rph-risk','riskEngine'); s('gl-risk','riskLevel'); s('zl-s','safe'); s('zl-w','warning'); s('zl-d','restricted');
  s('rph-live','liveData'); s('scl-spd','speed'); s('scl-hdg','heading');
  s('scl-lat','latitude'); s('scl-lon','longitude'); s('scl-dist','distBorder'); s('scl-eta','etaBorder');
  s('rph-prob','probEngine'); s('ct-comp','riskComp'); s('ct-traj','traj');
  s('rph-wx','weather'); s('wl-wave','wave'); s('wl-wind','wind'); s('wl-vis','visibility'); s('wl-pres','pressure');
  s('rph-bound','boundaries'); s('rph-alert','alertsEmail');
  const el=document.getElementById('email-lbl'); if(el) el.textContent=APP.emailEnabled?t.emailOn:t.emailOff;
  const vl=document.getElementById('voice-lbl'); if(vl) vl.textContent=APP.voiceEnabled?t.voiceOn:t.voiceOff;
  s('vl-title','voiceLang'); s('ae-label','alertEmailLbl'); s('test-email-btn','testEmail');
  s('rph-sos','sosBroadcast'); s('sos-desc','sosDesc');
  const sosb=document.getElementById('sos-btn'); if(sosb) sosb.textContent='🆘 '+t.sosBroadcast;
  s('mk-spd','speed'); s('mk-hdg','heading');
  s('leg-safe','safe'); s('leg-warn','warning'); s('leg-rest','restricted');
  s('me-title','sentEmails');
  s('inbox-title','inboxTitle'); s('inbox-all','allMsgs');
  s('sent-title','sentTitle');
  s('set-title','settings'); s('save-btn','saveBtn'); s('notif-title','notifs');
  s('al-title','alertTitle'); s('al-ack-btn','ackBtn'); s('al-sos-btn','sosBtn');
  s('compose-btn','composeBtn');
  const nh=document.getElementById('fish-hello');
  if(nh) nh.textContent=(APP.role==='crew'?'⚓ ':'🎣 ')+(APP.role==='crew'?t.crewHello:t.fishHello)+', '+(APP.user.fullname.split(' ')[0]||'')+'!';
  const ns=document.getElementById('fish-sub'); if(ns) ns.textContent=APP.role==='crew'?t.crewSub:t.fishSub;
  // Lang dropdowns
  document.querySelectorAll('.ld-item,.lo').forEach(el=>{
    const m=(el.getAttribute('onclick')||'').match(/setLang\('(\w+)'/);
    if(m) el.classList.toggle('active',m[1]===APP.lang);
  });
  const lshort={en:'EN',ta:'த',hi:'हि',ml:'മ',te:'తె'};
  ['langLabel','langLabel2'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=lshort[APP.lang]||'EN';});
  renderNotifications();
}
function setLang(lang){ APP.lang=lang; applyLang(); closeLangDrop(); }
function toggleLangDrop(e){e.stopPropagation();document.getElementById('langDropMenu').classList.toggle('open');}
function toggleLangDrop2(e){e.stopPropagation();document.getElementById('langDropMenu2').classList.toggle('open');}
function closeLangDrop(){['langDropMenu','langDropMenu2'].forEach(id=>document.getElementById(id).classList.remove('open'));}
document.addEventListener('click',()=>closeLangDrop());

// ═══════════════════════════════════════
// PAGE / NAV
// ═══════════════════════════════════════
function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const p=document.getElementById(id); if(p)p.classList.add('active');
  const c=p&&p.querySelector('.auth-card');
  if(c){c.style.animation='none';c.offsetHeight;c.style.animation='cardIn .65s cubic-bezier(.34,1.4,.64,1) both';}
}
function navTo(section){
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('active'));
  const ni=document.getElementById('ni-'+section); if(ni)ni.classList.add('active');
  document.querySelectorAll('.cp').forEach(p=>p.classList.remove('active'));
  if(section==='dashboard'){
    const dsh=APP.role==='admin'?'cp-dashboard':'cp-fish-dash';
    const el=document.getElementById(dsh); if(el)el.classList.add('active');
  } else {
    const cp=document.getElementById('cp-'+section); if(cp)cp.classList.add('active');
  }
  const ca=document.getElementById('contentArea');
  const rp=document.getElementById('rpanel');
  if(section==='map'){
    ca.classList.add('map-mode'); rp.classList.add('active');
    document.getElementById('cp-map').classList.add('active');
  } else {
    ca.classList.remove('map-mode'); rp.classList.remove('active');
  }
  // Refresh sent/inbox on navigate
  if(section==='sent'||section==='inbox') refreshMessages();
}
function togglePDrop(){document.getElementById('pdrop').classList.toggle('open');}
function closePDrop(){document.getElementById('pdrop').classList.remove('open');}
document.addEventListener('click',e=>{const ub=document.querySelector('.ubadge');const pd=document.getElementById('pdrop');if(pd&&ub&&!ub.contains(e.target))pd.classList.remove('open');});

// ═══════════════════════════════════════
// AUTH
// ═══════════════════════════════════════
let selRoleVal='fisherman';
function selRole(r,btn){
  selRoleVal=r;
  document.querySelectorAll('#pg-login .rbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const c={fisherman:{u:'fisher_001',p:'pass123'},crew:{u:'crew_001',p:'crew123'},admin:{u:'admin',p:'admin123'}};
  if(c[r]){document.getElementById('li-user').value=c[r].u;document.getElementById('li-pass').value=c[r].p;}
}
let selRoleSVal='fisherman';
function selRoleS(r,btn){selRoleSVal=r;document.querySelectorAll('#pg-signup .rbtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}

async function doLogin(){
  const u=document.getElementById('li-user').value.trim();
  const p=document.getElementById('li-pass').value.trim();
  const nat=document.getElementById('li-nat')?.value||'IND';
  if(!u||!p){showToast('Error','Please enter credentials','var(--danger)');return;}
  let data;
  try{ data=await API.login(u,p,selRoleVal,nat); }
  catch(err){ showToast('Login Failed',err.message||'Invalid credentials','var(--danger)');return; }
  API.setToken(data.token);
  const user=data.user; APP.role=user.role;
  const style={fisherman:{col:'linear-gradient(135deg,#0044dd,#0099ff)',let:'F'},
    crew:{col:'linear-gradient(135deg,#006633,#00aa55)',let:'C'},
    admin:{col:'linear-gradient(135deg,#880000,#cc2200)',let:'A'}}[user.role]||{col:'linear-gradient(135deg,#0044dd,#0099ff)',let:'F'};
  Object.assign(APP.user,{name:user.username,fullname:user.fullname,email:user.email,
    vessel:user.vessel,phone:user.phone,role:user.role},style);
  APP.adminEmail=document.getElementById('admin-email-input')?.value||APP.adminEmail;
  const card=document.querySelector('#pg-login .auth-card');
  card.style.transition='all .4s ease';card.style.transform='scale(.92) translateY(-22px)';card.style.opacity='0';
  setTimeout(()=>{showPage('pg-dash');document.getElementById('pg-dash').classList.add('active');initDash();},420);
}
function doLogout(){
  API.clearToken();if(window._ssSocket){try{window._ssSocket.disconnect();}catch(e){}window._ssSocket=null;}
  stopSim();showPage('pg-login');
  document.getElementById('pg-dash').classList.remove('active');
  const card=document.querySelector('#pg-login .auth-card');
  card.style.transition='none';card.style.transform='';card.style.opacity='';
  card.style.animation='cardIn .65s cubic-bezier(.34,1.4,.64,1) both';
  closePDrop();showToast(T('logout'),'Session ended safely','var(--ac)');
}
async function doSignup(){
  const name=document.getElementById('su-name')?.value.trim();
  const vessel=document.getElementById('su-vessel')?.value.trim();
  const email=document.getElementById('su-email')?.value.trim();
  const phone=document.getElementById('su-phone')?.value.trim();
  const pwEls=document.querySelectorAll('#pg-signup input[type=password]');
  const pw=pwEls[0]?.value||'', cpw=pwEls[1]?.value||'';
  if(!name||!email||!pw){showToast('Error','Name, email and password required','var(--danger)');return;}
  if(pw!==cpw){showToast('Error','Passwords do not match','var(--danger)');return;}
  try{
    await API.signup({username:email.split('@')[0],password:pw,fullname:name,email,phone,vessel,role:selRoleSVal});
    showToast('Account Created!','Welcome to SafeSea. Please login.','var(--safe)');
    setTimeout(()=>showPage('pg-login'),1500);
  }catch(err){showToast('Signup Failed',err.message||'Could not create account','var(--danger)');}
}

// ═══════════════════════════════════════
// DASHBOARD INIT
// ═══════════════════════════════════════
async function initDash(){
  applyLang();
  await loadCoreData();
  connectRealtime();
  const u=APP.user;
  document.getElementById('nav-av').style.background=u.col;
  document.getElementById('nav-av').textContent=u.let;
  document.getElementById('nav-un').textContent=u.name;
  document.getElementById('nav-ur').textContent={fisherman:T('rFish'),crew:T('rCrew'),admin:T('rAdmin')}[APP.role];
  document.getElementById('pd-name').textContent=u.fullname;
  document.getElementById('pd-role').textContent={fisherman:'🎣 '+T('rFish'),crew:'⚓ '+T('rCrew'),admin:'🛡️ '+T('rAdmin')}[APP.role];
  document.getElementById('p-av').style.background=u.col;
  document.getElementById('p-av').textContent=u.let;
  document.getElementById('p-nm').textContent=u.fullname;
  document.getElementById('p-em').textContent=u.email;
  const rbadge=document.getElementById('p-rb');
  rbadge.textContent={fisherman:'🎣 '+T('rFish'),crew:'⚓ '+T('rCrew'),admin:'🛡️ '+T('rAdmin')}[APP.role];
  const rbc={fisherman:'rgba(0,200,255,.1)',crew:'rgba(0,180,80,.1)',admin:'rgba(200,0,0,.1)'};
  const rbc2={fisherman:'var(--ac)',crew:'var(--safe)',admin:'var(--danger)'};
  rbadge.style.background=rbc[APP.role]; rbadge.style.color=rbc2[APP.role]; rbadge.style.borderColor=rbc2[APP.role];
  const isAdmin=APP.role==='admin';
  document.querySelectorAll('.admin-only').forEach(el=>el.style.display=isAdmin?'':'none');
  document.querySelectorAll('.admin-settings').forEach(el=>el.style.display=isAdmin?'flex':'none');
  // SOS visible for fisherman AND crew
  document.getElementById('sos-section').style.display=(APP.role!=='admin')?'block':'none';
  document.getElementById('dash-sos-btn').style.display=(APP.role!=='admin')?'inline-block':'none';
  // Sent nav visible for all
  document.getElementById('ni-sent').style.display='flex';
  document.getElementById('alert-email-disp').textContent=APP.adminEmail;
  document.getElementById('admin-email-input').value=APP.adminEmail;
  document.getElementById('dash-title').textContent={admin:'🛡️ ADMIN COMMAND CENTER',crew:'⚓ CREW DASHBOARD',fisherman:'🎣 FISHERMAN DASHBOARD'}[APP.role];
  buildProfileGrid();
  fillVesselTable();
  renderNotifications();
  refreshMessages();
  setTimeout(drawCharts,100);
  // fish/crew greeting
  document.getElementById('fish-hello').textContent=(APP.role==='crew'?'⚓ ':' 🎣 ')+(APP.role==='crew'?T('crewHello'):T('fishHello'))+', '+u.fullname.split(' ')[0]+'!';
  document.getElementById('fish-sub').textContent=APP.role==='crew'?T('crewSub'):T('fishSub');
  initMap();
  navTo('map');
  showToast('✅ Welcome',u.fullname+' · '+{fisherman:T('rFish'),crew:T('rCrew'),admin:T('rAdmin')}[APP.role],'var(--safe)');
  // Welcome voice — fires for ALL roles always (login button = user gesture = no browser block)
  setTimeout(()=>speakWelcome(), 800);
}

function buildProfileGrid(){
  const u=APP.user; const isAdmin=APP.role==='admin';
  document.getElementById('profile-grid').innerHTML=`
    <div class="pcard"><div class="pc-t">Personal Info</div>
      <div class="pc-r"><span class="pc-k">Full Name</span><span class="pc-v">${u.fullname}</span></div>
      <div class="pc-r"><span class="pc-k">Vessel ID</span><span class="pc-v">${u.vessel}</span></div>
      <div class="pc-r"><span class="pc-k">Role</span><span class="pc-v">${{fisherman:T('rFish'),crew:T('rCrew'),admin:T('rAdmin')}[APP.role]}</span></div>
      <div class="pc-r"><span class="pc-k">Email</span><span class="pc-v">${u.email}</span></div>
      <div class="pc-r"><span class="pc-k">Phone</span><span class="pc-v">${u.phone}</span></div>
    </div>
    <div class="pcard"><div class="pc-t">🎨 Appearance</div>
      <div class="theme-toggle-card">
        <div><div class="sr-l">${T('safe')==='Safe'?'Dark Mode':'Dark Mode'}</div></div>
        <div class="tog-row" style="margin:0;border:none;background:none;padding:0;" onclick="toggleTheme()">
          <div class="tog" id="profile-theme-tog"><div class="tok"></div></div>
        </div>
      </div>
      <div class="pc-r"><span class="pc-k">Theme</span><span class="pc-v" id="profile-theme-label">${APP.theme==='dark'?'Dark':'Light'}</span></div>
    </div>
    ${isAdmin?`<div class="pcard"><div class="pc-t">Admin Info</div>
      <div class="pc-r"><span class="pc-k">Alert Email</span><span class="pc-v">${APP.adminEmail}</span></div>
      <div class="pc-r"><span class="pc-k">Inbox</span><span class="pc-v" id="admin-inbox-count">${APP.inbox.length} msgs</span></div>
      <div class="pc-r"><span class="pc-k">Safety Score</span><span class="pc-v" style="color:var(--safe)">97/100</span></div>
    </div>`:`<div class="pcard"><div class="pc-t">Navigation Stats</div>
      <div class="pc-r"><span class="pc-k">Total Trips</span><span class="pc-v">147</span></div>
      <div class="pc-r"><span class="pc-k">Distance</span><span class="pc-v">12,450 nm</span></div>
      <div class="pc-r"><span class="pc-k">Safety Score</span><span class="pc-v" style="color:var(--safe)">98/100</span></div>
    </div>`}`;
}

// ═══════════════════════════════════════
// VESSEL TABLE
// ═══════════════════════════════════════
let VESSELS=[];
function fillVesselTable(){
  let h='';
  VESSELS.forEach(v=>{
    const rb=v.zone==='safe'?'rb-s':v.zone==='warning'?'rb-w':'rb-d';
    h+=`<tr><td style="font-family:'JetBrains Mono',monospace;color:var(--ac2)">${v.id}</td>
      <td>${v.name}</td><td style="font-family:'JetBrains Mono',monospace;font-size:11px">${v.lat.toFixed(3)}°N,${v.lon.toFixed(3)}°E</td>
      <td>${v.spd}kn</td><td style="color:${v.dist<10?'var(--danger)':v.dist<20?'var(--warn)':'var(--safe)'}">${v.dist}nm</td>
      <td style="color:${v.risk>70?'var(--danger)':v.risk>40?'var(--warn)':'var(--safe)'}">${v.risk}%</td>
      <td><span class="rb ${rb}">${v.zone.toUpperCase()}</span></td>
      <td><button class="tbtn" onclick="showToast('${v.id}','${v.name} · Risk ${v.risk}%','var(--ac)')">View</button></td></tr>`;
  });
  ['vtbody','vtbody2'].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML=h;});
  if(document.getElementById('v-count'))document.getElementById('v-count').textContent=VESSELS.length+' vessels';
  if(document.getElementById('kpi-v'))document.getElementById('kpi-v').textContent=VESSELS.length;
  if(document.getElementById('kpi-s'))document.getElementById('kpi-s').textContent=VESSELS.filter(v=>v.zone==='safe').length;
  if(document.getElementById('kpi-w'))document.getElementById('kpi-w').textContent=VESSELS.filter(v=>v.zone==='warning').length;
  if(document.getElementById('kpi-d'))document.getElementById('kpi-d').textContent=VESSELS.filter(v=>v.zone==='danger').length;
}

// ═══════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════
function drawCharts(){
  const rc=document.getElementById('riskChart');
  if(rc){const ctx=rc.getContext('2d');rc.width=rc.offsetWidth||400;rc.height=80;
    const d=[8,14,20,16,28,38,46,40,32,58,70,78,62,48,36,52,74,88,72,56,42,32,24,18];
    ctx.clearRect(0,0,rc.width,rc.height);const step=rc.width/d.length;const mx=Math.max(...d);
    ctx.strokeStyle='var(--ac)';ctx.lineWidth=2;ctx.shadowColor='var(--ac)';ctx.shadowBlur=8;
    ctx.beginPath();d.forEach((v,i)=>{const x=i*step+step/2;const y=rc.height-(v/mx)*(rc.height-10)-5;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();
    const g=ctx.createLinearGradient(0,0,0,rc.height);g.addColorStop(0,'rgba(0,200,255,.3)');g.addColorStop(1,'rgba(0,200,255,0)');
    ctx.fillStyle=g;ctx.shadowBlur=0;ctx.lineTo(d.length*step,rc.height);ctx.lineTo(0,rc.height);ctx.closePath();ctx.fill();}
  const sc=document.getElementById('speedChart');
  if(sc){const ctx=sc.getContext('2d');sc.width=sc.offsetWidth||400;sc.height=80;
    const bars=[5,8,12,7,4,14,10,9,3,6];const bw=sc.width/bars.length;const mx=Math.max(...bars);
    ctx.clearRect(0,0,sc.width,sc.height);
    bars.forEach((v,i)=>{const h=(v/mx)*(sc.height-10);const x=i*bw+bw*.1;const y=sc.height-h-2;
      const g=ctx.createLinearGradient(0,y,0,sc.height);g.addColorStop(0,'rgba(0,255,136,.85)');g.addColorStop(1,'rgba(0,255,136,.2)');
      ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(x,y,bw*.8,h,3);ctx.fill();});}
}

// ═══════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════
function renderNotifications(){
  const notifs=(APP.notifications||[]);
  const c=document.getElementById('notif-list'); if(!c)return;
  if(!notifs.length){c.innerHTML='<div style="padding:24px;text-align:center;font-size:12px;color:var(--t3);">No notifications</div>';return;}
  c.innerHTML=notifs.map(n=>`<div class="ni-item ${n.unread?'unread':''} ${n.sos?'sos':''}">
    <div class="ni-ico" style="background:${n.bg}">${n.ico}</div>
    <div><div class="ni-t">${n.t}</div><div class="ni-m">${n.m}</div><div class="ni-tm">${n.tm}</div></div></div>`).join('');
}

// ═══════════════════════════════════════
// EMAIL SYSTEM
// ═══════════════════════════════════════
let currentEmailIdx=-1;

function nowStr(){ return new Date().toUTCString().slice(5,25); }

function buildEmailBody(type){
  const s=APP.sim||{lat:9.25,lon:79.85,risk:0,zone:'safe',speed:0,heading:0};
  const now=nowStr();
  if(type==='sos') return `🆘 SOS ALERT — SafeSea Maritime System\n\nVessel: ${APP.user.vessel}\nFisherman: ${APP.user.fullname}\nRole: ${APP.role.toUpperCase()}\nEmail: ${APP.user.email}\n\n📍 POSITION\nLatitude: ${s.lat.toFixed(4)}°N\nLongitude: ${s.lon.toFixed(4)}°E\nGoogle Maps: https://maps.google.com/?q=${s.lat.toFixed(4)},${s.lon.toFixed(4)}\n\n⚡ STATUS\nRisk: ${s.risk}%  Zone: ${(s.zone||'').toUpperCase()}\nSpeed: ${(s.speed||0).toFixed(1)} kn  Heading: ${Math.round(s.heading||0)}°\n\nTime: ${now} UTC\n\n⚠️ This is an automated SOS from SafeSea Navigation System.`;
  if(type==='alert') return `⚠️ BOUNDARY ALERT — SafeSea\n\nVessel: ${APP.user.vessel} (${APP.user.fullname})\nRisk: ${s.risk}%\nPosition: ${s.lat.toFixed(4)}°N, ${s.lon.toFixed(4)}°E\nZone: ${(s.zone||'').toUpperCase()}\nTime: ${now} UTC`;
  return `✅ SafeSea TEST EMAIL\nVessel: ${APP.user.vessel}\nRole: ${APP.role.toUpperCase()}\nPosition: ${s.lat.toFixed(4)}°N, ${s.lon.toFixed(4)}°E\nRisk: ${s.risk}%\nTime: ${now} UTC\n\nSystem is working correctly.`;
}

function testEmail(){
  API.sendMessage({subject:'[SafeSea TEST] '+APP.user.vessel,body:buildEmailBody('test'),type:'test'})
    .then(()=>{showToast('✅ Test Sent','Test message stored','var(--safe)');return refreshMessages();})
    .catch(err=>showToast('Error',err.message||'Failed','var(--danger)'));
}

async function sendSOS(){
  try{
    await API.sendSOS(buildEmailBody('sos'));
    showToast('🆘 SOS BROADCAST','Location + risk sent to Coast Guard','var(--danger)');
    await refreshMessages();
  }catch(err){showToast('Error',err.message||'Could not send SOS','var(--danger)');}
}

function openCompose(){
  document.getElementById('cm-from').textContent=APP.user.email;
  const adminTo=document.getElementById('admin-email-input')?.value||APP.adminEmail;
  document.getElementById('cm-to').textContent=adminTo;
  document.getElementById('cm-subject').value='';
  document.getElementById('cm-message').value='';
  document.getElementById('composeModal').classList.add('open');
}
function closeCompose(){document.getElementById('composeModal').classList.remove('open');}

async function sendComposedEmail(){
  const subj=document.getElementById('cm-subject').value.trim();
  const msg=document.getElementById('cm-message').value.trim();
  if(!subj||!msg){showToast('Error','Subject and message required','var(--danger)');return;}
  try{
    await API.sendMessage({subject:subj,body:msg,type:'info'});
    closeCompose(); await refreshMessages();
    showToast('✅ Sent','Message delivered','var(--safe)');
  }catch(err){showToast('Error',err.message||'Could not send','var(--danger)');}
}

function addToInbox(email){
  APP.inbox.unshift(email);
  const b=document.getElementById('inbox-badge');
  if(b){b.style.display='flex';b.textContent=APP.inbox.length;}
  const ac=document.getElementById('admin-inbox-count');if(ac)ac.textContent=APP.inbox.length+' msgs';
  renderInboxPage();
}

function addToSent(email){
  APP.sentEmails.unshift(email);
  // Also update the fish-dash sent list
  renderFishSentList();
  renderSentPage();
}

function renderFishSentList(){
  const list=document.getElementById('my-sent-list');if(!list)return;
  const ns=document.getElementById('no-sent-msg');
  if(!APP.sentEmails.length){if(ns)ns.style.display='block';list.innerHTML='<div style="padding:18px;text-align:center;font-size:12px;color:var(--t3);" id="no-sent-msg">No messages yet</div>';return;}
  if(ns)ns.style.display='none';
  list.innerHTML=APP.sentEmails.slice(0,5).map((e,i)=>`
    <div class="me-item">
      <div class="me-sub">${e.subject}</div>
      <div class="me-meta">To: ${e.to} · ${e.time}</div>
      <span class="me-status" style="background:${e.type==='sos'?'rgba(255,34,68,.1)':'rgba(0,255,136,.1)'};color:${e.type==='sos'?'var(--danger)':'var(--safe)'}">
        ${e.type==='sos'?'🆘 SOS':'✓ Sent'}
      </span>
      ${e.reply?`<div class="reply-received">↩️ Reply: "${e.reply}"</div>`:''}
    </div>`).join('');
}

function renderInboxPage(){
  const list=document.getElementById('inbox-list');if(!list)return;
  const ic=document.getElementById('inbox-count');
  // Admin sees all; fisherman/crew sees only replies to them
  const msgs = APP.role==='admin' ? APP.inbox : APP.inbox.filter(m=>m.replyTo===APP.user.email||m.to===APP.user.email);
  if(!msgs.length){
    list.innerHTML='<div style="padding:24px;text-align:center;font-size:12px;color:var(--t3);">No messages received</div>';
    if(ic)ic.textContent='0 messages';return;
  }
  if(ic)ic.textContent=msgs.length+' messages';
  list.innerHTML=msgs.map((e,i)=>{
    const realIdx=APP.inbox.indexOf(e);
    return `<div class="email-item unread ${e.type==='sos'?'sos-email':''}" onclick="openEmailDetail(${realIdx})">
      <div class="em-header"><div class="em-from">${e.fromName||e.from} <span style="font-size:10px;color:var(--t3);">&lt;${e.from}&gt;</span></div><div class="em-time">${e.time}</div></div>
      <div class="em-subject">${e.subject}</div>
      <div class="em-preview">${e.body.substring(0,90).replace(/\n/g,' ')}...</div>
      <div class="em-tags"><span class="em-tag ${e.type==='sos'?'tag-sos':e.type==='info'?'tag-info':'tag-warn'}">${e.type==='sos'?'🆘 SOS':e.type==='info'?'ℹ️ Info':'⚠️ Alert'}</span>${e.vessel?`<span class="em-tag tag-info">🚢 ${e.vessel}</span>`:''}</div>
    </div>`;
  }).join('');
}

function renderSentPage(){
  const list=document.getElementById('sent-list');if(!list)return;
  const sc=document.getElementById('sent-count');
  if(!APP.sentEmails.length){
    list.innerHTML='<div style="padding:24px;text-align:center;font-size:12px;color:var(--t3);">No sent messages yet</div>';
    if(sc)sc.textContent='0 messages';return;
  }
  if(sc)sc.textContent=APP.sentEmails.length+' messages';
  list.innerHTML=APP.sentEmails.map((e,i)=>`
    <div class="email-item unread">
      <div class="em-header"><div class="em-from" style="color:var(--ac2)">To: ${e.to}</div><div class="em-time">${e.time}</div></div>
      <div class="em-subject">${e.subject}</div>
      <div class="em-preview">${e.body.substring(0,90).replace(/\n/g,' ')}...</div>
      <div class="em-tags">
        <span class="em-tag ${e.type==='sos'?'tag-sos':e.type==='test'?'tag-warn':'tag-info'}">${e.type==='sos'?'🆘 SOS':e.type==='test'?'🧪 Test':'📧 Message'}</span>
        <span class="em-tag tag-info">✓ Sent</span>
        ${e.reply?'<span class="em-tag" style="background:rgba(0,255,136,.1);color:var(--safe)">↩️ Replied</span>':''}
      </div>
      ${e.reply?`<div style="margin:8px 18px;padding:8px 12px;background:rgba(0,200,255,.06);border:1px solid rgba(0,200,255,.15);border-radius:8px;font-size:11px;color:var(--ac2);">↩️ Reply: "${e.reply}"</div>`:''}
    </div>`).join('');
}

function openEmailDetail(idx){
  currentEmailIdx=idx;
  const e=APP.inbox[idx];
  document.getElementById('ed-from').textContent=`${e.fromName||e.from} <${e.from}>`;
  document.getElementById('ed-to').textContent=e.to;
  document.getElementById('ed-subject').textContent=e.subject;
  document.getElementById('ed-time').textContent=e.time;
  document.getElementById('ed-body').textContent=e.body;
  document.getElementById('reply-text').value='';
  // Only show reply section for admin
  document.getElementById('reply-section').style.display=APP.role==='admin'?'block':'none';
  document.getElementById('emailDetailModal').classList.add('open');
}
function closeEmailDetail(){document.getElementById('emailDetailModal').classList.remove('open');currentEmailIdx=-1;}

async function sendReply(){
  if(currentEmailIdx<0)return;
  const replyMsg=document.getElementById('reply-text').value.trim();
  if(!replyMsg){showToast('Error','Please type a reply','var(--danger)');return;}
  const email=APP.inbox[currentEmailIdx];
  try{
    await API.replyMessage(email.id,replyMsg);
    closeEmailDetail(); await refreshMessages();
    showToast('✅ Reply Sent',`Replied to ${email.fromName||email.from}`,'var(--safe)');
  }catch(err){showToast('Error',err.message||'Could not reply','var(--danger)');}
}

function saveSettings(){
  const newEmail=document.getElementById('admin-email-input').value.trim();
  if(newEmail){APP.adminEmail=newEmail;document.getElementById('alert-email-disp').textContent=newEmail;}
  showToast(T('saveBtn'),'Settings saved','var(--safe)');
}

// ═══════════════════════════════════════
// MAP
// ═══════════════════════════════════════
let map,vesselMarker,trailLayer,trailPts=[],simTimer;
const BNDS={
  IND_LKA:[[9.85,79.3],[9.60,79.6],[9.40,79.8],[9.20,80.0],[9.00,80.2],[8.80,80.4]],
  IND_EEZ:[[11.0,77.0],[10.5,78.5],[9.5,80.5],[8.5,82.0],[7.5,83.5]],
  INTL:[[12.0,75.0],[11.0,77.5],[9.5,80.0],[8.0,82.5],[6.5,85.0]]
};
function initMap(){
  if(map){map.remove();map=null;trailPts=[];}
  if(!window.L){setTimeout(initMap,1000);return;}
  map=L.map('map',{zoomControl:false,attributionControl:false}).setView([9.5,80],8);
  const tile=APP.theme==='dark'?'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png':'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  L.tileLayer(tile,{maxZoom:18,subdomains:'abcd'}).addTo(map);
  L.control.zoom({position:'bottomleft'}).addTo(map);
  L.polygon([[14,72],[14,80],[11,81],[9,80],[8,77],[7,74],[10,72]],{fillColor:'#00ff88',fillOpacity:.06,color:'#00ff88',weight:1.2,opacity:.25,dashArray:'6,4'}).addTo(map);
  L.polygon([[9.85,79.3],[9.6,79.6],[9.4,79.8],[9.2,80.0],[9.0,80.2],[8.8,80.4],[8.5,80.6],[8.5,83],[11,82],[11.5,80],[10,79]],{fillColor:'#ffd600',fillOpacity:.08,color:'#ffd600',weight:1.5,opacity:.5,dashArray:'6,4'}).addTo(map);
  L.polygon([[9.0,80.2],[8.8,80.4],[8.5,80.6],[8.5,82],[9.5,82],[9.5,80.5]],{fillColor:'#ff2244',fillOpacity:.14,color:'#ff2244',weight:2,opacity:.7,dashArray:'4,3'}).addTo(map);
  L.polyline(BNDS.IND_LKA,{color:'#ff2244',weight:2.5,opacity:.85,dashArray:'8,4'}).addTo(map).bindPopup('<b>🚨 India–Sri Lanka Maritime Boundary</b>');
  L.polyline(BNDS.IND_EEZ,{color:'#ffd600',weight:2,opacity:.7,dashArray:'6,4'}).addTo(map).bindPopup('<b>⚠️ Indian EEZ Boundary</b>');
  L.polyline(BNDS.INTL,{color:'#00aaff',weight:1.5,opacity:.5,dashArray:'4,4'}).addTo(map).bindPopup('<b>🌊 International Waters</b>');
  L.marker([9.3,79.82],{icon:L.divIcon({html:'<div style="color:#ff2244;font-family:Orbitron,monospace;font-size:9px;letter-spacing:1px;white-space:nowrap;text-shadow:0 0 8px #ff2244;background:rgba(0,0,0,.45);padding:2px 5px;border-radius:4px">IND–LKA LINE</div>',className:'',iconAnchor:[0,0]})}).addTo(map);
  refreshFleetMarkers();
  trailLayer=L.polyline([],{color:'rgba(0,200,255,.5)',weight:2,dashArray:'5,3'}).addTo(map);
  updateVesselMarker();
  startSim();
}
function updateVesselMarker(){
  if(!window.L||!map)return;
  const{lat,lon,heading}=APP.sim;
  const icon=L.divIcon({html:`<div style="position:relative;width:26px;height:26px;">
    <div style="width:16px;height:16px;background:linear-gradient(135deg,#00d4ff,#0044ff);border-radius:50% 50% 50% 0;transform:rotate(${heading-45}deg);border:2px solid rgba(255,255,255,.85);box-shadow:0 0 16px rgba(0,200,255,.85);position:absolute;top:5px;left:5px;"></div>
    <div style="position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(0,200,255,.4);animation:pulse 1.8s ease-out infinite;"></div></div>`,className:'',iconAnchor:[13,13]});
  if(vesselMarker){vesselMarker.setLatLng([lat,lon]);vesselMarker.setIcon(icon);}
  else vesselMarker=L.marker([lat,lon],{icon,zIndexOffset:1000}).addTo(map).bindPopup(`<b>🚢 ${APP.user.vessel}</b><br>${APP.user.fullname}`);
}

// ═══════════════════════════════════════
// SIMULATION
// ═══════════════════════════════════════
APP.sim={lat:9.2541,lon:79.8510,speed:12.4,heading:47,risk:12,zone:'safe',tick:0,alertFired:false};
function hDist(la1,lo1,la2,lo2){const R=3440.065,d1=(la2-la1)*Math.PI/180,d2=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(d1/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(d2/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function distToBound(lat,lon,b){let mn=Infinity;
  for(let i=0;i<b.length-1;i++){const[ax,ay]=b[i],[bx,by]=b[i+1];
    const abx=bx-ax,aby=by-ay,t=Math.max(0,Math.min(1,((lat-ax)*abx+(lon-ay)*aby)/(abx*abx+aby*aby)));
    const d=hDist(lat,lon,ax+t*abx,ay+t*aby);if(d<mn)mn=d;}return mn;}
function startSim(){if(simTimer)clearInterval(simTimer);simTimer=setInterval(simTick,1500);}
function stopSim(){if(simTimer)clearInterval(simTimer);simTimer=null;}
function simTick(){
  const s=APP.sim;s.tick++;
  s.lat+=0.003+Math.sin(s.tick*.1)*.001;
  s.lon+=0.004+Math.cos(s.tick*.08)*.001;
  s.heading=(47+Math.sin(s.tick*.2)*9+Math.cos(s.tick*.15)*6+360)%360;
  s.speed=12.4+Math.sin(s.tick*.3)*1.6;
  const d1=distToBound(s.lat,s.lon,BNDS.IND_LKA),d2=distToBound(s.lat,s.lon,BNDS.IND_EEZ),d3=distToBound(s.lat,s.lon,BNDS.INTL);
  const minD=Math.min(d1,d2);
  s.zone=minD>20?'safe':minD>8?'warning':'danger';
  const pD=Math.min(1,Math.exp(-minD/12)),angD=Math.abs(((s.heading-135)+360)%360);
  const pDir=Math.max(0,(180-Math.min(angD,360-angD))/180),pSpd=Math.min(1,s.speed/25);
  const R=.50*pD+.30*pDir+.20*pSpd;s.risk=Math.round(R*100);
  updatePanelUI(minD,d1,d2,d3,pD,pDir,pSpd,R,s);
  updateMapUI(s);
  if(s.risk>=80&&!s.alertFired){s.alertFired=true;triggerAlert();}
  if(s.risk<65&&s.alertFired)s.alertFired=false;
}
function updatePanelUI(minD,d1,d2,d3,pD,pDir,pSpd,R,s){
  const rPct=s.risk;
  const rColor=rPct<35?'var(--safe)':rPct<70?'var(--warn)':'var(--danger)';
  const fill=(rPct/100)*207;
  const gf=document.getElementById('gauge-fill');if(gf)gf.style.strokeDasharray=`${fill} 207`;
  const gp=document.getElementById('gauge-pct');if(gp){gp.textContent=rPct+'%';gp.style.color=rColor;}
  const zcur=document.getElementById('zcur');if(zcur)zcur.style.left=`calc(${Math.min(rPct,97)}% - 8px)`;
  const zb=document.getElementById('zone-badge');
  const zt={safe:T('zoneSafe'),warning:T('zoneWarn'),danger:T('zoneDanger')};
  const zc={safe:'var(--safe)',warning:'var(--warn)',danger:'var(--danger)'};
  const zbg={safe:'rgba(0,255,136,.1)',warning:'rgba(255,214,0,.1)',danger:'rgba(255,34,68,.1)'};
  if(zb){zb.textContent='● '+(zt[s.zone]||s.zone.toUpperCase());zb.style.color=zc[s.zone];zb.style.borderColor=zc[s.zone];zb.style.background=zbg[s.zone];}
  const upd=(id,html)=>{const e=document.getElementById(id);if(e)e.innerHTML=html;};
  upd('rp-spd',`${s.speed.toFixed(1)}<span class="sc-u">kn</span>`);
  upd('rp-hdg',`${Math.round(s.heading)}<span class="sc-u">°</span>`);
  upd('rp-lat',`${s.lat.toFixed(3)}<span class="sc-u">°N</span>`);
  upd('rp-lon',`${s.lon.toFixed(3)}<span class="sc-u">°E</span>`);
  upd('rp-dist',`${minD.toFixed(1)}<span class="sc-u">nm</span>`);
  const eta=minD/s.speed;upd('rp-eta',`${eta.toFixed(1)}<span class="sc-u">h</span>`);
  const setT=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  setT('c-pd',pD.toFixed(2));const bpd=document.getElementById('bar-pd');if(bpd)bpd.style.width=(pD*100)+'%';
  setT('c-pdir',pDir.toFixed(2));const bpdir=document.getElementById('bar-pdir');if(bpdir)bpdir.style.width=(pDir*100)+'%';
  setT('c-pspd',pSpd.toFixed(2));const bpspd=document.getElementById('bar-pspd');if(bpspd)bpspd.style.width=(pSpd*100)+'%';
  setT('c-formula',`R = 0.50×${pD.toFixed(2)} + 0.30×${pDir.toFixed(2)} + 0.20×${pSpd.toFixed(2)} = ${R.toFixed(2)}`);
  const pl=s.lat+(s.speed*2*Math.cos(s.heading*Math.PI/180))/60;
  const pm=s.lon+(s.speed*2*Math.sin(s.heading*Math.PI/180))/(60*Math.cos(s.lat*Math.PI/180));
  setT('c-proj',`${pl.toFixed(2)}°N ${pm.toFixed(2)}°E`);
  setT('c-dlat',`${((pl-s.lat)/2>0?'+':'')}${((pl-s.lat)/2).toFixed(4)}°`);
  setT('c-dlon',`${((pm-s.lon)/2>0?'+':'')}${((pm-s.lon)/2).toFixed(4)}°`);
  setT('c-eta',`${eta.toFixed(1)}h`);
  setT('bd1',`${d1.toFixed(1)}nm`);setT('bd2',`${d2.toFixed(1)}nm`);setT('bd3',`${d3.toFixed(1)}nm`);
  setT('wx-wave',`${(1.2+Math.sin(s.tick*.1)*.3).toFixed(1)}m`);
  setT('wx-wind',`${14+Math.round(Math.sin(s.tick*.15)*4)}kn`);
  setT('tb-coord',`LAT: ${s.lat.toFixed(4)}°N · LON: ${s.lon.toFixed(4)}°E`);
  const pill=document.getElementById('tb-zone');
  if(pill){pill.className=`tb-pill ${s.zone}`;pill.textContent=`● ${(zt[s.zone]||s.zone).toUpperCase()}`;}
  setT('mf-spd',`${s.speed.toFixed(1)} kn`);setT('mf-hdg',`${Math.round(s.heading)}°`);
  setT('mf-dep',`${40+Math.round(Math.sin(s.tick)*8)}m`);
  setT('mf-fuel',`${Math.max(10,78-Math.floor(s.tick*.1))}%`);
  setT('mf-eta',`${eta.toFixed(1)}h`);
  const arrows=['↑','↗','→','↘','↓','↙','←','↖'];
  setT('mf-dir',arrows[Math.round(s.heading/45)%8]);
  const rvec=document.getElementById('mf-rvec');
  if(rvec){rvec.textContent=rPct>70?'HIGH':rPct>35?'MED':'LOW';rvec.style.color=rColor;}
  setT('mf-bin',`${minD.toFixed(1)} nm`);
  setT('mf-cross',`${Math.floor(eta)}h ${Math.round((eta%1)*60)}m`);
  const cn=document.getElementById('cneedle');if(cn)cn.style.transform=`rotate(${s.heading}deg)`;
  // Alert overlay coords
  setT('al-coords',`LAT: ${s.lat.toFixed(4)}°N  LON: ${s.lon.toFixed(4)}°E  SPEED: ${s.speed.toFixed(1)} kn`);
  // Fisherman dashboard
  const fc_zone=document.getElementById('fc-zone');if(fc_zone){fc_zone.textContent=(zt[s.zone]||s.zone).toUpperCase();fc_zone.style.color=rColor;}
  const fc_dist=document.getElementById('fc-dist');if(fc_dist)fc_dist.innerHTML=`${minD.toFixed(1)}<span style="font-size:14px;font-weight:400"> nm</span>`;
  const fc_risk=document.getElementById('fc-risk');if(fc_risk){fc_risk.textContent=rPct+'%';fc_risk.style.color=rColor;}
  const fc_spd=document.getElementById('fc-spd');if(fc_spd)fc_spd.innerHTML=`${s.speed.toFixed(1)}<span style="font-size:14px;font-weight:400"> kn</span>`;
}
function updateMapUI(s){
  updateVesselMarker();
  trailPts.push([s.lat,s.lon]);if(trailPts.length>100)trailPts.shift();
  if(trailLayer)trailLayer.setLatLngs(trailPts);
}

// ═══════════════════════════════════════
// VOICE ENGINE — uses Google TTS for Indian languages
// (works offline fallback to Web Speech API for English)
// ═══════════════════════════════════════
let audioCtx=null;
let _currentAudio=null; // track playing audio to stop it

const VOICE_TEXTS={
  alert:{
    en:'Warning! Warning! You are approaching a restricted maritime boundary. Turn back immediately!',
    ta:'எச்சரிக்கை! நீங்கள் கட்டுப்படுத்தப்பட்ட கடல் எல்லையை அணுகுகிறீர்கள். உடனடியாக திரும்புங்கள்!',
    hi:'खतरा! आप प्रतिबंधित समुद्री सीमा के पास हैं। तुरंत वापस मुड़ें!',
    ml:'അപകടം! നിങ്ങൾ നിരോധിത സമുദ്ര അതിർത്തിക്ക് അടുക്കുന്നു. ഉടൻ തിരിച്ചുപോകൂ!',
    te:'హెచ్చరిక! మీరు నిషేధిత సముద్ర సరిహద్దుకు చేరుకుంటున్నారు. వెనక్కి వెళ్ళండి!'
  },
  welcome:{
    en:'Welcome to SafeSea. Navigation system is active. Stay safe.',
    ta:'SafeSea க்கு வரவேற்கிறோம். வழிசெலுத்தல் அமைப்பு செயலில் உள்ளது. பாதுகாப்பாக இருங்கள்.',
    hi:'SafeSea में आपका स्वागत है। नेविगेशन प्रणाली सक्रिय है। सुरक्षित रहें।',
    ml:'SafeSea ലേക്ക് സ്വാഗതം. നാവിഗേഷൻ സിസ്റ്റം സജീവമാണ്. സുരക്ഷിതരായിരിക്കുക.',
    te:'SafeSea కి స్వాగతం. నావిగేషన్ వ్యవస్థ సక్రియంగా ఉంది. సురక్షితంగా ఉండండి.'
  }
};

// Google TTS language codes
const GTTS_LANG={en:'en',ta:'ta',hi:'hi',ml:'ml',te:'te'};

// ── Play one language via Google TTS URL ──────────────
function _playGoogleTTS(text, langCode){
  return new Promise(resolve=>{
    try{
      // Google Translate TTS endpoint (free, no key needed)
      const url='https://translate.google.com/translate_tts?ie=UTF-8&tl='+langCode
        +'&client=tw-ob&q='+encodeURIComponent(text);
      const audio=new Audio(url);
      audio.volume=1.0;
      _currentAudio=audio;
      audio.onended=()=>resolve();
      audio.onerror=()=>{
        console.warn('Google TTS failed for:',langCode,', trying Web Speech...');
        // Fallback to Web Speech API
        _playWebSpeech(text, langCode).then(resolve);
      };
      audio.play().catch(()=>{
        // Autoplay blocked — fallback to Web Speech
        _playWebSpeech(text, langCode).then(resolve);
      });
    }catch(e){
      _playWebSpeech(text, langCode).then(resolve);
    }
  });
}

// ── Web Speech API fallback ────────────
function _playWebSpeech(text, langCode){
  return new Promise(resolve=>{
    if(!window.speechSynthesis){resolve();return;}
    window.speechSynthesis.cancel();
    setTimeout(()=>{
      const u=new SpeechSynthesisUtterance(text);
      u.lang=langCode+'-IN'; // e.g. ta-IN
      u.rate=0.88; u.pitch=1.0; u.volume=1.0;
      // try to find installed voice
      const voices=window.speechSynthesis.getVoices();
      const match=voices.find(v=>v.lang.startsWith(langCode));
      if(match) u.voice=match;
      u.onend=resolve;
      u.onerror=resolve;
      window.speechSynthesis.speak(u);
      setTimeout(resolve, Math.max(5000, text.length*90));
    },200);
  });
}

// ── Speak one item (Google TTS first, Web Speech fallback) ──
function _speakOne(text, langCode){
  return _playGoogleTTS(text, langCode);
}

// ── Build list of {text,lang} from selected voice language ──
function _buildItems(type){
  const lang=APP.voiceLang||'en';
  const texts=VOICE_TEXTS[type];
  if(lang==='all'){
    return [
      {text:texts.en, lang:'en'},
      {text:texts.ta, lang:'ta'},
      {text:texts.hi, lang:'hi'},
      {text:texts.ml, lang:'ml'},
      {text:texts.te, lang:'te'}
    ];
  }
  return [{text:texts[lang]||texts.en, lang:GTTS_LANG[lang]||'en'}];
}

// ── Play a sequence of language items one by one ──────
async function _speakSequence(items){
  // Stop any currently playing audio
  if(_currentAudio){try{_currentAudio.pause();_currentAudio.currentTime=0;}catch(e){}}
  if(window.speechSynthesis) window.speechSynthesis.cancel();
  for(const item of items){
    await _speakOne(item.text, item.lang);
    await new Promise(r=>setTimeout(r,600)); // gap between languages
  }
}

function setVoiceLang(lang,btn){
  APP.voiceLang=lang;
  document.querySelectorAll('.vlang').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
}

// ── Alarm beeps (Web Audio API) ────────
function playAlarm(){
  if(!APP.alarmEnabled)return;
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==='suspended')ctx.resume();
    audioCtx=ctx;
    [[880,0,.25],[440,.4,.2],[880,.8,.25],[440,1.2,.2],[880,1.6,.3],[440,2.0,.2],[880,2.4,.3],[330,2.8,.18]]
    .forEach(([freq,when,vol])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.type='sawtooth';o.frequency.value=freq;
      g.gain.setValueAtTime(vol,ctx.currentTime+when);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+when+0.35);
      o.start(ctx.currentTime+when);o.stop(ctx.currentTime+when+0.38);
    });
  }catch(e){console.warn('Alarm error:',e);}
}

// ── Welcome — ALL roles, every login ──────────────────
function speakWelcome(){
  showToast('🔊 SafeSea','Welcome voice playing...','var(--ac)');
  _speakSequence(_buildItems('welcome'));
}

// ── Alert voice ───────────────────────────────────────
function speakAlert(){
  showToast('🔊 ALERT','Boundary warning playing!','var(--danger)');
  _speakSequence(_buildItems('alert'));
}

// ── Test welcome button ───────────────────────────────
function testVoice(){
  showToast('🔊 Testing','Playing welcome in '+( APP.voiceLang==='all'?'ALL languages':(APP.voiceLang||'en').toUpperCase())+'...','var(--ac)');
  _speakSequence(_buildItems('welcome'));
}

// ── Trigger test alert button ─────────────────────────
function triggerTestAlert(){
  APP.sim.alertFired=false;
  showToast('⚠️ Test Alert','Full alert triggering now!','#ff8833');
  triggerAlert();
  setTimeout(()=>{
    if(APP.alertActive)dismissAlert();
    APP.sim.alertFired=false;
  },20000);
}

// ── Auto alert (risk > 80%) or manual ────────────────
function triggerAlert(){
  APP.alertActive=true;
  document.getElementById('alertOverlay').classList.add('on');
  playAlarm();
  setTimeout(()=>speakAlert(), 2000);
  if(APP.emailEnabled){
    API.sendMessage({subject:`⚠️ BOUNDARY ALERT — ${APP.user.vessel}`,body:buildEmailBody('alert'),type:'warn'})
      .then(()=>refreshMessages()).catch(()=>{});
  }
}

function dismissAlert(){
  document.getElementById('alertOverlay').classList.remove('on');
  APP.alertActive=false;
  if(_currentAudio){try{_currentAudio.pause();_currentAudio.currentTime=0;}catch(e){}}
  if(audioCtx)try{audioCtx.close();}catch(e){}
  if(window.speechSynthesis)window.speechSynthesis.cancel();
}

// ═══════════════════════════════════════
// TOGGLES
// ═══════════════════════════════════════
function syncTog(id,on){const el=document.getElementById(id);if(el){el.classList.toggle('on',on);const tk=el.querySelector('.tok');if(tk)tk.style.transform=on?'translateX(17px)':'none';}}
function toggleEmail(){
  APP.emailEnabled=!APP.emailEnabled;
  ['email-tog-sw','email-tog2'].forEach(id=>syncTog(id,APP.emailEnabled));
  const el=document.getElementById('email-lbl');if(el)el.textContent=APP.emailEnabled?T('emailOn'):T('emailOff');
}
function toggleVoice(){
  APP.voiceEnabled=!APP.voiceEnabled;
  ['voice-tog-sw','voice-tog2','voice-tog-dash'].forEach(id=>syncTog(id,APP.voiceEnabled));
  const vl=document.getElementById('voice-lbl');if(vl)vl.textContent=APP.voiceEnabled?T('voiceOn'):T('voiceOff');
  if(APP.voiceEnabled&&window.speechSynthesis){
    _loadVoices();
    // Unlock speech synthesis with a silent utterance
    const u=new SpeechSynthesisUtterance(' ');u.volume=0;window.speechSynthesis.speak(u);
  }
}
function toggleAlarm(){APP.alarmEnabled=!APP.alarmEnabled;syncTog('alarm-tog',APP.alarmEnabled);}
function toggleTheme(){
  APP.theme=APP.theme==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',APP.theme);
  const isDark=APP.theme==='dark';
  ['themeBtn','themeBtn2'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=isDark?'🌙':'☀️';});
  syncTog('theme-tog',!isDark);syncTog('profile-theme-tog',!isDark);
  const pl=document.getElementById('profile-theme-label');if(pl)pl.textContent=isDark?'Dark':'Light';
  if(window.L&&map){
    map.eachLayer(l=>{if(l._url)map.removeLayer(l);});
    L.tileLayer(isDark?'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png':'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:18,subdomains:'abcd'}).addTo(map);
  }
}

// ═══════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════
function fStep2(){if(!document.getElementById('frg-em').value){showToast('Error','Enter email','var(--danger)');return;}document.getElementById('fs1').style.display='none';document.getElementById('fs2').style.display='block';document.getElementById('sd1').className='step-dot done';document.getElementById('sd1').textContent='✓';document.getElementById('sl1').style.background='var(--safe)';document.getElementById('sd2').className='step-dot active';showToast('OTP Sent','Check your email','var(--ac)');}
function fStep3(){if(!document.getElementById('frg-otp').value){showToast('Error','Enter OTP','var(--danger)');return;}document.getElementById('fs2').style.display='none';document.getElementById('fs3').style.display='block';document.getElementById('sd2').className='step-dot done';document.getElementById('sd2').textContent='✓';document.getElementById('sl2').style.background='var(--safe)';document.getElementById('sd3').className='step-dot active';}
function fDone(){document.getElementById('fs3').style.display='none';document.getElementById('fs4').style.display='block';document.getElementById('sd3').className='step-dot done';document.getElementById('sd3').textContent='✓';}

// ═══════════════════════════════════════
// TOAST
// ═══════════════════════════════════════
let toastTimer;
function showToast(title,msg,color){
  const t=document.getElementById('toast');
  document.getElementById('toast-t').textContent=title;document.getElementById('toast-t').style.color=color||'var(--t1)';
  document.getElementById('toast-m').textContent=msg;
  t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3800);
}

// ═══════════════════════════════════════
// CLOCK + INIT
// ═══════════════════════════════════════
setInterval(()=>{const e=document.getElementById('tb-clk');if(e)e.textContent=new Date().toUTCString().slice(17,25)+' UTC';},1000);
applyLang();
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.getElementById('pg-login').classList.contains('active'))doLogin();});
