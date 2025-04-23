
function openDB() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open('flashcardDB', 1);
      
      request.onupgradeneeded = function(event) {
        const db = event.target.result;
        
        // Create flashcards store if it doesn't exist
        if (!db.objectStoreNames.contains('flashcards')) {
          const flashcardsStore = db.createObjectStore('flashcards', { keyPath: 'id', autoIncrement: true });
          flashcardsStore.createIndex('deckId', 'deckId', { unique: false });
        }
        
        // Create decks store if it doesn't exist
        if (!db.objectStoreNames.contains('decks')) {
          const decksStore = db.createObjectStore('decks', { keyPath: 'id', autoIncrement: true });
          decksStore.createIndex('name', 'name', { unique: false });
          
          
          const defaultDeckTransaction = event.target.transaction;
          const defaultDeckStore = defaultDeckTransaction.objectStore('decks');
          defaultDeckStore.add({ name: 'Default Deck', createdAt: new Date() });
        }
      };
      
      request.onsuccess = function(event) {
        resolve(event.target.result);
      };
      
      request.onerror = function(event) {
        reject('Error opening database: ' + event.target.error);
      };
    });
  }
  
  
  function getDecks() {
    return new Promise((resolve, reject) => {
      openDB().then(db => {
        const transaction = db.transaction(['decks'], 'readonly');
        const store = transaction.objectStore('decks');
        const getAll = store.getAll();
        
        getAll.onsuccess = function() {
          resolve(getAll.result);
        };
        
        getAll.onerror = function(error) {
          reject('Error getting decks: ' + error);
        };
      }).catch(error => reject(error));
    });
  }
  
  
  function getFlashcardsInDeck(deckId) {
    return new Promise((resolve, reject) => {
      openDB().then(db => {
        const transaction = db.transaction(['flashcards'], 'readonly');
        const store = transaction.objectStore('flashcards');
        const index = store.index('deckId');
        const getCards = index.getAll(Number(deckId));
        
        getCards.onsuccess = function() {

          const cards = getCards.result;
          cards.sort((a, b) => {
            const dateA = a.srs?.nextReview ? new Date(a.srs.nextReview) : new Date();
            const dateB = b.srs?.nextReview ? new Date(b.srs.nextReview) : new Date();
            return dateA - dateB;
          });
          
          resolve(cards);
        };
        
        getCards.onerror = function(error) {
          reject('Error getting flashcards: ' + error);
        };
      }).catch(error => reject(error));
    });
  }
  
  function updateFlashcardInDB(card) {
    return new Promise((resolve, reject) => {
      openDB().then(db => {
        const transaction = db.transaction(['flashcards'], 'readwrite');
        const store = transaction.objectStore('flashcards');
        
        const updateRequest = store.put(card);
        
        updateRequest.onsuccess = function() {
          resolve(card);
        };
        
        updateRequest.onerror = function(error) {
          reject('Error updating flashcard: ' + error);
        };
      }).catch(error => reject(error));
    });
  }
  
  
  function updateCardSRS(card, wasCorrect) {
    const updatedCard = { ...card };
    
    if (!updatedCard.srs) {
      
      updatedCard.srs = {
        level: 0,
        nextReview: new Date(),
        reviewCount: 0
      };
    }
    
    
    if (wasCorrect) {
      updatedCard.srs.level = Math.min(updatedCard.srs.level + 1, 5);
    } else {
      updatedCard.srs.level = Math.max(updatedCard.srs.level - 1, 0);
    }
    
    
    const now = new Date();
    let nextReviewDays = 0;
    
    switch (updatedCard.srs.level) {
      case 0: nextReviewDays = 0; break;   
      case 1: nextReviewDays = 1; break;  
      case 2: nextReviewDays = 3; break;   
      case 3: nextReviewDays = 7; break;   
      case 4: nextReviewDays = 14; break;  
      case 5: nextReviewDays = 30; break;  
      default: nextReviewDays = 1;
    }
    
    const nextReview = new Date(now);
    nextReview.setDate(now.getDate() + nextReviewDays);
    updatedCard.srs.nextReview = nextReview;
    updatedCard.srs.reviewCount = (updatedCard.srs.reviewCount || 0) + 1;
    updatedCard.srs.lastReviewed = now;
    
    return updatedCard;
  }