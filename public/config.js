// Backend API Configuration
// Production: https://tlangau.onrender.com
// Local dev:  http://localhost:10000

window.BACKEND_URL = 'https://tlangau.onrender.com';

// Auto-detect backend URL based on current hostname
(function () {
    const hostname = window.location.hostname;

    // If running on GitHub Pages
    if (hostname.includes('github.io')) {
        // Set your production backend URL here
        window.BACKEND_URL = 'https://tlangau.onrender.com';
    }
    // If running locally
    else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        window.BACKEND_URL = 'http://localhost:10000';
    }
    // For other domains, set your backend URL
    else {
        window.BACKEND_URL = 'https://tlangau.onrender.com';
    }
})();
