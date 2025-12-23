import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import os from "os";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import dotenv from "dotenv";
dotenv.config({ path: "config.env", quiet: true });

/* ALLOW USERS TO DISABLE FEATURES */
function envTrue(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true";
}
const WEATHER_ENABLED = envTrue(process.env.WEATHER_ENABLED, true);
const POWER_BUTTON_ENABLED = envTrue(process.env.POWER_BUTTON_ENABLED, true);
const SPOTIFY_OVERLAY_ENABLED = envTrue(process.env.SPOTIFY_OVERLAY_ENABLED, true);
const SYSTEM_OVERLAY_ENABLED = envTrue(process.env.SYSTEM_OVERLAY_ENABLED, true)
const REFRESH_BUTTON_ENABLED = envTrue(process.env.REFRESH_BUTTON_ENABLED, true);

/* VALIDATE ENVIRONMENT VARIABLES */
const requiredVars = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_REDIRECT_URI",
  "WEATHER_API_KEY",
  "WEATHER_LOCATION",
  "SYSTEM_OVERLAY_ENABLED",
  "REFRESH_BUTTON_ENABLED"
];

for (const v of requiredVars) {
  if (!process.env[v]) {
    console.error(`Missing required environment variable: ${v}`);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());

/* GET CPU USAGE FOR SYSTEM PAGE & OVERLAY */
function getCpuUsage() {
  const cpus = os.cpus();

  let idle = 0;
  let total = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  });

  return {
    idle,
    total
  };
}
let lastCpu = getCpuUsage();

/* CONFIG */
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID; 
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI
const TOKEN_FILE = path.join(__dirname, "refresh_token.txt");

/* SPOTIFY TOKEN HELPER */
async function ensureSpotifyToken() {
  if (accessToken) return true;
  if (!refreshToken) return false;

  try {
    const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID
      })
    });

    const data = await refreshRes.json();
    if (!refreshRes.ok) return false;

    accessToken = data.access_token;

    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      fs.writeFileSync(TOKEN_FILE, refreshToken);
    }

    return true;
  } catch (err) {
    console.error("Auto token refresh failed:", err);
    return false;
  }
}

/* WEATHER API CALL */

function conditionToEmoji(text) {
  const t = text.toLowerCase();

  if (t.includes("rain")) return "🌧️";
  if (t.includes("cloud")) return "☁️";
  if (t.includes("sun") || t.includes("clear")) return "☀️";
  if (t.includes("snow")) return "❄️";
  if (t.includes("storm") || t.includes("thunder")) return "⛈️";
  if (t.includes("fog") || t.includes("mist")) return "🌫️";

  return "🌡️";
}

app.get("/weather", async (req, res) => {
  if (!WEATHER_ENABLED) {
    return res.status(204).end(); // No Content
  }

  const apiKey = process.env.WEATHER_API_KEY;
  const location = process.env.WEATHER_LOCATION;

  try {
    const response = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(location)}`
    );

    const data = await response.json();
    const conditionText = data.current.condition.text;

    res.json({
      temp_c: Math.round(data.current.temp_c),
      feelslike_c: Math.round(data.current.feelslike_c),
      condition_text: conditionText,
      condition_emoji: conditionToEmoji(conditionText)
    });

  } catch (err) {
    console.error("Weather error:", err);
    res.status(500).json({ error: "Weather unavailable" });
  }
});

/* TIME AND DATE */
const TIMEZONE = process.env.TIMEZONE || "Europe/London";
const LOCALE = process.env.LOCALE || "en-GB";
const TIME_24H = process.env.TIME_24H === "true";
const DATE_FORMAT = process.env.DATE_FORMAT || "DD/MM/YYYY";

/* CONFIG FLAGS */
app.get("/config", (req, res) => {
  res.json({
    weatherEnabled: WEATHER_ENABLED,
    powerButtonEnabled: POWER_BUTTON_ENABLED,
    refreshButtonEnabled: REFRESH_BUTTON_ENABLED,
    spotifyOverlayEnabled: SPOTIFY_OVERLAY_ENABLED,
    systemOverlayEnabled: SYSTEM_OVERLAY_ENABLED,
    timezone: TIMEZONE,
    locale: LOCALE,
    time24h: TIME_24H,
    dateFormat: DATE_FORMAT
  });
});

app.get("/spotify/player", async (req, res) => {
  const ok = await ensureSpotifyToken();
  if (!ok) return res.sendStatus(401);

  const r = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (r.status === 204) {
    return res.sendStatus(204);
  }

  const text = await r.text();

  if (!text) {
    return res.sendStatus(204);
  }

  try {
    const json = JSON.parse(text);
    res.status(r.status).json(json);
  } catch (err) {
    console.error("Invalid JSON from Spotify /me/player:", text);
    res.sendStatus(502);
  }
});

app.all("/spotify/api/*", async (req, res) => {
  const ok = await ensureSpotifyToken();
  if (!ok) return res.sendStatus(401);

  const spotifyPath = req.originalUrl.replace("/spotify/api", "");

  const spotifyRes = await fetch(
    `https://api.spotify.com/v1${spotifyPath}`,
    {
      method: req.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : JSON.stringify(req.body)
    }
  );

  res.status(spotifyRes.status);

  const text = await spotifyRes.text();
  res.send(text);
});

/* SPOTIFY INFO */
app.get("/spotify/current", async (req, res) => {
  if (!SPOTIFY_OVERLAY_ENABLED) {
    return res.status(204).end();
  }

  const ok = await ensureSpotifyToken();
  if (!ok) {
    return res.status(204).end();
  }

  try {
    const r = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (r.status === 204) {
      return res.json({ playing: false });
    }

    if (!r.ok) {
      return res.status(204).end();
    }

    const data = await r.json();
    if (!data || !data.item) {
      return res.json({ playing: false });
    }

    res.json({
      playing: true,
      isPlaying: data.is_playing,
      track: data.item.name,
      artist: data.item.artists.map(a => a.name).join(", "),
      albumArt: data.item.album.images[0]?.url,
      progressMs: data.progress_ms,
      durationMs: data.item.duration_ms
    });

  } catch (err) {
    console.error("Spotify current error:", err);
    res.status(204).end();
  }
});


/* STATE */
let codeVerifier = "";
let refreshToken = null;
let accessToken = null;

/* HELPERS */
function base64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest();
}

/* LOAD REFRESH TOKEN */
if (fs.existsSync(TOKEN_FILE)) {
  refreshToken = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  console.log("Refresh token loaded from disk");
}

/* FRONTEND */
app.use(express.static(path.join(__dirname, "public")));

/* SHUTDOWN ROUTE */
app.post("/shutdown", (req, res) => {
  exec("sudo shutdown now", (err) => {
    if (err) {
      console.error("Shutdown failed:", err);
      return res.status(500).send("Shutdown failed");
    }
    res.send("Shutting down");
  });
});

/* SYSTEM INFO PAGE */
app.get("/system", (req, res) => {
  const currentCPU = getCpuUsage();
  const idleDiff = currentCPU.idle - lastCpu.idle;
  const totalDiff = currentCPU.total - lastCpu.total; 
  const cpuUsage = 100 - Math.round((idleDiff / totalDiff) * 100);
  lastCpu = currentCPU

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  res.json({
    cpu: cpuUsage,
    memory: Math.round((usedMem / totalMem) * 100),
    uptime: Math.floor(os.uptime() / 60),
  });
});

/* LOGIN */
app.get("/login", (req, res) => {
  if (refreshToken) {
    console.log("Login blocked: already authenticated");
    return res.redirect("/");
  }

  codeVerifier = base64url(crypto.randomBytes(32));
  res.cookie("pkce_verifier", codeVerifier, { httpOnly: true });
  const challenge = base64url(sha256(codeVerifier));

  const authUrl =
    "https://accounts.spotify.com/authorize" +
    "?response_type=code" +
    "&client_id=" + CLIENT_ID +
    "&scope=" + encodeURIComponent(
      "user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify" 
    ) +
    "&redirect_uri=" + encodeURIComponent(REDIRECT_URI) +
    "&code_challenge_method=S256" +
    "&code_challenge=" + challenge;

  res.redirect(authUrl);
});

/* CALLBACK */
app.get(["/callback", "/callback/"], async (req, res) => {
  const code = req.query.code;

  if (!req.cookies.pkce_verifier) {
    console.error("Missing PKCE verifier cookie");
    return res.status(400).send("PKCE verifier missing. Please retry login.");
  }
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: req.cookies.pkce_verifier
    })
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.refresh_token) {
    console.error("No refresh token returned:", tokenData);
    return res.status(500).send("No refresh token");
  }

  refreshToken = tokenData.refresh_token;
  accessToken = tokenData.access_token;

  fs.writeFileSync(TOKEN_FILE, refreshToken);
  console.log("✔ Refresh token saved");

  res.clearCookie("pkce_verifier");

  res.redirect("/");
});

/* TOKEN ENDPOINT (WITH ROTATION) */
app.get("/token", async (req, res) => {
  if (!refreshToken) {
    console.log("No refresh token in memory");
    return res.status(401).json({ error: "No refresh token" });
  }

  try {
    const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID
      })
    });

    const text = await refreshRes.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.error("Invalid JSON from Spotify:", text);
      return res.status(500).json({ error: "Invalid token response" });
    }

    if (!refreshRes.ok) {
      console.error("Refresh failed:", data);
      return res.status(401).json({ error: "Refresh failed" });
    }

    accessToken = data.access_token;

    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      fs.writeFileSync(TOKEN_FILE, refreshToken);
      console.log("Refresh token rotated and saved");
    }

    console.log("Access token refreshed");
    res.json({ access_token: accessToken });
  } catch (err) {
    console.error("Token refresh exception:", err);
    res.status(500).json({ error: "Token refresh exception" });
  }
});

/* START */
app.listen(8888, () => {
  console.log("Server running on http://127.0.0.1:8888");
});
