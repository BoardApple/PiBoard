document.addEventListener("DOMContentLoaded", () => {
  let appConfig = null;
  const pages = document.querySelectorAll(".page");
  const buttons = document.querySelectorAll("#top-bar button");

  let currentPage = 0;

  /* PAGE NAVIGATION */

  function updatePages(newPage) {
    pages.forEach((page, i) => {
      page.classList.remove("active", "left");

      if (i === newPage) page.classList.add("active");
      else if (i < newPage) page.classList.add("left");
    });

    buttons.forEach((btn, i) => {
      btn.classList.toggle("active", i === newPage);
    });

    currentPage = newPage;
  }

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      updatePages(Number(btn.dataset.page));
    });
  });

  /* DOUBLE TAP */

  let lastTapTime = 0;

  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;

    const now = Date.now();
    const delta = now - lastTapTime;

    if (delta > 0 && delta < 350) {
      updatePages((currentPage + 1) % pages.length);
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
  });

  updatePages(0);

  /* SPOTIFY OVERLAY */
  
  const spotifyOverlay = document.getElementById("spotify-overlay");
  const overlayTrack = document.getElementById("spotify-overlay-track");
  const overlayArtist = document.getElementById("spotify-overlay-artist");
  const overlayTime = document.getElementById("spotify-overlay-time");
  const overlayArt = document.getElementById("spotify-overlay-art");
  const overlayBg = document.getElementById("spotify-overlay-bg");

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  async function loadSpotify() {
    try {
      const res = await fetch("/spotify/current");

      // Spotify disabled or no token
      if (res.status === 204) {
        spotifyOverlay.classList.add("inactive");
        return;
      }

      const data = await res.json();

      // Nothing playing
      if (!data.playing) {
        spotifyOverlay.classList.add("inactive");

        overlayTrack.textContent = "Nothing Playing";
        overlayArtist.textContent = "";
        overlayTime.textContent = "";

        overlayArt.src = "";
        overlayArt.classList.add("spotify-placeholder");
        overlayBg.style.backgroundImage = "none";

        return;
      }

      spotifyOverlay.classList.remove("inactive");
      overlayArt.classList.remove("spotify-placeholder");

      overlayTrack.textContent = data.track;
      overlayArtist.textContent = data.artist;

      const remaining =
        data.durationMs - data.progressMs;

      overlayTime.textContent =
        `-${formatTime(remaining)}`;

      overlayArt.src = data.albumArt;
      overlayBg.style.backgroundImage =
        `url(${data.albumArt})`;

    } catch (err) {
      console.warn("Spotify overlay error:", err);
    }
  }

  loadSpotify()
  setInterval(loadSpotify, 3000);

  /* TIME & DATE */

  function ordinal(n) {
    if (n > 3 && n < 21) return n + "th";
    switch (n % 10) {
      case 1: return n + "st";
      case 2: return n + "nd";
      case 3: return n + "rd";
      default: return n + "th";
    }
  }

  function formatDate(date, format, locale) {
    const weekday = date.toLocaleDateString(locale, { weekday: "long" });
    const month = date.toLocaleDateString(locale, { month: "long" });
    const day = date.getDate();
    const year = date.getFullYear();

    return format
      .replace("dddd", weekday)
      .replace("Do", ordinal(day))
      .replace("MMMM", month)
      .replace("YYYY", year);
  }

  function updateTime(config) {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: config.timezone })
    );

    /* 24 Hour Time */
    if (config.time24h) {
      document.getElementById("time-main").textContent =
        now.toLocaleTimeString(config.locale, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        });
        
    /* 12 Hour Time */
      document.getElementById("time-ampm").textContent = "";
    } else {
      const timeString = now.toLocaleTimeString(config.locale, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });

      const [time, ampm] = timeString.split(" ");

      document.getElementById("time-main").textContent = time;
      document.getElementById("time-ampm").textContent = ampm;
    }

    document.getElementById("date").textContent =
      formatDate(now, config.dateFormat, config.locale);
  }


  /* WEATHER */

  async function loadWeather() {
    try {
      const res = await fetch("/weather");

      if (res.status === 204) {
        const weather = document.querySelector(".weather");
        if (weather) weather.style.display = "none";
        return;
      }

      const data = await res.json();

      document.getElementById("temp-main").textContent =
        `${data.temp_c}°C`;

      document.getElementById("temp-feels").textContent =
        `Feels like ${data.feelslike_c}°C`;

      document.getElementById("condition").textContent =
        `${data.condition_emoji} ${data.condition_text}`;

    } catch {
      document.getElementById("condition").textContent =
        "Weather unavailable";
    }
  }

  /* BACKGROUND */

  function updateBackground() {
    const hour = new Date().getHours();
    const bg = document.querySelector(".weather-bg");

    if (!bg) return;

    bg.style.backgroundImage =
      (hour >= 17 || hour < 6)
        ? 'url("assets/night.png")'
        : 'url("assets/day.png")';
  }

  updateBackground();
  setInterval(updateBackground, 60 * 1000);

  /* SHUTDOWN BUTTON */

  const powerBtn = document.getElementById("power-btn");
  if (powerBtn) {
    powerBtn.addEventListener("click", async () => {
      if (!confirm("Shut down the Raspberry Pi?")) return;
      await fetch("/shutdown", { method: "POST" });
    });
  }

  /* REFRESH BUTTON */
  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      location.reload();
    });
  }

  /* SYSTEM INFO PAGE */

  function formatUptime(minutes) {
    if (minutes < 60) {
      return `${minutes} minutes`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return mins === 0
      ? `${hours} hour${hours !== 1 ? "s" : ""}`
      : `${hours}h ${mins}m`;
  }

  async function loadSystem() {
    try {
      const res = await fetch("/system");
      const data = await res.json();

      document.getElementById("cpu-bar").style.width = `${data.cpu}%`;
      document.getElementById("cpu-percent").textContent = `${data.cpu}%`;
      document.getElementById("ram-bar").style.width = `${data.memory}%`;
      document.getElementById("ram-percent").textContent = `${data.memory}%`;
      document.getElementById("uptime").textContent = `Uptime: ${formatUptime(data.uptime)}`;

      // Overlay values
      const overlayCpu = document.getElementById("overlay-cpu");
      const overlayRam = document.getElementById("overlay-ram");
      const overlayCpuBar = document.getElementById("overlay-cpu-bar");
      const overlayRamBar = document.getElementById("overlay-ram-bar");

      if (overlayCpu) overlayCpu.textContent = `${data.cpu}%`;
      if (overlayRam) overlayRam.textContent = `${data.memory}%`;

      if (overlayCpuBar) {
        overlayCpuBar.style.width = `${data.cpu}%`;
        overlayCpuBar.className = data.cpu >= 80 ? "bar-red" : "bar-green";
      }

      if (overlayRamBar) {
        overlayRamBar.style.width = `${data.memory}%`;
        overlayRamBar.className = data.memory >= 80 ? "bar-red" : "bar-green";
      }

    } catch {
      console.warn("System info unavailable");
    }
  }

  /* CONFIG */

  async function loadConfig() {
    try {
      const res = await fetch("/config");
      const config = await res.json();

      appConfig = config;

      if (!config.weatherEnabled) {
        const weather = document.querySelector(".weather");
        if (weather) weather.style.display = "none";
      }

      if (!config.powerButtonEnabled && powerBtn) {
        powerBtn.style.display = "none";
      }

      if (!config.refreshButtonEnabled && refreshBtn) {
        refreshBtn.style.display = "none";
      }

      if (!config.spotifyOverlayEnabled) {
        const overlay = document.getElementById("spotify-overlay")
        if (overlay) overlay.style.display = "none";
      }

      if (!config.systemOverlayEnabled) {
        const systemOverlay = document.getElementById("system-overlay");
        if (systemOverlay) systemOverlay.style.display = "none";
      }

      updateTime(appConfig);
      setInterval(() => updateTime(appConfig), 1000);

    } catch (err) {
      console.warn("Config load failed:", err);
    }
  }

  loadConfig();
  if (!appConfig || appConfig.systemOverlayEnabled) {
    loadSystem();
    setInterval(loadSystem, 3000);
  }
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);
});
