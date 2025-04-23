
document.addEventListener('DOMContentLoaded', function() {
    
    initializeApp();
  });
  
  
  function initializeApp() {
    
    document.getElementById('manage-tab').addEventListener('click', () => showTab('manage'));
    document.getElementById('review-tab').addEventListener('click', () => showTab('review'));
    
    
    showTab('manage');
  }

  
  function showTab(tabName) {
    
    document.querySelectorAll('nav button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    const contentArea = document.getElementById('content-area');
    
    if (tabName === 'manage') {
    
      showManageFlashcardsUI(contentArea);
    } else if (tabName === 'review') {
      
      showReviewUI(contentArea);
    }
  }
  
  
  function showManageFlashcardsUI(container) {
    

    container.innerHTML = `
      <div class="manage-section">
        <h2>Manage Flashcards</h2>
        <p>This section was implemented in Phase 1.</p>
        <p>Click the "Review" tab to use the new review functionality.</p>
      </div>
    `;
    
    
  }
  
  
  function showReviewUI(container) {
    container.innerHTML = `
      <div class="review-section">
        <h2>Review Flashcards</h2>
        <div class="deck-selector">
          <label>Select a deck to review:</label>
          <select id="deck-select">
            <option value="">-- Select a Deck --</option>
          </select>
        </div>
        <div id="review-container"></div>
      </div>
    `;
    
    
    loadDecksForReview();
    
    
    document.getElementById('deck-select').addEventListener('change', function(e) {
      const deckId = e.target.value;
      if (deckId) {
        startReviewSession(deckId);
      } else {
        document.getElementById('review-container').innerHTML = '';
      }
    });
  }
  
  
  function loadDecksForReview() {
    getDecks().then(decks => {
      const selectElement = document.getElementById('deck-select');
      
      if (decks.length === 0) {
        
        document.getElementById('review-container').innerHTML = 
          '<p>No decks found. Please create a deck in the Manage tab first.</p>';
        return;
      }
      
      
      decks.forEach(deck => {
        const option = document.createElement('option');
        option.value = deck.id;
        option.textContent = deck.name;
        selectElement.appendChild(option);
      });
    }).catch(error => {
      console.error('Error loading decks:', error);
      document.getElementById('review-container').innerHTML = 
        '<p>Error loading decks. Please try again.</p>';
    });
  }
  
  // Start a review session for the selected deck
  function startReviewSession(deckId) {
    getFlashcardsInDeck(deckId).then(flashcards => {
      if (flashcards.length === 0) {
        document.getElementById('review-container').innerHTML = 
          '<p>No flashcards found in this deck. Add some flashcards first!</p>';
        return;
      }
      
      // Initialize review session
      const reviewSession = new ReviewSession(flashcards);
      reviewSession.start();
    }).catch(error => {
      console.error('Error loading flashcards:', error);
      document.getElementById('review-container').innerHTML = 
        '<p>Error loading flashcards. Please try again.</p>';
    });
  }
  
  // Review Session class to manage the review process
  class ReviewSession {
    constructor(flashcards) {
      this.flashcards = flashcards;
      this.currentIndex = 0;
      this.showAnswer = false;
      this.showHint = false;
      this.stats = {
        reviewed: 0,
        correct: 0,
        incorrect: 0
      };
      this.container = document.getElementById('review-container');
    }
    
    start() {
      this.render();
    }
    
    render() {
      if (this.currentIndex >= this.flashcards.length) {
        this.renderSessionComplete();
        return;
      }
      
      const currentCard = this.flashcards[this.currentIndex];
      
      let html = `
        <div class="progress">
          Card ${this.currentIndex + 1} of ${this.flashcards.length}
        </div>
        
        <div class="flashcard">
          <div class="front">
            <h3>Question:</h3>
            <p>${currentCard.front}</p>
          </div>
      `;
      
      if (this.showHint && !this.showAnswer) {
        html += `
          <div class="hint">
            <h3>Hint:</h3>
            <p>${currentCard.hint || "No hint available for this card."}</p>
          </div>
        `;
      }
      
      if (this.showAnswer) {
        html += `
          <div class="back">
            <h3>Answer:</h3>
            <p>${currentCard.back}</p>
          </div>
        `;
      }
      
      html += `</div><div class="actions">`;
      
      if (!this.showAnswer) {
        html += `
          <button id="show-answer" class="neutral">Show Answer</button>
          <button id="show-hint" class="neutral">Get Hint</button>
        `;
      } else {
        html += `
          <button id="correct-btn" class="correct">Yes, I knew it</button>
          <button id="incorrect-btn" class="incorrect">No, didn't know</button>
        `;
      }
      
      html += `</div>`;
      
      this.container.innerHTML = html;
      
      // Add event listeners
      if (!this.showAnswer) {
        document.getElementById('show-answer').addEventListener('click', () => this.revealAnswer());
        document.getElementById('show-hint').addEventListener('click', () => this.showCardHint());
      } else {
        document.getElementById('correct-btn').addEventListener('click', () => this.handleResponse(true));
        document.getElementById('incorrect-btn').addEventListener('click', () => this.handleResponse(false));
      }
    }
    
    revealAnswer() {
      this.showAnswer = true;
      this.render();
    }
    
    showCardHint() {
      this.showHint = true;
      this.render();
    }
    
    async handleResponse(correct) {
      const currentCard = this.flashcards[this.currentIndex];
      const updatedCard = updateCardSRS(currentCard, correct);
      
      
      try {
        await updateFlashcardInDB(updatedCard);
        
        
        this.stats.reviewed++;
        if (correct) {
          this.stats.correct++;
        } else {
          this.stats.incorrect++;
        }
        
        
        this.currentIndex++;
        this.showAnswer = false;
        this.showHint = false;
        this.render();
      } catch (error) {
        console.error('Error updating flashcard:', error);
        this.container.innerHTML = `
          <p>Error updating flashcard. Please try again.</p>
          <button id="retry-btn">Retry</button>
        `;
        document.getElementById('retry-btn').addEventListener('click', () => this.render());
      }
    }
    
    renderSessionComplete() {
      let accuracy = 0;
      if (this.stats.reviewed > 0) {
        accuracy = Math.round((this.stats.correct / this.stats.reviewed) * 100);
      }
      
      this.container.innerHTML = `
        <div class="session-complete">
          <h3>Review Session Complete!</h3>
          <div class="stats">
            <p>Total Cards Reviewed: ${this.stats.reviewed}</p>
            <p>Correct: ${this.stats.correct}</p>
            <p>Incorrect: ${this.stats.incorrect}</p>
            <p>Accuracy: ${accuracy}%</p>
          </div>
          <button id="new-session-btn" class="neutral">Start New Session</button>
        </div>
      `;
      
      document.getElementById('new-session-btn').addEventListener('click', () => {
        document.getElementById('deck-select').value = '';
        this.container.innerHTML = '';
      });
    }
  }