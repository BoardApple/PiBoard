# PiBoard


### Simple Dashboard for the Raspberry Pi

This is a simple project I made for an old Raspberry Pi 4 Model B. Sorry in advance if I get any of the information wrong, or if this doesn’t work on every version of the Raspberry Pi.

This was built specifically for a Raspberry Pi 4 Model B with an 800x480 touchscreen that I bought from Temu, but it should work on other setups with little to no modification.

![PiBoard Demo](/public/assets/example_images/PiBoardDemo-v1.2.2.gif)

*Demo of PiBoard running on a Browser (not on pi)*

---

## Requirements

* **Raspberry Pi**
  (I used a Pi 4 Model B, but this should run on lower-spec models as well.)

* **Touchscreen** *(optional)*
  The dashboard was designed for a Pi with a screen, but it can still be used without one.

* **Spotify Premium subscription** *(optional)*
  The Spotify page was built around Premium features, but the rest of the dashboard will still work without it.

---

## Walkthrough

### 1. Create a Spotify Developer App

To begin, go to [https://developer.spotify.com/](https://developer.spotify.com/) and create a new app.
Give it a name and a description, then add the following as a **Redirect URI**:

```
http://127.0.0.1:8888/callback
```

If you want to use a different redirect URI, just remember to update it later in `server.js`.

Make sure **Web API** is checked, then save the app.

---

### 2. Set up your Raspberry Pi

Now head over to your Raspberry Pi and install Node.js:

```
sudo apt install nodejs npm
```

Once that's installed, clone the repository:

```
git clone https://github.com/BoardApple/PiBoard
```

---

### 3. Configure the dashboard

Before running anything, you’ll need to set up the configuration file.

#### Configuration file

PiBoard uses a simple environment file to keep all configuration in one place.

In the project root you’ll find a file called `config.env-example`. To use it:

1. Make a copy of the file  
2. Remove `-example` from the name so it becomes `config.env`

```
cp config.env-example config.env
```

Open `config.env` and update the following values:

---

##### Spotify

- `SPOTIFY_CLIENT_ID` → Client ID from your Spotify Developer app  
- `SPOTIFY_REDIRECT_URI` → Redirect URI (only change this if you changed it in the Spotify app settings)

---

##### Weather (optional)

To enable the weather overlay, you’ll need a free WeatherAPI account.

1. Go to **https://www.weatherapi.com** and create a free account  
2. Once logged in, copy your **API Key** from the dashboard  

Then update the following values in `config.env`:

- `WEATHER_ENABLED` → Turn weather section on or off (true or false) 
- `WEATHER_API_KEY` → Your WeatherAPI key  
- `WEATHER_LOCATION` → Your location (city name, town, or postcode)

---

##### Power Button (optional)

You can also enable or disable the power button in the top right:

- `POWER_BUTTON_ENABLED` → Enable or disable the power button (true or false)

---

##### Refresh Button (optional)

You can enable or disable the refresh button in the top left:

- `REFRESH_BUTTON_ENABLED` → Enable or disable the refresh button (true or false) 

---

##### System Info Overlay (optional)

You can enable or disable a little system overlay in the top right that display's CPU and RAM usage by changing the value in `config.env`:

- `SYSTEM_OVERLAY_ENABLED` → Enable or disable the system info overlay (true or false)

---

##### Date & Time

To change the date and time settings, edit the following values **in `config.env`**:

- **`TIMEZONE`** → Timezone **in IANA format** (e.g. **Europe/London**, **America/New_York**)
- **`LOCALE`** → Locale used for date and time text
- **`TIME_24H`** → Choose between a **24-hour clock** or **12-hour clock** (`true` or `false`)
- **`DATE_FORMAT`** → Date **display** format. Supported values:
  - **`dddd`** = weekday name (*Sunday*)
  - **`Do`** = date with ordinal (*10th*)
  - **`MMMM`** = full month name (*October*)
  - **`YYYY`** = year (*2024*)

**List of supported locale codes:**  
**https://saimana.com/list-of-country-locale-code/**

Once these values are filled, save the file. The server will automatically load them on startup.

---

### 4. Install dependencies

Now change into the project directory and install the required dependencies:

```
cd PiBoard
npm install
```

This may take a couple of minutes. Once it finishes, everything needed to run the dashboard will be installed.

---

### 5. Run the server

To start the server manually, run:

```
node server.js
```

Then open a browser and go to:

```
http://127.0.0.1:8888/
```

From here:

* Double-tap the screen *(or click the second button at the top)* to open the Spotify page
* Click **Connect to Spotify** and go through the authorization steps

Once that’s finished, start playing music on **any other device** and you’ll have a simple Spotify media controller running on your Pi.

---

## Open on Startup (Kiosk Mode)

If you want the server to start automatically and open the dashboard when the Pi boots, follow the steps below.

### Create a startup script

Create a file called **`run.sh`** (you can place this anywhere — for example, on the Desktop):

```
nano ~/Desktop/run.sh
```

Add the following:

```
#!/bin/bash

cd ~/PiBoard
node server.js &

sleep 15
DISPLAY=:0 firefox -kiosk http://127.0.0.1:8888
```

Save the file and exit, then make it executable:

```
chmod +x ~/Desktop/run.sh
```

---

### Create a systemd service

Now create a systemd service file so this runs automatically on boot:

```
sudo nano /etc/systemd/system/piboard.service
```

Add the following:\
*(Make sure to update pi with your username)*

```
[Unit]
# PiBoard dashboard startup service
Description=PiBoard Startup Script

# Wait for the desktop environment and network to be ready
After=graphical.target network-online.target
Wants=network-online.target

[Service]
# Simple service that runs continuously
Type=simple

# Run as the user (required for Firefox/X access)
User=pi

# Specify the display for kiosk mode
Environment=DISPLAY=:0

# Use the current X session authentication
Environment=XAUTHORITY=/home/pi/.Xauthority

# Start the PiBoard launch script
ExecStart=/home/pi/Desktop/run.sh

# Restart the service if it crashes
Restart=on-failure
RestartSec=5

[Install]
# Start when the graphical session is loaded
WantedBy=graphical.target
```

Save and exit, then reload and enable the service:

```
sudo systemctl daemon-reload
sudo systemctl enable piboard.service
```

---

### Final step

Reboot your Raspberry Pi:

```
sudo reboot
```

Once the Pi boots, the server will start automatically and the dashboard will open in kiosk mode.

---

## Power Button (Shutdown)

I've also added an optional **power button** in the top-right corner that allows you to shut down the Raspberry Pi directly from the dashboard.

Because browsers can’t shut down the system on their own, this works by sending a request to the server, which then tells the Pi to power off.

### Enable shutdown support

You’ll need to allow your user to run the shutdown command without being prompted for a password.

Open a terminal and edit the sudoers file **carefully**:

```
sudo visudo
```

Add the following line to the bottom of the file:\
**(Change pi to your username)**

`pi ALL=(ALL) NOPASSWD: /sbin/shutdown`


This only allows passwordless access to the shutdown command and nothing else.

### Using the power button

Once enabled:

- A **power button** appears in the top-right of the dashboard
- Tapping it will ask for confirmation
- Confirming will safely shut down the Pi

This is very useful for kiosk setups where you don’t have access to a keyboard or terminal.

---

## Resources

Below are a few resources I found helpful while working on this project:

- **Autostarting a bash script on boot**  
  https://linuxconfig.org/how-to-autostart-bash-script-on-startup-on-raspberry-pi

- **Helpful forum thread for testing over SSH (`DISPLAY=:0`)**  
  https://forums.raspberrypi.com/viewtopic.php?t=189006

- **Project inspiration**  
  https://github.com/ansonlichtfuss/spotify-desk-thing

- **Not really helpful, but entertaining while trying to get everything working**:
  - https://www.youtube.com/watch?v=SWiPIBWvgIU
  - https://www.youtube.com/watch?v=iOz5XUVkFkY
  - https://www.youtube.com/watch?v=bBK4knFWUj0

---

## Changelog - ʕ•ﻌ•ʔ

### v1.2.2
- Added System Info Overlay (CPU / RAM)
- Added System Info Page (CPU / RAM / Uptime)
- Added Spotify Overlay
- Added Extra Buttons to Spotify Media Control Page (Like, Loop, Mute)
- Added Refresh Button to Top Left
- Changed Spotify Buttons to SVG Icons
- Removed Blank "Photo" Page

### v1.2.1
- Added Shutdown Button
- Changed Hardcoded Values to be Stored in a config.env File
- Added Toggleable Values in config.env (Weather Overlay, Shutdown Button)
- Updated Weather API

### v1.2.0 (First Release)
- Added Working Spotify Calls
- Added Updated Fonts

---

## License
Free and open source, use for whatever you want ( ദ്ദി ˙ᗜ˙ )
