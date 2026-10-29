# Market Keeper 🛒

**Market Keeper** is an offline-first sales and debt ledger designed for small shop owners. It allows users to quickly record daily cash sales, track customer debts, and review their sales history—all directly on their device without needing an active internet connection.

A standout feature of Market Keeper is its **Voice Sale** functionality, which uses the browser's speech recognition to let users simply speak their sales (e.g., *"Sold rice to Emeka 2000"*) to automatically fill out the ledger.

## 🚀 Features

* **🎙️ Voice Sales Entry:** Tap the microphone and speak to instantly record cash or debt sales.
* **📶 Offline-First (PWA):** Works perfectly without an internet connection using Service Workers.
* **📒 Cash & Debt Management:** Keep track of instant payments and easily manage who owes you money in the "Owing Me" tab.
* **📱 Device-Local Storage:** All sales and audio recordings are saved locally on the user's phone for privacy and speed.
* **🌅 End-of-Day Closing:** Clear today's cash sales and move the totals to a secure History log, while rolling over unpaid debts to the next day.

## 🛠️ Built With

* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **APIs Used:**
  * `Web Speech API` (for speech-to-text recognition)
  * `MediaRecorder API` (for saving audio playback)
  * `localStorage` (for offline database management)
* **Architecture:** Progressive Web App (PWA)

## 💻 Running the Project Locally

To test this project on your computer:

1. Clone or download this repository.
2. Open a terminal in the project folder.
3. Run the local development server (requires Python):
   ```bash
   npm run dev
   ```

   *(This runs `python3 -m http.server 3000 --bind 0.0.0.0`)*
4. Open `http://localhost:3000` in your web browser.

## 🎤 Important Note on Testing Voice Features (Mobile)

Modern mobile browsers strictly block microphone access on insecure connections. **If you are testing the Voice Sale feature on a phone, it will not work over a standard local IP address.**

To test on your phone, you must serve the app over **HTTPS**. You can do this by using a tunneling service like LocalTunnel:

```bash
npx localtunnel --port 3000
```

Open the generated `https://` link on your mobile device to allow microphone permissions.

## 📦 Deployment

This project is built with static files and can be hosted for free on platforms like **GitHub Pages** or **Netlify**. Deploying to these platforms automatically provides the secure HTTPS connection required for the Web Speech API to function correctly on all devices.
