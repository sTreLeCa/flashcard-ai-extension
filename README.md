# Flashcard AI Extension 🧠✨🖐️

**Create flashcards from web content instantly, get AI-powered suggestions, and review them using webcam gestures!**

---

## About This Project

**The Problem:** Learning often involves encountering new terms or concepts while browsing the web. Manually creating flashcards is time-consuming and interrupts the flow of reading. Furthermore, traditional flashcard review can sometimes feel passive.

**The Solution:** Flashcard AI aims to streamline the learning process by integrating flashcard creation directly into your browsing experience. It leverages AI to assist with defining terms and introduces an innovative, hands-free review method using gesture recognition.

**Core Goals:**

1.  **Seamless Integration:** Allow users to capture information and create flashcards with minimal friction while browsing.
2.  **AI Assistance:** Speed up flashcard creation by automatically suggesting relevant definitions or translations using the Google Gemini API.
3.  **Interactive Review:** Move beyond simple clicking by enabling users to interact with their review sessions using webcam gestures, making studying potentially more engaging and accessible.
4.  **Local-First Data:** Store all flashcards, decks, and trained gesture models securely and privately in the user's browser using IndexedDB. The only external communication is proxied through a dedicated backend for AI suggestions.

**Why Gesture Control?** This feature explores the potential of using client-side machine learning (TensorFlow.js) to create novel user interactions. It allows for hands-free operation, which could be beneficial in various scenarios (e.g., while multitasking, for accessibility reasons, or simply as a more engaging way to study). *Note: The current implementation (MobileNet + KNN) is functional but sensitive to environmental factors and serves as a proof-of-concept for this interaction method.*

---

## Features Explained

*   **📝 On-the-Fly Card Creation:**
    *   **Select & Create:** Highlight text on any webpage; it becomes the 'Front' of your card instantly when you open the extension. *Reduces context switching.*
    *   **AI Suggestions (Gemini):** Automatically fetches a definition or translation for the selected text to populate the 'Back'. *Saves typing and lookup time.*
    *   **Image Hints:** Add URLs for visual cues during review (feature planned for display). *Supports visual learners.*
    *   **Local Storage:** Cards are saved securely in your browser's IndexedDB. *Keeps your data private.*
*   **🗂️ Organization with Decks:**
    *   **Create & Assign:** Group cards into custom decks for focused study sessions. *Essential for managing different subjects.*
    *   **Manage Decks:** Easily rename or delete decks as your learning needs evolve.
*   **🔍 Card Management Interface:**
    *   **View & Edit:** Access, review, and modify all aspects of your saved flashcards. *Full control over your learning material.*
    *   **Filter by Deck:** Focus your management tasks on specific subjects.
*   **🔁 Spaced Repetition Review:**
    *   **SRS Filtering:** Reviews prioritize cards that are due based on a basic spaced repetition schedule. *Optimizes learning efficiency.*
    *   **Manual Controls:** Use buttons or keyboard shortcuts (`Space`, `H`, `1/→`, `2/↓`, `3/←`) for traditional review interaction. *Provides familiar control.*
    *   **Text Hints:** Generate simple underscores-based hints from the answer text. *Provides a small nudge when stuck.*
    *   **Session Stats:** Track your performance (Correct, Hard, Incorrect) for each session. *Monitor your progress.*
*   **🖐️ Gesture-Based Review (via TensorFlow.js):**
    *   **Webcam Training:** Train the system to recognize *your* specific gestures (e.g., thumbs up for 'yes', thumbs down for 'no', a specific object for 'hint') in *your* environment. *Personalizes the interaction.*
    *   **Real-Time Recognition:** During review, the webcam feed is analyzed locally to detect trained gestures. *Enables hands-free interaction.*
    *   **Action Mapping:** Recognized gestures trigger review actions ('Correct', 'Incorrect', 'Hint'). *Connects gesture to function.*

---

## How It Works: The Flow

1.  **Selection:** `content.js` detects text selection on a webpage and sends it to `background.js`.
2.  **Popup Opens:** The user clicks the extension icon. `popup.html` loads, running `popup.js` (the compiled React app).
3.  **Data Fetch:** The React app (`App.tsx`) requests the selected text from `background.js` and fetches existing decks/settings from IndexedDB (`db.ts`).
4.  **AI Suggestion:** If text was selected, `App.tsx` sends it to the backend Node.js/Express server. The backend proxies the request to the Google Gemini API and returns the suggestion.
5.  **Card Creation:** The user confirms/edits the 'Back' text, selects a deck, and saves. `App.tsx` writes the new card data to IndexedDB.
6.  **Gesture Training:** In 'Settings', the user enables the webcam. `SettingsPage.tsx` uses TensorFlow.js (MobileNet) to extract features from video frames and trains a KNN Classifier model with labeled examples provided by the user. The trained data is saved via `db.ts` to IndexedDB.
7.  **Gesture Review:** In 'Review', the user starts a session. `ReviewFlashcards.tsx` loads the trained KNN model, activates the webcam, and continuously feeds frames to MobileNet/KNN for prediction. High-confidence predictions trigger corresponding review actions (Show Answer, Correct, Incorrect, Hint), updating card data in IndexedDB.

---

## Technology Stack

*   **Frontend UI:** React (v19), Vite, TypeScript/JSX
    *   *Chosen for efficient UI development and component management.*
*   **Backend (API Proxy):** Node.js, Express, TypeScript
    *   *Provides a secure intermediary for the Gemini API key and controlled access.*
*   **Machine Learning (Client-Side):** TensorFlow.js
    *   MobileNet: *Pre-trained model for efficient image feature extraction.*
    *   KNN Classifier: *Simple classifier for learning custom gestures quickly in the browser.*
    *   *Chosen to enable ML features directly in the browser, enhancing privacy and reducing server load.*
*   **AI Suggestions:** Google Gemini API
    *   *Provides powerful language understanding for definitions and translations.*
*   **Browser Extension:** Chrome Manifest V3 APIs, JavaScript/TypeScript
    *   *Standard tools for building Chrome extensions.*
*   **Local Database:** Browser IndexedDB
    *   *Persistent, private, client-side storage suitable for structured data like flashcards.*

*(See Project Structure in the previous README version or explore the folders for details)*

---

## Setup and Installation (for Development)

*(Follow the detailed steps provided in the previous README version)*

1.  Clone repo.
2.  Install dependencies in root, `backend/`, and `react-popup-src/`.
3.  Create and configure `backend/.env` with your `GEMINI_API_KEY`.
4.  Build the frontend (`cd react-popup-src && npm run build`).
5.  Run the backend dev server (`cd backend && npm run dev`).
6.  Load the unpacked extension (root folder) in Chrome (`chrome://extensions/`).

---

## How to Use

*(Follow the detailed steps provided in the previous README version)*

1.  Select text on a page.
2.  Open the popup, review/edit the AI suggestion, choose a deck, save.
3.  Manage cards/decks in the 'Manage Cards' tab.
4.  Train gestures in the 'Settings' tab (optional).
5.  Review cards in the 'Review Cards' tab using buttons, keyboard, or trained gestures.

---

## Current Status & Known Limitations

*   **Functionality:** Core features are implemented, including card management, AI suggestions, and the gesture training/review loop.
*   **Phase 5 Incomplete:**
    *   **Spaced Repetition:** Uses a basic bucket system; a more refined algorithm (like SM-2 adaptation) is needed for optimal scheduling.
    *   **Hint Image Display:** Image URLs can be saved but are not yet displayed during review.
    *   **Performance:** Basic TFJS memory management is in place, but further optimization may be needed, especially on lower-end devices.
*   **Gesture Recognition Sensitivity:** The current MobileNet+KNN approach can be sensitive to lighting changes, background clutter, and subtle variations in gesture performance. Training a 'neutral' or 'background' class can help but doesn't fully eliminate potential misclassifications. More robust models (Phase 7) would be needed for production-level accuracy.
*   **Testing:** Formal unit, integration, and E2E tests (Phase 6) have not yet been implemented.

---

## Future Roadmap

1.  **Complete Phase 5:** Implement refined SRS, hint image display, and performance tuning.
2.  **Improve Gesture Recognition (Phase 7):** Explore alternative TFJS models (Object Detection, Hand Pose) for higher accuracy and robustness.
3.  **Testing & Deployment (Phase 6):** Add comprehensive tests and prepare for potential deployment/publishing.
4.  **UX/UI Enhancements:** Improve visual design, feedback, and overall user flow.
5.  **Potential Features:** Import/Export, Cloud Sync (requires significant backend changes).
