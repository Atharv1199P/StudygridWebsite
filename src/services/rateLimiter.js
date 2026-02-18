// Simple rate limiter to prevent exceeding OpenAI API rate limits
class RateLimiter {
  constructor(maxRequestsPerMinute = 3) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    this.requests = [];
  }

  // Check if we can make a request right now
  canMakeRequest() {
    const now = Date.now();
    // Remove requests older than 1 minute
    this.requests = this.requests.filter(time => now - time < 60000);
    
    // Check if we're under the limit
    return this.requests.length < this.maxRequestsPerMinute;
  }

  // Record a request
  addRequest() {
    this.requests.push(Date.now());
  }

  // Get delay needed before next request (in milliseconds)
  getDelay() {
    const now = Date.now();
    // Remove requests older than 1 minute
    this.requests = this.requests.filter(time => now - time < 60000);
    
    if (this.requests.length < this.maxRequestsPerMinute) {
      return 0;
    }
    
    // Calculate delay needed
    const oldestRequest = Math.min(...this.requests);
    return 60000 - (now - oldestRequest) + 1000; // Add 1 second buffer
  }
}

// Create a single instance for the app
const rateLimiter = new RateLimiter();

export default rateLimiter;