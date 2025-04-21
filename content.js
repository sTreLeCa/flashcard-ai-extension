// content.js
console.log("Flashcard AI Content Script Loaded");

// Function to handle text selection
function handleSelection() {
  const selectedText = window.getSelection().toString().trim();

  // Only send a message if some text is actually selected
  if (selectedText.length > 0) {
    console.log("Selected Text:", selectedText);

    // Send the selected text to the background script
    chrome.runtime.sendMessage({
      type: "TEXT_SELECTED", // Added a type for clarity
      text: selectedText
    }, (response) => {
      if (chrome.runtime.lastError) {
        // Handle potential errors (e.g., background script not ready)
        console.error("Error sending message:", chrome.runtime.lastError.message);
      } else if (response) {
        console.log("Background script responded:", response.status);
      }
    });
  }
}

// Add an event listener for mouse up, which usually signifies the end of a selection
document.addEventListener('mouseup', handleSelection);

// Optional: You might also want to listen for selectionchange,
// but mouseup is often sufficient and less noisy for this purpose.
// document.addEventListener('selectionchange', handleSelection); // Uncomment if needed