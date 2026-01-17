// Backend API Configuration
// Update this URL to your deployed backend URL
// For local development: http://localhost:3001
// For production: https://your-backend-url.railway.app (or your hosting service)

window.BACKEND_URL = 'https://tlangau-production.up.railway.app';
// Replace 'your-backend-url.railway.app' with your actual backend URL after deployment

// Auto-detect backend URL based on current hostname
(function() {
    const hostname = window.location.hostname;
    
    // If running on GitHub Pages
    if (hostname.includes('github.io')) {
        // Set your production backend URL here
        window.BACKEND_URL = 'https://tlangau-production.up.railway.app';
    }
    // If running locally
    else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        window.BACKEND_URL = 'http://localhost:3001';
    }
    // For other domains, set your backend URL
    else {
        window.BACKEND_URL = 'https://tlangau-production.up.railway.app';
    }
})();
