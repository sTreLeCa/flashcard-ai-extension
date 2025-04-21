// react-popup-src/src/App.jsx (or App.js)
import React, { useState, useEffect } from 'react';

function App() {
  const [selectedText, setSelectedText] = useState('');
  const [backText, setBackText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "GET_SELECTED_TEXT" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error getting selected text:", chrome.runtime.lastError.message);
          setError(`Error: ${chrome.runtime.lastError.message}`);
          setIsLoading(false);
          return;
        }
        if (response && typeof response.text === 'string') {
          console.log("Received text in popup:", response.text);
          setSelectedText(response.text);
        } else {
          console.log("No text received or response format invalid.");
          setSelectedText('');
        }
        setIsLoading(false);
      });
    } else {
      console.error("Chrome runtime API not available.");
      setError("Extension environment error.");
      setIsLoading(false);
    }
  }, []);

  const handleSave = () => {
    console.log("Saving Flashcard:");
    console.log("Front:", selectedText);
    console.log("Back:", backText);
    // --- Add IndexedDB save logic here later ---
    alert("Save functionality coming soon!");
  };

  if (isLoading) return <div>Loading selected text...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <>
      <h4>Create Flashcard</h4>
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
          />
          <button onClick={handleSave} disabled={!backText.trim()}>
            Save Flashcard
          </button>
        </>
      ) : (
        <p>Select text on a page first, then open this popup.</p>
      )}
    </>
  );
}

export default App;