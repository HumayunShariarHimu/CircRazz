const state = {
  running: false,
  intervalSec: 10,
  timerId: null,
  matches: {}, // match_id => match object in UI + history
};

const providers = {
  // NOTE: endpoints here are examples. Replace with real endpoints per provider.
  sportmonks: {
    base: 'https://soccer.sportmonks.com/api/v2.0', // <-- example; sportmonks cricket endpoints differ
    // sportmonks cricket docs: adapt endpoints & params
    // live matches endpoint example (pseudo): https://api.sportmonks.com/cricket/live?api_token=APIKEY
  },
  cricketdata: {
    base: 'https://api.cricketdata.org/v1',
    // e.g., https://api.cricketdata.org/v1/matches?status=live
  },
  custom: {
    // for custom: user will provide matches list URL via input
  }
};

/* ------------- DOM refs ------------- */
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const matchesContainer = document.getElementById('matchesContainer');
const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const customUrlInput = document.getElementById('customMatchesUrl');
const customLabel = document.getElementById('customEndpointLabel');
const intervalInput = document.getElementById('interval');
const intervalVal = document.getElementById('intervalVal');

/* show/hide custom field */
providerSelect.addEventListener('change', () => {
  customLabel.style.display = providerSelect.value === 'custom' ? 'block' : 'none';
});

/* interval slider */
intervalInput.addEventListener('input', () => {
  intervalVal.innerText = intervalInput.value;
  state.intervalSec = parseInt(intervalInput.value, 10);
});

/* ------------- Start/Stop controls ------------- */
startBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if(providerSelect.value !== 'custom' && !key) {
    alert('Please enter your API key.');
    return;
  }
  startLiveUpdates();
});
stopBtn.addEventListener('click', stopLiveUpdates);

/* ------------- Core: Polling & UI ------------- */

function startLiveUpdates(){
  if(state.running) return;
  state.running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  // initial fetch immediately
  fetchAndUpdateAll();
  // then interval
  state.timerId = setInterval(fetchAndUpdateAll, state.intervalSec * 1000);
}

function stopLiveUpdates(){
  state.running = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  clearInterval(state.timerId);
  state.timerId = null;
}

/* ------------- Fetching live matches list ------------- */

async function fetchAndUpdateAll(){
  try {
    const matchesList = await fetchLiveMatchesList();
    // matchesList is expected: [{match_id, team_a, team_b, target_score? , status?}, ...]
    // render cards for any new matches and update existing
    for(const m of matchesList){
      if(!state.matches[m.match_id]) {
        createMatchCard(m);
        // initialize state
        state.matches[m.match_id] = {
          meta: m,
          history: [], // recent ball runs
          lastBallSeq: [], // raw last balls
        };
      }
    }

    // For each tracked match, fetch ball-by-ball (or latest ball) and update
    for(const mid of Object.keys(state.matches)){
      // ensure still live: if not present in matchesList, we keep card but mark ended
      const found = matchesList.find(x => x.match_id == mid);
      if(!found){
        markMatchEnded(mid);
        continue;
      }
      await fetchAndProcessBalls(mid);
    }
  } catch(err){
    console.error('Error in fetchAndUpdateAll:', err);
  }
}

/* ------------- Provider-specific fetching -------------
   NOTE: Replace endpoints and parsing logic to match the API you use.
   Below are pseudo-implementations and must be adapted.
--------------------------------------------------------- */

async function fetchLiveMatchesList(){
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();
  if(provider === 'custom'){
    const url = customUrlInput.value.trim();
    if(!url) throw new Error('Custom matches URL empty');
    const res = await fetch(url);
    const data = await res.json();
    // Expect the custom endpoint to return array of matches directly
    // Example normalization: [{match_id, team_a, team_b, target_score}]
    return parseLiveMatchesResponse(data, provider);
  }

  // Example for sportmonks / cricketdata — MUST ADAPT:
  if(provider === 'sportmonks'){
    // Replace with actual cricket live matches endpoint & param for api_token
    const url = `https://api.sportmonks.com/v2.0/cricket/matches?filter[status]=live&api_token=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const data = await res.json();
    return parseLiveMatchesResponse(data, provider);
  }

  if(provider === 'cricketdata'){
    const url = `https://api.cricketdata.org/v1/matches?status=live&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: {'Authorization': `Bearer ${key}` }
    });
    const data = await res.json();
    return parseLiveMatchesResponse(data, provider);
  }

  throw new Error('Unknown provider');
}

/* ------------- parseLiveMatchesResponse
   Convert various API responses into normalized array:
   [{match_id, team_a, team_b, target_score, status}, ...]
   You must edit these parsers to match your chosen API's JSON structure.
--------------------------------------------------------- */
function parseLiveMatchesResponse(data, provider){
  // PROVIDE EXAMPLE PARSERS — CHANGE FOR YOUR API:
  if(provider === 'custom'){
    // If your custom endpoint already returns normalized array, return as-is:
    // Ensure each match has match_id, team_a, team_b, target_score
    return Array.isArray(data) ? data : [];
  }

  if(provider === 'sportmonks'){
    // Example: sportmonks might return {data: [ { id, localteam: {data:{name}}, visitorteam:{...}, ... } ]}
    // This is pseudo-code. Replace with exact response keys.
    const arr = (data.data || []).map(item => {
      return {
        match_id: item.id,
        team_a: item.localteam?.data?.name || item.localteam_name || 'Team A',
        team_b: item.visitorteam?.data?.name || item.visitorteam_name || 'Team B',
        target_score: item.target || null,
        status: item.status || 'live'
      };
    });
    return arr;
  }

  if(provider === 'cricketdata'){
    // Example parser for cricketdata.org sample structure
    // Replace field names with actual response
    if(Array.isArray(data.matches)) {
      return data.matches.map(m => ({
        match_id: m.id || m.match_id,
        team_a: (m.teamA && m.teamA.name) || m.team_a_name || m.teamAName,
        team_b: (m.teamB && m.teamB.name) || m.team_b_name || m.teamBName,
        target_score: m.target || m.target_score || null,
        status: m.status || 'live'
      }));
    }
    // fallback
    return [];
  }

  return [];
}

/* ------------- Create UI Card ------------- */
function createMatchCard(matchMeta){
  const card = document.createElement('div');
  card.className = 'match-card';
  card.id = `match-${matchMeta.match_id}`;
  card.innerHTML = `
    <div class="match-top">
      <div>
        <div class="match-title">${escapeHtml(matchMeta.team_a)} vs ${escapeHtml(matchMeta.team_b)}</div>
        <div class="match-meta">Match ID: ${matchMeta.match_id} • <span id="status-${matchMeta.match_id}">${matchMeta.status||'live'}</span></div>
      </div>
      <div>
        <div class="metric" id="score-${matchMeta.match_id}">Score: -</div>
      </div>
    </div>

    <div class="score-row">
      <div class="metric">Over: <span id="over-${matchMeta.match_id}">-</span></div>
      <div class="metric">Ball: <span id="ball-${matchMeta.match_id}">-</span></div>
      <div class="metric">Wkts: <span id="wickets-${matchMeta.match_id}">-</span></div>
      <div class="metric">Inning Score: <span id="inning-${matchMeta.match_id}">-</span></div>
    </div>

    <div class="history" id="history-${matchMeta.match_id}">
      <!-- recent balls -->
    </div>

    <div class="predictions">
      <div class="pred-box">
        <h4>Next Ball Prediction</h4>
        <div class="pred-big" id="pred-next-${matchMeta.match_id}">-</div>
        <div class="match-meta">Runs (expected)</div>
      </div>
      <div class="pred-box">
        <h4>Win Probability</h4>
        <div class="pred-big" id="pred-win-${matchMeta.match_id}">-</div>
        <div class="match-meta">%</div>
      </div>
    </div>
  `;
  matchesContainer.prepend(card);
}

/* ------------- Mark ended match ------------- */
function markMatchEnded(match_id){
  const elStatus = document.getElementById(`status-${match_id}`);
  if(elStatus) elStatus.innerText = 'ended';
}

/* ------------- Fetch & process balls for a match ------------- */
async function fetchAndProcessBalls(match_id){
  const provider = providerSelect.value;
  const key = apiKeyInput.value.trim();
  let ballsRaw = [];

  try {
    if(provider === 'custom'){
      // custom endpoint expected to provide ball-by-ball for match: user must provide base url pattern
      const base = customUrlInput.value.trim();
      // Client should provide endpoint that returns ball-by-ball JSON for that match
      if(!base) throw new Error('Custom ball endpoint not configured');
      const res = await fetch(base.replace('{match_id}', match_id));
      const data = await res.json();
      ballsRaw = parseBallByBallResponse(data, provider);
    } else if(provider === 'sportmonks'){
      // pseudo-endpoint example — replace with real one
      const url = `https://api.sportmonks.com/v2.0/cricket/matches/${match_id}/deliveries?api_token=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      const data = await res.json();
      ballsRaw = parseBallByBallResponse(data, provider);
    } else if(provider === 'cricketdata'){
      // example for cricketdata
      const url = `https://api.cricketdata.org/v1/match/${match_id}/deliveries`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${key}` }});
      const data = await res.json();
      ballsRaw = parseBallByBallResponse(data, provider);
    } else {
      // fallback: no provider
      ballsRaw = [];
    }

    // ballsRaw expected: array sorted in chronological order for current innings,
    // each item: {over, ball, runs, wickets, inning_score, batsman, bowler}
    if(!Array.isArray(ballsRaw) || ballsRaw.length === 0) {
      // nothing new
      return;
    }

    // update state and UI using the latest ball
    const st = state.matches[match_id];
    if(!st) return;

    // if ballsRaw contains many deliveries, find the new ones
    const lastKnownLen = st.lastBallSeq.length;
    // naive approach: replace lastBallSeq with ballsRaw (but ensure we keep recent history for prediction)
    st.lastBallSeq = ballsRaw;

    // build history of last runs (for prediction)
    const recentRuns = ballsRaw.slice(-8).map(b => Number(b.runs || 0)); // keep last up to 8 balls
    st.history = recentRuns;

    // update UI with latest ball info
    const latest = ballsRaw[ballsRaw.length - 1];
    updateMatchUI(match_id, latest, st.history);

  } catch(err){
    console.error('fetchAndProcessBalls error', match_id, err);
  }
}

/* ------------- parseBallByBallResponse
   Convert provider response to array of normalized deliveries:
   [{over, ball, runs, wickets, inning_score, batsman, bowler}, ...]
   MUST adapt to your API's JSON format.
--------------------------------------------------------- */
function parseBallByBallResponse(data, provider){
  if(provider === 'custom'){
    // expected to return normalized array already
    return Array.isArray(data) ? data : [];
  }
  if(provider === 'sportmonks'){
    // pseudo-parse. adapt to actual response.
    // e.g., data.data might contain deliveries
    const arr = (data.data || []).map(d => ({
      over: d.over || d.inningOver,
      ball: d.ball || d.inningBall,
      runs: (d.runs && d.runs.total) || d.runs || 0,
      wickets: d.wicket || 0,
      inning_score: d.team_score || d.inning_score || 0,
      batsman: d.batsman || null,
      bowler: d.bowler || null
    }));
    return arr;
  }
  if(provider === 'cricketdata'){
    // example: data.deliveries
    const arr = (data.deliveries || []).map(d => ({
      over: d.overNumber || d.over,
      ball: d.ballNumber || d.ball,
      runs: d.runs || 0,
      wickets: d.wicket || 0,
      inning_score: d.score || 0,
      batsman: d.batsman || null,
      bowler: d.bowler || null
    }));
    return arr;
  }
  return [];
}

/* ------------- UI updater + prediction ------------- */

function updateMatchUI(match_id, latestBall, historyRuns){
  // latestBall: {over, ball, runs, wickets, inning_score}
  const elScore = document.getElementById(`score-${match_id}`);
  const elOver = document.getElementById(`over-${match_id}`);
  const elBall = document.getElementById(`ball-${match_id}`);
  const elWkts = document.getElementById(`wickets-${match_id}`);
  const elInning = document.getElementById(`inning-${match_id}`);
  const histEl = document.getElementById(`history-${match_id}`);
  const predNextEl = document.getElementById(`pred-next-${match_id}`);
  const predWinEl = document.getElementById(`pred-win-${match_id}`);

  if(elScore) elScore.innerText = `Score: ${latestBall.inning_score || '-'}`;
  if(elOver) elOver.innerText = latestBall.over ?? '-';
  if(elBall) elBall.innerText = latestBall.ball ?? '-';
  if(elWkts) elWkts.innerText = latestBall.wickets ?? '-';
  if(elInning) elInning.innerText = latestBall.inning_score ?? '-';

  // update history visuals
  if(histEl){
    histEl.innerHTML = '';
    (historyRuns || []).slice(-8).forEach(r => {
      const b = document.createElement('div');
      b.className = 'ball';
      b.innerText = r;
      histEl.appendChild(b);
    });
  }

  // PREDICTION: Next run = simple weighted average + small randomness based on last balls
  const nextRunPred = predictNextRunJS(historyRuns);
  if(predNextEl) predNextEl.innerText = `${nextRunPred} runs`;

  // WIN probability: needs target_score; try from stored meta
  const meta = state.matches[match_id]?.meta || {};
  const target = meta.target_score || meta.target || null;
  let winProb = '-';
  if(target !== null && target !== undefined){
    const currentScore = Number(latestBall.inning_score || 0);
    const wicketsLost = Number(latestBall.wickets || 0);
    winProb = predictWinProbabilityJS(currentScore, wicketsLost, Number(target));
  } else {
    winProb = 'N/A';
  }
  if(predWinEl) predWinEl.innerText = winProb === 'N/A' ? 'N/A' : `${winProb}%`;
}

/* ------------- Prediction logic (JS) ------------- */

/* Simple next-run predictor:
   - Weighted average of last N balls (more recent heavier)
   - Clamp to 0..6
*/
function predictNextRunJS(historyRuns){
  if(!historyRuns || historyRuns.length === 0) return 1;
  const N = Math.min(6, historyRuns.length);
  // give higher weights to recent balls
  let total = 0, wsum = 0;
  for(let i=0;i<N;i++){
    const val = Number(historyRuns[historyRuns.length - 1 - i] || 0);
    const weight = (i+1); // recent gets higher weight
    total += val * weight;
    wsum += weight;
  }
  let avg = total / wsum;
  // small heuristic adjustments:
  if(avg < 0.5) avg = 0;
  // round to one decimal or integer if whole
  avg = Math.round(avg * 10) / 10;
  // clamp
  if(avg < 0) avg = 0;
  if(avg > 6) avg = 6;
  return avg;
}

/* Win-probability heuristic:
   - Based on runs remaining, wickets left, overs left estimate
   - Because we don't always have overs left explicitly, we approximate from recent over/ball
   This is a heuristic — not a full cricket simulation. For production, replace with a model (e.g., win-prob via historical ML).
*/
function predictWinProbabilityJS(currentScore, wicketsLost, targetScore){
  const remainingRuns = Math.max(0, targetScore - currentScore);
  const remainingWickets = Math.max(0, 10 - wicketsLost);

  // crude estimate of remainingBalls: assume a T20 or user-defined match length:
  // If targetScore <= 200 assume 20 overs total => 120 balls
  const totalInningsBalls = (targetScore <= 200) ? 120 : 300; // T20 vs ODI-ish
  // find latest over/ball across state (not perfect); we skip exact overs left if unknown
  // base probability decreases with remainingRuns, increases with wickets left
  let prob = 50;
  prob += remainingWickets * 4;        // each wicket gives +4%
  prob -= remainingRuns * 0.5;         // every run to win reduces prob by 0.5%
  // normalize
  if(prob < 1) prob = 1;
  if(prob > 99) prob = 99;
  return Math.round(prob);
}

/* ------------- small helper ------------- */
function escapeHtml(s){
  if(!s) return s;
  return String(s).replace(/[&<>"'`=\/]/g, function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[ch];
  });
}