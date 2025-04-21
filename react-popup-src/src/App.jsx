// react-popup-src/src/App.jsx
import React, { useState, useEffect } from 'react';
import ManageFlashcards from './ManageFlashcards'; // Import the new component

// --- Start: IndexedDB Logic (Copied & adapted from db.js for now) ---
// KEEP THE INDEXEDDB LOGIC HERE AS WELL FOR THE CREATE VIEW
const DB_NAME = 'flashcardDB';
const DB_VERSION = 1;
const STORE_NAME = 'flashcards';
let dbPromise = null;
function openDB() {
    if (dbPromise) return dbPromise;
    console.log(`App: Attempting to open DB: ${DB_NAME} version ${DB_VERSION}`);
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded=(e)=>{/* ... same as before ... */
            console.log('App: Database upgrade needed or first-time setup.');
            const tempDb = e.target.result;
            if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                console.log(`App: Creating object store: ${STORE_NAME}`);
                tempDb.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                console.log('App: Object store created successfully.');
            }
        };
        request.onsuccess=(e)=>{/* ... same as before ... */
             const db = e.target.result;
            console.log(`App: Database "${DB_NAME}" opened successfully (version ${db.version}).`);
            db.onerror=(errEvent)=>{console.error("App: DB connection error:",errEvent.target.error);dbPromise=null;};
            db.onclose=()=>{console.warn('App: DB connection closed.');dbPromise=null;};
            resolve(db);
        };
        request.onerror=(e)=>{console.error("App: Error opening DB:",e.target.error);dbPromise=null;reject(e.target.error);};
        request.onblocked=(e)=>{console.warn("App: DB open blocked.");dbPromise=null;reject(new Error("DB blocked"));}
    });
    return dbPromise;
}
// --- End: IndexedDB Logic ---


function App() {
  // --- State for view management ---
  const [view, setView] = useState('create'); // 'create' or 'manage'

  // --- State for Create View ---
  const [selectedText, setSelectedText] = useState('');
  const [backText, setBackText] = useState('');
  const [isCreateLoading, setIsCreateLoading] = useState(true);
  const [createError, setCreateError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  // --- Effect for fetching selected text (runs only for 'create' view conceptually) ---
  useEffect(() => {
    // Pre-open DB on initial load
    openDB().catch(err => {
        console.error("Initial DB open failed:", err);
        setCreateError("Could not connect to database.");
    });

    setIsCreateLoading(true); // Set loading true when effect runs
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "GET_SELECTED_TEXT" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error getting selected text:", chrome.runtime.lastError.message);
          setCreateError(`Error: ${chrome.runtime.lastError.message}`);
          setIsCreateLoading(false);
          return;
        }
        if (response && typeof response.text === 'string') {
          setSelectedText(response.text);
        } else {
          setSelectedText('');
        }
        setIsCreateLoading(false);
      });
    } else {
      setCreateError("Extension environment error.");
      setIsCreateLoading(false);
    }
  }, []); // Runs once when the popup initially mounts

  // --- handleSave function (remains the same) ---
  const handleSave = async () => {
      if (!selectedText || !backText.trim()) {
          setSaveStatus('Front or back text missing.');
          return;
      }
      setSaveStatus('Saving...');
      const newFlashcard = {
          front: selectedText,
          back: backText.trim(),
          bucket: 1,
          createdAt: new Date().toISOString()
      };
      try {
          const db = await openDB();
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.add(newFlashcard);
          request.onsuccess = () => {
              console.log('Flashcard added successfully!', request.result);
              setSaveStatus(`Flashcard saved! (ID: ${request.result})`);
              setBackText('');
              // Clear status after a delay
              setTimeout(() => setSaveStatus(''), 2000);
          };
          request.onerror = (event) => {
              console.error('Error adding flashcard:', event.target.error);
              setSaveStatus(`Error saving: ${event.target.error.message}`);
          };
          transaction.onerror = (event) => {
              console.error('Save transaction error:', event.target.error);
              if (!saveStatus.startsWith('Error')) {
                  setSaveStatus(`Transaction error: ${event.target.error.message}`);
              }
          };
      } catch (err) {
          console.error('Failed to open DB for saving:', err);
          setSaveStatus(`DB Error: ${err.message}`);
      }
  };

  // --- Render Logic ---
  const renderCreateView = () => {
      if (isCreateLoading) return <div>Loading selected text...</div>;
      if (createError && createError === "Could not connect to database.") return <div>Error: {createError}</div>;

      return (
         <>
            <h4>Create Flashcard</h4>
            {createError && <p style={{color: 'red'}}>{createError}</p>}

            {selectedText ? (
                <>
                    <label htmlFor="flashcard-front">Front (Selected Text):</label>
                    <div id="flashcard-front" className="selected-text-display">
                        {selectedText}
                    </div>
                    <label htmlFor="flashcard-back">Back (Translation/Definition):</label>
                    <textarea
                        id="flashcard-back"
                        rows="3"
                        value={backText}
                        onChange={(e) => setBackText(e.target.value)}
                        placeholder="Enter the back of the flashcard..."
                        disabled={saveStatus === 'Saving...'}
                    />
                    <button
                        onClick={handleSave}
                        disabled={!backText.trim() || saveStatus === 'Saving...'}
                    >
                        {saveStatus === 'Saving...' ? 'Saving...' : 'Save Flashcard'}
                    </button>
                    {saveStatus && <p>{saveStatus}</p>}
                </>
            ) : (
                <p>Select text on a page first, then open this popup.</p>
            )}
        </>
      );
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
      {/* Navigation Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
        <button onClick={() => setView('create')} disabled={view === 'create'}>
          Create New
        </button>
        <button onClick={() => setView('manage')} disabled={view === 'manage'}>
          Manage Cards
        </button>
      </div>

      {/* Conditional View Rendering */}
      {view === 'create' && renderCreateView()}
      {view === 'manage' && <ManageFlashcards />}
    </div>
  );
}

export default App;