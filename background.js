// background.js
// @ts-check
console.log("Background service worker started.");

let latestSelectedText = ""; // Variable to store the most recent selection

// Listen for messages from content scripts or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in background:", message);

  if (message.type === "TEXT_SELECTED") {
    // Store the text received from the content script
    latestSelectedText = message.text;
    console.log("Stored selected text:", latestSelectedText);
    // Optional: Send a response back to the content script to confirm receipt
    sendResponse({ status: "Text received by background" });
    return true; // Keep the message channel open for asynchronous response (good practice)

  } else if (message.type === "GET_SELECTED_TEXT") {
    // Send the stored text back to the popup
    console.log("Sending stored text to popup:", latestSelectedText);
    sendResponse({ text: latestSelectedText });
    return true; // Keep the message channel open for asynchronous response
  }

  // Handle other message types here if needed in the future
  // If you don't send a response asynchronously, you can omit 'return true;'
});
