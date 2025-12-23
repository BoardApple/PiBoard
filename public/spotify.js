const statusEl = document.getElementById("spotify-status");
const albumArt = document.getElementById("album-art");
const trackName = document.getElementById("track-name");
const artistName = document.getElementById("artist-name");
const progressBar = document.getElementById("progress");

const playBtn = document.getElementById("play");
const likeBtn = document.getElementById("like");
const repeatBtn = document.getElementById("repeat");

let isPlaying = false;
let progressMs = 0;
let durationMs = 1;
let currentTrackId = null;
let repeatState = "off";
let volume = 50;
let currentVolume = 50;

/*  INIT  */
async function initSpotify() {
  statusEl.textContent = "Checking Spotify…";
  statusEl.onclick = null;

  const res = await fetch("/spotify/player");

  if (res.status === 401) {
    statusEl.textContent = "Connect to Spotify";
    statusEl.onclick = () => (window.location = "/login");
    return;
  }

  if (res.status === 204) {
    statusEl.textContent = "Spotify open, nothing playing";
  } else {
    statusEl.textContent = "Connected to Spotify";
  }

  updatePlayback();
  setInterval(updatePlayback, 3000);
  setInterval(updateProgress, 1000);
}

/* SPOTIFY HELPER */
async function spotify(endpoint, method = "GET") {
  const res = await fetch(`/spotify/api/${endpoint}`, { method });

  if (!res.ok) {
    const text = await res.text();
    console.warn("Spotify API error:", res.status, endpoint, text);
  }

  return res;
}

/*  PLAYBACK  */
async function updatePlayback() {
  const res = await fetch("/spotify/player");

  if (res.status === 204) {
    statusEl.textContent = "Spotify open, nothing playing";
    return;
  }

  if (!res.ok) return;

  const data = await res.json();
  if (!data || !data.item) return;

  if (data.device && typeof data.device.volume_percent === "number") {
    volume = data.device.volume_percent;
    updateVolumeUI();
  }

  currentTrackId = data.item.id;
  repeatState = data.repeat_state;
  isPlaying = data.is_playing;
  progressMs = data.progress_ms;
  durationMs = data.item.duration_ms;

  const imageUrl = data.item.album.images[0].url;
  albumArt.src = imageUrl;

  document.querySelector(".spotify-bg").style.backgroundImage =
    `url(${imageUrl})`;

  trackName.textContent = data.item.name;
  artistName.textContent =
    data.item.artists.map(a => a.name).join(", ");

  /* Play / Pause icon */
  playBtn.querySelector("img").src = 
    isPlaying ? "/assets/icons/pause-fill.svg" : "/assets/icons/play-fill.svg";

  updateRepeatUI();
  updateLikeUI();

  updateProgress();
}

/*  PROGRESS  */
function updateProgress() {
  if (!isPlaying) return;
  progressMs += 1000;
  const percent = Math.min((progressMs / durationMs) * 100, 100);
  progressBar.style.width = percent + "%";
}

function updateVolumeUI() {
  const muteBtn = document.getElementById("vol-mute");
  if (!muteBtn) return;

  muteBtn.classList.toggle("active", volume === 0);
}

/*  LIKE  */
async function updateLikeUI() {
  const res = await spotify(`me/tracks/contains?ids=${currentTrackId}`);
  if (!res.ok) return;

  const [liked] = await res.json();

  likeBtn.classList.toggle("liked", liked);
}

likeBtn.onclick = async () => {
  if (!currentTrackId) return;

  const isLiked = likeBtn.classList.contains("liked");

  likeBtn.classList.toggle("liked", !isLiked);

  const res = await spotify(
    `me/tracks?ids=${currentTrackId}`,
    isLiked ? "DELETE" : "PUT"
  );

  if (!res || !res.ok) {
    likeBtn.classList.toggle("liked", isLiked);
  }
};

/*  REPEAT  */
function updateRepeatUI() {
  repeatBtn.classList.toggle("active", repeatState !== "off");

  const img = repeatBtn.querySelector("img");

  if (repeatState === "track") {
    img.src = "/assets/icons/repeat-1.svg";
  } else {
    img.src = "/assets/icons/repeat.svg";
  }
}

repeatBtn.onclick = async () => {
  let next;
  if (repeatState === "off") next = "context";
  else if (repeatState === "context") next = "track";
  else next = "off";

  await spotify(`me/player/repeat?state=${next}`, "PUT");
  repeatState = next;
  updateRepeatUI();
};

/*  VOLUME CONTROLS  */
const muteBtn = document.getElementById("vol-mute");

muteBtn.onclick = async () => {
  if (volume > 0) {
    currentVolume = volume;
  }

  if (volume === 0) {
    volume = currentVolume;
  } else {
    volume = 0;
  }

  await spotify(`me/player/volume?volume_percent=${volume}`, "PUT");
  updateVolumeUI();
};

/*  SKIP CONTROLS  */
document.getElementById("next").onclick = async () => {
  const res = await spotify("me/player/next", "POST");
  if (!res || !res.ok) {
    statusEl.textContent = "No active Spotify device";
    return;
  }

  setTimeout(updatePlayback, 500);
};


document.getElementById("prev").onclick = async () => {
  const res = await spotify("me/player/previous", "POST");
  if (!res || !res.ok) {
    statusEl.textContent = "No active Spotify device";
    return;
  }

  setTimeout(updatePlayback, 500);
};

/* PLAY / PAUSE CONTROLS */
playBtn.onclick = async () => {
  await spotify(
    isPlaying ? "me/player/pause" : "me/player/play",
    "PUT"
  );
  setTimeout(updatePlayback, 300);
};

/*  START  */
initSpotify();
