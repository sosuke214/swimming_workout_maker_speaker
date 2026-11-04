// === ここのコードに新しい音声を書き足すだけで追加される ===
const SHARED_VOICES = [
  { id: 'shared_voice1', name: '共有音声1 (紅林1)', file: 'voice1.mp3' },
  { id: 'shared_voice2', name: '共有音声2 (未登録)', file: 'voice2.mp3' }
];

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxz_hWX9qqMsF-KijdrLCb2mQIe5-6o__hyMsO_pyLiKOtGS2O24RCPNSQXL_DUhoIP/exec';
let fetchedCloudMenus = [];

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();
let customAudioBuffer = null;
let currentAudioSource = null;

let audioProfiles = [];
let audioSettings = { mode: 'tts' };

const savedProfiles = localStorage.getItem('swimTimerProfiles');
if (savedProfiles) audioProfiles = JSON.parse(savedProfiles);
const savedSettings = localStorage.getItem('swimTimerSettings');
if (savedSettings) audioSettings = JSON.parse(savedSettings);

function saveProfiles() {
  localStorage.setItem('swimTimerProfiles', JSON.stringify(audioProfiles));
  localStorage.setItem('swimTimerSettings', JSON.stringify(audioSettings));
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64.split(',')[1]);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

async function loadCustomAudioToMemory(base64) {
  try {
    const arrayBuffer = base64ToArrayBuffer(base64);
    customAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.error("デコード失敗:", e);
  }
}

function renderAudioSettings() {
  const list = document.getElementById('profile-list');
  list.innerHTML = '';
  
  let html = `
    <div class="profile-item">
      <label><input type="radio" name="audioMode" value="tts" ${audioSettings.mode === 'tts' ? 'checked' : ''}> 自動音声（合成音声）</label>
    </div>
  `;
  
  // 共有音声リストから動的に生成
  SHARED_VOICES.forEach(sv => {
    html += `
      <div class="profile-item">
        <label><input type="radio" name="audioMode" value="${sv.id}" ${audioSettings.mode === sv.id ? 'checked' : ''}> ☁️ ${sv.name}</label>
        <div>
          <button class="btn secondary" style="padding: 4px 8px; font-size: 12px;" onclick="previewSharedVoice('${sv.file}')">▶ 試聴</button>
        </div>
      </div>
    `;
  });
  
  // ローカル録音音声
  audioProfiles.forEach(p => {
    html += `
      <div class="profile-item">
        <label><input type="radio" name="audioMode" value="${p.id}" ${audioSettings.mode === p.id ? 'checked' : ''}> 録音: ${p.name}</label>
        <div>
          <button class="btn secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;" onclick="previewProfile('${p.id}')">▶ 試聴</button>
          <button class="delete-btn" onclick="deleteProfile('${p.id}')">削除</button>
        </div>
      </div>
    `;
  });
  list.innerHTML = html;

  document.querySelectorAll('input[name="audioMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      audioSettings.mode = e.target.value;
      saveProfiles();
    });
  });
}

window.previewProfile = function(id) {
  const p = audioProfiles.find(x => x.id === id);
  if (p && p.base64) {
    const audio = new Audio(p.base64);
    audio.play().catch(e => console.log("再生エラー:", e));
  }
}

window.previewSharedVoice = function(fileName) {
  const audio = new Audio(fileName);
  audio.play().catch(e => alert(`ファイルが見つかりません。GitHubに ${fileName} を配置してください。`));
}

window.deleteProfile = function(id) {
  if (!confirm('この音声を削除しますか？')) return;
  audioProfiles = audioProfiles.filter(p => p.id !== id);
  if (audioSettings.mode === id) audioSettings.mode = 'tts';
  saveProfiles();
  renderAudioSettings();
}

document.getElementById('go-audio-settings-btn').addEventListener('click', () => {
  renderAudioSettings();
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('audio-setup-screen').classList.add('active');
});
document.getElementById('back-to-setup-btn').addEventListener('click', () => {
  document.getElementById('audio-setup-screen').classList.remove('active');
  document.getElementById('setup-screen').classList.add('active');
});

let recordStream = null;
let mediaRecorder = null;
let audioChunks = [];
let clockAnimReq = null;
let currentRecordBase64 = "";

document.getElementById('open-record-modal-btn').addEventListener('click', () => {
  document.getElementById('record-modal').style.display = 'flex';
  resetRecordModal();
});
document.getElementById('close-record-modal-btn').addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  if (recordStream) recordStream.getTracks().forEach(t => t.stop());
  cancelAnimationFrame(clockAnimReq);
  document.getElementById('record-modal').style.display = 'none';
});

function resetRecordModal() {
  document.getElementById('clock-hand').style.transform = 'translateX(-50%) rotate(240deg)';
  document.getElementById('record-status').innerText = '待機中...';
  document.getElementById('start-record-btn').innerText = '録音開始 (22秒間)';
  document.getElementById('start-record-btn').disabled = false;
  document.getElementById('save-section').style.display = 'none';
  document.getElementById('profile-name').value = '';
}

document.getElementById('start-record-btn').addEventListener('click', async () => {
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    alert("マイクへのアクセスが拒否されました。");
    return;
  }
  
  document.getElementById('start-record-btn').disabled = true;
  document.getElementById('save-section').style.display = 'none';
  document.getElementById('record-status').innerText = '録音中... 時計に合わせて発声してください';
  
  mediaRecorder = new MediaRecorder(recordStream);
  audioChunks = [];
  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.onstop = finalizeRecording;
  mediaRecorder.start();

  let startMs = Date.now();
  function animateClock() {
    let elapsed = (Date.now() - startMs) / 1000;
    if (elapsed >= 22) {
      mediaRecorder.stop();
      recordStream.getTracks().forEach(t => t.stop());
      document.getElementById('clock-hand').style.transform = `translateX(-50%) rotate(372deg)`;
      return;
    }
    let currentSec = 40 + elapsed; 
    let deg = currentSec * 6;
    document.getElementById('clock-hand').style.transform = `translateX(-50%) rotate(${deg}deg)`;
    clockAnimReq = requestAnimationFrame(animateClock);
  }
  animateClock();
});

function finalizeRecording() {
  document.getElementById('record-status').innerText = '録音完了！再生して確認してください。';
  document.getElementById('start-record-btn').disabled = false;
  document.getElementById('start-record-btn').innerText = '再録音する';
  
  const mimeType = mediaRecorder.mimeType || 'audio/webm';
  const blob = new Blob(audioChunks, { type: mimeType }); 
  const audioUrl = URL.createObjectURL(blob);
  const preview = document.getElementById('preview-audio');
  preview.src = audioUrl;
  
  document.getElementById('save-section').style.display = 'block';
  document.getElementById('save-profile-btn').disabled = true;
  document.getElementById('save-profile-btn').innerText = '準備中...';

  const reader = new FileReader();
  reader.onload = () => { 
    currentRecordBase64 = reader.result; 
    document.getElementById('save-profile-btn').disabled = false;
    document.getElementById('save-profile-btn').innerText = '保存してリストに追加';
  };
  reader.readAsDataURL(blob);
}

document.getElementById('save-profile-btn').addEventListener('click', () => {
  const name = document.getElementById('profile-name').value.trim() || '名称未設定の音声';
  const id = 'custom_' + Date.now();
  audioProfiles.push({ id, name, base64: currentRecordBase64 });
  audioSettings.mode = id; 
  saveProfiles();
  renderAudioSettings();
  document.getElementById('record-modal').style.display = 'none';
});

function playWebAudio(offsetSec) {
  if (!customAudioBuffer) return;
  if (currentAudioSource) currentAudioSource.stop();
  currentAudioSource = audioCtx.createBufferSource();
  currentAudioSource.buffer = customAudioBuffer;
  currentAudioSource.connect(audioCtx.destination);
  currentAudioSource.start(0, offsetSec);
}

function stopWebAudio() {
  if (currentAudioSource) {
    currentAudioSource.stop();
    currentAudioSource = null;
  }
}

function timeToSeconds(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [min, sec] = timeStr.split(':').map(Number);
  return (min || 0) * 60 + (sec || 0);
}

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let timeline = [];
let currentIndex = 0;
let isPlaying = false;
let remainingSec = 0;
let currentEndTime = 0;
let timerInterval = null;
let customAudioPlayedForCurrentEvent = false;

document.getElementById('fetch-cloud-btn').addEventListener('click', () => {
  const btn = document.getElementById('fetch-cloud-btn');
  btn.innerText = '取得中...';
  btn.disabled = true;

  fetch(GAS_URL)
    .then(response => response.json())
    .then(data => {
      fetchedCloudMenus = data;
      const select = document.getElementById('cloud-menu-select');
      select.innerHTML = '<option value="">メニューを選択してください</option>';
      
      data.forEach((item, index) => {
        const option = document.createElement('option');
        option.value = index;
        const dateStr = new Date(item.date).toLocaleDateString('ja-JP');
        option.textContent = `${dateStr} - ${item.title}`;
        select.appendChild(option);
      });
      
      select.style.display = 'block';
      btn.innerText = '☁ クラウドから再取得';
      btn.disabled = false;
    })
    .catch(error => {
      alert('取得エラー: ' + error);
      btn.innerText = '☁ クラウドからメニューを取得';
      btn.disabled = false;
    });
});

document.getElementById('cloud-menu-select').addEventListener('change', (e) => {
  const index = e.target.value;
  if (index === "") return;
  const selectedData = fetchedCloudMenus[index];
  const menuData = JSON.parse(selectedData.jsonMenu);
  buildTimeline(menuData);
  document.getElementById('file-info').innerText = `読込成功: ${selectedData.title}`;
  document.getElementById('start-app-btn').disabled = false;
});

document.getElementById('json-loader').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const menuData = JSON.parse(event.target.result);
    buildTimeline(menuData);
    document.getElementById('file-info').innerText = `読込成功: 全 ${timeline.length} イベント`;
    document.getElementById('start-app-btn').disabled = false;
  };
  reader.readAsText(file);
});

document.getElementById('start-app-btn').addEventListener('click', async () => {
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('timer-screen').classList.add('active');
  currentIndex = 0;
  customAudioPlayedForCurrentEvent = false;
  
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const sharedVoice = SHARED_VOICES.find(sv => sv.id === audioSettings.mode);

  if (sharedVoice) {
    try {
      const response = await fetch(sharedVoice.file);
      if (!response.ok) throw new Error("File not found");
      const arrayBuffer = await response.arrayBuffer();
      customAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
      alert(`共有音声の読み込みに失敗しました。GitHubに ${sharedVoice.file} があるか確認してください。`);
    }
  } else if (audioSettings.mode !== 'tts') {
    const p = audioProfiles.find(p => p.id === audioSettings.mode);
    if (p) await loadCustomAudioToMemory(p.base64);
  } else if ('speechSynthesis' in window) {
    const ut = new SpeechSynthesisUtterance("準備完了です。");
    ut.lang = 'ja-JP';
    speechSynthesis.speak(ut);
  }
  
  loadEvent(currentIndex);
});

document.getElementById('back-btn').addEventListener('click', () => {
  pauseTimer();
  document.getElementById('timer-screen').classList.remove('active');
  document.getElementById('setup-screen').classList.add('active');
});

function buildTimeline(menuData) {
  timeline = [];
  let spanCounts = new Array(menuData.length).fill(1);
  let skipSetCell = new Array(menuData.length).fill(false);
  
  for (let i = 0; i < menuData.length; i++) {
    if (skipSetCell[i]) continue;
    if (menuData[i].type === 'rest') { menuData[i].groupWithNext = false; continue; }
    let span = 1;
    while (i + span - 1 < menuData.length && menuData[i + span - 1].groupWithNext && menuData[i + span].type !== 'rest') span++;
    if (span > 1) {
      spanCounts[i] = span;
      for (let j = 1; j < span; j++) skipSetCell[i + j] = true;
    }
  }

  let i = 0;
  while (i < menuData.length) {
    let span = spanCounts[i];
    let blockSets = Number(menuData[i].set) || 1;

    for (let s = 1; s <= blockSets; s++) {
      for (let j = 0; j < span; j++) {
        let row = menuData[i + j];
        if (row.type === 'swim') {
          let rep = Number(row.rep) || 1;
          for (let r = 1; r <= rep; r++) {
            let sec = 0;
            if (row.isVarInterval && row.varIntervals && row.varIntervals[r-1]) {
              sec = timeToSeconds(row.varIntervals[r-1]);
            } else {
              sec = timeToSeconds(row.interval);
            }
            if (sec > 0) {
              let t = `${row.work || 'Swim'} ${row.dis || '0'}m`;
              let d = `${r}/${rep}本目`;
              if (blockSets > 1) d += ` (${s}/${blockSets} Set)`;
              timeline.push({ title: t, detail: d, duration: sec });
            }
          }
        } else if (row.type === 'rest') {
          let sec = timeToSeconds(row.rest);
          if (sec > 0) timeline.push({ title: '大休憩', detail: row.work || 'Rest', duration: sec });
        }
      }
      
      let lastRow = menuData[i + span - 1];
      let setRestSec = timeToSeconds(lastRow.rest);
      if (setRestSec > 0) {
        let d = blockSets > 1 ? `${s}/${blockSets} Set 終了` : 'セット終了';
        timeline.push({ title: 'Set Rest', detail: d, duration: setRestSec });
      }
    }
    i += span;
  }
}

function loadEvent(index) {
  if (index >= timeline.length) {
    document.getElementById('current-title').innerText = "練習終了";
    document.getElementById('current-detail').innerText = "お疲れ様でした";
    document.getElementById('time-display').innerText = "00:00";
    document.getElementById('time-display').classList.remove('time-warning');
    document.getElementById('next-title').innerText = "--";
    document.getElementById('progress-text-timer').innerText = "End";
    remainingSec = 0;
    return;
  }
  
  const ev = timeline[index];
  remainingSec = ev.duration;
  customAudioPlayedForCurrentEvent = false;
  
  document.getElementById('current-title').innerText = ev.title;
  document.getElementById('current-detail').innerText = ev.detail;
  document.getElementById('time-display').innerText = formatTime(remainingSec);
  document.getElementById('time-display').classList.remove('time-warning');
  
  document.getElementById('progress-text-timer').innerText = `進行度: ${index + 1} / ${timeline.length}`;
  
  if (index + 1 < timeline.length) {
    let nx = timeline[index + 1];
    document.getElementById('next-title').innerText = `${nx.title} (${nx.detail})`;
  } else {
    document.getElementById('next-title').innerText = "練習終了";
  }
}

function startTimer() {
  if (currentIndex >= timeline.length) return;
  isPlaying = true;
  document.getElementById('play-pause-btn').innerText = "⏸ 停止";
  document.getElementById('play-pause-btn').style.backgroundColor = "#ff9800"; 
  
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (remainingSec <= 0 && timeline[currentIndex]) {
    remainingSec = timeline[currentIndex].duration;
  }
  
  currentEndTime = Date.now() + (remainingSec * 1000);
  
  if (audioSettings.mode !== 'tts' && remainingSec <= 20 && remainingSec > 0) {
    playWebAudio(20 - remainingSec);
    customAudioPlayedForCurrentEvent = true;
  }
  
  timerInterval = setInterval(() => {
    let now = Date.now();
    let timeLeft = Math.ceil((currentEndTime - now) / 1000);
    
    if (timeLeft !== remainingSec) {
      remainingSec = timeLeft;
      updateDisplay();
      
      if (audioSettings.mode === 'tts') {
        if (remainingSec === 10) speakTTS("10秒前");
        else if (remainingSec === 5) speakTTS("5秒前");
        else if (remainingSec === 3) speakTTS("行きます");
        else if (remainingSec === 1) speakTTS("よーい");
      } else {
        if (remainingSec <= 20 && remainingSec > 0 && !customAudioPlayedForCurrentEvent) {
          playWebAudio(20 - remainingSec);
          customAudioPlayedForCurrentEvent = true;
        }
      }
    }
    
    // 【修正】残り0秒になった瞬間、即座に次のイベントへ切り替えるのではなく、
    // 音声の「はい」の余韻（1秒間）を最後まで鳴らし切るためにわずかに遅延させる
    if (remainingSec <= 0) {
      clearInterval(timerInterval);
      
      if (audioSettings.mode === 'tts') speakTTS("はい");
      
      // 音声の「い」が途切れないよう、1.2秒だけ待ってから次のメニューへ進む
      setTimeout(() => {
        currentIndex++;
        customAudioPlayedForCurrentEvent = false; 
        loadEvent(currentIndex);
        if (currentIndex < timeline.length) {
          startTimer();
        } else {
          pauseTimer();
        }
      }, 1200); // 1200ミリ秒（1.2秒）の余韻を持たせる
    }
  }, 100);
    

function speakTTS(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = 'ja-JP';
  ut.rate = 1.1;
  speechSynthesis.speak(ut);
}

function pauseTimer() {
  isPlaying = false;
  clearInterval(timerInterval);
  document.getElementById('play-pause-btn').innerText = "▶ スタート";
  document.getElementById('play-pause-btn').style.backgroundColor = "#d32f2f"; 
  
  if (audioSettings.mode !== 'tts') {
    stopWebAudio();
  }
}

function updateDisplay() {
  const display = document.getElementById('time-display');
  display.innerText = formatTime(remainingSec);
  if (remainingSec <= 10 && remainingSec > 0) {
    display.classList.add('time-warning');
  } else {
    display.classList.remove('time-warning');
  }
}

document.getElementById('play-pause-btn').addEventListener('click', () => {
  if (isPlaying) pauseTimer();
  else startTimer();
});

document.getElementById('next-btn').addEventListener('click', () => {
  pauseTimer();
  if (currentIndex < timeline.length - 1) {
    currentIndex++;
    loadEvent(currentIndex);
  }
});

document.getElementById('prev-btn').addEventListener('click', () => {
  pauseTimer();
  if (currentIndex > 0) {
    currentIndex--;
    loadEvent(currentIndex);
  }
});