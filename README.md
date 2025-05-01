
## Setup and Installation (for Development)

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd flashcard-ai-extension
    ```
2.  **Install Root Dependencies (if any):**
    ```bash
    npm install
    ```
3.  **Install Backend Dependencies:**
    ```bash
    cd backend
    npm install
    ```
4.  **Configure Backend Environment:**
    *   Create a `.env` file in the `backend/` directory.
    *   Add your Google Gemini API key to the `.env` file:
        ```
        GEMINI_API_KEY=YOUR_API_KEY_HERE
        ```
    *   *Note: Ensure this file is listed in `backend/.gitignore`.*
5.  **Install Frontend Dependencies:**
    ```bash
    cd ../react-popup-src
    npm install
    ```
6.  **Build the Frontend Popup:**
    *   While still in the `react-popup-src` directory, run the build command. This compiles the React code and outputs `popup.js` and `index.html` to the root directory.
    ```bash
    npm run build
    # Or, for continuous development with auto-rebuild:
    # npm run dev
    ```
7.  **Run the Backend Server:**
    *   Open a *new* terminal window/tab.
    *   Navigate to the `backend` directory.
    *   Start the development server (which uses `ts-node-dev` for auto-reloading):
    ```bash
    cd ../backend
    npm run dev
    ```
    *   You should see output indicating the server is running (e.g., `[server]: Server is running at http://localhost:3001`).

8.  **Load the Extension in Chrome:**
    *   Open Chrome and navigate to `chrome://extensions/`.
    *   Enable "Developer mode" (usually a toggle in the top right corner).
    *   Click "Load unpacked".
    *   Select the **root folder** of the cloned project (`flashcard-ai-extension`).
    *   The extension icon should appear in your toolbar.

## How to Use

1.  **Select Text:** Highlight any text on a webpage you want to learn.
2.  **Open Popup:** Click the Flashcard AI extension icon in your toolbar.
3.  **Create Card:**
    *   The selected text will appear as the 'Front'.
    *   An AI suggestion for the 'Back' should load automatically (if the backend is running).
    *   Edit the 'Back', add an optional hint image URL, select a deck (or leave 'Unassigned'), and click 'Save Flashcard'.
4.  **Manage:**
    *   Click the 'Manage Cards' button/tab in the popup.
    *   Create/Rename/Delete decks.
    *   View your list of flashcards.
    *   Click 'View Details' to see/edit/delete a specific card.
5.  **Train Gestures (Optional):**
    *   Click the 'Settings' button/tab.
    *   Start your webcam.
    *   Follow the prompts: Hold the 'Start Training' button for a gesture (e.g., 'yes') while performing it towards the camera. Collect enough samples (e.g., 15+). Repeat for other gestures ('no', 'hint').
    *   Click 'Save Trained Gestures'.
6.  **Review:**
    *   Go to the 'Manage Cards' tab and switch to the 'Review Cards' sub-tab.
    *   Select the deck you want to review and click 'Start Review Session'.
    *   Your webcam feed will appear (if gestures were trained and the model loaded).
    *   The 'Front' of a card due for review is shown.
    *   **Manual:** Click 'Show Answer' or press `Space`. Then click 'Correct', 'Hard', or 'Incorrect' (or use keyboard shortcuts `1`/`→`, `2`/`↓`, `3`/`←`). Use 'Get Hint' or `H` if needed.
    *   **Gestures:** Perform your trained 'yes', 'no', or 'hint' gesture towards the camera when appropriate (e.g., 'yes'/'no' *after* revealing the answer).

## Current Status

The project is currently advanced but not fully complete. Key milestones achieved include core flashcard CRUD, deck management, AI suggestions, and the foundational gesture recognition training/review loop.

*   **Phase 1-4:** Largely complete.
*   **Phase 5 (Refinements):** Partially complete.
    *   **Needs Work:**
        *   Refining the Spaced Repetition algorithm (more dynamic interval calculation).
        *   Displaying the hint image during review sessions.
        *   Further performance optimizations for TensorFlow.js.
    *   **Completed:** Error handling (TFJS, IndexedDB, Backend), Onboarding tutorial.
*   **Phase 6 (Testing & Deployment):** Not started.
*   **Phase 7 (Future):** Not started.

*(Refer to the original To-Do list for detailed item status)*

## Future Improvements (Post-MVP)

*   **Refactor Gesture Recognition:** Improve accuracy and robustness by potentially using more advanced TensorFlow.js models (e.g., Hand Pose Detection, Object Detection) to better isolate gestures/objects from the background (as outlined in Phase 7).
*   **Complete Phase 5:** Implement the refined SRS logic and hint image display. Optimize performance.
*   **Complete Phase 6:** Add comprehensive testing (unit, integration, E2E) and deploy the backend/publish the extension.
*   **Enhanced UI/UX:** Improve styling, add animations, provide clearer feedback.
*   **Cloud Sync:** Option to sync flashcards across devices (would require significant backend changes and user accounts).
*   **Import/Export:** Allow users to import/export flashcards/decks.

## Contributing

*(Optional: Add guidelines if you want others to contribute)*
Currently, this is a solo project, but contributions/suggestions might be considered in the future. Please open an issue first to discuss potential changes.

## License

*(Optional: Choose a license)*
This project is licensed under the MIT License - see the LICENSE file for details (or specify your chosen license here).
