const GAS_URL = 'https://script.google.com/macros/s/AKfycbxz_hWX9qqMsF-KijdrLCb2mQIe5-6o__hyMsO_pyLiKOtGS2O24RCPNSQXL_DUhoIP/exec';

let menuData = Array.from({ length: 20 }, () => ({
  type: 'swim', work: '', dis: '', rep: '', set: '', interval: '00:00', note: '', sys: '', str: '', item: '', mg: '', rest: '00:00', restDisplay: 'inline',
  isVarInterval: false, varIntervals: [], groupWithNext: false
}));

let globalStartTimeStr = '07:30';
document.getElementById('menuDate').valueAsDate = new Date();

let historyStack = [];
let historyIndex = -1;

function pushHistory() {
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }
  historyStack.push(JSON.stringify({ menu: menuData, start: globalStartTimeStr }));
  historyIndex++;
}

window.undo = function() {
  if (historyIndex > 0) {
    historyIndex--;
    const state = JSON.parse(historyStack[historyIndex]);
    menuData = state.menu;
    globalStartTimeStr = state.start;
    renderTable();
  }
}

window.redo = function() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    const state = JSON.parse(historyStack[historyIndex]);
    menuData = state.menu;
    globalStartTimeStr = state.start;
    renderTable();
  }
}

function timeToSeconds(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [min, sec] = timeStr.split(':').map(Number);
  return (min || 0) * 60 + (sec || 0);
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

window.updateStartTime = function(val) {
  if (globalStartTimeStr === val) return;
  globalStartTimeStr = val;
  pushHistory();
  renderTable();
}

function updateData(index, field, value) {
  if (menuData[index][field] === value) return;
  menuData[index][field] = value;
  
  if (field === 'work') {
    const isRest = (value.trim().toLowerCase() === 'rest' || value.trim() === 'レスト');
    const currentType = menuData[index].type;
    if (isRest && currentType !== 'rest') {
      menuData[index].type = 'rest'; menuData[index].restDisplay = 'block';
    } else if (!isRest && currentType === 'rest') {
      menuData[index].type = 'swim'; menuData[index].restDisplay = 'inline';
    }
  }
  pushHistory();
  renderTable(); 
}

function deleteRow(index) { 
  menuData.splice(index, 1); 
  pushHistory();
  renderTable(); 
}

window.mergeNext = function(index, span) {
  if (index + span < menuData.length) {
    menuData[index + span - 1].groupWithNext = true;
    pushHistory();
    renderTable();
  }
}

window.unmergeRow = function(index, span) {
  if (span > 1) {
    menuData[index + span - 2].groupWithNext = false;
    pushHistory();
    renderTable();
  }
}

window.toggleVarInterval = function(index, isChecked) {
  menuData[index].isVarInterval = isChecked;
  if (isChecked && (!menuData[index].varIntervals || menuData[index].varIntervals.length === 0)) {
    const rep = Number(menuData[index].rep) || 1;
    menuData[index].varIntervals = Array(rep).fill('01:00');
  }
  pushHistory();
  renderTable();
}

let currentVarIndex = -1;
window.openVarModal = function(index) {
  currentVarIndex = index;
  const rep = Number(menuData[index].rep) || 1;
  let intervals = menuData[index].varIntervals || [];
  
  if (intervals.length !== rep) {
    const newArr = Array(rep).fill('01:00');
    for(let i=0; i<Math.min(intervals.length, rep); i++) newArr[i] = intervals[i];
    intervals = newArr;
  }
  menuData[index].varIntervals = intervals;

  let html = '';
  for(let i=0; i<rep; i++) {
    html += `<label>${i+1}本目: <input type="time" id="varInt_${i}" value="${intervals[i]}" style="margin-left:10px;"></label>`;
  }
  document.getElementById('varModalInputs').innerHTML = html;
  document.getElementById('varModal').style.display = 'block';
}

window.closeVarModal = function() { document.getElementById('varModal').style.display = 'none'; }

window.saveVarModal = function() {
  const rep = Number(menuData[currentVarIndex].rep) || 1;
  let newIntervals = [];
  for(let i=0; i<rep; i++) newIntervals.push(document.getElementById(`varInt_${i}`).value);
  menuData[currentVarIndex].varIntervals = newIntervals;
  closeVarModal();
  pushHistory();
  renderTable();
}

function renderTable() {
  const tbody = document.querySelector('tbody');
  tbody.innerHTML = ''; 

  const sysColors = { 'A1':'#aed581', 'EN1':'#4fc3f7', 'EN2':'#64b5f6', 'EN3':'#1976d2', 'AN1':'#ffb74d', 'AN2':'#ff8a65', 'AN3':'#e53935', 'Max':'#8e24aa', '未分類':'#cccccc' };
  let sysTotals = {};
  let totalDistance = 0;

  let spanCounts = new Array(menuData.length).fill(1);
  let skipSetCell = new Array(menuData.length).fill(false);
  for (let i = 0; i < menuData.length; i++) {
      if (skipSetCell[i]) continue;
      if (menuData[i].type === 'rest') {
         menuData[i].groupWithNext = false;
         continue;
      }
      let span = 1;
      while (i + span - 1 < menuData.length && menuData[i + span - 1].groupWithNext && menuData[i + span].type !== 'rest') {
          span++;
      }
      if (span > 1) {
          spanCounts[i] = span;
          for (let j = 1; j < span; j++) {
              skipSetCell[i + j] = true;
          }
      }
  }

  let currentSeconds = timeToSeconds(globalStartTimeStr) * 60;
  let displayTimes = new Array(menuData.length).fill('');
  let i = 0;
  
  while (i < menuData.length) {
      let span = spanCounts[i];
      let blockSets = Number(menuData[i].set) || 1;
      let blockSingleDuration = 0;

      for (let j = 0; j < span; j++) {
          let rowIndex = i + j;
          let row = menuData[rowIndex];
          
          displayTimes[rowIndex] = formatTime(currentSeconds + blockSingleDuration);

          let rowSingleDuration = 0;
          if (row.type === 'swim') {
              const rep = Number(row.rep) || 1;
              const restSec = timeToSeconds(row.rest); // 各行のレスト
              
              if (row.isVarInterval && row.varIntervals) {
                  rowSingleDuration = row.varIntervals.reduce((sum, t) => sum + timeToSeconds(t), 0) + restSec;
              } else {
                  rowSingleDuration = (timeToSeconds(row.interval) * rep) + restSec;
              }
              
              const dis = Number(row.dis) || 0;
              if (dis > 0) {
                  const rowTotalDis = dis * rep * blockSets;
                  totalDistance += rowTotalDis;
                  
                  const sysKey = row.sys ? row.sys : '未分類';
                  sysTotals[sysKey] = (sysTotals[sysKey] || 0) + rowTotalDis;
              }
          } else if (row.type === 'rest') {
              rowSingleDuration = timeToSeconds(row.rest);
          }
          
          blockSingleDuration += rowSingleDuration;
      }
      
      currentSeconds += (blockSingleDuration * blockSets);
      i += span;
  }

  menuData.forEach((row, index) => {
    const tr = document.createElement('tr');
    
    let timeCellHtml = '';
    if (index === 0) {
      timeCellHtml = `<input type="time" value="${globalStartTimeStr}" onchange="updateStartTime(this.value)" style="width: 100%; border: none; font-size: 11px; text-align: center; background: transparent; font-weight: bold; cursor: pointer;">`;
    } else {
      timeCellHtml = displayTimes[index];
    }

    let html = `<td class="delete-col no-print"><button onclick="deleteRow(${index})" style="cursor:pointer; color:red; border:none; background:none; font-size:11px; font-weight:bold; padding:0;">削除</button></td>`;

    if (row.type === 'rest' && row.restDisplay === 'block') {
      tr.className = 'rest-block';
      html += `
        <td style="font-size:11px;">${timeCellHtml}</td>
        <td><input type="text" value="${row.work}" list="work-options" onfocus="this.select()" onchange="updateData(${index}, 'work', this.value)"></td>
        <td colspan="9" style="background-color: #e6e6e6;"></td>
        <td><input type="time" value="${row.rest}" data-rest="${row.rest}" onfocus="this.select()" onchange="updateData(${index}, 'rest', this.value)"></td>
      `;
    } else {
      let intervalCell = '';
      if (row.isVarInterval) {
         const displayTimesStr = (row.varIntervals || []).filter(t=>t).join(', ');
         intervalCell = `
           <td style="line-height:1.2;">
             <div style="font-size:10px; color:#555;">${displayTimesStr}</div>
             <button class="no-print" onclick="openVarModal(${index})" style="font-size:10px; padding:1px 4px;">設定</button>
             <label class="no-print" style="font-size:9px; margin-left:3px; cursor:pointer;">変則<input type="checkbox" checked onchange="toggleVarInterval(${index}, this.checked)" style="margin-left:2px; vertical-align:middle;"></label>
           </td>
         `;
      } else {
         intervalCell = `
           <td>
             <input type="time" value="${row.interval}" onfocus="this.select()" onchange="updateData(${index}, 'interval', this.value)">
             <div class="no-print" style="font-size:9px;"><label style="cursor:pointer;">変則<input type="checkbox" onchange="toggleVarInterval(${index}, this.checked)" style="margin-left:2px; vertical-align:middle;"></label></div>
           </td>
         `;
      }

      html += `
        <td style="font-size:11px;">${timeCellHtml}</td>
        <td><input type="text" value="${row.work}" list="work-options" onfocus="this.select()" onchange="updateData(${index}, 'work', this.value)"></td>
        <td><input type="text" value="${row.dis}" list="dis-options" onfocus="this.select()" onchange="updateData(${index}, 'dis', this.value)"></td>
        <td><input type="text" value="${row.rep}" list="repset-options" onfocus="this.select()" onchange="updateData(${index}, 'rep', this.value)"></td>
      `;

      if (!skipSetCell[index]) {
          html += `<td rowspan="${spanCounts[index]}" style="vertical-align: middle; border: 1px solid #444; background-color: transparent;">
                     <input type="text" value="${row.set}" list="repset-options" onfocus="this.select()" onchange="updateData(${index}, 'set', this.value)" style="height: auto;">
                     <div class="no-print" style="display:flex; justify-content:center; gap:2px; margin-top:2px;">
                       ${spanCounts[index] > 1 ? `<button onclick="unmergeRow(${index}, ${spanCounts[index]})" style="padding:1px 3px; font-size:9px; cursor:pointer;">解除</button>` : ''}
                       ${(index + spanCounts[index] < menuData.length && menuData[index + spanCounts[index]].type !== 'rest') ? `<button onclick="mergeNext(${index}, ${spanCounts[index]})" style="padding:1px 3px; font-size:9px; cursor:pointer;">↓結</button>` : ''}
                     </div>
                   </td>`;
      }

      html += `
        ${intervalCell}
        <td><textarea rows="1" onfocus="this.select()" oninput="this.style.height='0px'; this.style.height=this.scrollHeight+'px';" onchange="updateData(${index}, 'note', this.value)">${row.note}</textarea></td>
        <td><input type="text" value="${row.sys}" list="sys-options" onfocus="this.select()" onchange="updateData(${index}, 'sys', this.value)"></td>
        <td><input type="text" value="${row.str}" list="str-options" onfocus="this.select()" onchange="updateData(${index}, 'str', this.value)"></td>
        <td><input type="text" value="${row.item}" onfocus="this.select()" onchange="updateData(${index}, 'item', this.value)"></td>
        <td><input type="text" value="${row.mg}" onfocus="this.select()" onchange="updateData(${index}, 'mg', this.value)"></td>
        <td class="rest-inline"><input type="time" value="${row.rest}" data-rest="${row.rest}" onfocus="this.select()" onchange="updateData(${index}, 'rest', this.value)"></td>
      `;
    }
    tr.innerHTML = html;
    tbody.appendChild(tr);
    
    const textarea = tr.querySelector('textarea');
    if (textarea) {
      textarea.style.height = '0px';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  });

  updateChart(sysTotals, totalDistance, sysColors);
}

function updateChart(sysTotals, totalDistance, sysColors) {
  const chartEl = document.getElementById('sysPieChart');
  const legendEl = document.getElementById('sysLegend');
  
  const totalDistDisplay = document.getElementById('totalDistanceDisplay');
  if (totalDistDisplay) {
    totalDistDisplay.innerText = `Total: ${totalDistance} m`;
  }

  if (totalDistance === 0) {
    chartEl.style.background = '#eee';
    legendEl.innerHTML = 'データなし';
    return;
  }
  let gradientStops = [];
  let currentPercent = 0;
  let legendHtml = '';
  for (const [sys, dis] of Object.entries(sysTotals)) {
    const percent = (dis / totalDistance) * 100;
    const color = sysColors[sys] || sysColors['未分類'];
    gradientStops.push(`${color} ${currentPercent}% ${currentPercent + percent}%`);
    currentPercent += percent;
    legendHtml += `<div class="legend-item"><span style="color:${color};">■</span> ${sys}: ${Math.round(percent)}%</div>`;
  }
  chartEl.style.background = `conic-gradient(${gradientStops.join(', ')})`;
  legendEl.innerHTML = legendHtml;
}

function updateCountdown() {
  const menuDateStr = document.getElementById('menuDate').value;
  const baseDate = menuDateStr ? new Date(menuDateStr) : new Date();
  baseDate.setHours(0,0,0,0);
  
  [1, 2, 3].forEach(num => {
    const dateInput = document.getElementById(`event${num}Date`).value;
    const daysDiv = document.getElementById(`event${num}Days`);
    if (dateInput) {
      const targetDate = new Date(dateInput);
      targetDate.setHours(0,0,0,0);
      const diffTime = targetDate - baseDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      daysDiv.innerText = diffDays >= 0 ? `あと ${diffDays} 日` : '終了';
    }
  });
}

function getFileName() {
  const d = document.getElementById('menuDate').value.replace(/-/g, '');
  const ampm = document.getElementById('menuAmPm').value;
  const type = document.getElementById('menuType').value;
  const author = document.getElementById('menuAuthor').value || '作成者なし';
  const defaultName = `${d}_${ampm}_${type}_${author}`;
  return prompt("ファイル名を確認・変更してください", defaultName);
}

document.getElementById('menuDate').addEventListener('change', updateCountdown);
document.querySelectorAll('.countdown-box input[type="date"]').forEach(el => el.addEventListener('change', updateCountdown));

document.getElementById('addRowBtn').addEventListener('click', () => {
  menuData.push({ type: 'swim', work: '', dis: '', rep: '', set: '', interval: '00:00', note: '', sys: '', str: '', item: '', mg: '', rest: '00:00', restDisplay: 'inline', isVarInterval: false, varIntervals: [], groupWithNext: false });
  pushHistory();
  renderTable();
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const filename = getFileName();
  if(!filename) return;
  const dataStr = JSON.stringify(menuData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename + '.json';
  a.click();
});

document.getElementById('pdfBtn').addEventListener('click', () => {
  const filename = getFileName();
  if(!filename) return;
  
  const originalTitle = document.title;
  document.title = filename;

  const container = document.querySelector('.print-container');
  const clone = container.cloneNode(true);
  clone.id = 'print-clone';
  document.body.appendChild(clone);

  window.print();

  document.title = originalTitle;
  clone.remove();
});

document.getElementById('loadBtn').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => { 
    menuData = JSON.parse(e.target.result); 
    pushHistory();
    renderTable(); 
  };
  reader.readAsText(file);
});

pushHistory();
renderTable();
updateCountdown();

document.getElementById('cloudSaveBtn').addEventListener('click', () => {
  const filename = getFileName();
  if(!filename) return;

  const payload = {
    date: document.getElementById('menuDate').value,
    title: filename,
    jsonMenu: JSON.stringify(menuData)
  };

  const btn = document.getElementById('cloudSaveBtn');
  btn.innerText = '保存中...';
  btn.disabled = true;

  // GASへデータを送信
  fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  .then(response => response.json())
  .then(data => {
    alert('クラウドに保存しました！');
    btn.innerText = 'クラウド保存';
    btn.disabled = false;
  })
  .catch(error => {
    alert('エラーが発生しました: ' + error);
    btn.innerText = 'クラウド保存';
    btn.disabled = false;
  });
});